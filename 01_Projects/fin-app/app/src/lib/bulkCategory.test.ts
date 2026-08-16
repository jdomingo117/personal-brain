import { describe, expect, it } from 'vitest'
import type { Txn } from '../data'
import { buildBulkCategoryChanges, buildBulkCategoryImpact, initialBulkCategoryDraft, LEAVE_UNCHANGED } from './bulkCategory'

const row = (cat: string, subcat?: string): Pick<Txn, 'cat' | 'subcat'> => ({ cat, subcat })
const transaction = (overrides: Partial<Txn> = {}): Txn => ({
  id: crypto.randomUUID(), date: '2026-08-15', merchant: 'Preview fixture',
  cat: 'Food & drink', subcat: 'Coffee', kind: 'expense', kindSource: 'derived',
  amount: -1000, account_id: 'a', categorySource: 'bank', categoryConfidence: 0.8,
  needsReview: true, isSubscription: false, subscriptionSource: 'derived',
  ...overrides,
})

describe('bulk category field semantics', () => {
  it('shows shared category and subcategory values without creating an edit', () => {
    const transactions = [row('Food & drink', 'Coffee'), row('Food & drink', 'Coffee')]
    const draft = initialBulkCategoryDraft(transactions)

    expect(draft).toEqual({ category: 'Food & drink', subcategory: 'Coffee' })
    expect(buildBulkCategoryChanges(transactions, draft)).toEqual({
      payload: {}, requiresCategory: false, requiresSubcategory: false, hasChanges: false,
    })
  })

  it('represents a mixed subcategory as leave unchanged', () => {
    const transactions = [row('Food & drink', 'Coffee'), row('Food & drink', 'Groceries')]

    expect(initialBulkCategoryDraft(transactions)).toEqual({
      category: 'Food & drink', subcategory: LEAVE_UNCHANGED,
    })
  })

  it('sends only an explicitly selected subcategory', () => {
    const transactions = [row('Food & drink', 'Coffee'), row('Food & drink', 'Groceries')]

    expect(buildBulkCategoryChanges(transactions, {
      category: 'Food & drink', subcategory: 'Dining & takeaway',
    })).toEqual({
      payload: { subcategory: 'Dining & takeaway' }, requiresSubcategory: false, hasChanges: true,
      requiresCategory: false,
    })
  })

  it('requires an explicit subcategory whenever category changes', () => {
    const transactions = [row('Food & drink', 'Coffee'), row('Shopping', 'Household')]

    expect(buildBulkCategoryChanges(transactions, {
      category: 'Health & wellbeing', subcategory: LEAVE_UNCHANGED,
    })).toEqual({
      payload: { category: 'Health & wellbeing' }, requiresCategory: false, requiresSubcategory: true, hasChanges: false,
    })
  })

  it('can explicitly clear subcategory while leaving a shared category unchanged', () => {
    const transactions = [row('Food & drink', 'Coffee'), row('Food & drink', 'Groceries')]

    expect(buildBulkCategoryChanges(transactions, {
      category: 'Food & drink', subcategory: '',
    }).payload).toEqual({ subcategory: null })
  })

  it('does not allow a subcategory-only change across mixed categories', () => {
    const transactions = [row('Food & drink', 'Coffee'), row('Shopping', 'Household')]

    expect(buildBulkCategoryChanges(transactions, {
      category: LEAVE_UNCHANGED, subcategory: '',
    })).toMatchObject({ requiresCategory: true, hasChanges: false })
  })
})

describe('bulk category impact preview', () => {
  it('reports current mixes, exact label changes and provenance-only updates', () => {
    const impact = buildBulkCategoryImpact([
      transaction({ subcat: 'Coffee' }),
      transaction({ subcat: 'Dining & takeaway' }),
    ], { subcategory: 'Dining & takeaway' })

    expect(impact.categories).toEqual([{ label: 'Food & drink', count: 2 }])
    expect(impact.subcategories).toEqual([
      { label: 'Coffee', count: 1 }, { label: 'Dining & takeaway', count: 1 },
    ])
    expect(impact).toMatchObject({
      categoryChangeCount: 0, subcategoryChangeCount: 1, classificationChangeCount: 1,
      affectedCount: 2, provenanceOnlyCount: 1, subcategoryClearCount: 0,
    })
  })

  it('makes an explicit subcategory clear visible', () => {
    const impact = buildBulkCategoryImpact([
      transaction({ subcat: 'Coffee' }), transaction({ subcat: undefined }),
    ], { subcategory: null })

    expect(impact.subcategoryChangeCount).toBe(1)
    expect(impact.subcategoryClearCount).toBe(1)
    expect(impact.subcategories).toContainEqual({ label: 'No subcategory', count: 1 })
  })

  it('projects derived kind and expense-reporting changes', () => {
    const impact = buildBulkCategoryImpact([
      transaction({ amount: -1000 }), transaction({ amount: -2000 }),
    ], { category: 'Transfer', subcategory: 'Internal' })

    expect(impact.categoryChangeCount).toBe(2)
    expect(impact.subcategoryChangeCount).toBe(2)
    expect(impact.kindTransitions).toEqual([{ from: 'expense', to: 'transfer', count: 2 }])
    expect(impact.expenseDeltaCents).toBe(-3000)
    expect(impact.earnedIncomeDeltaCents).toBe(0)
  })

  it('preserves user-pinned kind in the reporting projection', () => {
    const impact = buildBulkCategoryImpact([
      transaction({ kind: 'expense', kindSource: 'user', amount: -1000 }),
    ], { category: 'Transfer', subcategory: 'Internal' })

    expect(impact.kindTransitions).toEqual([])
    expect(impact.expenseDeltaCents).toBe(0)
  })

  it('projects derived subscription changes', () => {
    const impact = buildBulkCategoryImpact([
      transaction(),
    ], { category: 'Lifestyle', subcategory: 'Streaming' })

    expect(impact.subscriptionChangeCount).toBe(1)
  })
})
