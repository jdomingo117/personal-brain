import { describe, it, expect } from 'vitest'
import { buildRecurring } from './recurring'
import type { Txn, Account } from '../data'

let seq = 0
function txn(partial: Partial<Txn> & Pick<Txn, 'date' | 'amount'>): Txn {
  seq += 1
  return {
    id: `txn-${seq}`,
    merchant: 'Netflix',
    kind: 'expense',
    cat: 'Lifestyle',
    subcat: 'Streaming',
    account: 'Everyday Account',
    account_id: 'acct-1',
    ...partial,
  }
}

function account(partial: Partial<Account> & Pick<Account, 'name'>): Account {
  return {
    id: partial.name,
    type: 'Liquid',
    balance: 0,
    glow: 'cyan',
    ...partial,
  }
}

const TODAY = '2026-08-01'

describe('buildRecurring', () => {
  it('detects a clean monthly fixed series', () => {
    const txns = [
      txn({ date: '2026-05-01', amount: -1599 }),
      txn({ date: '2026-06-01', amount: -1599 }),
      txn({ date: '2026-07-01', amount: -1599 }),
      txn({ date: '2026-08-01', amount: -1599 }),
    ]
    const r = buildRecurring(txns, [], TODAY)
    expect(r.series).toHaveLength(1)
    expect(r.series[0].cadence).toBe('Monthly')
    expect(r.series[0].kind).toBe('fixed')
    expect(r.series[0].monthly).toBe(1599)
    expect(r.series[0].status).toBe('active')
  })

  it('does not detect a series from fewer than MIN_OBSERVATIONS charges', () => {
    const txns = [
      txn({ date: '2026-07-01', amount: -1599 }),
      txn({ date: '2026-08-01', amount: -1599 }),
    ]
    const r = buildRecurring(txns, [], TODAY)
    expect(r.series).toHaveLength(0)
  })

  it('rejects an erratic-amount series even with a consistent cadence (hardware store, not a commitment)', () => {
    const txns = [
      txn({ date: '2026-05-01', amount: -4500, merchant: 'Bunnings' }),
      txn({ date: '2026-06-01', amount: -21000, merchant: 'Bunnings' }),
      txn({ date: '2026-07-01', amount: -3200, merchant: 'Bunnings' }),
      txn({ date: '2026-08-01', amount: -15000, merchant: 'Bunnings' }),
    ]
    const r = buildRecurring(txns, [], TODAY)
    expect(r.series).toHaveLength(0)
  })

  it('excludes transfer-flagged and pending rows from detection entirely', () => {
    const transferTxns = [
      txn({ date: '2026-05-01', amount: -50000, merchant: 'Savings Sweep', isTransfer: true }),
      txn({ date: '2026-06-01', amount: -50000, merchant: 'Savings Sweep', isTransfer: true }),
      txn({ date: '2026-07-01', amount: -50000, merchant: 'Savings Sweep', isTransfer: true }),
      txn({ date: '2026-08-01', amount: -50000, merchant: 'Savings Sweep', isTransfer: true }),
    ]
    const pendingTxns = [
      txn({ date: '2026-05-01', amount: -1599, merchant: 'Held Charge', pending: true }),
      txn({ date: '2026-06-01', amount: -1599, merchant: 'Held Charge', pending: true }),
      txn({ date: '2026-07-01', amount: -1599, merchant: 'Held Charge', pending: true }),
      txn({ date: '2026-08-01', amount: -1599, merchant: 'Held Charge', pending: true }),
    ]
    const r = buildRecurring([...transferTxns, ...pendingTxns], [], TODAY)
    expect(r.series).toHaveLength(0)
  })

  it('marks a series dormant once silent for more than 1.5 cadence cycles', () => {
    const txns = [
      txn({ date: '2026-02-01', amount: -1599 }),
      txn({ date: '2026-03-01', amount: -1599 }),
      txn({ date: '2026-04-01', amount: -1599 }),
      txn({ date: '2026-05-01', amount: -1599 }),
    ]
    // ~92 days silent by TODAY, well past 1.5 * ~30.44 days for Monthly.
    const r = buildRecurring(txns, [], TODAY)
    expect(r.series).toHaveLength(1)
    expect(r.series[0].status).toBe('dormant')
    expect(r.active).toHaveLength(0)
    expect(r.dormant).toHaveLength(1)
  })

  it('classifies a one-time price step as fixed with priceChange, not variable', () => {
    const txns = [
      txn({ date: '2026-05-01', amount: -1500 }),
      txn({ date: '2026-06-01', amount: -1500 }),
      txn({ date: '2026-07-01', amount: -2000 }),
      txn({ date: '2026-08-01', amount: -2000 }),
    ]
    const r = buildRecurring(txns, [], TODAY)
    expect(r.series).toHaveLength(1)
    expect(r.series[0].kind).toBe('fixed')
    expect(r.series[0].priceChange).toEqual({ from: 1500, to: 2000, date: '2026-07-01' })
  })

  it("resolves a series' funding-account glow from the real account list", () => {
    const txns = [
      txn({ date: '2026-05-01', amount: -1599, account: 'Up Transactions' }),
      txn({ date: '2026-06-01', amount: -1599, account: 'Up Transactions' }),
      txn({ date: '2026-07-01', amount: -1599, account: 'Up Transactions' }),
      txn({ date: '2026-08-01', amount: -1599, account: 'Up Transactions' }),
    ]
    const accounts = [account({ name: 'Up Transactions', glow: 'green' })]
    const r = buildRecurring(txns, accounts, TODAY)
    expect(r.series[0].fundingAccountGlow).toBe('green')
  })

  it('keeps the same merchant on different accounts as separate commitments', () => {
    const txns = [
      txn({ date: '2026-05-01', amount: -1599, account_id: 'acct-1', account: 'Everyday' }),
      txn({ date: '2026-06-01', amount: -1599, account_id: 'acct-1', account: 'Everyday' }),
      txn({ date: '2026-07-01', amount: -1599, account_id: 'acct-1', account: 'Everyday' }),
      txn({ date: '2026-05-02', amount: -1599, account_id: 'acct-2', account: 'Travel card' }),
      txn({ date: '2026-06-02', amount: -1599, account_id: 'acct-2', account: 'Travel card' }),
      txn({ date: '2026-07-02', amount: -1599, account_id: 'acct-2', account: 'Travel card' }),
    ]
    const r = buildRecurring(txns, [], TODAY)
    expect(r.series).toHaveLength(2)
    expect(r.series.map((series) => series.accountId).sort()).toEqual(['acct-1', 'acct-2'])
  })

  it('applies a user projection overlay without changing the observed charges', () => {
    const txns = [
      txn({ date: '2026-05-01', amount: -1599, merchantKey: 'netflix' }),
      txn({ date: '2026-06-01', amount: -1599, merchantKey: 'netflix' }),
      txn({ date: '2026-07-01', amount: -1599, merchantKey: 'netflix' }),
    ]
    const r = buildRecurring(txns, [], TODAY, new Map(), [{
      id: 'override-1', merchantKey: 'netflix', accountId: 'acct-1', state: 'active',
      cadenceOverride: 'Quarterly', expectedAmountOverride: 2400,
      nextExpectedOverride: '2026-10-15', reminderDaysBefore: 7,
    }])
    expect(r.series).toHaveLength(1)
    expect(r.series[0]).toMatchObject({ cadence: 'Quarterly', expected: 2400, nextExpected: '2026-10-15', trackingState: 'managed', reminderDaysBefore: 7 })
    expect(r.series[0].charges.map((charge) => charge.amount)).toEqual([1599, 1599, 1599])
    expect(r.series[0].monthly).toBe(800)
  })

  it('excludes a stopped commitment from totals while retaining it for explicit resume', () => {
    const txns = [
      txn({ date: '2026-05-01', amount: -1599, merchantKey: 'netflix' }),
      txn({ date: '2026-06-01', amount: -1599, merchantKey: 'netflix' }),
      txn({ date: '2026-07-01', amount: -1599, merchantKey: 'netflix' }),
    ]
    const r = buildRecurring(txns, [], TODAY, new Map(), [{
      id: 'override-1', merchantKey: 'netflix', accountId: 'acct-1', state: 'stopped',
      cadenceOverride: null, expectedAmountOverride: null, nextExpectedOverride: null, reminderDaysBefore: null,
    }])
    expect(r.series).toHaveLength(0)
    expect(r.active).toHaveLength(0)
    expect(r.untracked).toHaveLength(1)
    expect(r.untracked[0].trackingState).toBe('stopped')
  })

  it('falls back to a neutral glow when the funding account has no match', () => {
    const txns = [
      txn({ date: '2026-05-01', amount: -1599, account: 'Unknown Account' }),
      txn({ date: '2026-06-01', amount: -1599, account: 'Unknown Account' }),
      txn({ date: '2026-07-01', amount: -1599, account: 'Unknown Account' }),
      txn({ date: '2026-08-01', amount: -1599, account: 'Unknown Account' }),
    ]
    const r = buildRecurring(txns, [], TODAY)
    expect(r.series[0].fundingAccountGlow).toBe('cyan')
  })

  describe('multi-year annual evidence', () => {
    it('confirms three stable annual renewals while keeping actuals to the trailing reporting year', () => {
      const txns = [
        txn({ date: '2024-08-01', amount: -12000, merchant: 'Annual Service' }),
        txn({ date: '2025-08-01', amount: -12000, merchant: 'Annual Service' }),
        txn({ date: '2026-08-01', amount: -12000, merchant: 'Annual Service' }),
      ]
      const r = buildRecurring(txns, [], TODAY)
      expect(r.series).toHaveLength(1)
      expect(r.series[0]).toMatchObject({
        cadence: 'Annual',
        status: 'active',
        confidence: 'medium',
        expected: 12000,
        monthly: 1000,
        nextExpected: '2027-08-01',
      })
      expect(r.series[0].trailingTotal).toBe(12000)
      expect(r.trailingActual).toBe(12000)
      expect(r.annualBurn).toBe(12000)
    })

    it('keeps two matching annual charges as a non-financial early signal', () => {
      const txns = [
        txn({ date: '2025-08-01', amount: -12000, merchant: 'Annual Service' }),
        txn({ date: '2026-08-01', amount: -12000, merchant: 'Annual Service' }),
      ]
      const r = buildRecurring(txns, [], TODAY)
      expect(r.series).toHaveLength(0)
      expect(r.monthlyCommitment).toBe(0)
      expect(r.annualBurn).toBe(0)
      expect(r.candidates).toHaveLength(1)
      expect(r.candidates[0]).toMatchObject({
        source: 'annual_evidence',
        suggestedCadence: 'Annual',
        merchant: 'Annual Service',
      })
    })

    it('does not turn an off-cadence or stale annual pair into a candidate', () => {
      const offCadence = buildRecurring([
        txn({ date: '2025-08-01', amount: -12000, merchant: 'Off cadence annual' }),
        txn({ date: '2026-05-28', amount: -12000, merchant: 'Off cadence annual' }),
      ], [], TODAY)
      const stale = buildRecurring([
        txn({ date: '2023-08-01', amount: -12000, merchant: 'Old annual' }),
        txn({ date: '2024-08-01', amount: -12000, merchant: 'Old annual' }),
      ], [], TODAY)
      expect(offCadence.candidates).toHaveLength(0)
      expect(stale.candidates).toHaveLength(0)
    })
  })

  describe('candidates (AI early-detection hints)', () => {
    it('surfaces a confident, recurring hint on a thin (1-2 charge) merchant as a candidate', () => {
      const txns = [
        txn({ date: '2026-07-01', amount: -1599, merchant: 'Netflix' }),
        txn({ date: '2026-08-01', amount: -1799, merchant: 'Netflix' }),
      ]
      const hints = new Map([['netflix', { isRecurring: true, suggestedCadence: 'Monthly' as const, confidence: 0.9 }]])
      const r = buildRecurring(txns, [], TODAY, hints)
      expect(r.series).toHaveLength(0)
      expect(r.candidates).toHaveLength(1)
      expect(r.candidates[0].suggestedCadence).toBe('Monthly')
      expect(r.candidates[0].confidence).toBe(0.9)
      expect(r.candidates[0].charges).toHaveLength(2)
    })

    it('does not surface a candidate when the hint confidence is below the threshold', () => {
      const txns = [txn({ date: '2026-08-01', amount: -1599, merchant: 'Corner Store' })]
      const hints = new Map([['corner store', { isRecurring: true, suggestedCadence: null, confidence: 0.4 }]])
      const r = buildRecurring(txns, [], TODAY, hints)
      expect(r.candidates).toHaveLength(0)
    })

    it('does not surface a candidate when the hint says isRecurring: false', () => {
      const txns = [txn({ date: '2026-08-01', amount: -4500, merchant: 'Bunnings' })]
      const hints = new Map([['bunnings', { isRecurring: false, suggestedCadence: null, confidence: 0.9 }]])
      const r = buildRecurring(txns, [], TODAY, hints)
      expect(r.candidates).toHaveLength(0)
    })

    it('routes a merchant with 3+ real charges to series, never to candidates, even with a matching hint', () => {
      const txns = [
        txn({ date: '2026-05-01', amount: -1599, merchant: 'Netflix' }),
        txn({ date: '2026-06-01', amount: -1599, merchant: 'Netflix' }),
        txn({ date: '2026-07-01', amount: -1599, merchant: 'Netflix' }),
        txn({ date: '2026-08-01', amount: -1599, merchant: 'Netflix' }),
      ]
      const hints = new Map([['netflix', { isRecurring: true, suggestedCadence: 'Monthly' as const, confidence: 0.9 }]])
      const r = buildRecurring(txns, [], TODAY, hints)
      expect(r.series).toHaveLength(1)
      expect(r.candidates).toHaveLength(0)
    })

    it('produces no candidates when no hints map is supplied', () => {
      const txns = [txn({ date: '2026-08-01', amount: -1599, merchant: 'Netflix' })]
      const r = buildRecurring(txns, [], TODAY)
      expect(r.candidates).toHaveLength(0)
    })
  })
})
