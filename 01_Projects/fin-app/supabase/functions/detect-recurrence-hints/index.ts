import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'
import { normalizeMerchant } from '../_shared/normalizeMerchant.ts'
import { resolveRecurrenceHints, type HintMerchantInput } from '../_shared/recurrenceHints.ts'

const PendingSchema = z.object({
  // Keyset cursor, not an offset: unlike categorize-pending, this function
  // never mutates the transactions it reads (the resolution lives in the
  // separate merchant_recurrence_hints cache, keyed by merchant not by
  // transaction), so a query with no cursor would return the identical page
  // on every call and the caller's poll loop would never converge. The
  // client threads `next_after_id` from one response into the next call's
  // `after_id`.
  after_id: z.string().uuid().optional(),
}).optional()

/**
 * Recurring Hub Phase 2: classifies merchants that have only 1-2 charges so
 * far — too few for the deterministic detector (`MIN_OBSERVATIONS = 3` in
 * app/src/lib/recurring.ts) to call a pattern, but a merchant NAME can still
 * suggest a subscription archetype (Netflix, an insurer, a gym) well before
 * the third charge lands. Results cache in merchant_recurrence_hints and
 * surface client-side as Recurring.candidates — deliberately never merged
 * into the confirmed series/active/dormant arrays.
 *
 * Out-of-band by construction, same as categorize-pending: its own endpoint,
 * called after a sync/import/history-extend completes, never inside another
 * function's request path (Law 5).
 *
 * PAGE mirrors categorize-pending's reasoning: bounded by Gemini-call cost,
 * not row count, so a cold-cache page doesn't overrun the gateway timeout.
 */
const PAGE = 300
Deno.serve(
  withAuth({ schema: PendingSchema, rateLimit: LIMITS.recurrenceHintsPerUser }, async (ctx) => {
    const boundsFrom = new Date()
    boundsFrom.setDate(boundsFrom.getDate() - 364)
    const boundsFromIso = boundsFrom.toISOString().slice(0, 10)
    const afterId = ctx.body?.after_id

    // RLS scopes this to the caller's tenant. Expense rows only, same
    // discipline as buildRecurring() client-side: a transfer or a still-HELD
    // charge is not a candidate commitment.
    let query = ctx.db
      .from('transactions')
      .select('id, original_description, merchant, category, subcategory, amount, date, transfer_candidate, pending, kind')
      .eq('pending', false)
      .eq('kind', 'expense')
      .lt('amount', 0)
      .gte('date', boundsFromIso)
    if (afterId) query = query.gt('id', afterId)
    const { data: rows, error: rowsErr } = await query.order('id', { ascending: true }).limit(PAGE)
    if (rowsErr) throw rowsErr

    if (!rows || rows.length === 0) {
      return { done: true, next_after_id: null, progress: { rows_seen: 0, merchants_checked: 0, candidates_cached: 0, gemini_calls: 0 } }
    }
    const lastId = rows[rows.length - 1].id

    // ── Group by normalised merchant key, same identity as merchant_rules ──
    interface Group {
      key: string
      display: string
      category: string
      subcategory: string | null
      count: number
      samples: string[]
    }
    const groups = new Map<string, Group>()

    for (const r of rows) {
      // A row flagged as a transfer candidate at ingest time is excluded the
      // same way buildRecurring() excludes is_transfer client-side — a
      // recurring internal sweep is not a spending commitment.
      if (r.transfer_candidate) continue
      const { key, display } = normalizeMerchant(r.original_description)
      let g = groups.get(key)
      if (!g) {
        g = { key, display, category: r.category, subcategory: r.subcategory, count: 0, samples: [] }
        groups.set(key, g)
      }
      g.count++
      if (g.samples.length < 3 && !g.samples.includes(r.original_description)) {
        g.samples.push(r.original_description)
      }
    }

    // Only merchants with 1-2 occurrences are candidates for a hint — 0 is
    // nothing to ask about, 3+ is already the deterministic detector's job
    // and asking Gemini about it would be pure waste.
    const thin = [...groups.values()].filter((g) => g.count >= 1 && g.count <= 2)

    if (thin.length === 0) {
      return {
        done: rows.length < PAGE,
        next_after_id: lastId,
        progress: { rows_seen: rows.length, merchants_checked: 0, candidates_cached: 0, gemini_calls: 0 },
      }
    }

    // ── Skip merchants already cached ───────────────────────────────────
    const KEY_CHUNK = 100
    const cachedKeys = new Set<string>()
    const allKeys = thin.map((g) => g.key)
    for (let i = 0; i < allKeys.length; i += KEY_CHUNK) {
      const { data: existing, error: existingErr } = await ctx.db
        .from('merchant_recurrence_hints')
        .select('merchant_key')
        .in('merchant_key', allKeys.slice(i, i + KEY_CHUNK))
      if (existingErr) throw existingErr
      for (const row of existing ?? []) cachedKeys.add(row.merchant_key)
    }

    const uncached = thin.filter((g) => !cachedKeys.has(g.key))

    if (uncached.length === 0) {
      return {
        done: rows.length < PAGE,
        next_after_id: lastId,
        progress: { rows_seen: rows.length, merchants_checked: thin.length, candidates_cached: 0, gemini_calls: 0 },
      }
    }

    const merchants: HintMerchantInput[] = uncached.map((g) => ({
      key: g.key,
      display: g.display,
      category: g.category,
      subcategory: g.subcategory,
      sampleDescriptions: g.samples,
    }))

    const { resolved, stats } = await resolveRecurrenceHints(ctx.db, ctx.tenantId, merchants)

    // Materialise the cross-cutting attribute for ledger filtering without
    // overwriting a user's explicit recurring/not-recurring correction.
    const trueKeys = [...resolved.values()].filter((hint) => hint.isRecurring).map((hint) => hint.key)
    const falseKeys = [...resolved.values()].filter((hint) => !hint.isRecurring).map((hint) => hint.key)
    for (const [keys, value] of [[trueKeys, true], [falseKeys, false]] as const) {
      if (keys.length === 0) continue
      const { error: attributeError } = await ctx.admin().from('transactions')
        .update({ is_recurring: value, recurring_source: 'derived' })
        .eq('tenant_id', ctx.tenantId).eq('recurring_source', 'derived').in('merchant_key', keys)
      if (attributeError) throw attributeError
    }

    await ctx.audit('recurrence_hints.detected', {
      rows_seen: rows.length,
      merchants_checked: thin.length,
      merchants_resolved: resolved.size,
      gemini_calls: stats.geminiCalls,
    })

    return {
      // A full page almost certainly means more rows are waiting. The caller
      // loops until done, same contract as categorize-pending.
      done: rows.length < PAGE,
      next_after_id: lastId,
      progress: {
        rows_seen: rows.length,
        merchants_checked: thin.length,
        candidates_cached: resolved.size,
        gemini_calls: stats.geminiCalls,
      },
    }
  }),
)
