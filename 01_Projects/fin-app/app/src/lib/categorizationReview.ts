import type { Txn } from '../data'
import { defaultTransactionKind, earnedIncomeCents, expenseEffectCents, type TransactionKind } from './classification'

export type ReviewSource = 'user' | 'bank' | 'ai' | 'seed' | null
export type ReviewStatus = 'suggested' | 'unchanged' | 'protected' | 'unresolved'
export type CategorizationReviewScope = 'selected' | 'unresolved' | 'eligible'

/** Review application is deliberately bounded by the same atomic operation
 * limit as the service boundary. Durable, multi-batch runs are a separate
 * future contract; do not silently turn a scope shortcut into an unbounded
 * mutation. */
export const MAX_CATEGORIZATION_REVIEW_ROWS = 500

export interface ReviewClassification {
  category: string
  subcategory: string | null
  source: ReviewSource
  confidence: number | null
  needs_review: boolean
}

export interface CategorizationReviewRow {
  transaction_id: string
  date: string
  merchant: string
  current: ReviewClassification
  proposed: ReviewClassification | null
  status: ReviewStatus
  protection_reason: string | null
}

export interface CategorizationReviewResponse {
  rows: CategorizationReviewRow[]
  stats: {
    requested: number
    fromCache: number
    fromBank: number
    fromAi: number
    geminiCalls: number
    selected: number
    eligible: number
  }
}

export interface ReviewApplyAssignment {
  transaction_id: string
  before_category: string
  before_subcategory: string | null
  before_source: Exclude<ReviewSource, 'user'>
  before_confidence: number | null
  before_needs_review: boolean
  category: string
  subcategory: string | null
}

export interface ReviewChoice { category: string; subcategory: string | null }
export type ReviewChoices = ReadonlyMap<string, ReviewChoice>

/** Manual choices are staged locally, and never make a protected row eligible. */
export function reviewTarget(row: CategorizationReviewRow, choices: ReviewChoices = new Map()): ReviewChoice | null {
  if (row.status === 'protected') return null
  const choice = choices.get(row.transaction_id)
  if (choice) return choice
  return row.status === 'suggested' && row.proposed
    ? { category: row.proposed.category, subcategory: row.proposed.subcategory }
    : null
}

export interface CategorizationReviewImpact {
  accepted: number
  categoryChanges: number
  subcategoryChanges: number
  reviewFlagsCleared: number
  kindTransitions: Array<{ from: TransactionKind; to: TransactionKind; count: number }>
  subscriptionChanges: number
  expenseDeltaCents: number
  earnedIncomeDeltaCents: number
}

const SUBSCRIPTION_SUBCATEGORIES = new Set(['Streaming', 'Software & digital services', 'Memberships'])

/** The safe recovery/default scope mirrors the backlog drain: only rows with
 * no classification source that still remain explicitly unresolved. */
export function isUnresolvedReviewCandidate(transaction: Txn): boolean {
  return transaction.cat === 'Uncategorized' && transaction.categorySource == null
}

/** This is intentionally a *candidate* predicate. The Edge Function remains
 * authoritative for user rules and protects manual, bank and system rows a
 * browser cannot safely determine on its own. */
export function isEligibleReviewCandidate(transaction: Txn): boolean {
  return transaction.categorySource !== 'user'
    && transaction.categorySource !== 'bank'
    && !(transaction.kind === 'adjustment' && transaction.kindSource === 'system')
}

export function reviewScopeTransactions(
  transactions: Txn[],
  scope: Exclude<CategorizationReviewScope, 'selected'>,
  limit = MAX_CATEGORIZATION_REVIEW_ROWS,
): { candidates: Txn[]; selected: Txn[]; truncated: boolean } {
  const candidates = transactions.filter(scope === 'unresolved'
    ? isUnresolvedReviewCandidate
    : isEligibleReviewCandidate)
  return {
    candidates,
    selected: candidates.slice(0, limit),
    truncated: candidates.length > limit,
  }
}

/** Keep all rows for one merchant in the same preview request so one fresh AI
 * answer cannot diverge across pages. The row cap still matches atomic apply. */
export function categorizationPreviewPages(
  transactions: Pick<Txn, 'id' | 'merchantKey'>[],
  maxMerchants = 200,
  maxRows = 500,
): string[][] {
  const groups = new Map<string, string[]>()
  for (const transaction of transactions) {
    const key = transaction.merchantKey || `transaction:${transaction.id}`
    const ids = groups.get(key) ?? []
    ids.push(transaction.id)
    groups.set(key, ids)
  }
  const pages: string[][] = []
  let page: string[] = []
  let merchantCount = 0
  for (const ids of groups.values()) {
    if (page.length > 0 && (merchantCount >= maxMerchants || page.length + ids.length > maxRows)) {
      pages.push(page); page = []; merchantCount = 0
    }
    if (ids.length > maxRows) {
      for (let index = 0; index < ids.length; index += maxRows) pages.push(ids.slice(index, index + maxRows))
      continue
    }
    page.push(...ids); merchantCount++
  }
  if (page.length > 0) pages.push(page)
  return pages
}

