import { describe, it, expect } from 'vitest'
import { matchTransfers, pairHistoryKey, pairKey } from './match'
import { AUTO_THRESHOLD, MAX_BUCKET, PAIR_CADENCE_BONUS, SUGGESTED_THRESHOLD } from './constants'
import type { AccountIdentifier, TransferLeg } from './types'

let seq = 0
function leg(partial: Partial<TransferLeg> & Pick<TransferLeg, 'accountId' | 'accountType' | 'date' | 'amountCents'>): TransferLeg {
  seq += 1
  return {
    txnId: `txn-${seq}`,
    accountName: partial.accountId,
    originalDescription: '',
    dedupeHashHex: `hash-${seq}`,
    occurrence: 0,
    ...partial,
  }
}

describe('matchTransfers', () => {
  it('pairs a same-day reciprocal-mask transfer with a high score', () => {
    const from = leg({
      accountId: 'macquarie-txn', accountType: 'Liquid', date: '2026-07-12', amountCents: -1500,
      accountName: 'Macquarie Transaction', originalDescription: 'To Linked Account Xx3692 - Internal Transfer',
    })
    const to = leg({
      accountId: 'macquarie-savings', accountType: 'Savings', date: '2026-07-12', amountCents: 1500,
      accountName: 'Macquarie Savings', originalDescription: 'From Linked Account Xx3965 - Internal Transfer',
    })

    const { pairs } = matchTransfers([from, to])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].from.txnId).toBe(from.txnId)
    expect(pairs[0].to.txnId).toBe(to.txnId)
  })

  it('account identifiers lift a reciprocal-mask pair from suggested into auto', () => {
    const from = leg({
      accountId: 'macquarie-txn', accountType: 'Liquid', date: '2026-07-12', amountCents: -1500,
      accountName: 'Macquarie Transaction', originalDescription: 'To Linked Account Xx3692 - Internal Transfer',
    })
    const to = leg({
      accountId: 'macquarie-savings', accountType: 'Savings', date: '2026-07-12', amountCents: 1500,
      accountName: 'Macquarie Savings', originalDescription: 'From Linked Account Xx3965 - Internal Transfer',
    })

    const withoutIdentifiers = matchTransfers([from, to]).pairs[0]

    const identifiers: AccountIdentifier[] = [
      { accountId: 'macquarie-savings', kind: 'mask', value: '3692', confidence: 1 },
      { accountId: 'macquarie-txn', kind: 'mask', value: '3965', confidence: 1 },
    ]
    const withIdentifiers = matchTransfers([from, to], identifiers).pairs[0]

    // The self-improving loop: the same pair scores strictly higher once the
    // masks resolve to known accounts (date+direction+lexicon+account-type
    // alone land it in 'suggested'; the reciprocal mask match is worth 0.20
    // of the total weight on its own, which here is not quite enough to also
    // clear 'auto' — that needs a second corroborating signal, e.g. a shared
    // embedded-date token, which this synthetic pair doesn't carry).
    expect(withoutIdentifiers.state).toBe('suggested')
    expect(withIdentifiers.score).toBeGreaterThan(withoutIdentifiers.score)
    expect(withIdentifiers.score - withoutIdentifiers.score).toBeCloseTo(0.2, 5)
  })

  it('never pairs two legs on the same account (G2)', () => {
    const a = leg({ accountId: 'acct-1', accountType: 'Liquid', date: '2026-07-08', amountCents: -63082, originalDescription: 'Internet Withdrawal 07Jul22:43' })
    const b = leg({ accountId: 'acct-1', accountType: 'Liquid', date: '2026-07-08', amountCents: 63082, originalDescription: 'Sct Deposit 07Jul22:43' })
    const { pairs } = matchTransfers([a, b])
    expect(pairs).toHaveLength(0)
  })

  it('never pairs the synthetic opening-balance anchor (G5)', () => {
    const anchor = leg({
      accountId: 'acct-1', accountType: 'Liquid', date: '2026-01-01', amountCents: -100000,
      subcategory: 'Reconciliation', originalDescription: 'Opening Balance',
    })
    const real = leg({ accountId: 'acct-2', accountType: 'Savings', date: '2026-01-01', amountCents: 100000 })
    const { pairs } = matchTransfers([anchor, real])
    expect(pairs).toHaveLength(0)
  })

  it('resolves a four-leg ambiguity chain without cross-pairing the wrong legs', () => {
    // The real St George/Macquarie corpus case: 630.82 appears four times
    // across three accounts. A naive amount+date matcher cross-pairs them;
    // this asserts the account-identity gate (G2) and greedy best-first
    // assignment keep same-account legs from ever pairing with each other.
    const macquarieOut = leg({
      accountId: 'macquarie-txn', accountType: 'Liquid', date: '2026-07-07', amountCents: -63082,
      accountName: 'St George Complete Freedom', originalDescription: 'To St George Complete Freedom - Funds Transfer',
    })
    const stgIn = leg({
      accountId: 'stgeorge-txn', accountType: 'Liquid', date: '2026-07-08', amountCents: 63082,
      originalDescription: 'Sct Deposit                   07Jul22:43 Funds Transfer Domingo J T',
    })
    const stgOut = leg({
      accountId: 'stgeorge-txn', accountType: 'Liquid', date: '2026-07-08', amountCents: -63082,
      originalDescription: 'Internet Withdrawal           07Jul22:43 To 4601841001739020',
    })
    const stgCcIn = leg({
      accountId: 'stgeorge-cc', accountType: 'Credit Card', date: '2026-07-08', amountCents: 63082,
      originalDescription: 'Phone/Internet Tfr From    0000439102433',
    })

    const { pairs } = matchTransfers([macquarieOut, stgIn, stgOut, stgCcIn])

    // Invariant that matters: stgIn and stgOut share an account, so G2
    // forbids them from ever appearing paired with each other.
    for (const p of pairs) {
      expect(p.from.accountId).not.toBe(p.to.accountId)
    }
    // Every leg is used at most once.
    const used = pairs.flatMap((p) => [p.from.txnId, p.to.txnId])
    expect(new Set(used).size).toBe(used.length)
  })

  it('marks an ambiguous pair when two candidates score within the margin', () => {
    // Two identical-amount, same-day transfers between the same account pair —
    // genuinely indistinguishable without more signal.
    const out1 = leg({ accountId: 'acct-1', accountType: 'Liquid', date: '2026-07-01', amountCents: -50000, originalDescription: 'To Linked Account - Internal Transfer' })
    const out2 = leg({ accountId: 'acct-1', accountType: 'Liquid', date: '2026-07-01', amountCents: -50000, originalDescription: 'To Linked Account - Internal Transfer' })
    const in1 = leg({ accountId: 'acct-2', accountType: 'Savings', date: '2026-07-01', amountCents: 50000, originalDescription: 'From Linked Account - Internal Transfer' })
    const in2 = leg({ accountId: 'acct-2', accountType: 'Savings', date: '2026-07-01', amountCents: 50000, originalDescription: 'From Linked Account - Internal Transfer' })

    const { pairs } = matchTransfers([out1, out2, in1, in2])
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs.every((p) => p.ambiguous)).toBe(true)
    expect(pairs.every((p) => p.state === 'suggested')).toBe(true)
  })

  it('skips an amount bucket entirely once it exceeds MAX_BUCKET, and reports it', () => {
    const legs: TransferLeg[] = []
    const n = MAX_BUCKET + 4
    for (let i = 0; i < n; i++) {
      const sign = i % 2 === 0 ? -1 : 1
      legs.push(leg({ accountId: sign < 0 ? 'acct-1' : 'acct-2', accountType: 'Liquid', date: '2026-07-01', amountCents: sign * 500 }))
    }
    const { pairs, overflowedAmounts } = matchTransfers(legs)
    expect(pairs).toHaveLength(0)
    expect(overflowedAmounts).toEqual([500])
  })

  it('is idempotent: re-running on the same input yields identical pairs and scores', () => {
    const from = leg({ accountId: 'a', accountType: 'Liquid', date: '2026-07-01', amountCents: -1000, originalDescription: 'To Linked Account Xx1234 - Internal Transfer' })
    const to = leg({ accountId: 'b', accountType: 'Savings', date: '2026-07-01', amountCents: 1000, originalDescription: 'From Linked Account Xx5678 - Internal Transfer' })

    const run1 = matchTransfers([from, to])
    const run2 = matchTransfers([from, to])
    expect(run1.pairs).toEqual(run2.pairs)
  })

  it('does not persist a pair below the suggested threshold', () => {
    const from = leg({ accountId: 'a', accountType: 'Liquid', date: '2026-01-01', amountCents: -733, originalDescription: 'Coles Supermarket' })
    const to = leg({ accountId: 'b', accountType: 'Savings', date: '2026-02-15', amountCents: 733, originalDescription: 'Unrelated Deposit' })
    const { pairs } = matchTransfers([from, to])
    expect(pairs).toHaveLength(0)
  })

  // Regression: a rejected pair used to be re-proposed on every rescan.
  // Greedy assignment then consumed both legs again, so the correct
  // counterpart never got a turn — one wrong guess disabled detection for
  // that leg permanently.
  it('skips a rejected pair and falls through to the correct counterpart', () => {
    const from = leg({
      accountId: 'a', accountType: 'Liquid', date: '2026-07-01', amountCents: -50000,
      originalDescription: 'To Linked Account - Internal Transfer',
    })
    const wrong = leg({
      accountId: 'b', accountType: 'Savings', date: '2026-07-01', amountCents: 50000,
      originalDescription: 'From Linked Account - Internal Transfer',
    })
    const right = leg({
      accountId: 'c', accountType: 'Savings', date: '2026-07-01', amountCents: 50000,
      originalDescription: 'From Linked Account - Internal Transfer',
    })

    const withoutExclusion = matchTransfers([from, wrong, right]).pairs
    expect(withoutExclusion).toHaveLength(1)

    const afterRejection = matchTransfers([from, wrong, right], [], {
      rejectedPairKeys: new Set([pairKey(from.txnId, withoutExclusion[0].to.txnId)]),
    }).pairs

    expect(afterRejection).toHaveLength(1)
    expect(afterRejection[0].to.txnId).not.toBe(withoutExclusion[0].to.txnId)
    expect(afterRejection[0].from.txnId).toBe(from.txnId)
  })

  it('never proposes a pair touching a leg pinned by a confirmed link', () => {
    const from = leg({ accountId: 'a', accountType: 'Liquid', date: '2026-07-01', amountCents: -50000, originalDescription: 'To Linked Account - Internal Transfer' })
    const to = leg({ accountId: 'b', accountType: 'Savings', date: '2026-07-01', amountCents: 50000, originalDescription: 'From Linked Account - Internal Transfer' })

    expect(matchTransfers([from, to]).pairs).toHaveLength(1)
    expect(
      matchTransfers([from, to], [], { pinnedLegIds: new Set([from.txnId]) }).pairs,
    ).toHaveLength(0)
  })

  it('scores a card payment (Liquid out -> Credit Card in) favourably', () => {
    const from = leg({ accountId: 'liquid', accountType: 'Liquid', date: '2026-07-10', amountCents: -20000, originalDescription: 'BPAY Payment to Amex' })
    const to = leg({ accountId: 'cc', accountType: 'Credit Card', date: '2026-07-10', amountCents: 20000, originalDescription: 'Payment Received, Thank You' })
    const { pairs } = matchTransfers([from, to])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].score).toBeGreaterThanOrEqual(SUGGESTED_THRESHOLD)
  })

  // Regression: real-data trace found "Transfer to Spending"/"Transfer from
  // Savings" (Up Bank's own fixed wording for its Saver sweep) scoring 0.45
  // — under SUGGESTED_THRESHOLD — purely because LEXICON_RE didn't recognize
  // the phrase, even though a genuine same-day, opposite-account pair
  // existed. 3,086 real unmatched rows, 393 of them this exact shape.
  it('recognizes Up\'s generic "Transfer to/from Spending/Savings" wording as lexical', () => {
    // accountName deliberately avoids "ing"-suffixed words (see the separate
    // scoreName substring-collision bug this test uncovered, tracked below) —
    // this test isolates the lexicon fix specifically.
    const from = leg({ accountId: 'acct-a', accountName: 'Account A', accountType: 'Savings', date: '2026-07-01', amountCents: -2000, originalDescription: 'Transfer to Spending' })
    const to = leg({ accountId: 'acct-b', accountName: 'Account B', accountType: 'Liquid', date: '2026-07-01', amountCents: 2000, originalDescription: 'Transfer from Savings' })
    const { pairs } = matchTransfers([from, to])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].score).toBeCloseTo(0.55, 4)
    expect(pairs[0].state).toBe('suggested')
    expect(pairs[0].reasons).toContain('lexicon:both')
  })

  describe('pair-history cadence bonus', () => {
    it('a pair with no cadence history behaves identically to today (bonus is 0)', () => {
      const from = leg({ accountId: 'a', accountType: 'Liquid', date: '2026-07-01', amountCents: -1000, originalDescription: 'To Linked Account Xx1234 - Internal Transfer' })
      const to = leg({ accountId: 'b', accountType: 'Savings', date: '2026-07-01', amountCents: 1000, originalDescription: 'From Linked Account Xx5678 - Internal Transfer' })
      const withDefault = matchTransfers([from, to]).pairs[0]
      const withEmptyMap = matchTransfers([from, to], [], {}, new Map()).pairs[0]
      expect(withDefault.score).toBe(withEmptyMap.score)
    })

    // Reuses the reciprocal-mask setup from the 'account identifiers lift...'
    // test above, whose comment establishes its baseline at 0.75 — short of
    // AUTO_THRESHOLD (0.8) but close enough that the +0.15 cadence bonus
    // crosses it, unlike the plain lexicon/direction-only pair (0.55) which
    // would still fall short even with the bonus.
    it('lifts a near-auto pair across the auto threshold when the amount matches the established cadence', () => {
      const identifiers: AccountIdentifier[] = [
        { accountId: 'macquarie-savings', kind: 'mask', value: '3692', confidence: 1 },
        { accountId: 'macquarie-txn', kind: 'mask', value: '3965', confidence: 1 },
      ]
      const from = leg({
        accountId: 'macquarie-txn', accountType: 'Liquid', date: '2026-07-15', amountCents: -1500,
        accountName: 'Macquarie Transaction', originalDescription: 'To Linked Account Xx3692 - Internal Transfer',
      })
      const to = leg({
        accountId: 'macquarie-savings', accountType: 'Savings', date: '2026-07-15', amountCents: 1500,
        accountName: 'Macquarie Savings', originalDescription: 'From Linked Account Xx3965 - Internal Transfer',
      })

      const baseline = matchTransfers([from, to], identifiers).pairs[0]
      expect(baseline.state).toBe('suggested') // sanity: below AUTO_THRESHOLD without history

      // A 14-day-apart, same-amount history — a fortnightly sweep — with the
      // candidate landing exactly on the next cycle.
      const cadences = new Map([[pairHistoryKey('macquarie-txn', 'macquarie-savings'), { cadence: 'Biweekly' as const, expectedAmountCents: 1500, lastDate: '2026-07-01' }]])
      const boosted = matchTransfers([from, to], identifiers, {}, cadences).pairs[0]

      expect(boosted.score).toBeCloseTo(Math.min(1, baseline.score + PAIR_CADENCE_BONUS), 4)
      expect(boosted.reasons).toContain('recurring-pair')
      expect(boosted.state).toBe('auto')
    })

    it('does not apply the bonus when the candidate amount is outside the tolerance band', () => {
      const from = leg({ accountId: 'a', accountType: 'Liquid', date: '2026-07-15', amountCents: -65000, originalDescription: 'To Linked Account - Internal Transfer' })
      const to = leg({ accountId: 'b', accountType: 'Savings', date: '2026-07-15', amountCents: 65000, originalDescription: 'From Linked Account - Internal Transfer' })

      const baseline = matchTransfers([from, to]).pairs[0]
      const cadences = new Map([[pairHistoryKey('a', 'b'), { cadence: 'Biweekly' as const, expectedAmountCents: 20000, lastDate: '2026-07-01' }]])
      const unaffected = matchTransfers([from, to], [], {}, cadences).pairs[0]

      expect(unaffected.score).toBe(baseline.score)
      expect(unaffected.reasons).not.toContain('recurring-pair')
    })
  })

  describe('provider-timestamp ambiguity tie-breaker', () => {
    it('a close provider timestamp can lift a near-auto pair across the auto threshold', () => {
      const identifiers: AccountIdentifier[] = [
        { accountId: 'macquarie-savings', kind: 'mask', value: '3692', confidence: 1 },
        { accountId: 'macquarie-txn', kind: 'mask', value: '3965', confidence: 1 },
      ]
      const from = leg({
        accountId: 'macquarie-txn', accountType: 'Liquid', date: '2026-07-12', amountCents: -1500,
        accountName: 'Macquarie Transaction', originalDescription: 'To Linked Account Xx3692 - Internal Transfer',
      })
      const to = leg({
        accountId: 'macquarie-savings', accountType: 'Savings', date: '2026-07-12', amountCents: 1500,
        accountName: 'Macquarie Savings', originalDescription: 'From Linked Account Xx3965 - Internal Transfer',
      })

      // Matches the existing 'account identifiers lift...' test: reciprocal
      // mask alone lands this at 0.75, still short of AUTO_THRESHOLD (0.8).
      const withoutTime = matchTransfers([from, to], identifiers).pairs[0]
      expect(withoutTime.state).toBe('suggested')

      const withTime = matchTransfers(
        [{ ...from, providerPostedAt: '2026-07-12T09:00:00Z' }, { ...to, providerPostedAt: '2026-07-12T09:01:00Z' }],
        identifiers,
      ).pairs[0]
      expect(withTime.score).toBeGreaterThan(withoutTime.score)
      expect(withTime.reasons).toContain('timestamp:close')
      expect(withTime.state).toBe('auto')
    })

    it('a provider timestamp hours apart earns no bonus', () => {
      const from = leg({ accountId: 'a', accountType: 'Liquid', date: '2026-07-01', amountCents: -1000, originalDescription: 'To Linked Account Xx1234 - Internal Transfer' })
      const to = leg({ accountId: 'b', accountType: 'Savings', date: '2026-07-01', amountCents: 1000, originalDescription: 'From Linked Account Xx5678 - Internal Transfer' })

      const noTime = matchTransfers([from, to]).pairs[0]
      const farTime = matchTransfers([
        { ...from, providerPostedAt: '2026-07-01T09:00:00Z' },
        { ...to, providerPostedAt: '2026-07-01T20:00:00Z' },
      ]).pairs[0]
      expect(farTime.score).toBe(noTime.score)
    })
  })
})
