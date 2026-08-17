#!/usr/bin/env node
/**
 * Token broker tests: HttpOnly refresh cookie, rotation, lockout, and the
 * anti-enumeration guarantees on the login endpoint.
 *
 *   node app/scripts/test-token-broker.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { assertSafeTestTarget } from './lib/assertSafeTestTarget.mjs'

assertSafeTestTarget()

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY
if (!ANON) { console.error('Set SUPABASE_ANON_KEY.'); process.exit(1) }
const BROKER = `${URL}/functions/v1/auth-session`

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  \x1b[32mPASS\x1b[0m ${name}`) }
  else { failed++; console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`) }
}

// Each run gets its own source IP so that the per-IP sliding window from a
// previous run does not bleed into this one. Two runs a minute apart would
// otherwise fail on the limiter rather than on the behaviour under test.
const RUN_IP = `198.51.100.${1 + Math.floor(Math.random() * 250)}`

async function broker(body, { cookie, origin = 'http://localhost:5300', ip = RUN_IP } = {}) {
  const headers = {
    'Content-Type': 'application/json', apikey: ANON, Origin: origin,
    'x-forwarded-for': ip,
  }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(BROKER, { method: 'POST', headers, body: JSON.stringify(body) })
  let json = null
  try { json = await res.json() } catch { /* no body */ }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie'), headers: res.headers }
}

/** Extract the cookie pair for replay, as a browser would. */
function cookiePair(setCookie) {
  return setCookie ? setCookie.split(';')[0] : null
}

async function main() {
  console.log('\n\x1b[1mHttpOnly token broker\x1b[0m\n')

  const email = `broker-${Date.now()}@example.test`
  const password = 'correct-horse-battery-staple-1'
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: suErr } = await c.auth.signUp({ email, password })
  if (suErr) throw new Error(`signup: ${suErr.message}`)

  console.log('Login')
  const login = await broker({ action: 'login', email, password })
  check('valid credentials -> 200', login.status === 200, JSON.stringify(login.json))
  check('access token returned in the body', typeof login.json?.access_token === 'string')
  check('refresh token NOT in the body',
    !JSON.stringify(login.json ?? {}).includes('refresh'), JSON.stringify(login.json))

  console.log('\nCookie attributes')
  const sc = login.setCookie ?? ''
  check('cookie is set', sc.includes('halcyon_rt='), sc)
  check('HttpOnly — unreadable from JavaScript', /HttpOnly/i.test(sc), sc)
  check('SameSite=Lax — not sent on cross-site POSTs', /SameSite=Lax/i.test(sc), sc)
  check('scoped Path, not site-wide', /Path=\/functions\/v1\/auth-session/i.test(sc), sc)
  check('credentials allowed for the echoed origin',
    login.headers.get('access-control-allow-credentials') === 'true')

  console.log('\nRefresh rotation')
  const first = cookiePair(login.setCookie)
  const refreshed = await broker({ action: 'refresh' }, { cookie: first })
  check('refresh with cookie -> 200', refreshed.status === 200, JSON.stringify(refreshed.json))
  check('a new access token is issued', typeof refreshed.json?.access_token === 'string')
  const second = cookiePair(refreshed.setCookie)
  check('refresh token was rotated', !!second && second !== first)

  // Replay inside the reuse interval is ALLOWED on purpose. config.toml sets
  // refresh_token_reuse_interval = 10, a grace window so that two tabs
  // refreshing at the same moment do not destroy a perfectly good session.
  const graceReplay = await broker({ action: 'refresh' }, { cookie: first })
  check('replay within the reuse interval is tolerated', graceReplay.status === 200,
    `got ${graceReplay.status}`)

  // NOT asserted: that replaying an old refresh token past the reuse interval
  // revokes the whole token family. Measured against this local GoTrue
  // (rotation enabled, reuse interval 10s), a one-generation-old token still
  // refreshed successfully 14 seconds later, and its child stayed valid too —
  // so family revocation did not trigger. Rotation itself is verified above.
  // Treat reuse detection as unconfirmed until it is re-measured against a
  // hosted project; do not rely on it as a control in the meantime.

  // An invalid token must still be refused and must clear the cookie.
  const bogus = await broker({ action: 'refresh' }, { cookie: 'halcyon_rt=not-a-real-token' })
  check('an invalid refresh token is refused', bogus.status === 401, `got ${bogus.status}`)
  check('refusal clears the cookie', /Max-Age=0/.test(bogus.setCookie ?? ''), bogus.setCookie ?? '')

  console.log('\nNo cookie / bad cookie')
  check('refresh without a cookie -> 401', (await broker({ action: 'refresh' })).status === 401)
  const forged = await broker({ action: 'refresh' }, { cookie: 'halcyon_rt=forged-value' })
  check('forged cookie -> 401', forged.status === 401, `got ${forged.status}`)

  console.log('\nCSRF / origin')
  const evil = await broker({ action: 'login', email, password }, { origin: 'https://evil.example' })
  check('login from a disallowed Origin -> 403', evil.status === 403, `got ${evil.status}`)

  console.log('\nUser enumeration')
  const unknown = await broker({ action: 'login', email: `nobody-${Date.now()}@example.test`, password })
  const wrongPw = await broker({ action: 'login', email, password: 'definitely-not-the-password' })
  check('unknown user and wrong password share a status',
    unknown.status === wrongPw.status, `${unknown.status} vs ${wrongPw.status}`)
  check('unknown user and wrong password share a body',
    JSON.stringify(unknown.json) === JSON.stringify(wrongPw.json),
    `${JSON.stringify(unknown.json)} vs ${JSON.stringify(wrongPw.json)}`)

  console.log('\nBrute-force lockout')
  // 5 consecutive failures locks the account; the response must not say so.
  const victim = `victim-${Date.now()}@example.test`
  await c.auth.signUp({ email: victim, password })
  // Rotate the source IP on every attempt. This is what a real credential
  // -stuffing run looks like, and it proves the per-account protection works
  // independently of the per-IP window — an attacker with a proxy pool gets
  // no advantage.
  let statuses = []
  for (let i = 0; i < 6; i++) {
    const r = await broker(
      { action: 'login', email: victim, password: 'wrong-password-here' },
      { ip: `203.0.113.${10 + i}` },
    )
    statuses.push(r.status)
  }
  // The correct password must ALSO be refused. Which layer catches it is not
  // fixed: the per-account sliding window (429) usually trips before the
  // lockout counter (401), and both are correct refusals. What matters is
  // that valid credentials do not get through, and that the reason is not
  // disclosed.
  const afterLock = await broker({ action: 'login', email: victim, password }, { ip: '203.0.113.99' })
  check('correct password is refused after repeated failures',
    afterLock.status === 401 || afterLock.status === 429, `got ${afterLock.status}`)
  check('the reason is not disclosed',
    !/lock|attempt|exist/i.test(JSON.stringify(afterLock.json ?? {})), JSON.stringify(afterLock.json))
  check('every failed attempt was refused', statuses.every((s) => s === 401 || s === 429), statuses.join(','))
  check('at least one attempt reached the rate limiter', statuses.includes(429), statuses.join(','))

  console.log('\nLogout')
  const loggedOut = await broker({ action: 'logout' }, { cookie: second })
  check('logout -> 200', loggedOut.status === 200)
  check('logout clears the cookie', /Max-Age=0/.test(loggedOut.setCookie ?? ''), loggedOut.setCookie ?? '')

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => { console.error('\x1b[31mHarness error:\x1b[0m', e.message); process.exit(2) })
