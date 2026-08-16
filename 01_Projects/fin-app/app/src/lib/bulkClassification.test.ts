import { describe, expect, it } from 'vitest'
import type { Txn } from '../data'
import { LEAVE_UNCHANGED } from './bulkCategory'
import {
  buildBulkClassificationChanges, buildBulkClassificationImpact,
  initialBulkClassificationDraft, NO_SPENDING_NATURE,
} from './bulkClassification'

const transaction = (overrides: Partial<Txn> = {}): Txn => ({
  id: crypto.randomUUID(), date: '2026-08-15', merchant: 'Bulk fixture',
  cat: 'Shopping', subcat: 'Household', kind: 'expense', kindSource: 'derived',
  isRecurring: false, recurringSource: 'derived', isSubscription: false,
  subscriptionSource: 'derived', spendingNature: null, isReimbursable: false,
  isTaxRelated: false, amount: -1000, account_id: 'a',
  ...overrides,
})

describe('bulk classification field semantics', () => {
  it('shows common values without creating an edit', () => {
    const rows = [transaction(), transaction()]
    const draft = initialBulkClassificationDraft(rows)
    expect(draft).toEqual({
      kind: 'expense', isRecurring: 'false', isSubscription: 'false',
      spendingNature: NO_SPENDING_NATURE, isReimbursable: 'false', isTaxRelated: 'false',
    })
    expect(buildBulkClassificationChanges(rows, draft)).toEqual({ payload: {}, hasChanges: false })
  })

  it('uses leave unchanged independently for every mixed field', () => {
    const draft = initialBulkClassificationDraft([
      transaction(),
      transaction({ kind: 'income', isRecurring: true, isSubscription: true, spendingNature: 'essential', isReimbursable: true, isTaxRelated: true }),
    ])
    expect(Object.values(draft).every((value) => value === LEAVE_UNCHANGED)).toBe(true)
  })

  it('sends only explicit changes and can explicitly clear spending nature', () => {
    const rows = [transaction(), transaction({ isRecurring: true, spendingNature: 'essential' })]
    const draft = initialBulkClassificationDraft(rows)
    expect(buildBulkClassificationChanges(rows, {
      ...draft, isRecurring: 'false', spendingNature: NO_SPENDING_NATURE,
    })).toEqual({ payload: { is_recurring: false, spending_nature: null }, hasChanges: true })
  })
})

describe('bulk classification impact', () => {
  it('counts value changes, source-only pins and affected rows exactly', () => {
    const impact = buildBulkClassificationImpact([
      transaction(),
      transaction({ isRecurring: true, recurringSource: 'user' }),
    ], { is_recurring: false })
    expect(impact.fieldChangeCounts.is_recurring).toBe(1)
    expect(impact.affectedCount).toBe(2)
    expect(impact.manualPinCount).toBe(1)
  })

  it('projects accounting deltas from a kind update', () => {
    const impact = buildBulkClassificationImpact([
      transaction({ amount: -1200 }), transaction({ amount: -800 }),
    ], { kind: 'transfer' })
    expect(impact.fieldChangeCounts.kind).toBe(2)
    expect(impact.expenseDeltaCents).toBe(-2000)
    expect(impact.earnedIncomeDeltaCents).toBe(0)
  })

  it('does not report analytics changes for attribute-only edits', () => {
    const impact = buildBulkClassificationImpact([transaction()], { is_tax_related: true })
    expect(impact.affectedCount).toBe(1)
    expect(impact.expenseDeltaCents).toBe(0)
    expect(impact.earnedIncomeDeltaCents).toBe(0)
  })
})
