import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'
import { MerchantSchema, resolveMerchantCategories } from '../_shared/categorize.ts'

/**
 * Categorises MERCHANTS, not transactions — the decision that makes AI
 * categorisation affordable. A 3000-row bank export contains perhaps 200
 * distinct merchants; classifying per row would mean 3000 judgements and a
 * Gemini bill on every import, while classifying per normalised merchant
 * means 200 — and once cached in `merchant_rules`, the next import costs
 * nothing at all.
 *
 * This is the CSV path: the caller (CSVUploader) resolves merchants for rows
 * it has staged but not yet committed, and applies the answers itself. The
 * provider path is `categorize-pending`, which sweeps rows already in the
 * ledger. Both share `_shared/categorize.ts` so the same merchant can never
 * categorise differently depending on how it arrived.
 */

const BatchSchema = z.object({
  merchants: z.array(MerchantSchema).min(1).max(300),
})

Deno.serve(
  withAuth(
    { schema: BatchSchema, rateLimit: LIMITS.categorizePerUser, maxBodyBytes: 512 * 1024 },
    async (ctx) => {
      const { resolved, stats } = await resolveMerchantCategories(ctx.db, ctx.tenantId, ctx.body.merchants)

      await ctx.audit('merchants.categorized', {
        requested: stats.requested,
        from_cache: stats.fromCache,
        from_ai: stats.fromAi,
        gemini_calls: stats.geminiCalls,
      })

      return { assignments: [...resolved.values()], stats }
    },
  ),
)
