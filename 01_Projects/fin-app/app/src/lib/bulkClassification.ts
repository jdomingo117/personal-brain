import type { Txn } from '../data'
import {
  earnedIncomeCents, expenseEffectCents, KIND_LABELS,
  type SpendingNature, type TransactionKind,
} from './classification'
import { LEAVE_UNCHANGED, type BulkDistributionItem } from './bulkCategory'

export const NO_SPENDING_NATURE = '__no_spending_nature__'

export interface BulkClassificationDraft {
  kind: string
  isRecurring: string
  isSubscription: string
  spendingNature: string
  isReimbursable: string
  isTaxRelated: string
}

export interface BulkClassificationPayload {
  kind?: TransactionKind
  is_recurring?: boolean
  is_subscription?: boolean
  spending_nature?: SpendingNature
  is_reimbursable?: boolean
  is_tax_related?: boolean
}

export interface BulkClassificationImpact {
  kinds: BulkDistributionItem[]
  recurring: BulkDistributionItem[]
  subscriptions: BulkDistributionItem[]
  spendingNatures: BulkDistributionItem[]
  reimbursable: BulkDistributionItem[]
  taxRelated: BulkDistributionItem[]
  fieldChangeCounts: Record<keyof BulkClassificationPayload, number>
  affectedCount: number
  manualPinCount: number
  expenseDeltaCents: number
  earnedIncomeDeltaCents: number
}

function common(values: string[]) {
  return values.length > 0 && values.every((value) => value === values[0])
    ? values[0]
    : LEAVE_UNCHANGED
}

function boolValue(value: boolean | undefined) {
  return value === true ? 'true' : 'false'
}

function natureValue(value: SpendingNature | undefined) {
  return value ?? NO_SPENDING_NATURE
}

