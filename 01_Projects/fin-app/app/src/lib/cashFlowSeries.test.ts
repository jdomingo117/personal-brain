import { describe, expect, it } from 'vitest'
import type { Txn } from '../data'
import { buildCashFlowSeries, cashFlowGranularity } from './cashFlowSeries'

const txn = (date: string, amount: number, account_id = 'cash'): Txn => ({
  id: `${date}-${amount}`,
  date,
  amount,
  account_id,
  merchant: 'Test',
  cat: amount > 0 ? 'Income' : 'Other',
  kind: amount > 0 ? 'income' : 'expense',
})

describe('Income cash-flow series', () => {
  it('uses daily, weekly, then monthly buckets as the selected duration grows', () => {
    expect(cashFlowGranularity('2026-08-01', '2026-08-31')).toBe('day')
    expect(cashFlowGranularity('2026-05-01', '2026-07-31')).toBe('week')
    expect(cashFlowGranularity('2025-08-01', '2026-08-11')).toBe('month')
  })

  it('uses the exact selected week and preserves zero-activity days for cumulative pacing', () => {
    const series = buildCashFlowSeries({
      from: '2026-08-05',
      to: '2026-08-11',
      accountIds: ['cash'],
      transactions: [txn('2026-08-01', 9_000), txn('2026-08-06', 12_000), txn('2026-08-10', -2_000)],
    })

    expect(series.granularity).toBe('day')
    expect(series.buckets).toHaveLength(7)
    expect(series.labels).toEqual(['5 Aug', '6 Aug', '7 Aug', '8 Aug', '9 Aug', '10 Aug', '11 Aug'])
    expect(series.inflow).toEqual([0, 12_000, 0, 0, 0, 0, 0])
    expect(series.net).toEqual([0, 12_000, 0, 0, 0, -2_000, 0])
  })

  it('groups longer ranges without losing the selected interval boundaries', () => {
    const series = buildCashFlowSeries({
      from: '2026-05-01',
      to: '2026-07-31',
      accountIds: ['cash'],
      transactions: [txn('2026-05-01', 10_000), txn('2026-07-31', 15_000)],
    })

    expect(series.granularity).toBe('week')
    expect(series.buckets[0]).toMatchObject({ start: '2026-05-01', end: '2026-05-07', inflow: 10_000 })
    expect(series.buckets.at(-1)).toMatchObject({ start: '2026-07-31', end: '2026-07-31', inflow: 15_000 })
  })

  it('excludes transfers, pending rows, and unselected accounts from every granularity', () => {
    const series = buildCashFlowSeries({
      from: '2026-08-01',
      to: '2026-08-03',
      accountIds: ['cash'],
      transactions: [
        txn('2026-08-01', 10_000),
        { ...txn('2026-08-02', 8_000), kind: 'transfer', isTransfer: true },
        { ...txn('2026-08-02', 7_000), pending: true },
        txn('2026-08-03', 6_000, 'other'),
      ],
    })

    expect(series.inflow).toEqual([10_000, 0, 0])
  })

  it('treats refunds and reimbursements as contra-expense rather than income', () => {
    const series = buildCashFlowSeries({
      from: '2026-08-01', to: '2026-08-01', accountIds: ['cash'],
      transactions: [
        { ...txn('2026-08-01', 50_000), kind: 'income' },
        { ...txn('2026-08-01', -12_000), id: 'expense', kind: 'expense' },
        { ...txn('2026-08-01', 2_000), id: 'refund', kind: 'refund' },
        { ...txn('2026-08-01', 1_000), id: 'reimbursement', kind: 'reimbursement' },
      ],
    })
    expect(series.inflow).toEqual([50_000])
    expect(series.outflow).toEqual([9_000])
    expect(series.net).toEqual([41_000])
  })

  it('counts rejected derived transfers as regular activity while preserving user-pinned transfers', () => {
    const series = buildCashFlowSeries({
      from: '2026-08-01', to: '2026-08-01', accountIds: ['cash'],
      transactions: [
        { ...txn('2026-08-01', -4_747), id: 'rejected-out', kind: 'transfer', kindSource: 'derived', transferState: 'rejected', isTransfer: false },
        { ...txn('2026-08-01', 5_200), id: 'rejected-in', kind: 'transfer', kindSource: 'derived', transferState: 'rejected', isTransfer: false },
        { ...txn('2026-08-01', -9_999), id: 'pinned', kind: 'transfer', kindSource: 'user', transferState: 'rejected', isTransfer: false },
      ],
    })

    expect(series.inflow).toEqual([5_200])
    expect(series.outflow).toEqual([4_747])
    expect(series.net).toEqual([453])
  })
})
