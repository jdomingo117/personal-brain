/**
 * Up Bank API client.
 *
 * Read-only Personal Access Token, Bearer auth. Up's rate limit is
 * undisclosed and returns 429 + X-RateLimit-Remaining, so this behaves as if
 * the limit is tight: full jittered exponential backoff, honour
 * Retry-After when present, and a proactive slowdown when remaining is low
 * rather than sprinting into a 429 and then waiting.
 *
 * https://developer.up.com.au/
 */

const BASE_URL = 'https://api.up.com.au/api/v1'
const MAX_ATTEMPTS = 5
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])
const LOW_REMAINING_THRESHOLD = 5

export class UpAuthError extends Error {
  constructor() {
    super('Up token is invalid or has been revoked')
    this.name = 'UpAuthError'
  }
}
export class UpForbiddenError extends Error {
  constructor() {
    super('Up token lacks the required scope')
    this.name = 'UpForbiddenError'
  }
}
export class UpApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'UpApiError'
  }
}

export interface UpMoney {
  currencyCode: string
  value: string
  valueInBaseUnits: number
}

export interface UpAccount {
  id: string
  displayName: string
  accountType: 'TRANSACTIONAL' | 'SAVER'
  ownershipType: 'INDIVIDUAL' | 'JOINT'
  balance: UpMoney
  createdAt: string
}

export interface UpTransaction {
  id: string
  status: 'HELD' | 'SETTLED'
  description: string
  rawText: string | null
  message: string | null
  amount: UpMoney
  foreignAmount: UpMoney | null
  settledAt: string | null
  createdAt: string
  accountId: string
  transferAccountId: string | null
  categoryId: string | null
  parentCategoryId: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 400ms, 800, 1600, 3200, 6400 — jittered so two concurrent syncs hitting the wall together don't retry in lockstep. */
function backoffMs(attempt: number): number {
  const base = 400 * 2 ** attempt
  return Math.round(base * (0.5 + Math.random() / 2))
}

export interface UpFetchResult<T> {
  data: T
  /** X-RateLimit-Remaining, if Up sent it. */
  remaining: number | null
}

async function upFetch<T>(url: string, token: string): Promise<UpFetchResult<T>> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      })
    } catch (err) {
      lastError = err
      await sleep(backoffMs(attempt))
      continue
    }

    if (res.status === 401) {
      await res.body?.cancel()
      throw new UpAuthError()
    }
    if (res.status === 403) {
      await res.body?.cancel()
      throw new UpForbiddenError()
    }
    if (res.status === 404) {
      await res.body?.cancel()
      throw new UpApiError(404, 'not found')
    }

    if (RETRY_STATUSES.has(res.status)) {
      const retryAfter = res.headers.get('Retry-After')
      await res.body?.cancel()
      lastError = new UpApiError(res.status, `retryable status ${res.status}`)
      await sleep(retryAfter ? Number(retryAfter) * 1000 : backoffMs(attempt))
      continue
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new UpApiError(res.status, text.slice(0, 500) || `status ${res.status}`)
    }

    const remainingHeader = res.headers.get('X-RateLimit-Remaining')
    const remaining = remainingHeader ? Number(remainingHeader) : null
    const data = (await res.json()) as T

    // Proactive slowdown: if we're nearly out, pace the NEXT request rather
    // than the one that just succeeded, so callers doing many pages in a row
    // don't sprint into a 429 near the end of the budget.
    if (remaining !== null && remaining < LOW_REMAINING_THRESHOLD) {
      await sleep(1000)
    }

    return { data, remaining }
  }
  throw lastError instanceof Error ? lastError : new UpApiError(0, 'exhausted retries')
}

/** Validates a token before it is ever stored. Throws UpAuthError on an invalid/revoked token. */
export async function pingUp(token: string): Promise<void> {
  await upFetch(`${BASE_URL}/util/ping`, token)
}

function toUpAccount(raw: any): UpAccount {
  return {
    id: raw.id,
    displayName: raw.attributes.displayName,
    accountType: raw.attributes.accountType,
    ownershipType: raw.attributes.ownershipType,
    balance: raw.attributes.balance,
    createdAt: raw.attributes.createdAt,
  }
}

function toUpTransaction(raw: any): UpTransaction {
  return {
    id: raw.id,
    status: raw.attributes.status,
    description: raw.attributes.description,
    rawText: raw.attributes.rawText ?? null,
    message: raw.attributes.message ?? null,
    amount: raw.attributes.amount,
    foreignAmount: raw.attributes.foreignAmount ?? null,
    settledAt: raw.attributes.settledAt ?? null,
    createdAt: raw.attributes.createdAt,
    accountId: raw.relationships?.account?.data?.id ?? null,
    transferAccountId: raw.relationships?.transferAccount?.data?.id ?? null,
    categoryId: raw.relationships?.category?.data?.id ?? null,
    parentCategoryId: raw.relationships?.parentCategory?.data?.id ?? null,
  }
}

/** All of the user's Up accounts. Small, fixed-size list — walked to completion in one call. */
export async function listUpAccounts(token: string): Promise<UpAccount[]> {
  const accounts: UpAccount[] = []
  let url: string | null = `${BASE_URL}/accounts?page[size]=100`
  while (url) {
    const { data } = await upFetch<{ data: any[]; links: { next: string | null } }>(url, token)
    accounts.push(...data.data.map(toUpAccount))
    url = data.links.next
  }
  return accounts
}

export interface TransactionPage {
  transactions: UpTransaction[]
  /** Opaque `links.next` URL. Null when this was the last page. */
  next: string | null
  remaining: number | null
}

/** Builds the initial URL for a windowed transaction fetch. Pass the result of a previous page's `next` on subsequent calls instead of rebuilding this. */
export function buildTransactionsUrl(accountId: string, sinceIso: string): string {
  return `${BASE_URL}/accounts/${accountId}/transactions?page[size]=100&filter[since]=${encodeURIComponent(sinceIso)}`
}

/** Fetches one page. `url` is either buildTransactionsUrl(...)'s result or a previous page's `next`. */
export async function fetchTransactionPage(url: string, token: string): Promise<TransactionPage> {
  const { data, remaining } = await upFetch<{ data: any[]; links: { next: string | null } }>(url, token)
  return {
    transactions: data.data.map(toUpTransaction),
    next: data.links.next,
    remaining,
  }
}

/** Fetches a single transaction by id, e.g. to refresh a still-pending row. Returns null if Up no longer has it (an expired/cancelled hold). */
export async function getUpTransaction(id: string, token: string): Promise<UpTransaction | null> {
  try {
    const { data } = await upFetch<{ data: any }>(`${BASE_URL}/transactions/${id}`, token)
    return toUpTransaction(data.data)
  } catch (err) {
    if (err instanceof UpApiError && err.status === 404) return null
    throw err
  }
}