/** Progress is defined by fully resolved bounded preview requests, never by
 * rows guessed to be underway. A failed later request therefore leaves the
 * caller with an honest partial count but no usable partial review result. */
export function categorizationPreviewProgress(totalPages: number, completedPages: number): {
  totalPages: number
  completedPages: number
  activePage: number | null
} {
  const total = Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0
  const completed = Number.isFinite(completedPages) ? Math.min(total, Math.max(0, Math.floor(completedPages))) : 0
  return { totalPages: total, completedPages: completed, activePage: completed < total ? completed + 1 : null }
}

export function suggestedReviewIds(rows: CategorizationReviewRow[]): Set<string> {
  return new Set(rows.filter((row) => row.status === 'suggested' && row.proposed).map((row) => row.transaction_id))
}

export function buildReviewAssignments(
  rows: CategorizationReviewRow[],
  acceptedIds: ReadonlySet<string>,
  choices: ReviewChoices = new Map(),
): ReviewApplyAssignment[] {
  return rows.flatMap((row) => {
    const target = reviewTarget(row, choices)
    if (!acceptedIds.has(row.transaction_id) || !target) return []
    return [{
      transaction_id: row.transaction_id,
      before_category: row.current.category,
      before_subcategory: row.current.subcategory,
      before_source: row.current.source as Exclude<ReviewSource, 'user'>,
      before_confidence: row.current.confidence,
      before_needs_review: row.current.needs_review,
      category: target.category,
      subcategory: target.subcategory,
    }]
  })
}

export function buildCategorizationReviewImpact(
  transactions: Txn[],
  rows: CategorizationReviewRow[],
  acceptedIds: ReadonlySet<string>,
  choices: ReviewChoices = new Map(),
): CategorizationReviewImpact {
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]))
  const transitionCounts = new Map<string, { from: TransactionKind; to: TransactionKind; count: number }>()
  let categoryChanges = 0
  let subcategoryChanges = 0
  let reviewFlagsCleared = 0
  let subscriptionChanges = 0
  let expenseDeltaCents = 0
  let earnedIncomeDeltaCents = 0
  let accepted = 0

  for (const row of rows) {
    const target = reviewTarget(row, choices)
    if (!acceptedIds.has(row.transaction_id) || !target) continue
    const transaction = transactionById.get(row.transaction_id)
    if (!transaction) continue
    accepted++
    if (transaction.cat !== target.category) categoryChanges++
    if ((transaction.subcat ?? null) !== target.subcategory) subcategoryChanges++
    if (transaction.needsReview) reviewFlagsCleared++

    const targetKind = transaction.kindSource === 'user'
      ? transaction.kind
      : defaultTransactionKind(target.category, target.subcategory ?? undefined, transaction.amount)
    const targetKindSource: NonNullable<Txn['kindSource']> = transaction.kindSource === 'user'
      ? 'user'
      : targetKind === 'adjustment' ? 'system' : 'derived'
    if (targetKind !== transaction.kind) {
      const key = `${transaction.kind}:${targetKind}`
      const current = transitionCounts.get(key)
      transitionCounts.set(key, current
        ? { ...current, count: current.count + 1 }
        : { from: transaction.kind, to: targetKind, count: 1 })
    }

    const targetSubscription = transaction.subscriptionSource === 'user'
      ? transaction.isSubscription === true
      : target.category === 'Lifestyle' && SUBSCRIPTION_SUBCATEGORIES.has(target.subcategory ?? '')
    if (targetSubscription !== (transaction.isSubscription === true)) subscriptionChanges++

    const projected = { ...transaction, kind: targetKind, kindSource: targetKindSource }
    expenseDeltaCents += expenseEffectCents(projected) - expenseEffectCents(transaction)
    earnedIncomeDeltaCents += earnedIncomeCents(projected) - earnedIncomeCents(transaction)
  }

  return {
    accepted, categoryChanges, subcategoryChanges, reviewFlagsCleared,
    kindTransitions: [...transitionCounts.values()].sort((left, right) => right.count - left.count),
    subscriptionChanges, expenseDeltaCents, earnedIncomeDeltaCents,
  }
}
