#!/usr/bin/env node
/**
 * analyze-csv contract tests.
 *
 * The first test is the regression guard: it sends the EXACT shape papaparse
 * produces with `header: true` (an array of objects). A schema that expects
 * string[][] rejects this with 422, which is what broke every upload.
 *
 * Requires: local stack + `npx supabase functions serve --no-verify-jwt
 * --env-file supabase/.env.local` (the env file is needed for GEMINI_API_KEY).
 *
 *   node app/scripts/test-analyze-csv.mjs
 */
import Papa from 'papaparse'
import {
  check, section, exitWithSummary, newUserWithAccount, invoke, readSample,
} from './lib/harness.mjs'

/** Parse a real sample file the same way CSVUploader does. */
function parseLikeApp(name) {
  const out = Papa.parse(readSample(name), { header: true, skipEmptyLines: true })
  return {
    header: out.meta.fields,
    rows: out.data.filter((r) => Object.keys(r).length > 0),
  }
}

async function main() {
  console.log('\n\x1b[1manalyze-csv\x1b[0m')

  const u = await newUserWithAccount('analyze')

  section('Regression guard — papaparse object rows')
  const stg = parseLikeApp('StGreorge_CreditCardtrans180726.csv')
  const r = await invoke('analyze-csv', u.token, {
    header: stg.header,
    sampleRows: stg.rows.slice(0, 5),
  })
  check('object-shaped sampleRows are not rejected', r.status !== 422,
    `422 means the schema still expects string[][] — got ${r.status}`)
  check('request succeeds', r.status === 200, JSON.stringify(r.json))

  if (r.status === 200) {
    section('Mapping quality — St George credit card (split debit/credit)')
    const m = r.json
    check('date column identified', m.dateCol === 'Date', m.dateCol)
    check('description column identified', m.descCol === 'Description', m.descCol)
    check('split debit/credit detected', m.debitCol === 'Debit' && m.creditCol === 'Credit',
      `debit=${m.debitCol} credit=${m.creditCol}`)
    check('no single amount column claimed', !m.amountCol, m.amountCol)
    // Split debit/credit carries its own polarity, so inversion must be off.
    check('invertAmount is false for split columns', m.invertAmount === false, String(m.invertAmount))
  }

  section('Mapping quality — AMEX (single column, expenses positive)')
  const amex = parseLikeApp('AMEX_transactions.csv')
  const ra = await invoke('analyze-csv', u.token, {
    header: amex.header, sampleRows: amex.rows.slice(0, 5),
  })
  check('request succeeds', ra.status === 200, JSON.stringify(ra.json))
  if (ra.status === 200) {
    const m = ra.json
    check('single amount column identified', m.amountCol === 'Amount', m.amountCol)
    check('description column identified', m.descCol === 'Description', m.descCol)
    // In this file INTEREST CHARGES is +8.55 (an expense) and a received
    // payment is -1292.00, so expenses are positive and must be inverted.
    check('invertAmount is true (expenses are positive here)', m.invertAmount === true,
      String(m.invertAmount))
  }

  section('Mapping quality — Macquarie (DD MMM YYYY, split columns)')
  const mq = parseLikeApp('Macquarie_Transactions-2026-07-18-222903.csv')
  const rm = await invoke('analyze-csv', u.token, {
    header: mq.header, sampleRows: mq.rows.slice(0, 5),
  })
  check('request succeeds', rm.status === 200, JSON.stringify(rm.json))
  if (rm.status === 200) {
    const m = rm.json
    check('date column identified', m.dateCol === 'Transaction Date', m.dateCol)
    check('split debit/credit detected', m.debitCol === 'Debit' && m.creditCol === 'Credit',
      `debit=${m.debitCol} credit=${m.creditCol}`)
    // 'Balance' is a running total, not a transaction amount. Picking it would
    // silently import wrong values for every row.
    check('running Balance column not mistaken for the amount', m.amountCol !== 'Balance',
      `amountCol=${m.amountCol}`)
  }

  section('Hardening still in force')
  const bad = await invoke('analyze-csv', u.token, { header: [], sampleRows: [] })
  check('empty payload rejected', bad.status === 422, `got ${bad.status}`)
  const noAuth = await fetch('http://127.0.0.1:54321/functions/v1/analyze-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5300' },
    body: JSON.stringify({ header: ['a'], sampleRows: [{ a: '1' }] }),
  })
  check('unauthenticated request rejected', noAuth.status === 401, `got ${noAuth.status}`)

  exitWithSummary()
}

main().catch((e) => { console.error('\x1b[31mHarness error:\x1b[0m', e.message); process.exit(2) })
