#!/usr/bin/env node
/**
 * categorize-pending write-back integration test.
 *
 * Regression for the 2026-11-10 failure: after 20261004010000 revoked
 * transaction UPDATE from `authenticated`, the post-sync sweep failed with
 * 42501 because apply_merchant_categories ran through the RLS client. The
 * sweep now calls a service-role-only RPC scoped to ctx.tenantId.
 *
 * Claims:
 *   1. A never-classified Uncategorized row is categorised from the merchant
 *      cache (no Gemini call — the rule is pre-seeded).
 *   2. A user-corrected row is never touched, even when the RPC is handed an
 *      assignment for it directly (the read/write race).
 *   3. The RPC cannot write another tenant's rows.
 *   4. Browser roles cannot execute the RPC.
 *
 * Isolated targets only (lib/harness.mjs fails closed on the personal stack):
 *   cd app && npm run test:golden:categorize-pending
 */
import { createClient } from '@supabase/supabase-js'
import {
  URL_, check, section, exitWithSummary, newUserWithAccount, invoke,
} from './lib/harness.mjs'

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY for fixture setup (isolated stack only).')
  process.exit(1)
}
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

// Letters only, so normalizeMerchant's key is just the lower-cased string.
const tag = () => Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('')

async function seed(user, description, extra = {}) {
  const result = await invoke('upsert-transactions', user.token, {
    account_id: user.accountId,
    date: '2026-11-10',
    original_description: description,
    merchant: description,
    category: 'Uncategorized',
    amount: -1250,
    ...extra,
  })
  if (result.status !== 200) throw new Error(`seed failed: ${JSON.stringify(result.json)}`)
  const { data, error } = await user.client.from('transactions')
    .select('id, category, subcategory, category_source, needs_review')
    .eq('original_description', description).single()
  if (error) throw error
  return data
}

const read = async (user, id) => (await user.client.from('transactions')
  .select('category, subcategory, category_source, category_confidence, needs_review').eq('id', id).single()).data

async function main() {
  console.log('\n\x1b[1mcategorize-pending — service-role write-back\x1b[0m')
  const owner = await newUserWithAccount('pending-owner')
  const other = await newUserWithAccount('pending-other')

  const merchant = `PENDINGCAT ${tag().toUpperCase()}`
  const key = merchant.toLowerCase()
  const pending = await seed(owner, merchant)
  // A real correction goes through the validated edit path, which is the only
  // way a row becomes category_source='user' (upsert-transactions does not
  // accept client-asserted provenance).
  const correctedSeed = await seed(owner, `${merchant} ${tag().toUpperCase()}`)
  const edit = await invoke('update-transaction-category', owner.token, {
    action: 'edit', transaction_id: correctedSeed.id, category: 'Food & drink', subcategory: 'Coffee',
  })
  if (edit.status !== 200) throw new Error(`user correction failed: ${JSON.stringify(edit.json)}`)
  const corrected = { ...correctedSeed, ...(await owner.client.from('transactions')
    .select('category, category_source').eq('id', correctedSeed.id).single()).data }
  const foreign = await seed(other, merchant)

  check('fixture row starts unclassified', pending.category === 'Uncategorized' && pending.category_source === null, JSON.stringify(pending))
  check('fixture correction is user-sourced', corrected.category_source === 'user', JSON.stringify(corrected))

  const rule = await admin.from('merchant_rules').insert({
    tenant_id: owner.tenantId, merchant_key: key, merchant_display: merchant,
    category: 'Shopping', subcategory: null, source: 'ai', confidence: 0.95,
  })
  if (rule.error) throw new Error(`seed rule: ${rule.error.message}`)

  section('Sweep categorises the pending row')
  const r = await invoke('categorize-pending', owner.token, {})
  check('categorize-pending succeeds (no 42501)', r.status === 200, JSON.stringify(r.json).slice(0, 300))
  check('it reports the row as categorised', (r.json?.progress?.rows_categorized ?? 0) >= 1, JSON.stringify(r.json?.progress))
  check('no Gemini call was needed', r.json?.progress?.gemini_calls === 0, JSON.stringify(r.json?.progress))
  const after = await read(owner, pending.id)
  check('pending row now carries the cached category', after?.category === 'Shopping' && after?.category_source === 'ai', JSON.stringify(after))

  section('User corrections always win')
  const untouched = await read(owner, corrected.id)
  check('user-corrected row is unchanged by the sweep', untouched?.category === 'Food & drink' && untouched?.category_source === 'user', JSON.stringify(untouched))
  const assignment = (id) => ({ txn_id: id, category: 'Travel', subcategory: '', category_source: 'ai', category_confidence: 0.9, needs_review: false })
  const race = await admin.rpc('apply_merchant_categories', { p_tenant_id: owner.tenantId, p_assignments: [assignment(corrected.id), assignment(pending.id)] })
  check('RPC refuses user-sourced and already-classified rows', !race.error && Number(race.data) === 0, JSON.stringify(race))
  const afterRace = await read(owner, corrected.id)
  check('user row still unchanged after a direct assignment', afterRace?.category === 'Food & drink' && afterRace?.category_source === 'user', JSON.stringify(afterRace))

  section('Tenant scoping and browser boundary')
  const cross = await admin.rpc('apply_merchant_categories', { p_tenant_id: owner.tenantId, p_assignments: [assignment(foreign.id)] })
  check('RPC cannot write another tenant’s row', !cross.error && Number(cross.data) === 0, JSON.stringify(cross))
  const foreignAfter = await read(other, foreign.id)
  check('other tenant’s row is still pending', foreignAfter?.category === 'Uncategorized' && foreignAfter?.category_source === null, JSON.stringify(foreignAfter))
  const browser = await owner.client.rpc('apply_merchant_categories', { p_tenant_id: owner.tenantId, p_assignments: [assignment(pending.id)] })
  check('authenticated browser client cannot execute the RPC', !!browser.error, JSON.stringify(browser))

  const again = await invoke('categorize-pending', owner.token, {})
  check('a second sweep is a no-op and reports done', again.status === 200 && again.json?.done === true && (again.json?.progress?.rows_categorized ?? 0) === 0, JSON.stringify(again.json))

  exitWithSummary()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
