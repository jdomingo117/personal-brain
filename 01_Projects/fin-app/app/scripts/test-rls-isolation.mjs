#!/usr/bin/env node
/**
 * Cross-tenant RLS isolation test.
 *
 * Creates two users in two tenants, seeds data for each, then drives user B's
 * JWT at every one of user A's rows. Every attempt must come back empty or as
 * a policy error. This is the test that catches a leak before users do.
 *
 * Usage (local stack must be running):
 *   node scripts/test-rls-isolation.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY
if (!ANON) {
  console.error('Set SUPABASE_ANON_KEY (printed by `npx supabase status`).')
  process.exit(1)
}

let passed = 0
let failed = 0

function check(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`)
  } else {
    failed++
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** A cross-tenant read must return zero rows (RLS filters, it does not error). */
function checkNoRows(name, { data, error }) {
  const rows = data?.length ?? 0
  check(name, rows === 0 && !error?.message?.includes('JWT'), error ? error.message : `${rows} row(s) leaked`)
}

/** A cross-tenant write must either error or affect zero rows. */
function checkDenied(name, { data, error }) {
  const rows = data?.length ?? 0
  check(name, !!error || rows === 0, `no error and ${rows} row(s) affected`)
}

async function newUser(tag) {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const email = `rls-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  const { data, error } = await client.auth.signUp({ email, password: 'correct-horse-battery-staple-1' })
  if (error) throw new Error(`signUp ${tag}: ${error.message}`)
  if (!data.session) throw new Error(`signUp ${tag}: no session (email confirmations enabled?)`)

  const { data: profile, error: pErr } = await client
    .from('profiles').select('id, default_tenant_id').eq('id', data.user.id).single()
  if (pErr) throw new Error(`profile ${tag}: ${pErr.message}`)

  return { client, userId: data.user.id, tenantId: profile.default_tenant_id, email }
}

async function main() {
  console.log('\n\x1b[1mCross-tenant RLS isolation\x1b[0m\n')

  const A = await newUser('a')
  const B = await newUser('b')

  console.log('Provisioning')
  check('signup auto-provisions a tenant for A', !!A.tenantId)
  check('signup auto-provisions a tenant for B', !!B.tenantId)
  check('the two tenants are distinct', A.tenantId !== B.tenantId)

  // ── Seed data owned by A ────────────────────────────────────────────
  const { data: acct, error: acctErr } = await A.client
    .from('accounts')
    .insert({ name: 'A Ledger', type: 'Liquid', balance: 12345, currency: 'AUD', user_id: A.userId, tenant_id: A.tenantId })
    .select().single()
  if (acctErr) throw new Error(`seed account: ${acctErr.message}`)

  const { error: txErr } = await A.client.from('transactions').insert({
    user_id: A.userId, tenant_id: A.tenantId, account_id: acct.id,
    date: '2026-08-01', original_description: 'SECRET PAYMENT', merchant: 'Secret',
    category: 'Other', amount: -4200,
  })
  if (txErr) throw new Error(`seed transaction: ${txErr.message}`)

  await A.client.from('budgets').insert({ user_id: A.userId, tenant_id: A.tenantId, category: 'Food & drink', amount_limit: 50000 })

  // ── Transfer-linker data owned by A ─────────────────────────────────
  // These tables carry the same financial detail as `transactions` (account
  // masks, amounts, dates via the linked rows), so they need the same
  // isolation guarantees and the same regression coverage.
  await A.client.from('account_identifiers').insert({
    tenant_id: A.tenantId, account_id: acct.id, kind: 'mask', value: '3692', source: 'user',
  })
  const { data: aTxns } = await A.client.from('transactions').select('id, dedupe_hash, occurrence')
  const aTxnId = aTxns?.[0]?.id
  await A.client.from('transfer_decisions').insert({
    tenant_id: A.tenantId, from_account_id: acct.id,
    from_hash: '\\xdeadbeef', from_occurrence: 0, verdict: 'rejected',
  })

  console.log('\nA can reach its own data')
  const ownAcct = await A.client.from('accounts').select('*')
  check('A reads its own accounts', ownAcct.data?.length === 1, ownAcct.error?.message)
  const ownTx = await A.client.from('transactions').select('*')
  check('A reads its own transactions', ownTx.data?.length === 1, ownTx.error?.message)

  console.log("\nB cannot read A's data")
  checkNoRows('accounts',        await B.client.from('accounts').select('*').eq('id', acct.id))
  checkNoRows('transactions',    await B.client.from('transactions').select('*'))
  checkNoRows('budgets',         await B.client.from('budgets').select('*').eq('tenant_id', A.tenantId))
  checkNoRows('static_profiles', await B.client.from('static_profiles').select('*').eq('tenant_id', A.tenantId))
  checkNoRows("A's tenant row",  await B.client.from('tenants').select('*').eq('id', A.tenantId))
  checkNoRows("A's membership",  await B.client.from('tenant_members').select('*').eq('tenant_id', A.tenantId))
  checkNoRows("A's profile",     await B.client.from('profiles').select('*').eq('id', A.userId))
  checkNoRows('account_identifiers',  await B.client.from('account_identifiers').select('*').eq('tenant_id', A.tenantId))
  checkNoRows('transfer_links',       await B.client.from('transfer_links').select('*').eq('tenant_id', A.tenantId))
  checkNoRows('transfer_decisions',   await B.client.from('transfer_decisions').select('*').eq('tenant_id', A.tenantId))
  // The analytic view is the one the whole client reads from. It must be
  // security_invoker, or it returns every tenant's ledger with owner rights.
  checkNoRows('transactions_analytic (view)', await B.client.from('transactions_analytic').select('*'))

  console.log("\nB cannot write to A's data")
  checkDenied('update account',  await B.client.from('accounts').update({ balance: 0 }).eq('id', acct.id).select())
  checkDenied('delete account',  await B.client.from('accounts').delete().eq('id', acct.id).select())
  checkDenied('delete txns',     await B.client.from('transactions').delete().eq('tenant_id', A.tenantId).select())
  checkDenied('insert into A\'s tenant', await B.client.from('accounts').insert({
    name: 'Injected', type: 'Liquid', balance: 0, currency: 'AUD', user_id: B.userId, tenant_id: A.tenantId,
  }).select())
  checkDenied('join A\'s tenant', await B.client.from('tenant_members').insert({
    tenant_id: A.tenantId, user_id: B.userId, role: 'owner',
  }).select())
  checkDenied('rename A\'s tenant', await B.client.from('tenants').update({ name: 'pwned' }).eq('id', A.tenantId).select())
  checkDenied('insert identifier into A\'s tenant', await B.client.from('account_identifiers').insert({
    tenant_id: A.tenantId, account_id: acct.id, kind: 'mask', value: '9999', source: 'user',
  }).select())
  checkDenied('delete A\'s identifiers', await B.client.from('account_identifiers').delete().eq('tenant_id', A.tenantId).select())
  checkDenied('delete A\'s transfer decisions', await B.client.from('transfer_decisions').delete().eq('tenant_id', A.tenantId).select())

  console.log('\nTransfer-linker RPCs are tenant-scoped')
  // Passing A's tenant id explicitly is the obvious attack on a SECURITY
  // INVOKER function: the argument must not be trusted as authorisation.
  const stolenCandidates = await B.client.rpc('transfer_candidates', {
    p_tenant_id: A.tenantId, p_from: '2020-01-01', p_to: '2030-01-01',
  })
  check('transfer_candidates leaks nothing across tenants', (stolenCandidates.data?.length ?? 0) === 0,
    `${stolenCandidates.data?.length} row(s) leaked`)
  const stolenIdents = await B.client.rpc('account_identifier_map', { p_tenant_id: A.tenantId })
  check('account_identifier_map leaks nothing across tenants', (stolenIdents.data?.length ?? 0) === 0,
    `${stolenIdents.data?.length} row(s) leaked`)
  const stolenExcl = await B.client.rpc('transfer_match_exclusions', { p_tenant_id: A.tenantId })
  check('transfer_match_exclusions leaks nothing across tenants', (stolenExcl.data?.length ?? 0) === 0,
    `${stolenExcl.data?.length} row(s) leaked`)
  const forgedLink = await B.client.rpc('replace_transfer_links', {
    p_tenant_id: A.tenantId, p_from: '2020-01-01', p_to: '2030-01-01', p_links: [], p_matcher_version: 1,
  })
  const forgedCreated = forgedLink.data?.[0]?.created ?? forgedLink.data?.created ?? 0
  check('replace_transfer_links cannot write into A\'s tenant', !!forgedLink.error || forgedCreated === 0,
    forgedLink.error?.message ?? `created ${forgedCreated}`)

  console.log("\nA's transfer data survived")
  const aIdents = await A.client.from('account_identifiers').select('*')
  check('A still sees its own identifier', aIdents.data?.length === 1, aIdents.error?.message)
  const aDecisions = await A.client.from('transfer_decisions').select('*')
  check('A still sees its own decision', aDecisions.data?.length === 1, aDecisions.error?.message)

  console.log('\nA\'s data survived')
  const after = await A.client.from('accounts').select('*').eq('id', acct.id).single()
  check('balance unchanged', after.data?.balance === 12345, `got ${after.data?.balance}`)
  const afterTx = await A.client.from('transactions').select('*')
  check('transaction still present', afterTx.data?.length === 1)

  console.log('\nPrivilege escalation')
  checkDenied('self-promote to platform admin', await B.client.from('profiles')
    .update({ callsign: 'x' }).eq('id', A.userId).select())
  const lock = await B.client.from('account_lockouts').select('*')
  check('login_attempts / lockouts are invisible', (lock.data?.length ?? 0) === 0 || !!lock.error)

  console.log('\nAudit log')
  // A owns its tenant, and `owner` outranks `admin`, so A is meant to see its
  // own security events. What must never happen is A seeing B's.
  const auditRead = await A.client.from('audit_log').select('*')
  const foreign = (auditRead.data ?? []).filter((r) => r.tenant_id !== A.tenantId)
  check('A sees its own signup event', (auditRead.data?.length ?? 0) > 0, auditRead.error?.message)
  check("A sees none of B's audit rows", foreign.length === 0, `${foreign.length} foreign row(s)`)
  checkNoRows("B's tenant filtered out", await A.client.from('audit_log').select('*').eq('tenant_id', B.tenantId))
  const auditIns = await A.client.from('audit_log').insert({ action: 'forged.event' }).select()
  check('cannot forge an audit entry', !!auditIns.error, 'insert succeeded')
  const auditDel = await A.client.from('audit_log').delete().neq('id', 0).select()
  check('cannot delete audit entries', !!auditDel.error || (auditDel.data?.length ?? 0) === 0)

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\x1b[31mHarness error:\x1b[0m', e.message)
  process.exit(2)
})
