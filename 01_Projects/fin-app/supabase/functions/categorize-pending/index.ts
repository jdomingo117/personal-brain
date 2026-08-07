import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'
import { normalizeMerchant } from '../_shared/normalizeMerchant.ts'
import { resolveMerchantCategories, type MerchantInput } from '../_shared/categorize.ts'
import { UNCATEGORIZED } from '../_shared/taxonomy.ts'

const PendingSchema = z.object({}).optional()

/**
 * Categorises transactions that are ALREADY in the ledger and have never been
 * through the AI tier — `category_source IS NULL`.
 *
 * This exists because provider-synced rows had no categorisation path at all.
 * sync-provider deliberately does not call Gemini (Law 5: never on the main
 * request path), and `upCategoryMap` only covers what Up's own category ids
 * label — everything else landed as Uncategorized with nothing to pick it up.
 * `upCategoryMap`'s docblock has always described rows falling through to
 * "the out-of-band categorize-merchants batch"; this IS that batch, which had
 * never actually been built.
 *
 * Out-of-band by construction: its own endpoint, called after a sync
 * completes or on demand, never inside sync-provider's or an import's
 * request path. Chunked with the same done/progress contract as
 * sync-provider, so the caller loops rather than pretending a 5000-row
 * backlog fits in one call.
 *
 * PAGE is deliberately well below PostgREST's `max_rows` (1000). The bound
 * that matters is not rows, it's Gemini calls: a cold-cache page of 1000 rows
 * can carry 250+ distinct merchants = 6–8 sequential Gemini calls, which
 * overruns the gateway's request timeout even though the work commits
 * server-side. Observed against a real 2000-row backlog. Smaller pages mean
 * more round trips but every one of them returns.
 */
const PAGE = 300
Deno.serve(
  withAuth({ schema: PendingSchema, rateLimit: LIMITS.categorizePerUser }, async (ctx) => {
    // RLS scopes this to the caller's tenant. Ordered by id purely so the
    // page boundary is deterministic across the caller's loop.
    const { data: rows, error: rowsErr } = await ctx.db
      .from('transactions')
      .select('id, original_description, merchant, amount')
      .eq('category', UNCATEGORIZED)
      .is('category_source', null)
      .order('id', { ascending: true })
      .limit(PAGE)
    if (rowsErr) throw rowsErr

    if (!rows || rows.length === 0) {
      return { done: true, progress: { rows_seen: 0, rows_categorized: 0, merchants_resolved: 0, gemini_calls: 0 } }
    }

    // ── Group rows by normalised merchant key ─────────────────────────
    // The key is recomputed from original_description rather than read off
    // the row: `transactions.merchant` stores the DISPLAY form, and the cache
    // in merchant_rules is keyed on the normalised key. Recomputing is what
    // keeps this consistent with how the row was written in the first place
    // (sync-provider and the CSV pipeline both call normalizeMerchant).
    interface Group {
      key: string
      display: string
      txnIds: string[]
      inflow: number
      outflow: number
      samples: string[]
    }
    const groups = new Map<string, Group>()

    for (const r of rows) {
      const { key, display } = normalizeMerchant(r.original_description)
      let g = groups.get(key)
      if (!g) {
        g = { key, display, txnIds: [], inflow: 0, outflow: 0, samples: [] }
        groups.set(key, g)
      }
      g.txnIds.push(r.id)
      if (r.amount >= 0) g.inflow++
      else g.outflow++
      if (g.samples.length < 3 && !g.samples.includes(r.original_description)) {
        g.samples.push(r.original_description)
      }
    }

    const merchants: MerchantInput[] = [...groups.values()].map((g) => ({
      key: g.key,
      display: g.display,
      sampleDescriptions: g.samples,
      // A merchant that appears in both directions (a P2P app, a refunding
      // retailer) gets its dominant one — the model uses this as a hint, not
      // a constraint, and per-row direction isn't available at merchant grain.
      direction: g.inflow > g.outflow ? ('inflow' as const) : ('outflow' as const),
    }))

    const { resolved, stats } = await resolveMerchantCategories(ctx.db, ctx.tenantId, merchants)

    // ── Write back to the rows themselves ─────────────────────────────
    const assignments: Array<Record<string, unknown>> = []
    for (const g of groups.values()) {
      const r = resolved.get(g.key)
      if (!r) continue
      for (const txnId of g.txnIds) {
        assignments.push({
          txn_id: txnId,
          category: r.category,
          subcategory: r.subcategory ?? '',
          // Stamped even when the answer came back Uncategorized: it records
          // that this row HAS been through the tier, so the next sweep skips
          // it instead of paying for the same unanswerable merchant forever.
          category_source: r.source,
          needs_review: r.needsReview || r.category === UNCATEGORIZED,
        })
      }
    }

    let categorized = 0
    const CHUNK = 500
    for (let i = 0; i < assignments.length; i += CHUNK) {
      const { data: updated, error: applyErr } = await ctx.db.rpc('apply_merchant_categories', {
        p_tenant_id: ctx.tenantId,
        p_assignments: assignments.slice(i, i + CHUNK),
      })
      if (applyErr) throw applyErr
      categorized += Number(updated ?? 0)
    }

    await ctx.audit('transactions.categorized_pending', {
      rows_seen: rows.length,
      rows_categorized: categorized,
      merchants_resolved: merchants.length,
      from_cache: stats.fromCache,
      from_ai: stats.fromAi,
      gemini_calls: stats.geminiCalls,
    })

    return {
      // A full page almost certainly means more rows are waiting. The caller
      // loops until done, same contract as sync-provider.
      done: rows.length < PAGE,
      progress: {
        rows_seen: rows.length,
        rows_categorized: categorized,
        merchants_resolved: merchants.length,
        gemini_calls: stats.geminiCalls,
      },
    }
  }),
)
