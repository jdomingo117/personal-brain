/**
 * Shared request pipeline for authenticated Edge Functions.
 *
 * Replaces the ~25-line preamble that was copy-pasted into six functions.
 * That duplication is why the `getUser()` "Auth session missing!" bug had to
 * be fixed three separate times: there was no single place to fix it.
 *
 * Order matters. Cheap rejections come first so that an unauthenticated
 * flood never reaches the database:
 *
 *   preflight -> origin -> method -> body size -> JWT -> rate limit
 *   -> tenant/role -> schema -> handler -> audit
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { corsHeadersFor, isAllowedOrigin } from './cors.ts'
import { rateLimit, type RateLimitRule, LIMITS } from './rateLimit.ts'

export type TenantRole = 'owner' | 'admin' | 'member' | 'viewer'

const ROLE_RANK: Record<TenantRole, number> = { owner: 4, admin: 3, member: 2, viewer: 1 }

export interface AuthContext<TBody> {
  body: TBody
  user: { id: string; email: string | null }
  tenantId: string
  role: TenantRole
  /** Caller-scoped client. Every query through it is still filtered by RLS. */
  db: SupabaseClient
  /** Service-role client. Bypasses RLS — scope every query by hand. */
  admin: () => SupabaseClient
  req: Request
  ip: string | null
  /** Records an entry in the append-only audit log. */
  audit: (action: string, extra?: Record<string, unknown>) => Promise<void>
}

export interface WithAuthOptions<TSchema extends z.ZodTypeAny> {
  /** Zod schema for the request body. Omit for functions that take no body. */
  schema?: TSchema
  /** Minimum tenant role required. Defaults to 'member'. */
  requireRole?: TenantRole
  /** Rate limit applied per user. Defaults to LIMITS.writePerUser. */
  rateLimit?: RateLimitRule
  /** Audit action name recorded on success. Omit to skip the audit write. */
  auditAction?: string
  /** Max request body in bytes. Defaults to 1 MiB. */
  maxBodyBytes?: number
}

const MAX_BODY_BYTES_DEFAULT = 1024 * 1024

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

/**
 * Responds without having read the request body.
 *
 * The body has to be cancelled explicitly first. Returning a response while
 * the client is still streaming leaves the request half-open and the caller
 * sees a gateway timeout instead of the status we sent — which is exactly
 * what an oversized-payload rejection would otherwise produce.
 */
async function reject(
  req: Request,
  body: unknown,
  status: number,
  headers: Record<string, string>,
) {
  try {
    await req.body?.cancel()
  } catch {
    // Already consumed or closed — nothing to do.
  }
  return json(body, status, headers)
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  // Left-most entry is the original client; the rest are proxies.
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('cf-connecting-ip') ?? null
}

export function withAuth<TSchema extends z.ZodTypeAny>(
  options: WithAuthOptions<TSchema>,
  handler: (ctx: AuthContext<z.infer<TSchema>>) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeadersFor(req)

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (!isAllowedOrigin(req)) {
      return await reject(req, { error: 'Origin not allowed' }, 403, cors)
    }
    if (req.method !== 'POST') {
      return await reject(req, { error: 'Method not allowed' }, 405, {
        ...cors,
        Allow: 'POST, OPTIONS',
      })
    }

    const ip = clientIp(req)

    try {
      // ── Body size, checked before reading ────────────────────────────
      const maxBytes = options.maxBodyBytes ?? MAX_BODY_BYTES_DEFAULT
      const declared = Number(req.headers.get('content-length') ?? 0)
      if (declared > maxBytes) {
        return await reject(req, { error: 'Payload too large' }, 413, cors)
      }

      // ── Authentication ───────────────────────────────────────────────
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return await reject(req, { error: 'Unauthorized' }, 401, cors)
      }
      const token = authHeader.slice('Bearer '.length).trim()
      if (!token) return await reject(req, { error: 'Unauthorized' }, 401, cors)

      const db = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      )

      // The token must be passed explicitly. getUser() with no argument reads
      // the session from client storage, which does not exist in Deno, and
      // fails with "Auth session missing!".
      const { data: userData, error: userErr } = await db.auth.getUser(token)
      const user = userData?.user
      if (userErr || !user) {
        return await reject(req, { error: 'Unauthorized' }, 401, cors)
      }

      // ── Rate limiting, keyed on the authenticated user ───────────────
      const rule = options.rateLimit ?? LIMITS.writePerUser
      const fnName = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? 'fn'
      const limited = await rateLimit(`fn:${fnName}:${user.id}`, rule)
      if (!limited.allowed) {
        return json({ error: 'Too many requests' }, 429, {
          ...cors,
          'Retry-After': String(limited.retryAfter),
        })
      }

      // ── Tenant + role resolution ─────────────────────────────────────
      // Read through the caller's own client so RLS confirms the membership
      // rather than the service role asserting it.
      const { data: membership, error: memErr } = await db
        .from('tenant_members')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (memErr || !membership) {
        console.error('no tenant membership', { userId: user.id, err: memErr?.message })
        return json({ error: 'No tenant' }, 403, cors)
      }

      const role = membership.role as TenantRole
      const required = options.requireRole ?? 'member'
      if (ROLE_RANK[role] < ROLE_RANK[required]) {
        return json({ error: 'Forbidden' }, 403, cors)
      }

      // ── Validation ───────────────────────────────────────────────────
      let body: z.infer<TSchema> = undefined as z.infer<TSchema>
      if (options.schema) {
        const raw = await req.text()
        if (raw.length > maxBytes) {
          return json({ error: 'Payload too large' }, 413, cors)
        }
        let parsedJson: unknown
        try {
          parsedJson = JSON.parse(raw)
        } catch {
          return json({ error: 'Invalid JSON' }, 400, cors)
        }
        const result = options.schema.safeParse(parsedJson)
        if (!result.success) {
          // Field-level issues are safe to return: they describe the caller's
          // own payload, not server internals.
          return json(
            { error: 'Validation failed', issues: result.error.issues },
            422,
            cors,
          )
        }
        body = result.data
      }

      const adminClient = () =>
        createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          { auth: { persistSession: false, autoRefreshToken: false } },
        )

      const audit = async (action: string, extra: Record<string, unknown> = {}) => {
        // Audit writes must never fail the request they describe.
        try {
          await adminClient().from('audit_log').insert({
            actor_id: user.id,
            tenant_id: membership.tenant_id,
            action,
            ip,
            user_agent: req.headers.get('user-agent'),
            metadata: extra,
          })
        } catch (err) {
          console.error('audit write failed', { action, err: String(err) })
        }
      }

      const ctx: AuthContext<z.infer<TSchema>> = {
        body,
        user: { id: user.id, email: user.email ?? null },
        tenantId: membership.tenant_id,
        role,
        db,
        admin: adminClient,
        req,
        ip,
        audit,
      }

      const result = await handler(ctx)

      if (options.auditAction) {
        await audit(options.auditAction)
      }

      return json(result ?? { success: true }, 200, cors)
    } catch (err) {
      // Log the detail, return a generic message. The previous code returned
      // `err.message` straight to the client, which leaked Postgres error
      // text — including constraint and column names — to anyone who could
      // trigger a failure.
      // PostgREST rejections are plain objects, not Errors, so String(err)
      // renders them as "[object Object]" and throws away the message, hint
      // and constraint name — exactly the fields needed to diagnose a failure.
      const detail = err instanceof Error
        ? err.message
        : (() => { try { return JSON.stringify(err) } catch { return String(err) } })()
      console.error('unhandled error', { fn: req.url, detail })
      return json({ error: 'Request failed' }, 400, cors)
    }
  }
}
