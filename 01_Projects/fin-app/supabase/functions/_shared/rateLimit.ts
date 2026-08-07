/**
 * Sliding-window rate limiter.
 *
 * Sliding rather than fixed window: a fixed window lets an attacker send the
 * full quota at 0:59 and the full quota again at 1:01, so a "10 per minute"
 * limit actually permits 20 requests in two seconds. The sliding log below
 * counts the trailing window on every call, so the limit holds at every
 * instant.
 *
 * Backends, in order of preference:
 *   1. Upstash Redis REST — shared across every edge isolate and region.
 *   2. In-isolate memory — a per-instance fallback so local development and
 *      a misconfigured deploy still limit *something*. It is explicitly not a
 *      substitute for Upstash: each isolate keeps its own counters, so the
 *      effective limit multiplies by the number of live isolates. For login
 *      specifically, the Postgres lockout layer (record_login_attempt) is the
 *      real protection and does not depend on this at all.
 */

const UPSTASH_URL = Deno.env.get('UPSTASH_REDIS_REST_URL')
const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')

export interface RateLimitRule {
  /** Requests permitted within the window. */
  limit: number
  /** Window length in seconds. */
  windowSec: number
  /**
   * What to do when the backing store is unreachable.
   * 'closed' — reject the request (use for anything auth-related: an
   *            unavailable limiter must not become an open door).
   * 'open'   — allow it (use for read paths where availability wins).
   */
  onError?: 'open' | 'closed'
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the caller may retry. */
  retryAfter: number
}

// ── Backend 1: Upstash ──────────────────────────────────────────────────

async function upstashPipeline(commands: unknown[][]): Promise<unknown[]> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(2000),
  })
  if (!res.ok) throw new Error(`upstash ${res.status}`)
  const body = await res.json() as Array<{ result?: unknown; error?: string }>
  const failed = body.find((r) => r.error)
  if (failed) throw new Error(`upstash: ${failed.error}`)
  return body.map((r) => r.result)
}

async function upstashSlidingWindow(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = rule.windowSec * 1000
  const cutoff = now - windowMs
  // A unique member per request; without the random suffix two requests in
  // the same millisecond would collapse into one sorted-set entry and the
  // second would go uncounted.
  const member = `${now}-${crypto.randomUUID()}`

  const results = await upstashPipeline([
    ['ZREMRANGEBYSCORE', key, '0', String(cutoff)],
    ['ZADD', key, String(now), member],
    ['ZCOUNT', key, String(cutoff), '+inf'],
    ['PEXPIRE', key, String(windowMs)],
    ['ZRANGE', key, '0', '0', 'WITHSCORES'],
  ])

  const count = Number(results[2] ?? 0)
  const oldest = Array.isArray(results[4]) && results[4].length > 1
    ? Number((results[4] as string[])[1])
    : now

  if (count > rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    }
  }
  return { allowed: true, remaining: Math.max(0, rule.limit - count), retryAfter: 0 }
}

// ── Backend 2: per-isolate memory ───────────────────────────────────────

const memory = new Map<string, number[]>()

function memorySlidingWindow(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now()
  const windowMs = rule.windowSec * 1000
  const hits = (memory.get(key) ?? []).filter((t) => t > now - windowMs)
  hits.push(now)
  memory.set(key, hits)

  // Opportunistic sweep so a long-lived isolate does not accumulate keys.
  if (memory.size > 10_000) {
    for (const [k, v] of memory) {
      if (v.every((t) => t <= now - windowMs)) memory.delete(k)
    }
  }

  if (hits.length > rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)),
    }
  }
  return { allowed: true, remaining: rule.limit - hits.length, retryAfter: 0 }
}

// ── Public API ──────────────────────────────────────────────────────────

export const usingUpstash = Boolean(UPSTASH_URL && UPSTASH_TOKEN)

export async function rateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const namespaced = `rl:${key}`
  if (usingUpstash) {
    try {
      return await upstashSlidingWindow(namespaced, rule)
    } catch (err) {
      console.error('rate limiter unavailable', { key, err: String(err) })
      if ((rule.onError ?? 'closed') === 'closed') {
        return { allowed: false, remaining: 0, retryAfter: rule.windowSec }
      }
      return { allowed: true, remaining: 0, retryAfter: 0 }
    }
  }
  return memorySlidingWindow(namespaced, rule)
}

/**
 * Applies several rules at once (e.g. per-IP and per-account) and returns the
 * first refusal. Evaluated sequentially so that a request already refused by
 * a cheap check does not spend a round trip on the rest.
 */
export async function rateLimitAll(
  checks: Array<{ key: string; rule: RateLimitRule }>,
): Promise<RateLimitResult> {
  for (const { key, rule } of checks) {
    const result = await rateLimit(key, rule)
    if (!result.allowed) return result
  }
  return { allowed: true, remaining: 0, retryAfter: 0 }
}

/** Named limits, kept in one place so they can be reviewed as a set. */
export const LIMITS: Record<string, RateLimitRule> = {
  loginPerIp: { limit: 10, windowSec: 300, onError: 'closed' },
  loginPerAccount: { limit: 5, windowSec: 900, onError: 'closed' },
  signupPerIp: { limit: 3, windowSec: 3600, onError: 'closed' },
  magicLinkPerAccount: { limit: 3, windowSec: 900, onError: 'closed' },
  resetPerAccount: { limit: 3, windowSec: 3600, onError: 'closed' },
  refreshPerUser: { limit: 60, windowSec: 3600, onError: 'closed' },
  // Writes: generous, but enough to stop a runaway client or a scripted flood.
  writePerUser: { limit: 120, windowSec: 60, onError: 'open' },
  // analyze-csv bills a Gemini call per request, so this is cost control as
  // much as abuse control.
  analyzePerUser: { limit: 20, windowSec: 3600, onError: 'closed' },
  // categorize-merchants batches ~50 merchants per Gemini call, so one large
  // import is only a handful of requests. The cap is higher than analyze's
  // because a first-time import of several accounts legitimately needs more,
  // while the merchant_rules cache means repeat imports cost nothing.
  categorizePerUser: { limit: 60, windowSec: 3600, onError: 'closed' },
  // Each attempt spends a live Up /util/ping check and, on success, writes a
  // credential. Tight: a user connects once, and a loose limit here would
  // turn the endpoint into a token-validity oracle for anyone holding a
  // stolen session.
  providerConnectPerUser: { limit: 5, windowSec: 3600, onError: 'closed' },
  // Sync is chunked and client-driven (no cron yet), so a legitimate backfill
  // is dozens of calls in a few minutes — generous enough for that.
  // onError: 'closed', unlike writePerUser's 'open', because the resource
  // being protected here is a THIRD PARTY's undisclosed rate limit: if our
  // own limiter is down, hammering Up risks the token being throttled for
  // reasons we cannot see or recover from.
  providerSyncPerUser: { limit: 90, windowSec: 600, onError: 'closed' },
  // detect-recurrence-hints batches ~50 merchants per Gemini call, same shape
  // as categorizePerUser — mirrors its limit for the same reason (a first
  // sync/import legitimately needs several passes, repeat runs cost nothing
  // once a merchant is cached).
  recurrenceHintsPerUser: { limit: 60, windowSec: 3600, onError: 'closed' },
}
