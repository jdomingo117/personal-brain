import { describe, expect, it } from 'vitest'
import type { Txn } from '../data'
import {
  filterLedger, isExactMatchingLedgerSelection, isMissingSubcategory, MAX_BULK_SELECTION,
  reviewCount, selectAllMatchingLedgerTransactions, summarizeLedgerSelection, toggleLedgerPageSelection,
} from './ledger'

const rows: Txn[] = [
  { id: '1', date: '2026-08-01', merchant: 'Cafe One', originalDescription: 'CARD CAFE ONE', cat: 'Food & drink', subcat: 'Coffee', kind: 'expense', amount: -500, account_id: 'a', account: 'Daily', categorySource: 'ai', categoryConfidence: 0.82 },
  { id: '2', date: '2026-08-02', merchant: 'Mystery', cat: 'Uncategorized', kind: 'expense', amount: -900, account_id: 'a', account: 'Daily', categorySource: 'ai', categoryConfidence: 0, needsReview: true },
  { id: '3', date: '2026-08-03', merchant: 'Power Co', cat: 'Bills & utilities', kind: 'expense', amount: -12000, account_id: 'b', account: 'Bills', categorySource: 'bank' },
  { id: '4', date: '2026-08-04', merchant: 'Employer', cat: 'Income', subcat: 'Salary', kind: 'income', amount: 200000, account_id: 'a', account: 'Daily', categorySource: 'user' },
]

describe('ledger review filtering', () => {
  it('finds unresolved and uncategorized transactions without conflating reviewed Other', () => {
    expect(reviewCount(rows)).toBe(1)
    expect(filterLedger(rows, { query: '', accountId: '', category: '', review: 'uncategorized' }).map((row) => row.id)).toEqual(['2'])
  })

  it('detects categories whose vocabulary expects a subcategory', () => {
    expect(isMissingSubcategory(rows[2])).toBe(true)
    expect(filterLedger(rows, { query: '', accountId: '', category: '', review: 'missing-subcategory' }).map((row) => row.id)).toEqual(['3'])
  })

  it('combines text, account, category and provenance filters', () => {
    expect(filterLedger(rows, { query: 'card cafe', accountId: 'a', category: 'Food & drink', review: 'ai' }).map((row) => row.id)).toEqual(['1'])
    expect(filterLedger(rows, { query: '', accountId: 'a', category: '', review: 'user' }).map((row) => row.id)).toEqual(['4'])
  })

  it('filters cross-cutting attributes without competing with category', () => {
    const attributed = rows.map((row, index) => index === 0 ? { ...row, isSubscription: true, isRecurring: true, isTaxRelated: true } : row)
    expect(filterLedger(attributed, { query: '', accountId: '', category: '', review: 'subscription' }).map((row) => row.id)).toEqual(['1'])
    expect(filterLedger(attributed, { query: '', accountId: '', category: '', review: 'recurring' }).map((row) => row.id)).toEqual(['1'])
    expect(filterLedger(attributed, { query: '', accountId: '', category: '', review: 'tax-related' }).map((row) => row.id)).toEqual(['1'])
  })
})

describe('ledger cross-page selection summary', () => {
  it('separates the current page from selected transactions elsewhere', () => {
    expect(summarizeLedgerSelection(
      new Set(['1', '2', '3', '4']),
      [{ id: '3' }, { id: '4' }, { id: '5' }],
      rows,
    )).toEqual({ total: 4, currentPage: 2, elsewhere: 2 })
  })

  it('does not count stale selected ids that no longer exist', () => {
    expect(summarizeLedgerSelection(
      new Set(['1', 'missing']),
      [{ id: '1' }],
      rows,
    )).toEqual({ total: 1, currentPage: 1, elsewhere: 0 })
  })
})

describe('ledger bulk selection boundary', () => {
  const matching = Array.from({ length: 507 }, (_, index) => ({ id: String(index + 1) }))

  it('selects every match up to the visible 500-row boundary', () => {
    const selected = selectAllMatchingLedgerTransactions(matching)

    expect(selected.size).toBe(MAX_BULK_SELECTION)
    expect(selected.has('500')).toBe(true)
    expect(selected.has('501')).toBe(false)
    expect(isExactMatchingLedgerSelection(selected, matching)).toBe(true)
  })

  it('selects all matching rows when the result is below the boundary', () => {
    const selected = selectAllMatchingLedgerTransactions(matching.slice(0, 57))

    expect(selected.size).toBe(57)
    expect(isExactMatchingLedgerSelection(selected, matching.slice(0, 57))).toBe(true)
  })

  it('adds a page only until the selection reaches 500', () => {
    const existing = new Set(matching.slice(0, 490).map((transaction) => transaction.id))
    const next = toggleLedgerPageSelection(existing, matching.slice(490, 540))

    expect(next.size).toBe(500)
    expect(next.has('500')).toBe(true)
    expect(next.has('501')).toBe(false)
  })

  it('clears a partial current page when already at the boundary', () => {
    const selected = new Set(matching.slice(0, 500).map((transaction) => transaction.id))
    const currentPage = matching.slice(495, 507)
    const next = toggleLedgerPageSelection(selected, currentPage)

    expect(next.size).toBe(495)
    expect(currentPage.every((transaction) => !next.has(transaction.id))).toBe(true)
  })
})
