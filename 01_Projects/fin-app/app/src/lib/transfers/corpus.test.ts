/**
 * Corpus test: runs the matcher over the real files in `Sample datasets/`.
 *
 * This corpus contains the two hardest real cases for transfer detection:
 *  - a reciprocal-mask internal transfer within Macquarie (Xx3965/Xx3692)
 *  - a four-leg $630.82 ambiguity chain spanning Macquarie, St George
 *    transaction and St George credit card, where a naive amount+date
 *    matcher would cross-pair legs that share an account.
 *
 * The assertions here are structural invariants (no leg used twice, no
 * same-account pairing, the known reciprocal pair is found), not pinned
 * score values — the exact score for cross-institution pairs depends on
 * signals (embedded dates, institution names) that only partially resolve
 * without a populated account_identifiers table, and asserting brittle
 * magic numbers here would just encode today's weights as if they were a
 * spec.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { parseDate, detectDateFormat } from '../csv/parseDate'
import { resolveRowAmountCents } from '../csv/parseAmount'
import { matchTransfers } from './match'
import type { MatchableAccountType, TransferLeg } from './types'

const SAMPLES = join(__dirname, '..', '..', '..', '..', 'Sample datasets')

type Row = Record<string, string>

function load(name: string): Row[] {
  const out = Papa.parse<Row>(readFileSync(join(SAMPLES, name), 'utf8'), {
    header: true,
    skipEmptyLines: true,
  })
  return out.data.filter((r) => Object.keys(r).length > 0)
}

interface FileSpec {
  accountId: string
  accountName: string
  accountType: MatchableAccountType
  dateCol: string
  descCol: string
  amountCol?: string
  debitCol?: string
  creditCol?: string
  invertAmount?: boolean
}

const FILES: Record<string, FileSpec> = {
  'AMEX_transactions.csv': {
    accountId: 'amex', accountName: 'American Express', accountType: 'Credit Card',
    dateCol: 'Date', descCol: 'Description', amountCol: 'Amount', invertAmount: true,
  },
  'Macquarie_Transactions-2026-07-18-222903.csv': {
    accountId: 'macquarie-txn', accountName: 'Macquarie Platinum Transaction Account', accountType: 'Liquid',
    dateCol: 'Transaction Date', descCol: 'Details', debitCol: 'Debit', creditCol: 'Credit',
  },
  'Macquarie_savings_Transactions-2026-07-18-222939.csv': {
    accountId: 'macquarie-savings', accountName: 'Macquarie Savings Account', accountType: 'Savings',
    dateCol: 'Transaction Date', descCol: 'Details', debitCol: 'Debit', creditCol: 'Credit',
  },
  'StGeroge_Transaction_trans180726.csv': {
    accountId: 'stgeorge-txn', accountName: 'St George Complete Freedom', accountType: 'Liquid',
    dateCol: 'Date', descCol: 'Description', debitCol: 'Debit', creditCol: 'Credit',
  },
  'StGreorge_CreditCardtrans180726.csv': {
    accountId: 'stgeorge-cc', accountName: 'St George Vertigo Visa', accountType: 'Credit Card',
    dateCol: 'Date', descCol: 'Description', debitCol: 'Debit', creditCol: 'Credit',
  },
}

function buildLegs(): TransferLeg[] {
  const legs: TransferLeg[] = []
  let seq = 0

  for (const [file, spec] of Object.entries(FILES)) {
    const rows = load(file)
    const { format } = detectDateFormat(rows.slice(0, 40).map((r) => r[spec.dateCol]))

    for (const row of rows) {
      const date = parseDate(row[spec.dateCol], format)
      const amountCents = resolveRowAmountCents(row, spec)
      if (date === null || amountCents === null || amountCents === 0) continue

      seq += 1
      legs.push({
        txnId: `${spec.accountId}-${seq}`,
        accountId: spec.accountId,
        accountName: spec.accountName,
        accountType: spec.accountType,
        date,
        amountCents,
        originalDescription: row[spec.descCol],
        dedupeHashHex: `hash-${seq}`,
        occurrence: 0,
      })
    }
  }
  return legs
}

describe('transfer matcher over Sample datasets/', () => {
  const legs = buildLegs()

  it('loaded a non-trivial number of legs from every file', () => {
    expect(legs.length).toBeGreaterThan(100)
  })

  const { pairs, overflowedAmounts } = matchTransfers(legs)

  it('never uses the same leg in more than one pair', () => {
    const used = pairs.flatMap((p) => [p.from.txnId, p.to.txnId])
    expect(new Set(used).size).toBe(used.length)
  })

  it('never pairs two legs on the same account', () => {
    for (const p of pairs) {
      expect(p.from.accountId).not.toBe(p.to.accountId)
    }
  })

  it('every pair is a real inverse-amount, opposite-sign match', () => {
    for (const p of pairs) {
      expect(p.from.amountCents).toBe(-p.to.amountCents)
      expect(p.from.amountCents).toBeLessThan(0)
      expect(p.to.amountCents).toBeGreaterThan(0)
    }
  })

  it('finds the Macquarie <-> Macquarie Savings reciprocal-mask internal transfer', () => {
    const found = pairs.some(
      (p) =>
        (p.from.accountId === 'macquarie-txn' && p.to.accountId === 'macquarie-savings') ||
        (p.from.accountId === 'macquarie-savings' && p.to.accountId === 'macquarie-txn'),
    )
    expect(found).toBe(true)
  })

  it('resolves the four-leg $630.82 chain without cross-pairing the two St George transaction legs', () => {
    // The StGeorge transaction account's own -630.82 and +630.82 rows on
    // 08/07/2026 must never be paired with EACH OTHER (same account, G2) —
    // the invariant this whole scenario exists to test.
    const stgTxnLegs = legs.filter((l) => l.accountId === 'stgeorge-txn' && Math.abs(l.amountCents) === 63082)
    expect(stgTxnLegs.length).toBe(2)

    const crossPaired = pairs.some(
      (p) =>
        (p.from.txnId === stgTxnLegs[0].txnId && p.to.txnId === stgTxnLegs[1].txnId) ||
        (p.from.txnId === stgTxnLegs[1].txnId && p.to.txnId === stgTxnLegs[0].txnId),
    )
    expect(crossPaired).toBe(false)
  })

  it('does not silently truncate an overflowing bucket — reports it instead', () => {
    // Not asserting overflowedAmounts is empty or non-empty (depends on the
    // corpus), only that whatever it reports is a plausible cents value, so
    // a caller wiring this to a UI message has something sane to show.
    for (const amount of overflowedAmounts) {
      expect(Number.isInteger(amount)).toBe(true)
      expect(amount).toBeGreaterThan(0)
    }
  })

  it('every persisted pair clears the suggested-or-above bar', () => {
    for (const p of pairs) {
      expect(p.score).toBeGreaterThanOrEqual(0.55)
    }
  })
})
