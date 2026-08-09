import { describe, expect, it } from 'vitest'
import type { Account, Txn } from '../data'
import {
  buildProjection,
  currentValueFor,
  deriveProjectionBaseline,
  firstTargetPoint,
  requiredMonthlyAdjustment,
} from './projections'

const accounts: Account[] = [
  { id: 'cash', name: 'Everyday', type: 'Liquid', balance: 50_000_00, glow: 'cyan' },
  { id: 'save', name: 'Reserve', type: 'Savings', balance: 20_000_00, glow: 'green' },
  { id: 'fund', name: 'Index fund', type: 'Invest', balance: 30_000_00, glow: 'blue' },
  { id: 'card', name: 'Card', type: 'Credit Card', balance: -2_000_00, glow: 'red' },
]

const txn = (id: string, date: string, amount: number, account_id = 'cash', cat = 'Income', isTransfer = false): Txn => ({
  id, date, amount, account_id, cat, isTransfer, merchant: id,
})

describe('strategic projection model', () => {
  it('separates available cash from total net worth', () => {
    expect(currentValueFor('cash', accounts)).toBe(70_000_00)
    expect(currentValueFor('netWorth', accounts)).toBe(98_000_00)
  })

  it('uses complete months, excludes transfers, and treats investing differently by metric', () => {
    const transactions = [
      txn('salary-jan', '2026-01-15', 8_000_00),
      txn('spend-jan', '2026-01-20', -3_000_00, 'cash', 'Food'),
      txn('invest-jan', '2026-01-25', -1_000_00, 'cash', 'Investing'),
      txn('transfer-jan', '2026-01-28', -2_000_00, 'cash', 'Transfer', true),
      txn('transfer-in-jan', '2026-01-28', 2_000_00, 'save', 'Transfer', true),
      txn('salary-feb', '2026-02-15', 8_000_00),
      txn('spend-feb', '2026-02-20', -3_000_00, 'cash', 'Food'),
      txn('invest-feb', '2026-02-25', -1_000_00, 'cash', 'Investing'),
      txn('partial-current', '2026-03-02', 20_000_00),
    ]
    const today = new Date(2026, 2, 10)

    expect(deriveProjectionBaseline('cash', accounts, transactions, today, 6)).toMatchObject({
      monthlyFlow: 4_000_00,
      monthsUsed: 2,
    })
    expect(deriveProjectionBaseline('netWorth', accounts, transactions, today, 6)).toMatchObject({
      monthlyFlow: 5_000_00,
      monthlyInvestmentContribution: 1_000_00,
      monthsUsed: 2,
    })
  })

  it('builds a stable deterministic cash trajectory', () => {
    const points = buildProjection({
      metric: 'cash', currentValue: 10_000_00, investmentBalance: 0,
      monthlyFlow: 1_000_00, monthlyInvestmentContribution: 0,
      annualReturnPct: 0, months: 3, startDate: new Date(2026, 0, 1),
    })
    expect(points.map((point) => point.value)).toEqual([10_000_00, 11_000_00, 12_000_00, 13_000_00])
    expect(firstTargetPoint(points, 12_000_00)?.date).toBe('2026-03')
    expect(firstTargetPoint(points, 5_000_00)?.date).toBe('2026-01')
  })

  it('calculates the additional monthly amount for a dated goal', () => {
    const inputs = {
      metric: 'cash' as const, currentValue: 10_000_00, investmentBalance: 0,
      monthlyFlow: 1_000_00, monthlyInvestmentContribution: 0,
      annualReturnPct: 0, months: 4, startDate: new Date(2026, 0, 1),
    }
    expect(requiredMonthlyAdjustment(inputs, 18_000_00)).toBe(1_000_00)
    expect(requiredMonthlyAdjustment(inputs, 13_000_00)).toBe(0)
  })

  it('can begin a what-if adjustment in a future month', () => {
    const points = buildProjection({
      metric: 'cash', currentValue: 10_000_00, investmentBalance: 0,
      monthlyFlow: 1_000_00, monthlyInvestmentContribution: 0,
      annualReturnPct: 0, monthlyAdjustment: 500_00, adjustmentStartMonth: 3,
      months: 4, startDate: new Date(2026, 0, 1),
    })
    expect(points.map((point) => point.value)).toEqual([
      10_000_00, 11_000_00, 12_000_00, 13_500_00, 15_000_00,
    ])
  })
})
