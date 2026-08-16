import type { Txn } from '../data'

/** Replaces a split parent only for reporting; account ledgers retain the immutable bank row. */
export function expandTransactionAllocations(transactions: Txn[]): Txn[] {
  return transactions.flatMap((transaction) => transaction.allocations?.length
    ? transaction.allocations.map((allocation) => ({
        ...transaction, id: `allocation:${allocation.id}`, parentTransactionId: transaction.id,
        isAllocation: true, allocationNote: allocation.note, allocations: [], amount: allocation.amount,
        kind: allocation.kind, cat: allocation.category, subcat: allocation.subcategory,
      }))
    : [transaction])
}
