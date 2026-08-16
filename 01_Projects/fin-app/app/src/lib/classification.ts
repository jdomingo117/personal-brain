import type { Txn } from '../data'

export const TRANSACTION_KINDS = [
  'expense', 'income', 'transfer', 'investment', 'adjustment', 'refund', 'reimbursement',
] as const
export type TransactionKind = typeof TRANSACTION_KINDS[number]
export type SpendingNature = 'essential' | 'discretionary' | null

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  investment: 'Investment',
  adjustment: 'Adjustment',
  refund: 'Refund',
  reimbursement: 'Reimbursement',
}

/** Initial accounting behavior for imported/provider classifications. Once a
 * user corrects kind, `kind_source=user` prevents category changes replacing it. */
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

type ReportingClassification = Pick<Txn, 'kind' | 'kindSource' | 'transferState' | 'amount'>

/**
 * A durable "Count as regular activity" decision outranks a stale derived
 * transfer kind. Direction supplies the ordinary cash-flow behavior until the
 * user gives the transaction a more specific purpose in the review ledger.
 * User-pinned transfer kinds remain authoritative.
 */
export function effectiveTransactionKind(transaction: ReportingClassification): TransactionKind {
  if (
    transaction.kind === 'transfer' &&
    transaction.kindSource === 'derived' &&
    transaction.transferState === 'rejected'
  ) return transaction.amount >= 0 ? 'income' : 'expense'
  return transaction.kind
}

export function isTransferKind(transaction: Pick<Txn, 'kind' | 'kindSource' | 'transferState' | 'amount' | 'isTransfer'>): boolean {
  return transaction.isTransfer === true || effectiveTransactionKind(transaction) === 'transfer'
}

export function earnedIncomeCents(transaction: Pick<Txn, 'kind' | 'kindSource' | 'transferState' | 'amount' | 'pending'>): number {
  if (transaction.pending || effectiveTransactionKind(transaction) !== 'income') return 0
  return Math.max(0, transaction.amount)
}

/** Positive means spending; refunds/reimbursements reduce it as contra-expense. */
export function expenseEffectCents(transaction: Pick<Txn, 'kind' | 'kindSource' | 'transferState' | 'amount' | 'pending'>): number {
  if (transaction.pending) return 0
  const kind = effectiveTransactionKind(transaction)
  if (kind === 'expense') return Math.max(0, -transaction.amount)
  if (kind === 'refund' || kind === 'reimbursement') return -Math.max(0, transaction.amount)
  return 0
}

export function isGrossExpense(transaction: Pick<Txn, 'kind' | 'kindSource' | 'transferState' | 'amount' | 'pending'>): boolean {
  return !transaction.pending && effectiveTransactionKind(transaction) === 'expense' && transaction.amount < 0
}

export function isEarnedIncome(transaction: Pick<Txn, 'kind' | 'kindSource' | 'transferState' | 'amount' | 'pending'>): boolean {
  return !transaction.pending && effectiveTransactionKind(transaction) === 'income' && transaction.amount > 0
}
