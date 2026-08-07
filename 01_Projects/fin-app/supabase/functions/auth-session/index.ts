import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { corsHeadersFor, isAllowedOrigin } from '../_shared/cors.ts'
import { rateLimitAll, LIMITS } from '../_shared/rateLimit.ts'

/**
 * Token broker: the piece that makes HttpOnly refresh tokens possible.
 *
 * A static SPA cannot set an HttpOnly cookie — supabase-js keeps tokens in
 * localStorage, which any successful XSS can read, and a stolen refresh token
 * is a long-lived key to the account. This function sits in front of GoTrue
 * so that:
 *
 *   - the refresh token is returned as HttpOnly; Secure; SameSite=Lax and is
 *     never visible to JavaScript;
 *   - the access token comes back in the response body, for the SPA to hold
 *     in memory only, and expires in 15 minutes.
 *
 * The residual XSS risk is a 15-minute access token rather than indefinite
 * account access. SameSite=Lax plus the Origin allowlist covers CSRF: the
 * cookie is not sent on cross-site POSTs, and a disallowed Origin is refused
 * before any credential is touched.
 *
 * Endpoints (action in the body):
 *   login   { email, password }  -> sets cookie, returns access token
 *   refresh {}                   -> rotates using the cookie
 *   logout  {}                   -> revokes server-side and clears the cookie
 */

const COOKIE = 'halcyon_rt'
const COOKIE_PATH = '/functions/v1/auth-session'

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('login'),
    email: z.string().email().max(320),
    password: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal('refresh') }),
  z.object({ action: z.literal('logout') }),
])

function json(body: unknown, status: number, headers: Record<string, string>, cookie?: string) {
  const h = new Headers({ ...headers, 'Content-Type': 'application/json' })
  if (cookie) h.append('Set-Cookie', cookie)
  return new Response(JSON.stringify(body), { status, headers: h })
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

function setCookie(value: string, maxAgeSec: number): string {
  // Secure is omitted on plain-HTTP localhost only; browsers reject Secure
  // cookies over http://, which would break local development entirely.
  const isLocal = (Deno.env.get('SUPABASE_URL') ?? '').includes('127.0.0.1')
  return [
    `${COOKIE}=${encodeURIComponent(value)}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=Lax',
    isLocal ? '' : 'Secure',
  ].filter(Boolean).join('; ')
}

const clearCookie = () =>
  `${COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax`

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : null
}

const anonClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

const adminClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  // Credentialed requests need this, and it is only ever paired with a
  // specific echoed Origin — never a wildcard, which browsers reject here.
  const headers = { ...cors, 'Access-Control-Allow-Credentials': 'true' }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!isAllowedOrigin(req)) return json({ error: 'Origin not allowed' }, 403, headers)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers)

  const ip = clientIp(req)

  try {
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) return json({ error: 'Invalid request' }, 400, headers)
    const body = parsed.data

    // ── logout ─────────────────────────────────────────────────────────
    if (body.action === 'logout') {
      const token = readCookie(req, COOKIE)
      if (token) {
        // Revoke server-side. Clearing the cookie alone would leave a valid
        // refresh token in circulation for anyone who captured it.
        const client = anonClient()
        const { data } = await client.auth.refreshSession({ refresh_token: token })
        if (data.session) {
          await client.auth.admin?.signOut?.(data.session.access_token).catch(() => {})
          await client.auth.signOut()
        }
      }
      return json({ success: true }, 200, headers, clearCookie())
    }

    // ── refresh ────────────────────────────────────────────────────────
    if (body.action === 'refresh') {
      const token = readCookie(req, COOKIE)
      if (!token) return json({ error: 'No session' }, 401, headers, clearCookie())

      const limited = await rateLimitAll([
        { key: `refresh:ip:${ip ?? 'unknown'}`, rule: LIMITS.refreshPerUser },
      ])
      if (!limited.allowed) {
        return json({ error: 'Too many requests' }, 429, {
          ...headers, 'Retry-After': String(limited.retryAfter),
        })
      }

      const { data, error } = await anonClient().auth.refreshSession({ refresh_token: token })
      if (error || !data.session) {
        // Expired, malformed, or revoked. Clear the cookie and force a fresh
        // login rather than leaving a dead credential in the browser.
        //
        // Note: GoTrue is configured with rotation enabled and a 10s reuse
        // interval, and rotation is confirmed working. Family revocation on
        // token reuse is NOT confirmed — an old token still refreshed
        // successfully well past the interval in local testing (see
        // app/scripts/test-token-broker.mjs). Re-measure on a hosted project
        // before treating reuse detection as a control you rely on.
        return json({ error: 'Session expired' }, 401, headers, clearCookie())
      }

      return json(
        { access_token: data.session.access_token, expires_at: data.session.expires_at },
        200, headers,
        setCookie(data.session.refresh_token, 60 * 60 * 24 * 30),
      )
    }

    // ── login ──────────────────────────────────────────────────────────
    const { email, password } = body

    // Layer 2: sliding window on IP and on the account.
    const limited = await rateLimitAll([
      { key: `login:ip:${ip ?? 'unknown'}`, rule: LIMITS.loginPerIp },
      { key: `login:email:${email.toLowerCase()}`, rule: LIMITS.loginPerAccount },
    ])
    if (!limited.allowed) {
      await adminClient().rpc('record_login_attempt', {
        p_email: email, p_ip: ip, p_succeeded: false, p_failure_kind: 'rate_limited',
      })
      return json({ error: 'Too many requests' }, 429, {
        ...headers, 'Retry-After': String(limited.retryAfter),
      })
    }

    // Layer 3: per-account lockout, which survives IP rotation.
    const admin = adminClient()
    const { data: lockedUntil } = await admin.rpc('check_login_lockout', { p_email: email })
    if (lockedUntil) {
      await admin.rpc('record_login_attempt', {
        p_email: email, p_ip: ip, p_succeeded: false, p_failure_kind: 'locked',
      })
      // Deliberately the same 401 and body as a wrong password. Announcing
      // the lockout would turn it into an oracle for which addresses exist,
      // and would tell an attacker exactly when to resume.
      return json({ error: 'Invalid credentials' }, 401, headers)
    }

    const { data, error } = await anonClient().auth.signInWithPassword({ email, password })

    if (error || !data.session) {
      await admin.rpc('record_login_attempt', {
        p_email: email, p_ip: ip, p_succeeded: false, p_failure_kind: 'bad_password',
      })
      return json({ error: 'Invalid credentials' }, 401, headers)
    }

    await admin.rpc('record_login_attempt', {
      p_email: email, p_ip: ip, p_succeeded: true,
    })
    await admin.from('audit_log').insert({
      actor_id: data.user.id,
      action: 'auth.login',
      ip,
      user_agent: req.headers.get('user-agent'),
      metadata: { method: 'password', broker: true },
    })

    return json(
      { access_token: data.session.access_token, expires_at: data.session.expires_at },
      200, headers,
      setCookie(data.session.refresh_token, 60 * 60 * 24 * 30),
    )
  } catch (err) {
    console.error('auth-session error', String(err))
    return json({ error: 'Request failed' }, 400, headers)
  }
})
