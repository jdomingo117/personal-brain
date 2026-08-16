export const TRANSACTION_KINDS = [
  'expense', 'income', 'transfer', 'investment', 'adjustment', 'refund', 'reimbursement',
] as const
export type TransactionKind = typeof TRANSACTION_KINDS[number]

/** Mirror of app/src/lib/classification.ts. Database triggers remain final authority. */
export function defaultTransactionKind(category: string, subcategory: string | null | undefined, amount: number): TransactionKind {
  if (category === 'Transfer' && subcategory === 'Reconciliation') return 'adjustment'
  if (category === 'Transfer') return 'transfer'
  if (category === 'Investing') return 'investment'
  if (category === 'Income' && subcategory === 'Refund') return 'refund'
  if (category === 'Income' && subcategory === 'Reimbursement') return 'reimbursement'
  if (category === 'Income') return 'income'
  if (category === 'Uncategorized') return amount >= 0 ? 'income' : 'expense'
  return 'expense'
}

export interface ReportingClassification {
  kind: TransactionKind
  kindSource?: 'derived' | 'user' | 'system'
  transferState?: 'auto' | 'suggested' | 'confirmed' | 'rejected' | 'external' | 'unmatched' | 'none'
  amount: number
}

/** Mirror of the frontend reporting precedence for durable transfer rejections. */
export function effectiveTransactionKind(transaction: ReportingClassification): TransactionKind {
  if (
    transaction.kind === 'transfer' &&
    transaction.kindSource === 'derived' &&
    transaction.transferState === 'rejected'
  ) return transaction.amount >= 0 ? 'income' : 'expense'
  return transaction.kind
}
