import type { Txn } from '../data'
import { defaultTransactionKind, earnedIncomeCents, expenseEffectCents, type TransactionKind } from './classification'

export type ReviewSource = 'user' | 'bank' | 'ai' | 'seed' | null
export type ReviewStatus = 'suggested' | 'unchanged' | 'protected' | 'unresolved'

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

export function suggestedReviewIds(rows: CategorizationReviewRow[]): Set<string> {
  return new Set(rows.filter((row) => row.status === 'suggested' && row.proposed).map((row) => row.transaction_id))
}

export function buildReviewAssignments(
  rows: CategorizationReviewRow[],
  acceptedIds: ReadonlySet<string>,
): ReviewApplyAssignment[] {
  return rows.flatMap((row) => {
    if (!acceptedIds.has(row.transaction_id) || row.status !== 'suggested' || !row.proposed) return []
    return [{
      transaction_id: row.transaction_id,
      before_category: row.current.category,
      before_subcategory: row.current.subcategory,
      before_source: row.current.source as Exclude<ReviewSource, 'user'>,
      before_confidence: row.current.confidence,
      before_needs_review: row.current.needs_review,
      category: row.proposed.category,
      subcategory: row.proposed.subcategory,
    }]
  })
}

export function buildCategorizationReviewImpact(
  transactions: Txn[],
  rows: CategorizationReviewRow[],
  acceptedIds: ReadonlySet<string>,
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
    if (!acceptedIds.has(row.transaction_id) || row.status !== 'suggested' || !row.proposed) continue
    const transaction = transactionById.get(row.transaction_id)
    if (!transaction) continue
    accepted++
    if (transaction.cat !== row.proposed.category) categoryChanges++
    if ((transaction.subcat ?? null) !== row.proposed.subcategory) subcategoryChanges++
    if (transaction.needsReview) reviewFlagsCleared++

    const targetKind = transaction.kindSource === 'user'
      ? transaction.kind
      : defaultTransactionKind(row.proposed.category, row.proposed.subcategory ?? undefined, transaction.amount)
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
      : row.proposed.category === 'Lifestyle' && SUBSCRIPTION_SUBCATEGORIES.has(row.proposed.subcategory ?? '')
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
