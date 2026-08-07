#!/usr/bin/env node
/**
 * Internal-transfer linker — end-to-end through the real stack.
 *
 * The regression this exists to hold down: a rejected pairing used to keep
 * occupying its legs' one-link-per-leg unique index, so when the TRUE
 * counterpart was imported later the correct pair hit ON CONFLICT DO NOTHING
 * and was silently discarded. `created` came back 0 with no error anywhere,
 * and that transaction could never be linked again. Rejecting a single wrong
 * guess permanently disabled transfer detection for that leg.
 *
 * Requires the local stack plus:
 *   npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local
 *
 *   node app/scripts/test-transfers.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { URL_, ANON, check, section, exitWithSummary, newUserWithAccount, invoke } from './lib/harness.mjs'

/** Adds a second/third account to an existing user. */
async function addAccount(u, name, type) {
  const { data, error } = await u.client
    .from('accounts')
    .insert({ name, type, balance: 0, currency: 'AUD', user_id: u.userId, tenant_id: u.tenantId })
    .select().single()
  if (error) throw new Error(`addAccount(${name}): ${error.message}`)
  return data.id
}

const txn = (accountId, date, description, amount) => ({
  account_id: accountId,
  date,
  original_description: description,
  merchant: description,
  category: 'Transfer',
  subcategory: 'Internal',
  amount,
})

