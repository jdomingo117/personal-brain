/**
 * Shared test helpers for the ingestion suites.
 *
 * Kept separate from the auth suites because these need real CSV fixtures and
 * an account to import into, whereas the auth suites only need a session.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const ANON = process.env.SUPABASE_ANON_KEY

if (!ANON) {
  console.error('Set SUPABASE_ANON_KEY (see `npx supabase status`).')
  process.exit(1)
}

const HERE = dirname(fileURLToPath(import.meta.url))
export const SAMPLES = join(HERE, '..', '..', '..', 'Sample datasets')

export function sampleFiles() {
  return readdirSync(SAMPLES).filter((f) => f.toLowerCase().endsWith('.csv'))
}

export function readSample(name) {
  return readFileSync(join(SAMPLES, name), 'utf8')
}

// ── assertions ─────────────────────────────────────────────────────────
let passed = 0
let failed = 0

export function check(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`)
  } else {
    failed++
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
  }
  return ok
}

export function section(title) {
  console.log(`\n${title}`)
}

export function summary() {
  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`)
  return failed === 0
}

export function exitWithSummary() {
  process.exit(summary() ? 0 : 1)
}

// ── session / fixtures ─────────────────────────────────────────────────

/** Signs up a fresh user and returns a client plus their tenant + an account. */
export async function newUserWithAccount(tag = 'ing', accountType = 'Liquid') {
  const client = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`
  const { data, error } = await client.auth.signUp({
    email,
    password: 'correct-horse-battery-staple-1',
  })
  if (error) throw new Error(`signUp: ${error.message}`)
  if (!data.session) throw new Error('signUp returned no session')

  const { data: profile } = await client
    .from('profiles').select('default_tenant_id').eq('id', data.user.id).single()

  const { data: account, error: acctErr } = await client
    .from('accounts')
    .insert({
      name: `${tag} Ledger`, type: accountType, balance: 0, currency: 'AUD',
      user_id: data.user.id, tenant_id: profile.default_tenant_id,
    })
    .select().single()
  if (acctErr) throw new Error(`create account: ${acctErr.message}`)

  return {
    client,
    token: data.session.access_token,
    userId: data.user.id,
    tenantId: profile.default_tenant_id,
    accountId: account.id,
    email,
  }
}

/** Calls an Edge Function the way the browser does. */
export async function invoke(fn, token, body, { origin = 'http://localhost:5300', ip } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    Origin: origin,
  }
  if (ip) headers['x-forwarded-for'] = ip
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* empty */ }
  return { status: res.status, json, headers: res.headers }
}
