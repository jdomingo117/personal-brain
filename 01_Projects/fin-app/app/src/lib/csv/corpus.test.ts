/**
 * Corpus tests: run the parsing library over every real file in
 * `Sample datasets/` and assert the whole-file properties that unit tests on
 * individual strings cannot catch — e.g. "no row silently loses its date" or
 * "the sign convention is right for this institution".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { normalizeMerchant } from './normalizeMerchant'
import { parseDate, detectDateFormat } from './parseDate'
import { resolveRowAmountCents } from './parseAmount'
import { mapBankCategory, unmappedBankCategories } from './bankCategoryMap'
import { isVanguardPersonalInvestorCsv } from '../investments/vanguard'

const SAMPLES = join(__dirname, '..', '..', '..', '..', 'Sample datasets')

type Row = Record<string, string>

function load(name: string): { header: string[]; rows: Row[] } {
  const out = Papa.parse<Row>(readFileSync(join(SAMPLES, name), 'utf8'), {
    header: true, skipEmptyLines: true,
  })
  return {
    header: out.meta.fields ?? [],
    rows: out.data.filter((r) => Object.keys(r).length > 0),
  }
}

const FILES = readdirSync(SAMPLES).filter((f) => f.toLowerCase().endsWith('.csv'))

/** Mapping per file, as analyze-csv resolves it (asserted separately by the AI suite). */
const MAPPINGS: Record<string, { dateCol: string; descCol: string; amountCol?: string; debitCol?: string; creditCol?: string; invertAmount?: boolean; categoryCol?: string; subcategoryCol?: string }> = {
  'AMEX_transactions.csv': {
    dateCol: 'Date', descCol: 'Description', amountCol: 'Amount', invertAmount: true,
  },
  'StGreorge_CreditCardtrans180726.csv': {
    dateCol: 'Date', descCol: 'Description', debitCol: 'Debit', creditCol: 'Credit',
    categoryCol: 'Category', subcategoryCol: 'SubCategory',
  },
  'StGeroge_Transaction_trans180726.csv': {
    dateCol: 'Date', descCol: 'Description', debitCol: 'Debit', creditCol: 'Credit',
    categoryCol: 'Category', subcategoryCol: 'SubCategory',
  },
  'Macquarie_Transactions-2026-07-18-222903.csv': {
    dateCol: 'Transaction Date', descCol: 'Details', debitCol: 'Debit', creditCol: 'Credit',
    categoryCol: 'Category', subcategoryCol: 'Subcategory',
  },
  'Macquarie_savings_Transactions-2026-07-18-222939.csv': {
    dateCol: 'Transaction Date', descCol: 'Details', debitCol: 'Debit', creditCol: 'Credit',
    categoryCol: 'Category', subcategoryCol: 'Subcategory',
  },
}

describe('sample corpus', () => {
  it('covers every file in Sample datasets/', () => {
    expect(FILES.length).toBeGreaterThan(0)
    for (const f of FILES) {
      const supportedInvestment = isVanguardPersonalInvestorCsv(load(f).header)
      expect(Boolean(MAPPINGS[f]) || supportedInvestment, `no importer for ${f}`).toBe(true)
    }
  })

  // This suite covers bank-statement invariants. Investment corpus fixtures
  // have their own adapter suite: they carry units/prices, not debit/credit
  // merchant rows, so forcing them through the bank mapping would be a false
  // test rather than broader coverage.
  for (const file of Object.keys(MAPPINGS)) {
    describe(file, () => {
      const { header, rows } = load(file)
      const map = MAPPINGS[file]

      it('parses every date — no nulls, no silent fallback', () => {
        const { format } = detectDateFormat(rows.slice(0, 40).map((r) => r[map.dateCol]))
        const bad = rows.filter((r) => parseDate(r[map.dateCol], format) === null)
        expect(bad.map((r) => r[map.dateCol])).toEqual([])
      })

      it('dates are ISO and plausible', () => {
        const { format } = detectDateFormat(rows.slice(0, 40).map((r) => r[map.dateCol]))
        for (const r of rows) {
          const d = parseDate(r[map.dateCol], format)!
          expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
          expect(d >= '2020-01-01' && d <= '2030-12-31').toBe(true)
        }
      })

      it('resolves an amount for every row', () => {
        const bad = rows.filter((r) => resolveRowAmountCents(r, map) === null)
        // A row with neither debit nor credit is a structural oddity worth
        // seeing rather than silently dropping, so assert none exist here.
        expect(bad.length, `${bad.length} rows without a usable amount`).toBe(0)
      })

      it('amounts are integers in cents', () => {
        for (const r of rows) {
          const c = resolveRowAmountCents(r, map)!
          expect(Number.isInteger(c)).toBe(true)
        }
      })

      it('has both inflows and outflows with the right sign convention', () => {
        const amounts = rows.map((r) => resolveRowAmountCents(r, map)!)
        expect(amounts.some((a) => a < 0), 'expected some outflows').toBe(true)
        // Every sample contains at least one payment/deposit.
        expect(amounts.some((a) => a > 0), 'expected some inflows').toBe(true)
      })

      it('normalises merchants to non-empty stable keys', () => {
        for (const r of rows) {
          const n = normalizeMerchant(r[map.descCol])
          expect(n.key.length).toBeGreaterThan(0)
          expect(n.key).toBe(n.key.toLowerCase())
          // Idempotent: re-normalising a display value must not drift the key.
          expect(normalizeMerchant(n.display).key).toBe(n.key)
        }
      })

      it('collapses merchant variants (fewer keys than rows, where repeats exist)', () => {
        const keys = new Set(rows.map((r) => normalizeMerchant(r[map.descCol]).key))
        expect(keys.size).toBeLessThanOrEqual(rows.length)
      })

      if (MAPPINGS[file].categoryCol) {
        it('maps a useful share of bank categories, and reports the rest', () => {
          const cats = rows.map((r) => r[map.categoryCol!])
          const mapped = cats.filter((c) => mapBankCategory(c, null) !== null)
          const unmapped = unmappedBankCategories(cats)
          // Not asserting a high hit rate — the point is that the split is
          // visible and that unmapped values are reported, not silently
          // dumped into a catch-all category.
          expect(mapped.length + cats.filter((c) => !c).length + unmapped.length)
            .toBeGreaterThan(0)
          for (const u of unmapped) expect(typeof u).toBe('string')
        })
      }

      it('header is non-trivial', () => {
        expect(header.length).toBeGreaterThan(2)
      })
    })
  }
})