async function main() {
  console.log('\n\x1b[1mInternal transfer linker\x1b[0m')

  const u = await newUserWithAccount('xfer', 'Liquid')
  const savingsA = await addAccount(u, 'Savings A', 'Savings')
  const savingsB = await addAccount(u, 'Savings B', 'Savings')

  // ── Detection ───────────────────────────────────────────────────────
  section('Detection')
  const imported = await invoke('upsert-transactions', u.token, [
    txn(u.accountId, '2026-07-12', 'To Linked Account Xx3692 - Internal Transfer', -50000),
    txn(savingsA, '2026-07-12', 'From Linked Account Xx3965 - Internal Transfer', 50000),
    { ...txn(u.accountId, '2026-07-10', 'Woolworths Metro', -4250), category: 'Food', subcategory: 'Groceries' },
  ])
  check('import succeeds', imported.status === 200, JSON.stringify(imported.json))
  check('all three rows land', imported.json?.inserted === 3, `inserted ${imported.json?.inserted}`)

  // transfer_candidate is computed server-side from original_description; a
  // client must not be able to assert it (that would let spending be hidden).
  const { data: flagged } = await u.client
    .from('transactions').select('original_description, transfer_candidate')
  const grocery = flagged?.find((r) => r.original_description === 'Woolworths Metro')
  const transferLeg = flagged?.find((r) => r.original_description.includes('Xx3692'))
  check('an ordinary purchase is not a transfer candidate', grocery?.transfer_candidate === false)
  check('a lexical transfer row is a candidate', transferLeg?.transfer_candidate === true)

  const link1 = await invoke('link-transfers', u.token, { scope: 'all' })
  check('link-transfers succeeds', link1.status === 200, JSON.stringify(link1.json))
  check('the transfer pair is found', (link1.json?.auto ?? 0) + (link1.json?.suggested ?? 0) === 1,
    JSON.stringify(link1.json))

  // ── Analytics exclusion ─────────────────────────────────────────────
  section('Analytics exclusion')
  const { data: analytic } = await u.client
    .from('transactions_analytic').select('original_description, amount, is_transfer, transfer_state')
  const groceryRow = analytic?.find((r) => r.original_description === 'Woolworths Metro')
  check('is_transfer is false, never null, for ordinary rows', groceryRow?.is_transfer === false,
    `got ${JSON.stringify(groceryRow?.is_transfer)}`)
  // NULL would be falsy in JS but would silently drop every ordinary row from
  // any future `.eq('is_transfer', false)` filter, since NULL <> false in SQL.
  check('ordinary spending is still counted', groceryRow?.transfer_state === 'none')

  // ── Idempotency ─────────────────────────────────────────────────────
  section('Idempotency')
  const link2 = await invoke('link-transfers', u.token, { scope: 'all' })
  const { data: linksAfter } = await u.client.from('transfer_links').select('id')
  check('a second rescan does not duplicate links', linksAfter?.length === 1,
    `${linksAfter?.length} link(s)`)
  check('re-running reports a stable result', link2.status === 200)

  // ── Rejection must not be a dead end (the regression) ───────────────
  section('Rejecting a wrong pair, then finding the right one')
  const { data: theLink } = await u.client
    .from('transfer_links').select('id, from_txn_id, to_txn_id').single()

  const rejected = await invoke('decide-transfer', u.token, {
    link_id: theLink.id, verdict: 'rejected',
  })
  check('rejection is accepted', rejected.status === 200, JSON.stringify(rejected.json))

  const { data: afterReject } = await u.client
    .from('transactions_analytic').select('is_transfer').eq('id', theLink.from_txn_id).single()
  check('a rejected leg counts as real spending again', afterReject?.is_transfer === false)

  // The genuine counterpart arrives in a different account, later.
  const second = await invoke('upsert-transactions', u.token, [
    txn(savingsB, '2026-07-12', 'From Linked Account Xx3965 - Internal Transfer', 50000),
  ])
  check('the true counterpart imports', second.json?.inserted === 1)

  const link3 = await invoke('link-transfers', u.token, { scope: 'all' })
  check('rescan succeeds', link3.status === 200, JSON.stringify(link3.json))

  const { data: finalLinks } = await u.client
    .from('transfer_links').select('id, state, to_txn_id')
  const live = finalLinks?.filter((l) => l.state !== 'rejected') ?? []
  check('the correct pair now forms', live.length === 1,
    `links: ${JSON.stringify(finalLinks)}`)
  check('and it is NOT the pair the user rejected',
    live[0]?.to_txn_id !== theLink.to_txn_id,
    'the rejected counterpart was re-proposed')

  // ── The rejection is still durable ──────────────────────────────────
  section('Rejection durability')
  const { data: decisions } = await u.client
    .from('transfer_decisions').select('verdict')
  check('the rejection is recorded durably', decisions?.some((d) => d.verdict === 'rejected'))
  const rejectedStill = finalLinks?.some((l) => l.state === 'rejected')
  const reRejected = rejectedStill || !finalLinks?.some(
    (l) => l.to_txn_id === theLink.to_txn_id && l.state !== 'rejected',
  )
  check('the rejected pair is never silently re-suggested', reRejected)

  // ── Batch confirm (grouped by account pair, OskoLinker's bulk action) ──
  section('Batch confirm')
  const savingsC = await addAccount(u, 'Savings C', 'Savings')
  const batchImport = await invoke('upsert-transactions', u.token, [
    txn(u.accountId, '2026-07-01', 'To Linked Account - Internal Transfer', -10000),
    txn(savingsC, '2026-07-01', 'From Linked Account - Internal Transfer', 10000),
    txn(u.accountId, '2026-07-15', 'To Linked Account - Internal Transfer', -12000),
    txn(savingsC, '2026-07-15', 'From Linked Account - Internal Transfer', 12000),
    txn(u.accountId, '2026-07-29', 'To Linked Account - Internal Transfer', -13000),
    txn(savingsC, '2026-07-29', 'From Linked Account - Internal Transfer', 13000),
  ])
  check('batch import succeeds', batchImport.json?.inserted === 6, JSON.stringify(batchImport.json))

  const linkBatch = await invoke('link-transfers', u.token, { scope: 'all' })
  check('rescan succeeds', linkBatch.status === 200, JSON.stringify(linkBatch.json))

  const { data: batchLinks } = await u.client
    .from('transfer_links')
    .select('id, state, from_account_id, to_account_id')
    .eq('from_account_id', u.accountId)
    .eq('to_account_id', savingsC)
  const suggestedBatchLinks = batchLinks?.filter((l) => l.state === 'suggested') ?? []
  check('three suggested links share this account pair, ready to group', suggestedBatchLinks.length === 3,
    JSON.stringify(batchLinks))

  const linkIds = suggestedBatchLinks.map((l) => l.id)
  const batchDecide = await invoke('decide-transfer', u.token, { link_ids: linkIds, verdict: 'confirmed' })
  check('one call decides the whole group', batchDecide.status === 200, JSON.stringify(batchDecide.json))
  check('all three decision ids come back', batchDecide.json?.decision_ids?.length === 3, JSON.stringify(batchDecide.json))

  const { data: afterBatch } = await u.client.from('transfer_links').select('state').in('id', linkIds)
  check('all three links are now confirmed', afterBatch?.every((l) => l.state === 'confirmed'), JSON.stringify(afterBatch))

  const { data: analyticAfterBatch } = await u.client
    .from('transactions_analytic').select('is_transfer').eq('account_id', savingsC)
  check('the confirmed legs are excluded from analytics', analyticAfterBatch?.every((r) => r.is_transfer === true),
    JSON.stringify(analyticAfterBatch))

  const oversizedBatch = await invoke('decide-transfer', u.token, {
    link_ids: Array.from({ length: 201 }, () => theLink.id), verdict: 'confirmed',
  })
  check('a batch over the 200-item cap is rejected', oversizedBatch.status !== 200, `status ${oversizedBatch.status}`)

  // ── Cross-tenant ────────────────────────────────────────────────────
  section('Tenant isolation')
  const other = await newUserWithAccount('xfer-other', 'Liquid')
  const { data: leaked } = await other.client.from('transfer_links').select('*')
  check('another tenant sees none of these links', (leaked?.length ?? 0) === 0)
  const stolen = await invoke('decide-transfer', other.token, {
    link_id: theLink.id, verdict: 'confirmed',
  })
  check('another tenant cannot decide this link', stolen.status !== 200, `status ${stolen.status}`)

  // ── Unmatched single legs ────────────────────────────────────────────
  // A leg that LOOKS like a transfer but has no counterpart anywhere never
  // gets a transfer_links row (matchTransfers only ever emits pairs), so it
  // needs its own decision path straight to transfer_decisions.
  section('Deciding on an unmatched leg (no counterpart exists)')
  // Deliberately NOT category: 'Transfer' — that alone excludes a row from
  // spending regardless of matching, which is a separate, intentionally
  // untouched behaviour. This row must be flagged as a candidate purely by
  // its wording (the lexicon match on "Osko"), so it exercises the
  // no-counterpart-found path on its own.
  const lonely = await invoke('upsert-transactions', u.token, [
    { ...txn(u.accountId, '2026-07-20', 'Transfer to Sarah - Osko Payment', -8800), category: 'Uncategorized', subcategory: undefined },
  ])
  check('the lonely leg imports', lonely.json?.inserted === 1)

  const link4 = await invoke('link-transfers', u.token, { scope: 'all' })
  check('rescan succeeds', link4.status === 200, JSON.stringify(link4.json))

  const { data: beforeDecision } = await u.client
    .from('transactions_analytic')
    .select('id, is_transfer, transfer_state')
    .eq('original_description', 'Transfer to Sarah - Osko Payment').single()
  check('it is flagged unmatched, not silently linked', beforeDecision?.transfer_state === 'unmatched',
    JSON.stringify(beforeDecision))
  check('and counts as ordinary spending until reviewed', beforeDecision?.is_transfer === false,
    'overstating spending on an unreviewed leg is the safe default — silently zeroing it out is not')

  const legDecision = await invoke('decide-transfer', u.token, {
    txn_id: beforeDecision.id, verdict: 'external',
  })
  check('deciding on the bare leg succeeds', legDecision.status === 200, JSON.stringify(legDecision.json))

  const { data: afterDecision } = await u.client
    .from('transactions_analytic')
    .select('is_transfer, transfer_state')
    .eq('id', beforeDecision.id).single()
  check('it is now excluded from spending', afterDecision?.is_transfer === true)
  check('and no longer reads as unmatched', afterDecision?.transfer_state === 'external')

  const badVerdict = await invoke('decide-transfer', u.token, {
    txn_id: beforeDecision.id, verdict: 'confirmed',
  })
  check("'confirmed' is refused for a bare leg — it asserts a pairing that doesn't exist",
    badVerdict.status !== 200, `status ${badVerdict.status}`)

  const otherLeaked = await invoke('decide-transfer', other.token, {
    txn_id: beforeDecision.id, verdict: 'rejected',
  })
  check('another tenant cannot decide this leg either', otherLeaked.status !== 200, `status ${otherLeaked.status}`)

  // ── Batch decide on unmatched legs (OskoLinker's merchant-grouped UI) ──
  section('Batch deciding on a merchant-grouped set of unmatched legs')
  const legBatchImport = await invoke('upsert-transactions', u.token, [
    { ...txn(u.accountId, '2026-07-02', 'PayID Payment Received, Thank you', -2500), category: 'Uncategorized', subcategory: undefined },
    { ...txn(u.accountId, '2026-07-09', 'PayID Payment Received, Thank you', -3100), category: 'Uncategorized', subcategory: undefined },
    { ...txn(u.accountId, '2026-07-16', 'PayID Payment Received, Thank you', -1800), category: 'Uncategorized', subcategory: undefined },
  ])
  check('three same-merchant lonely legs import', legBatchImport.json?.inserted === 3, JSON.stringify(legBatchImport.json))

  const link5 = await invoke('link-transfers', u.token, { scope: 'all' })
  check('rescan succeeds', link5.status === 200, JSON.stringify(link5.json))

  const { data: legGroup } = await u.client
    .from('transactions_analytic')
    .select('id')
    .eq('original_description', 'PayID Payment Received, Thank you')
    .eq('transfer_state', 'unmatched')
  check('all three land in the unmatched queue, groupable by merchant', legGroup?.length === 3,
    JSON.stringify(legGroup))

  const legIds = (legGroup ?? []).map((r) => r.id)
  const legBatchDecide = await invoke('decide-transfer', u.token, { txn_ids: legIds, verdict: 'external' })
  check('one call decides the whole merchant group', legBatchDecide.status === 200, JSON.stringify(legBatchDecide.json))
  check('all three decision ids come back', legBatchDecide.json?.decision_ids?.length === 3, JSON.stringify(legBatchDecide.json))

  const { data: afterLegBatch } = await u.client
    .from('transactions_analytic').select('is_transfer, transfer_state').in('id', legIds)
  check('all three are now excluded from spending', afterLegBatch?.every((r) => r.is_transfer === true), JSON.stringify(afterLegBatch))
  check('and none read as unmatched anymore', afterLegBatch?.every((r) => r.transfer_state === 'external'), JSON.stringify(afterLegBatch))

  const legBatchBadVerdict = await invoke('decide-transfer', u.token, { txn_ids: legIds, verdict: 'confirmed' })
  check("'confirmed' is refused for a batch of bare legs, same as the single-leg path",
    legBatchBadVerdict.status !== 200, `status ${legBatchBadVerdict.status}`)

  const legBatchOversized = await invoke('decide-transfer', u.token, {
    txn_ids: Array.from({ length: 201 }, () => legIds[0]), verdict: 'rejected',
  })
  check('a leg batch over the 200-item cap is rejected', legBatchOversized.status !== 200, `status ${legBatchOversized.status}`)

  const legBatchLeaked = await invoke('decide-transfer', other.token, { txn_ids: legIds, verdict: 'rejected' })
  check('another tenant cannot batch-decide these legs', legBatchLeaked.status !== 200, `status ${legBatchLeaked.status}`)

  // ── Round Up exclusion (never enters the candidate pool at all) ────────
  section('Round Up sweep never becomes a transfer candidate')
  const roundUp = await invoke('upsert-transactions', u.token, [
    txn(u.accountId, '2026-07-25', 'Round Up', -70),
  ])
  check('the Round Up row imports', roundUp.json?.inserted === 1, JSON.stringify(roundUp.json))

  const { data: roundUpRow } = await u.client
    .from('transactions').select('transfer_candidate').eq('original_description', 'Round Up').single()
  check('it never becomes a transfer_candidate, even though category=Transfer would otherwise flag it',
    roundUpRow?.transfer_candidate === false, JSON.stringify(roundUpRow))

  const { data: roundUpAnalytic } = await u.client
    .from('transactions_analytic')
    .select('is_transfer, transfer_state')
    .eq('original_description', 'Round Up').single()
  check('it is still excluded from spend/income analytics (category=Transfer alone does that)',
    roundUpAnalytic?.is_transfer === true, JSON.stringify(roundUpAnalytic))
  check('and it never appears in the review queue at all',
    roundUpAnalytic?.transfer_state === 'none', JSON.stringify(roundUpAnalytic))

  exitWithSummary()
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness error:\x1b[0m', err.message)
  process.exit(1)
})
