import { describe, expect, it } from 'vitest'
import { expandTransactionAllocations } from './allocations'
import type { Txn } from '../data'

const base: Txn = { id: 't', date: '2026-08-14', merchant: 'Mixed shop', cat: 'Shopping', subcat: 'General retail', kind: 'expense', amount: -10000, account_id: 'a' }

describe('split reporting expansion', () => {
  it('preserves an unsplit bank row', () => expect(expandTransactionAllocations([base])).toEqual([base]))
  it('replaces a parent with exact child allocations for analytics', () => {
    const rows = expandTransactionAllocations([{ ...base, allocations: [
      { id: '1', position: 0, amount: -7000, kind: 'expense', category: 'Shopping', subcategory: 'Household' },
      { id: '2', position: 1, amount: -3000, kind: 'reimbursement', category: 'Income', subcategory: 'Reimbursement' },
    ] }])
    expect(rows.map((row) => [row.amount, row.kind, row.cat])).toEqual([[-7000, 'expense', 'Shopping'], [-3000, 'reimbursement', 'Income']])
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(base.amount)
    expect(rows.every((row) => row.parentTransactionId === base.id && row.isAllocation)).toBe(true)
  })
})
