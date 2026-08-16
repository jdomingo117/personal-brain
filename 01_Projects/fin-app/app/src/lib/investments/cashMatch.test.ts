import { describe, expect, it } from 'vitest'
import {
  expectedBankAmount,
  investmentCashContentKey,
  matchInvestmentCash,
  type InvestmentCashActivity,
  type InvestmentCashTransaction,
} from './cashMatch'

const activity = (overrides: Partial<InvestmentCashActivity> = {}): InvestmentCashActivity => ({
  id: 'activity-1', accountId: 'invest-1', tradeDate: '2025-10-13', activityType: 'purchase',
  valueCents: 3_000_000, brokerageCents: 0, sourceHash: 'a'.repeat(64), occurrence: 0,
  platform: 'vanguard_personal_investor', instrumentName: 'Vanguard High Growth Index Fund',
  ...overrides,
})
const transaction = (overrides: Partial<InvestmentCashTransaction> = {}): InvestmentCashTransaction => ({
  id: 'txn-1', accountId: 'cash-1', date: '2025-10-13', amountCents: -3_000_000,
  description: "To Vanguard Cash Account - Funds Transfer", kind: 'transfer', category: 'Transfer',
  dedupeHash: 'b'.repeat(64), occurrence: 0, ...overrides,
})

describe('investment cash matching', () => {
  it.each([
    ['2025-06-10', '2025-06-11', 1_000_000],
    ['2025-07-09', '2025-07-10', 371_500],
    ['2025-10-03', '2025-10-06', 200_000],
    ['2025-10-13', '2025-10-13', 3_000_000],
  ])('auto-links the anonymized Vanguard pair %s → %s', (bankDate, tradeDate, cents) => {
    const result = matchInvestmentCash(
      [transaction({ date: bankDate, amountCents: -cents })],
      [activity({ tradeDate, valueCents: cents })],
    )
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0]).toMatchObject({ state: 'auto', ambiguous: false })
  })

  it('uses brokerage in purchase and redemption settlement amounts', () => {
    expect(expectedBankAmount(activity({ valueCents: 10_000, brokerageCents: 500 }))).toBe(-10_500)
    expect(expectedBankAmount(activity({ activityType: 'redemption', valueCents: 10_000, brokerageCents: 500 }))).toBe(9_500)
  })

  it('matches redemption proceeds in the opposite direction', () => {
    const result = matchInvestmentCash(
      [transaction({ amountCents: 995_00, description: 'From Vanguard redemption' })],
      [activity({ activityType: 'redemption', valueCents: 1_000_00, brokerageCents: 500 })],
    )
    expect(result.pairs).toHaveLength(1)
  })

  it('does not guess between equally good same-value bank rows', () => {
    const result = matchInvestmentCash(
      [transaction(), transaction({ id: 'txn-2', accountId: 'cash-2' })],
      [activity()],
    )
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0]).toMatchObject({ state: 'suggested', ambiguous: true })
  })

  it('honours durable rejected and confirmed pair identities', () => {
    const txn = transaction()
    const act = activity()
    const key = investmentCashContentKey(txn, act)
    expect(matchInvestmentCash([txn], [act], { rejectedPairKeys: new Set([key]) }).pairs).toHaveLength(0)
    expect(matchInvestmentCash([txn], [act], { confirmedPairKeys: new Set([key]) }).pairs[0].state).toBe('confirmed')
  })

  it('rejects amount mismatches, out-of-window dates, and zero settlements', () => {
    expect(matchInvestmentCash([transaction({ amountCents: -1 })], [activity()]).pairs).toHaveLength(0)
    expect(matchInvestmentCash([transaction({ date: '2025-10-01' })], [activity()]).pairs).toHaveLength(0)
    expect(matchInvestmentCash([transaction({ amountCents: 0 })], [activity({ activityType: 'redemption', valueCents: 500, brokerageCents: 500 })]).pairs).toHaveLength(0)
  })
})
