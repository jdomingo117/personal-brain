import { FULL_TAXONOMY, UNCATEGORIZED, type Txn } from '../data'

export type LedgerReviewFilter =
  | 'all'
  | 'needs-review'
  | 'uncategorized'
  | 'missing-subcategory'
  | 'ai'
  | 'bank'
  | 'user'
  | 'recurring'
  | 'subscription'
  | 'reimbursable'
  | 'tax-related'

export interface LedgerFilters {
  query: string
  accountId: string
  category: string
  kind?: string
  review: LedgerReviewFilter
}

export interface LedgerSelectionSummary {
  total: number
  currentPage: number
  elsewhere: number
}

export const MAX_BULK_SELECTION = 500

export function summarizeLedgerSelection(
  selectedIds: ReadonlySet<string>,
  currentPage: Pick<Txn, 'id'>[],
  allTransactions: Pick<Txn, 'id'>[],
): LedgerSelectionSummary {
  const existingIds = new Set(allTransactions.map((transaction) => transaction.id))
  const total = [...selectedIds].filter((id) => existingIds.has(id)).length
  const currentPageCount = currentPage.filter((transaction) => selectedIds.has(transaction.id)).length
  return { total, currentPage: currentPageCount, elsewhere: total - currentPageCount }
}

export function selectAllMatchingLedgerTransactions(
  matchingTransactions: Pick<Txn, 'id'>[],
  limit = MAX_BULK_SELECTION,
): Set<string> {
  return new Set(matchingTransactions.slice(0, limit).map((transaction) => transaction.id))
}

export function toggleLedgerPageSelection(
  selectedIds: ReadonlySet<string>,
  currentPage: Pick<Txn, 'id'>[],
  limit = MAX_BULK_SELECTION,
): Set<string> {
  const next = new Set(selectedIds)
  const selectedOnPage = currentPage.filter((transaction) => next.has(transaction.id))
  const pageIsFullySelected = currentPage.length > 0 && selectedOnPage.length === currentPage.length
  const clearSelectedOnPage = pageIsFullySelected || (next.size >= limit && selectedOnPage.length > 0)

  if (clearSelectedOnPage) {
    for (const transaction of selectedOnPage) next.delete(transaction.id)
    return next
  }

  for (const transaction of currentPage) {
    if (next.size >= limit) break
    next.add(transaction.id)
  }
  return next
}

export function isExactMatchingLedgerSelection(
  selectedIds: ReadonlySet<string>,
  matchingTransactions: Pick<Txn, 'id'>[],
  limit = MAX_BULK_SELECTION,
): boolean {
  const target = matchingTransactions.slice(0, limit)
  return target.length > 0
    && selectedIds.size === target.length
    && target.every((transaction) => selectedIds.has(transaction.id))
}

export function isMissingSubcategory(transaction: Txn): boolean {
  return (FULL_TAXONOMY[transaction.cat]?.length ?? 0) > 0 && !transaction.subcat
}

export function matchesLedgerReview(transaction: Txn, filter: LedgerReviewFilter): boolean {
  switch (filter) {
    case 'needs-review': return transaction.needsReview === true
    case 'uncategorized': return transaction.cat === UNCATEGORIZED
    case 'missing-subcategory': return isMissingSubcategory(transaction)
    case 'ai': return transaction.categorySource === 'ai'
    case 'bank': return transaction.categorySource === 'bank'
    case 'user': return transaction.categorySource === 'user'
    case 'recurring': return transaction.isRecurring === true
    case 'subscription': return transaction.isSubscription === true
    case 'reimbursable': return transaction.isReimbursable === true
    case 'tax-related': return transaction.isTaxRelated === true
    default: return true
  }
}

export function filterLedger(transactions: Txn[], filters: LedgerFilters): Txn[] {
  const query = filters.query.trim().toLowerCase()
  return transactions.filter((transaction) => {
    if (filters.accountId && transaction.account_id !== filters.accountId) return false
    if (filters.category && transaction.cat !== filters.category) return false
    if (filters.kind && transaction.kind !== filters.kind) return false
    if (!matchesLedgerReview(transaction, filters.review)) return false
    if (query) {
      const haystack = [
        transaction.merchant,
        transaction.originalDescription,
        transaction.account,
        transaction.cat,
        transaction.subcat,
        transaction.kind,
        transaction.spendingNature,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

export function reviewCount(transactions: Txn[]): number {
  return transactions.filter((transaction) =>
    transaction.needsReview === true || transaction.cat === UNCATEGORIZED,
  ).length
}
