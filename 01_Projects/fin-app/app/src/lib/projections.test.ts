import { describe, expect, it } from 'vitest'
import type { Account, Txn } from '../data'
import {
  buildProjection,
  buildProjectionBreakdown,
  currentValueFor,
  deriveProjectionBaseline,
  firstTargetPoint,
  requiredMonthlyAdjustment,
} from './projections'
import { defaultTransactionKind } from './classification'
import { reviewCompletedMonth } from './planningReview'

const accounts: Account[] = [
  { id: 'cash', name: 'Everyday', type: 'Liquid', balance: 50_000_00, glow: 'cyan' },
  { id: 'save', name: 'Reserve', type: 'Savings', balance: 20_000_00, glow: 'green' },
  { id: 'fund', name: 'Index fund', type: 'Invest', balance: 30_000_00, glow: 'blue' },
  { id: 'card', name: 'Card', type: 'Credit Card', balance: -2_000_00, glow: 'red' },
]

const txn = (id: string, date: string, amount: number, account_id = 'cash', cat = 'Income', isTransfer = false): Txn => ({
  id, date, amount, account_id, cat, kind: defaultTransactionKind(cat, null, amount), isTransfer, merchant: id,
})

describe('strategic projection model', () => {
  it('separates available cash from total net worth', () => {
    expect(currentValueFor('cash', accounts)).toBe(70_000_00)
    expect(currentValueFor('netWorth', accounts)).toBe(98_000_00)
  })

  it('uses complete months, excludes transfers, and treats investing differently by metric', () => {
    const transactions = [
      txn('salary-jan', '2026-01-15', 8_000_00),
      txn('spend-jan', '2026-01-20', -3_000_00, 'cash', 'Food & drink'),
      txn('invest-jan', '2026-01-25', -1_000_00, 'cash', 'Investing'),
      txn('transfer-jan', '2026-01-28', -2_000_00, 'cash', 'Transfer', true),
      txn('transfer-in-jan', '2026-01-28', 2_000_00, 'save', 'Transfer', true),
      txn('salary-feb', '2026-02-15', 8_000_00),
      txn('spend-feb', '2026-02-20', -3_000_00, 'cash', 'Food & drink'),
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

  it('applies one-off and bounded monthly planning events in their calendar months', () => {
    const points = buildProjection({
      metric: 'cash', currentValue: 10_000_00, investmentBalance: 0,
      monthlyFlow: 1_000_00, monthlyInvestmentContribution: 0,
      annualReturnPct: 0, months: 4, startDate: new Date(2026, 0, 1),
      events: [
        { id: 'trip', name: 'Trip', amountCents: -2_000_00, cadence: 'once', startDate: '2026-03-15' },
        { id: 'raise', name: 'Raise', amountCents: 300_00, cadence: 'monthly', startDate: '2026-02-01', endDate: '2026-03-31' },
      ],
    })
    expect(points.map((point) => point.value)).toEqual([10_000_00, 11_300_00, 10_600_00, 11_600_00, 12_600_00])
  })

  it('provides an exact, inspectable reconciliation for each forecast month', () => {
    const [february] = buildProjectionBreakdown({
      metric: 'netWorth', currentValue: 10_000_00, investmentBalance: 5_000_00,
      monthlyFlow: 1_000_00, monthlyInvestmentContribution: 0,
      annualReturnPct: 12, months: 1, startDate: new Date(2026, 0, 1),
      events: [{ id: 'trip', name: 'Trip', amountCents: -200_00, cadence: 'once', startDate: '2026-02-10' }],
    })
    expect(february.plannedEvents.map((event) => event.name)).toEqual(['Trip'])
    expect(february.openingValue + february.observedRunRate + february.adjustment + february.plannedMovement + february.investmentGrowth).toBe(february.closingValue)
  })

  it('reviews only the completed month and reconciles planned variance', () => {
    const review = reviewCompletedMonth({
      metric: 'cash', accounts, monthlyRunRate: 1_000_00, today: new Date(2026, 2, 10),
      transactions: [txn('feb-income', '2026-02-03', 1_500_00), txn('feb-food', '2026-02-10', -300_00), txn('mar-partial', '2026-03-01', 9_000_00)],
      events: [{ id: 'trip', name: 'Trip', amountCents: -200_00, cadence: 'once', startDate: '2026-02-14' }],
    })
    expect(review.month).toBe('2026-02')
    expect(review.actualMovement).toBe(1_200_00)
    expect(review.expectedMovement).toBe(800_00)
    expect(review.variance).toBe(400_00)
    expect(review.observedRunRateDifference + review.plannedEventDifference + review.recurringTimingDifference + review.uncategorisedResidual).toBe(review.variance)
  })
})