function distribution(values: string[], label: (value: string) => string): BulkDistributionItem[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].map(([value, count]) => ({ label: label(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function initialBulkClassificationDraft(transactions: Txn[]): BulkClassificationDraft {
  return {
    kind: common(transactions.map((transaction) => transaction.kind)),
    isRecurring: common(transactions.map((transaction) => boolValue(transaction.isRecurring))),
    isSubscription: common(transactions.map((transaction) => boolValue(transaction.isSubscription))),
    spendingNature: common(transactions.map((transaction) => natureValue(transaction.spendingNature))),
    isReimbursable: common(transactions.map((transaction) => boolValue(transaction.isReimbursable))),
    isTaxRelated: common(transactions.map((transaction) => boolValue(transaction.isTaxRelated))),
  }
}

export function buildBulkClassificationChanges(
  transactions: Txn[], draft: BulkClassificationDraft,
): { payload: BulkClassificationPayload; hasChanges: boolean } {
  const payload: BulkClassificationPayload = {}
  if (draft.kind !== LEAVE_UNCHANGED && transactions.some((transaction) => transaction.kind !== draft.kind)) {
    payload.kind = draft.kind as TransactionKind
  }
  if (draft.isRecurring !== LEAVE_UNCHANGED && transactions.some((transaction) => boolValue(transaction.isRecurring) !== draft.isRecurring)) {
    payload.is_recurring = draft.isRecurring === 'true'
  }
  if (draft.isSubscription !== LEAVE_UNCHANGED && transactions.some((transaction) => boolValue(transaction.isSubscription) !== draft.isSubscription)) {
    payload.is_subscription = draft.isSubscription === 'true'
  }
  if (draft.spendingNature !== LEAVE_UNCHANGED && transactions.some((transaction) => natureValue(transaction.spendingNature) !== draft.spendingNature)) {
    payload.spending_nature = draft.spendingNature === NO_SPENDING_NATURE ? null : draft.spendingNature as Exclude<SpendingNature, null>
  }
  if (draft.isReimbursable !== LEAVE_UNCHANGED && transactions.some((transaction) => boolValue(transaction.isReimbursable) !== draft.isReimbursable)) {
    payload.is_reimbursable = draft.isReimbursable === 'true'
  }
  if (draft.isTaxRelated !== LEAVE_UNCHANGED && transactions.some((transaction) => boolValue(transaction.isTaxRelated) !== draft.isTaxRelated)) {
    payload.is_tax_related = draft.isTaxRelated === 'true'
  }
  return { payload, hasChanges: Object.keys(payload).length > 0 }
}

export function buildBulkClassificationImpact(transactions: Txn[], payload: BulkClassificationPayload): BulkClassificationImpact {
  const fieldChangeCounts: BulkClassificationImpact['fieldChangeCounts'] = {
    kind: 0, is_recurring: 0, is_subscription: 0, spending_nature: 0,
    is_reimbursable: 0, is_tax_related: 0,
  }
  let affectedCount = 0
  let manualPinCount = 0
  let expenseDeltaCents = 0
  let earnedIncomeDeltaCents = 0

  for (const transaction of transactions) {
    let affected = false
    let pins = false
    const targetKind = payload.kind ?? transaction.kind
    if (payload.kind !== undefined) {
      if (transaction.kind !== payload.kind) fieldChangeCounts.kind++
      affected ||= transaction.kind !== payload.kind || transaction.kindSource !== 'user'
      pins ||= transaction.kindSource !== 'user'
    }
    if (payload.is_recurring !== undefined) {
      if ((transaction.isRecurring === true) !== payload.is_recurring) fieldChangeCounts.is_recurring++
      affected ||= (transaction.isRecurring === true) !== payload.is_recurring || transaction.recurringSource !== 'user'
      pins ||= transaction.recurringSource !== 'user'
    }
    if (payload.is_subscription !== undefined) {
      if ((transaction.isSubscription === true) !== payload.is_subscription) fieldChangeCounts.is_subscription++
      affected ||= (transaction.isSubscription === true) !== payload.is_subscription || transaction.subscriptionSource !== 'user'
      pins ||= transaction.subscriptionSource !== 'user'
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'spending_nature')) {
      if ((transaction.spendingNature ?? null) !== payload.spending_nature) fieldChangeCounts.spending_nature++
      affected ||= (transaction.spendingNature ?? null) !== payload.spending_nature
    }
    if (payload.is_reimbursable !== undefined) {
      if ((transaction.isReimbursable === true) !== payload.is_reimbursable) fieldChangeCounts.is_reimbursable++
      affected ||= (transaction.isReimbursable === true) !== payload.is_reimbursable
    }
    if (payload.is_tax_related !== undefined) {
      if ((transaction.isTaxRelated === true) !== payload.is_tax_related) fieldChangeCounts.is_tax_related++
      affected ||= (transaction.isTaxRelated === true) !== payload.is_tax_related
    }
    if (affected) affectedCount++
    if (pins) manualPinCount++

    const projected = payload.kind === undefined
      ? transaction
      : { ...transaction, kind: targetKind, kindSource: 'user' as const }
    expenseDeltaCents += expenseEffectCents(projected) - expenseEffectCents(transaction)
    earnedIncomeDeltaCents += earnedIncomeCents(projected) - earnedIncomeCents(transaction)
  }

  const yesNo = (value: string) => value === 'true' ? 'Yes' : 'No'
  return {
    kinds: distribution(transactions.map((transaction) => transaction.kind), (value) => KIND_LABELS[value as TransactionKind]),
    recurring: distribution(transactions.map((transaction) => boolValue(transaction.isRecurring)), yesNo),
    subscriptions: distribution(transactions.map((transaction) => boolValue(transaction.isSubscription)), yesNo),
    spendingNatures: distribution(transactions.map((transaction) => natureValue(transaction.spendingNature)), (value) => value === NO_SPENDING_NATURE ? 'Not set' : value === 'essential' ? 'Essential' : 'Discretionary'),
    reimbursable: distribution(transactions.map((transaction) => boolValue(transaction.isReimbursable)), yesNo),
    taxRelated: distribution(transactions.map((transaction) => boolValue(transaction.isTaxRelated)), yesNo),
    fieldChangeCounts, affectedCount, manualPinCount, expenseDeltaCents, earnedIncomeDeltaCents,
  }
}
