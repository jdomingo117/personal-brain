#!/usr/bin/env node
/**
 * Edge Function auth middleware tests.
 *
 * Requires the local stack plus `npx supabase functions serve --no-verify-jwt`
 * (the --no-verify-jwt flag hands rejection to withAuth so the middleware
 * itself is what gets exercised).
 *
 *   node app/scripts/test-edge-auth.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY
if (!ANON) {
  console.error('Set SUPABASE_ANON_KEY.')
  process.exit(1)
}
const FN = `${URL}/functions/v1`

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  \x1b[32mPASS\x1b[0m ${name}`) }
  else { failed++; console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function call(fn, { token, body, origin = 'http://localhost:5300', method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: ANON }
  if (token) headers.Authorization = `Bearer ${token}`
  if (origin) headers.Origin = origin
  const res = await fetch(`${FN}/${fn}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* empty body */ }
  return { status: res.status, json, headers: res.headers }
}

async function newUser(tag) {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `edge-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  const { data, error } = await client.auth.signUp({ email, password: 'correct-horse-battery-staple-1' })
  if (error) throw new Error(`signUp ${tag}: ${error.message}`)
  const { data: profile } = await client.from('profiles').select('default_tenant_id').eq('id', data.user.id).single()
  return { client, token: data.session.access_token, userId: data.user.id, tenantId: profile.default_tenant_id }
}

async function main() {
  console.log('\n\x1b[1mEdge Function auth middleware\x1b[0m\n')

  const A = await newUser('a')
  const B = await newUser('b')
  const valid = { name: 'Ledger', type: 'Liquid', balance: 1000, currency: 'AUD' }

  console.log('Authentication')
  check('no Authorization header -> 401', (await call('upsert-account', { body: valid })).status === 401)
  check('malformed header -> 401',
    (await call('upsert-account', { token: 'not-a-jwt', body: valid })).status === 401)
  const noBearer = await fetch(`${FN}/upsert-account`, {
    method: 'POST', headers: { apikey: ANON, Authorization: A.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(valid),
  })
  check('header without "Bearer " -> 401', noBearer.status === 401)

  console.log('\nTransport')
  const opts = await call('upsert-account', { method: 'OPTIONS' })
  check('OPTIONS preflight -> 204', opts.status === 204)
  const bad = await call('upsert-account', { token: A.token, body: valid, origin: 'https://evil.example' })
  check('disallowed Origin -> 403', bad.status === 403, `got ${bad.status}`)
  // The exact Access-Control-Allow-Origin value cannot be asserted here: the
  // local `functions serve` gateway rewrites that one header to "*" on the way
  // out (our other CORS headers pass through untouched). Deployed functions
  // are not proxied that way. The produced value is asserted directly in
  // supabase/functions/_shared/cors_test.ts.
  const echoed = await call('upsert-account', { token: A.token, body: { name: '' } })
  check('our CORS headers reach the client',
    echoed.headers.get('access-control-allow-methods') === 'POST, OPTIONS',
    echoed.headers.get('access-control-allow-methods'))
  const wrongMethod = await call('upsert-account', { token: A.token, method: 'GET' })
  check('GET -> 405', wrongMethod.status === 405, `got ${wrongMethod.status}`)

  console.log('\nValidation')
  const badSchema = await call('upsert-account', { token: A.token, body: { name: '', type: 'Nope', balance: 'x' } })
  check('schema violation -> 422', badSchema.status === 422, `got ${badSchema.status}`)
  check('422 names the offending fields', Array.isArray(badSchema.json?.issues))
  const notJson = await fetch(`${FN}/upsert-account`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${A.token}`, 'Content-Type': 'application/json', Origin: 'http://localhost:5300' },
    body: '{not json',
  })
  check('malformed JSON -> 400', notJson.status === 400, `got ${notJson.status}`)
  // The 413 branch is not reachable through the local runtime: it fails on
  // request bodies from roughly 900KB — below our 1MiB threshold — and
  // mishandles the 100-continue negotiation curl uses at that size, so the
  // connection dies before the function is entered. Asserted against a body
  // large enough to trip the check but small enough for the runtime to
  // deliver would require a per-function limit that does not exist. Verify
  // this one against a deployed function.
  console.log('       (413 oversized-body branch: not exercisable on the local runtime)')

  console.log('\nHappy path')
  const created = await call('upsert-account', { token: A.token, body: valid })
  check('valid request -> 200', created.status === 200, JSON.stringify(created.json))
  check('tenant_id stamped from the JWT', created.json?.tenant_id === A.tenantId)
  check('user_id stamped from the JWT', created.json?.user_id === A.userId)

  console.log('\nProfile and identifier functions')
  const badCallsign = await call('update-callsign', { token: A.token, body: { callsign: '' } })
  check('callsign validation -> 422', badCallsign.status === 422, `got ${badCallsign.status}`)
  const callsign = await call('update-callsign', { token: A.token, body: { callsign: 'Edge Operator' } })
  check('callsign update -> 200', callsign.status === 200 && callsign.json?.callsign === 'Edge Operator')
  const malformedIdentifier = await call('manage-account-identifier', { token: A.token, body: { action: 'add' } })
  check('identifier validation -> 422', malformedIdentifier.status === 422, `got ${malformedIdentifier.status}`)
  const identifier = await call('manage-account-identifier', {
    token: A.token, body: { action: 'add', account_id: created.json.id, value: 'Account • 1234' },
  })
  check('identifier add -> 200', identifier.status === 200 && identifier.json?.value === '1234', JSON.stringify(identifier.json))
  const foreignIdentifier = await call('manage-account-identifier', {
    token: B.token, body: { action: 'add', account_id: created.json.id, value: '9999' },
  })
  check('cannot add identifier to another tenant account', foreignIdentifier.status === 400, `got ${foreignIdentifier.status}`)
  const foreignRemove = await call('manage-account-identifier', {
    token: B.token, body: { action: 'remove', id: identifier.json.id },
  })
  check('cannot remove another tenant identifier', foreignRemove.status === 200 && foreignRemove.json?.success === false, JSON.stringify(foreignRemove.json))
  const restoreSchema = await call('restore-user-account', { token: A.token, body: { unexpected: true } })
  check('account recovery validation -> 422', restoreSchema.status === 422, `got ${restoreSchema.status}`)
  await A.client.from('profiles').update({ deletion_scheduled_at: new Date().toISOString() }).eq('id', A.userId)
  const restored = await call('restore-user-account', { token: A.token, body: {} })
  const restoredProfile = await A.client.from('profiles').select('deletion_scheduled_at').eq('id', A.userId).single()
  check('account recovery clears deletion schedule', restored.status === 200 && restored.json?.restored === true && !restoredProfile.data?.deletion_scheduled_at)
  const sessionSchema = await call('revoke-other-session-records', { token: A.token, body: { unexpected: true } })
  check('session record validation -> 422', sessionSchema.status === 422, `got ${sessionSchema.status}`)

  console.log('\nTenant injection')
  // The client asks to write into A's tenant while holding B's token.
  const injected = await call('upsert-account', {
    token: B.token,
    body: { ...valid, name: 'Injected', tenant_id: A.tenantId, user_id: A.userId },
  })
  check('body tenant_id/user_id are ignored', injected.status === 200 && injected.json?.tenant_id === B.tenantId,
    `tenant_id=${injected.json?.tenant_id}`)
  const aSees = await A.client.from('accounts').select('name')
  check("row did not land in A's tenant", !aSees.data?.some((r) => r.name === 'Injected'))

  console.log('\nAuthorization')
  // delete-account requires 'admin'; both users are 'owner' of their own
  // tenant, so this should succeed for the owner and find nothing for others.
  const delOther = await call('delete-account', { token: B.token, body: { id: created.json.id } })
  check("cannot delete another tenant's account", delOther.json?.success === false, JSON.stringify(delOther.json))
  const stillThere = await A.client.from('accounts').select('id').eq('id', created.json.id)
  check("A's account survived", stillThere.data?.length === 1)

  console.log('\nError handling')
  const leak = await call('upsert-transactions', {
    token: A.token,
    body: { account_id: '00000000-0000-0000-0000-000000000000', date: '2026-08-01',
            original_description: 'x', merchant: 'x', category: 'x', amount: -1 },
  })
  const msg = JSON.stringify(leak.json ?? {})
  check('DB errors are not echoed to the client',
    !/violates|constraint|foreign key|relation|column/i.test(msg), msg)

  console.log('\nAudit trail')
  const audit = await A.client.from('audit_log').select('action').order('occurred_at', { ascending: false })
  const actions = (audit.data ?? []).map((r) => r.action)
  check('account.created recorded', actions.includes('account.created'), actions.join(','))
  check('auth.user_created recorded', actions.includes('auth.user_created'))
  check('callsign update recorded', actions.includes('profile.callsign_updated'))
  check('identifier add recorded', actions.includes('account_identifier.added'))
  check('account recovery recorded', actions.includes('account.deletion_cancelled'))

  console.log('\nRate limiting')
  // analyze-csv is capped at 20/hour per user.
  let sawLimit = false, lastStatus = 0
  for (let i = 0; i < 24; i++) {
    const r = await call('analyze-csv', { token: B.token, body: { header: ['a'], sampleRows: [['1']] } })
    lastStatus = r.status
    if (r.status === 429) {
      sawLimit = true
      check('429 carries Retry-After', !!r.headers.get('retry-after'), 'missing header')
      console.log(`       (limit hit on request ${i + 1})`)
      break
    }
  }
  check('per-user limit enforced on analyze-csv', sawLimit, `last status ${lastStatus}`)

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('\x1b[31mHarness error:\x1b[0m', e.message); process.exit(2) })
