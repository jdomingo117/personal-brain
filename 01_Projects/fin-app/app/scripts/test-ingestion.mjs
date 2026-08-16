#!/usr/bin/env node
/**
 * Ingestion integration tests: deduplication and import counts.
 *
 * The headline case is the double-import. Before this work, re-importing a
 * file inserted every row a second time while the balance anchor recalculated
 * to keep the displayed balance correct — so the ledger doubled invisibly.
 *
 * Requires the local stack plus:
 *   npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local
 *
 *   node app/scripts/test-ingestion.mjs
 */
import Papa from 'papaparse'
import {
  check, section, exitWithSummary, newUserWithAccount, invoke, readSample,
} from './lib/harness.mjs'

const BATCH = () => crypto.randomUUID()

/** Build an import payload from the St George credit-card sample. */
function stGeorgeRows(accountId, limit = 25) {
  const parsed = Papa.parse(readSample('StGreorge_CreditCardtrans180726.csv'), {
    header: true, skipEmptyLines: true,
  })
  const rows = parsed.data.filter((r) => r.Date).slice(0, limit)
  return rows.map((r) => {
    const [d, m, y] = r.Date.split('/')
    const debit = parseFloat((r.Debit || '0').replace(/[^0-9.]/g, '')) || 0
    const credit = parseFloat((r.Credit || '0').replace(/[^0-9.]/g, '')) || 0
    const cents = credit > 0 ? Math.round(credit * 100) : -Math.round(debit * 100)
    return {
      account_id: accountId,
      date: `${y}-${m}-${d}`,
      original_description: r.Description,
      merchant: r.Description,
      category: 'Uncategorized',
      amount: cents,
    }
  })
}

async function main() {
  console.log('\n\x1b[1mIngestion — deduplication\x1b[0m')

  const u = await newUserWithAccount('dedupe')
  const rows = stGeorgeRows(u.accountId)

  section('First import')
  const firstBatch = BATCH()
  const first = await invoke('upsert-transactions', u.token,
    rows.map((r) => ({ ...r, upload_batch_id: firstBatch })))
  check('request succeeds', first.status === 200, JSON.stringify(first.json).slice(0, 200))
  check('all rows inserted', first.json?.inserted === rows.length,
    `inserted=${first.json?.inserted} of ${rows.length}`)
  check('nothing skipped on a fresh account', first.json?.skipped === 0,
    `skipped=${first.json?.skipped}`)

  const afterFirst = await u.client.from('transactions').select('id')
  check('rows are in the ledger', afterFirst.data?.length === rows.length,
    `${afterFirst.data?.length} rows`)

  section('Re-import of the SAME file — the bug this closes')
  const secondBatch = BATCH()
  const second = await invoke('upsert-transactions', u.token,
    rows.map((r) => ({ ...r, upload_batch_id: secondBatch })))
  check('request succeeds (a re-import is not an error)', second.status === 200,
    JSON.stringify(second.json).slice(0, 200))
  check('ZERO rows inserted', second.json?.inserted === 0, `inserted=${second.json?.inserted}`)
  check('every row reported as skipped', second.json?.skipped === rows.length,
    `skipped=${second.json?.skipped} of ${rows.length}`)

  const afterSecond = await u.client.from('transactions').select('id')
  check('ledger did NOT double', afterSecond.data?.length === rows.length,
    `${afterSecond.data?.length} rows (expected ${rows.length})`)

  section('Genuine same-day repeats must both survive')
  // Two identical coffees on one day are not a duplicate — they are two
  // coffees. A naive content hash would silently discard the second.
  const coffee = {
    account_id: u.accountId, date: '2026-07-01',
    original_description: 'THE COFFEE PLACE  SYDNEY', merchant: 'The Coffee Place',
    category: 'Food & drink', subcategory: 'Coffee', amount: -450,
  }
  const twice = await invoke('upsert-transactions', u.token, [coffee, coffee])
  check('both identical rows inserted', twice.json?.inserted === 2,
    `inserted=${twice.json?.inserted}`)

  // Filter on the merchant, not the date — the sample file contains rows on
  // this date too, which would pollute the ordinal check.
  const coffees = await u.client.from('transactions')
    .select('id, occurrence').eq('merchant', 'The Coffee Place').order('occurrence')
  check('they carry distinct occurrence ordinals',
    JSON.stringify(coffees.data?.map((c) => c.occurrence)) === '[0,1]',
    JSON.stringify(coffees.data?.map((c) => c.occurrence)))

  // ...but re-importing that same pair must still be caught.
  const twiceAgain = await invoke('upsert-transactions', u.token, [coffee, coffee])
  check('re-importing the repeats is still deduped', twiceAgain.json?.inserted === 0,
    `inserted=${twiceAgain.json?.inserted}`)

  section('Partial overlap — new rows land, seen rows do not')
  const extra = {
    account_id: u.accountId, date: '2026-07-02',
    original_description: 'BRAND NEW MERCHANT', merchant: 'Brand New Merchant',
    category: 'Uncategorized', amount: -1234,
  }
  const mixed = await invoke('upsert-transactions', u.token, [...rows, extra])
  check('only the unseen row is inserted', mixed.json?.inserted === 1,
    `inserted=${mixed.json?.inserted}`)
  check('the rest are reported skipped', mixed.json?.skipped === rows.length,
    `skipped=${mixed.json?.skipped}`)

  section('Tenant isolation of dedupe state')
  // Another user's identical transactions must not be suppressed by ours.
  const other = await newUserWithAccount('dedupe-b')
  const otherRows = stGeorgeRows(other.accountId)
  const otherImport = await invoke('upsert-transactions', other.token, otherRows)
  check("another tenant's identical rows still import", otherImport.json?.inserted === otherRows.length,
    `inserted=${otherImport.json?.inserted} of ${otherRows.length}`)

  section('Audit trail records the real numbers')
  const audit = await u.client.from('audit_log')
    .select('action, metadata').eq('action', 'transactions.imported')
    .order('occurred_at', { ascending: false }).limit(1)
  const meta = audit.data?.[0]?.metadata
  check('audit records inserted and skipped counts',
    meta && typeof meta.inserted === 'number' && typeof meta.skipped === 'number',
    JSON.stringify(meta))

  exitWithSummary()
}

main().catch((e) => { console.error('\x1b[31mHarness error:\x1b[0m', e.message); process.exit(2) })
