import { describe, expect, it } from 'vitest'
import type { Txn } from '../data'
import {
  buildCategorizationReviewImpact, buildReviewAssignments, categorizationPreviewPages, categorizationPreviewProgress, suggestedReviewIds,
  reviewScopeTransactions,
  type CategorizationReviewRow,
} from './categorizationReview'

const transaction = (overrides: Partial<Txn> = {}): Txn => ({
  id: crypto.randomUUID(), date: '2026-09-17', merchant: 'Review fixture',
  cat: 'Food & drink', subcat: 'Coffee', kind: 'expense', kindSource: 'derived',
  amount: -1200, account_id: 'account', categorySource: 'ai', categoryConfidence: 0.62,
  needsReview: true, isSubscription: false, subscriptionSource: 'derived',
  ...overrides,
})

const reviewRow = (txn: Txn, overrides: Partial<CategorizationReviewRow> = {}): CategorizationReviewRow => ({
  transaction_id: txn.id, date: txn.date, merchant: txn.merchant,
  current: {
    category: txn.cat, subcategory: txn.subcat ?? null, source: txn.categorySource ?? null,
    confidence: txn.categoryConfidence ?? null, needs_review: txn.needsReview ?? false,
  },
  proposed: {
    category: 'Transport', subcategory: 'Fuel', source: 'ai', confidence: 0.91, needs_review: false,
  },
  status: 'suggested', protection_reason: null, ...overrides,
})

describe('categorisation review selection', () => {
  it('keeps the safe unresolved scope to source-less Uncategorized rows', () => {
    const unresolved = transaction({ cat: 'Uncategorized', categorySource: null, needsReview: true })
    const aiUnresolved = transaction({ cat: 'Uncategorized', categorySource: 'ai', needsReview: true })
    const reviewFlag = transaction({ categorySource: null, needsReview: true })

    expect(reviewScopeTransactions([unresolved, aiUnresolved, reviewFlag], 'unresolved').candidates)
      .toEqual([unresolved])
  })

  it('offers the all-eligible scope as a bounded candidate batch while retaining server-side protection', () => {
    const eligible = transaction({ categorySource: 'ai' })
    const bank = transaction({ categorySource: 'bank' })
    const manual = transaction({ categorySource: 'user' })
    const system = transaction({ categorySource: null, kind: 'adjustment', kindSource: 'system' })

    const result = reviewScopeTransactions([eligible, bank, manual, system], 'eligible', 1)
    expect(result.candidates).toEqual([eligible])
    expect(result.selected).toEqual([eligible])
    expect(result.truncated).toBe(false)
  })

  it('makes the all-eligible boundary explicit rather than silently running every row', () => {
    const rows = Array.from({ length: 501 }, () => transaction({ categorySource: 'ai' }))
    const result = reviewScopeTransactions(rows, 'eligible')

    expect(result.selected).toHaveLength(500)
    expect(result.truncated).toBe(true)
  })

  it('keeps one merchant together while bounding distinct merchants per preview', () => {
    const transactions = [
      { id: 'a1', merchantKey: 'same' }, { id: 'a2', merchantKey: 'same' },
      { id: 'b1', merchantKey: 'other' }, { id: 'c1', merchantKey: 'third' },
    ]

    expect(categorizationPreviewPages(transactions, 2, 500)).toEqual([
      ['a1', 'a2', 'b1'], ['c1'],
    ])
  })

  it('reports only completed bounded preview requests as progress', () => {
    expect(categorizationPreviewProgress(3, 0)).toEqual({ totalPages: 3, completedPages: 0, activePage: 1 })
    expect(categorizationPreviewProgress(3, 1)).toEqual({ totalPages: 3, completedPages: 1, activePage: 2 })
    expect(categorizationPreviewProgress(3, 9)).toEqual({ totalPages: 3, completedPages: 3, activePage: null })
    expect(categorizationPreviewProgress(0, 1)).toEqual({ totalPages: 0, completedPages: 0, activePage: null })
  })

  it('accepts only actionable suggestions by default', () => {
    const one = transaction()
    const two = transaction()
    const rows = [
      reviewRow(one),
      reviewRow(two, { status: 'protected', proposed: null, protection_reason: 'Manual correction' }),
    ]

    expect([...suggestedReviewIds(rows)]).toEqual([one.id])
  })

  it('builds stale-safe heterogeneous assignments from accepted rows', () => {
    const one = transaction()
    const two = transaction({ cat: 'Shopping', subcat: 'General retail', categoryConfidence: null })
    const rows = [reviewRow(one), reviewRow(two, {
      proposed: { category: 'Home', subcategory: 'Furnishings', source: 'ai', confidence: 0.84, needs_review: false },
    })]

    expect(buildReviewAssignments(rows, new Set([one.id, two.id]))).toEqual([
      expect.objectContaining({
        transaction_id: one.id, before_category: 'Food & drink', before_source: 'ai',
        before_confidence: 0.62, category: 'Transport', subcategory: 'Fuel',
      }),
      expect.objectContaining({
        transaction_id: two.id, before_category: 'Shopping', before_confidence: null,
        category: 'Home', subcategory: 'Furnishings',
      }),
    ])
  })
})

describe('categorisation review impact', () => {
  it('combines different proposals into one exact reporting preview', () => {
    const expense = transaction({ amount: -1200 })
    const transfer = transaction({
      cat: 'Transfer', subcat: 'Internal', kind: 'transfer', amount: -5000,
      needsReview: false,
    })
    const rows = [
      reviewRow(expense, {
        proposed: { category: 'Transfer', subcategory: 'Internal', source: 'ai', confidence: 0.95, needs_review: false },
      }),
      reviewRow(transfer, {
        proposed: { category: 'Food & drink', subcategory: 'Groceries', source: 'ai', confidence: 0.89, needs_review: false },
      }),
    ]

    const impact = buildCategorizationReviewImpact([expense, transfer], rows, new Set([expense.id, transfer.id]))

    expect(impact).toMatchObject({
      accepted: 2, categoryChanges: 2, subcategoryChanges: 2, reviewFlagsCleared: 1,
      expenseDeltaCents: 3800, earnedIncomeDeltaCents: 0,
    })
    expect(impact.kindTransitions).toEqual([
      { from: 'expense', to: 'transfer', count: 1 },
      { from: 'transfer', to: 'expense', count: 1 },
    ])
  })

  it('preserves a user-pinned kind while changing category', () => {
    const txn = transaction({ kind: 'income', kindSource: 'user', amount: 1200 })
    const row = reviewRow(txn)
    const impact = buildCategorizationReviewImpact([txn], [row], new Set([txn.id]))

    expect(impact.kindTransitions).toEqual([])
  })
})
