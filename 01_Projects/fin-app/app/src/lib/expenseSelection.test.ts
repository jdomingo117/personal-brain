import { describe, expect, it } from 'vitest'
import { pruneSubcats } from './expenseSelection'
import type { Txn } from '../data'

describe('expense selection with tenant subcategories', () => {
  it('retains an observed custom subcategory under its selected parent', () => {
    const row: Txn = { id: 'a', date: '2026-08-14', merchant: 'Workshop', cat: 'Shopping', subcat: 'Workshop supplies', kind: 'expense', amount: -100, account_id: 'x' }
    expect(pruneSubcats(['Shopping'], ['Workshop supplies'], [row])).toEqual(['Workshop supplies'])
    expect(pruneSubcats(['Food & drink'], ['Workshop supplies'], [row])).toEqual([])
  })
})
