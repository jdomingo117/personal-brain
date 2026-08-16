import type { Txn } from '../data'
import { defaultTransactionKind, earnedIncomeCents, expenseEffectCents, type TransactionKind } from './classification'

export const LEAVE_UNCHANGED = '__leave_unchanged__'

export interface BulkCategoryDraft {
  category: string
  subcategory: string
}

export interface BulkCategoryPayload {
  category?: string
  subcategory?: string | null
}

export interface BulkDistributionItem {
  label: string
  count: number
}

export interface BulkKindTransition {
  from: TransactionKind
  to: TransactionKind
  count: number
}

export interface BulkCategoryImpact {
  categories: BulkDistributionItem[]
  subcategories: BulkDistributionItem[]
  categoryChangeCount: number
  subcategoryChangeCount: number
  subcategoryClearCount: number
  classificationChangeCount: number
  affectedCount: number
  provenanceOnlyCount: number
  kindTransitions: BulkKindTransition[]
  subscriptionChangeCount: number
  expenseDeltaCents: number
  earnedIncomeDeltaCents: number
}

const SUBSCRIPTION_SUBCATEGORIES = new Set(['Streaming', 'Software & digital services', 'Memberships'])

function distribution(values: string[]): BulkDistributionItem[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function commonValue(values: string[]): string | null {
  if (values.length === 0) return null
  return values.every((value) => value === values[0]) ? values[0] : null
}

export function initialBulkCategoryDraft(transactions: Pick<Txn, 'cat' | 'subcat'>[]): BulkCategoryDraft {
  return {
    category: commonValue(transactions.map((transaction) => transaction.cat)) ?? LEAVE_UNCHANGED,
    subcategory: commonValue(transactions.map((transaction) => transaction.subcat ?? '')) ?? LEAVE_UNCHANGED,
  }
}

export function buildBulkCategoryChanges(
  transactions: Pick<Txn, 'cat' | 'subcat'>[],
  draft: BulkCategoryDraft,
): { payload: BulkCategoryPayload; requiresCategory: boolean; requiresSubcategory: boolean; hasChanges: boolean } {
  const categoryChanged = draft.category !== LEAVE_UNCHANGED
    && transactions.some((transaction) => transaction.cat !== draft.category)
  const subcategoryChanged = draft.subcategory !== LEAVE_UNCHANGED
    && transactions.some((transaction) => (transaction.subcat ?? '') !== draft.subcategory)
  const requiresSubcategory = categoryChanged && draft.subcategory === LEAVE_UNCHANGED
  const requiresCategory = draft.category === LEAVE_UNCHANGED
    && draft.subcategory !== LEAVE_UNCHANGED
    && new Set(transactions.map((transaction) => transaction.cat)).size > 1
  const payload: BulkCategoryPayload = {}

  if (categoryChanged) payload.category = draft.category
  if (subcategoryChanged) payload.subcategory = draft.subcategory || null

  return {
    payload,
    requiresCategory,
    requiresSubcategory,
    hasChanges: !requiresCategory && !requiresSubcategory && (categoryChanged || subcategoryChanged),
  }
}

export function buildBulkCategoryImpact(transactions: Txn[], payload: BulkCategoryPayload): BulkCategoryImpact {
  const updatesCategory = payload.category !== undefined
  const updatesSubcategory = Object.prototype.hasOwnProperty.call(payload, 'subcategory')
  const kindTransitions = new Map<string, BulkKindTransition>()
  let categoryChangeCount = 0
  let subcategoryChangeCount = 0
  let subcategoryClearCount = 0
  let classificationChangeCount = 0
  let affectedCount = 0
  let provenanceOnlyCount = 0
  let subscriptionChangeCount = 0
  let expenseDeltaCents = 0
  let earnedIncomeDeltaCents = 0

  for (const transaction of transactions) {
    const targetCategory = payload.category ?? transaction.cat
    const targetSubcategory = updatesSubcategory ? (payload.subcategory ?? undefined) : transaction.subcat
    const categoryChanges = updatesCategory && transaction.cat !== targetCategory
    const subcategoryChanges = updatesSubcategory && (transaction.subcat ?? '') !== (targetSubcategory ?? '')
    const classificationChanges = categoryChanges || subcategoryChanges
    const provenanceChanges = transaction.categorySource !== 'user'
      || transaction.categoryConfidence !== 1
      || transaction.needsReview === true

    if (categoryChanges) categoryChangeCount++
    if (subcategoryChanges) subcategoryChangeCount++
    if (subcategoryChanges && !targetSubcategory && Boolean(transaction.subcat)) subcategoryClearCount++
    if (classificationChanges) classificationChangeCount++
    if (classificationChanges || provenanceChanges) affectedCount++
    if (!classificationChanges && provenanceChanges) provenanceOnlyCount++

    const targetKind = transaction.kindSource === 'user'
      ? transaction.kind
      : defaultTransactionKind(targetCategory, targetSubcategory, transaction.amount)
    const targetKindSource: NonNullable<Txn['kindSource']> = transaction.kindSource === 'user'
      ? 'user'
      : targetKind === 'adjustment' ? 'system' : 'derived'
    if (targetKind !== transaction.kind) {
      const key = `${transaction.kind}:${targetKind}`
      const existing = kindTransitions.get(key)
      kindTransitions.set(key, existing
        ? { ...existing, count: existing.count + 1 }
        : { from: transaction.kind, to: targetKind, count: 1 })
    }

    const targetSubscription = transaction.subscriptionSource === 'user'
      ? transaction.isSubscription === true
      : targetCategory === 'Lifestyle' && SUBSCRIPTION_SUBCATEGORIES.has(targetSubcategory ?? '')
    if (targetSubscription !== (transaction.isSubscription === true)) subscriptionChangeCount++

    const projected = { ...transaction, kind: targetKind, kindSource: targetKindSource }
    expenseDeltaCents += expenseEffectCents(projected) - expenseEffectCents(transaction)
    earnedIncomeDeltaCents += earnedIncomeCents(projected) - earnedIncomeCents(transaction)
  }

  return {
    categories: distribution(transactions.map((transaction) => transaction.cat)),
    subcategories: distribution(transactions.map((transaction) => transaction.subcat || 'No subcategory')),
    categoryChangeCount,
    subcategoryChangeCount,
    subcategoryClearCount,
    classificationChangeCount,
    affectedCount,
    provenanceOnlyCount,
    kindTransitions: [...kindTransitions.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from)),
    subscriptionChangeCount,
    expenseDeltaCents,
    earnedIncomeDeltaCents,
  }
}
