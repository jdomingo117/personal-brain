#!/usr/bin/env node
/**
 * Recurring Hub Phase 2: AI early-detection hint tests.
 *
 * The two claims that matter, mirroring test-categorization.mjs's shape for
 * the same reasons — this is the same kind of cacheable, per-merchant
 * Gemini classification, just answering a different question:
 *   1. A merchant with only 1-2 charges (below the deterministic detector's
 *      MIN_OBSERVATIONS=3) and an obviously-subscription name (a streaming
 *      service, an insurer) gets cached as a likely-recurring hint.
 *   2. The cache makes a repeat pass free — a second run makes ZERO Gemini
 *      calls for merchants already resolved, and the keyset cursor
 *      (`after_id` / `next_after_id`) actually advances so a poll loop
 *      converges instead of re-scanning the same page forever.
 *
 *   node app/scripts/test-recurrence-hints.mjs
 */
import {
  check, section, exitWithSummary, newUserWithAccount, invoke,
} from './lib/harness.mjs'

const BATCH = () => crypto.randomUUID()

async function main() {
  console.log('\n\x1b[1mAI recurrence-hint early detection\x1b[0m')

  const u = await newUserWithAccount('rhint')

  section('Seeding thin merchants (1-2 charges — below the deterministic threshold)')
  const rows = [
    // Two charges, obviously a subscription by name.
    { account_id: u.accountId, date: '2026-07-01', original_description: 'NETFLIX.COM', merchant: 'Netflix', category: 'Lifestyle', subcategory: 'Streaming', amount: -1599 },
    { account_id: u.accountId, date: '2026-08-01', original_description: 'NETFLIX.COM', merchant: 'Netflix', category: 'Lifestyle', subcategory: 'Streaming', amount: -1599 },
    // One charge, an ad-hoc retail purchase — should not be hinted recurring.
    { account_id: u.accountId, date: '2026-08-03', original_description: 'BUNNINGS WAREHOUSE  SYDNEY', merchant: 'Bunnings Warehouse', category: 'Shopping', subcategory: 'Household', amount: -4500 },
  ]
  const seeded = await invoke('upsert-transactions', u.token, rows.map((r) => ({ ...r, upload_batch_id: BATCH() })))
  check('seed rows inserted', seeded.json?.inserted === rows.length, JSON.stringify(seeded.json))

  section('First pass classifies the thin merchants')
  const first = await invoke('detect-recurrence-hints', u.token, {})
  check('request succeeds', first.status === 200, JSON.stringify(first.json).slice(0, 300))
  check('at least one merchant was checked', (first.json?.progress?.merchants_checked ?? 0) >= 2,
    JSON.stringify(first.json?.progress))
  check('Gemini was called', (first.json?.progress?.gemini_calls ?? 0) > 0, JSON.stringify(first.json?.progress))

  const hints = await u.client
    .from('merchant_recurrence_hints')
    .select('merchant_key, is_recurring, suggested_cadence, confidence')
  check('a hint row exists for netflix', hints.data?.some((h) => h.merchant_key === 'netflix.com'),
    JSON.stringify(hints.data))
  const netflixHint = hints.data?.find((h) => h.merchant_key === 'netflix.com')
  check('netflix is classified as recurring', netflixHint?.is_recurring === true, JSON.stringify(netflixHint))

  section('The cache makes a repeat pass free')
  const again = await invoke('detect-recurrence-hints', u.token, {})
  check('second pass makes ZERO Gemini calls', (again.json?.progress?.gemini_calls ?? -1) === 0,
    JSON.stringify(again.json?.progress))

  section('The keyset cursor actually advances (no infinite same-page loop)')
  check('next_after_id differs from the initial call (or is null once exhausted)',
    first.json?.next_after_id !== undefined, JSON.stringify(first.json?.next_after_id))
  if (first.json?.next_after_id) {
    const cursored = await invoke('detect-recurrence-hints', u.token, { after_id: first.json.next_after_id })
    check('a call with the cursor is accepted', cursored.status === 200, JSON.stringify(cursored.json))
    check('a call scoped past every seeded row reports done',
      cursored.json?.done === true, JSON.stringify(cursored.json))
  }

  section('Tenant isolation — another tenant cannot see this cache')
  const other = await newUserWithAccount('rhint-b')
  const otherHints = await other.client.from('merchant_recurrence_hints').select('merchant_key')
  check('another tenant sees zero hint rows', (otherHints.data?.length ?? 0) === 0,
    `${otherHints.data?.length} leaked`)

  exitWithSummary()
}

main().catch((e) => { console.error('\x1b[31mHarness error:\x1b[0m', e.message); process.exit(2) })
