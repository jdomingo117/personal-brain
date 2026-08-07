import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { ALL_CATEGORIES, FULL_TAXONOMY, UNCATEGORIZED } from '../_shared/taxonomy.ts'

/**
 * Records a user's categorisation as a permanent rule.
 *
 * This is the feedback loop that makes the system improve and get cheaper:
 * a `source='user'` rule outranks any AI answer for that merchant forever, so
 * a correction sticks instead of being silently reverted by the next import.
 * Without it the user would re-fix the same merchant every month and stop
 * trusting the categories.
 *
 * `applyToExisting` back-fills transactions already in the ledger, which is
 * what "apply to all from this merchant" means to a user.
 */

const RuleSchema = z.object({
  merchantKey: z.string().min(1).max(200),
  merchantDisplay: z.string().min(1).max(200),
  category: z.string().max(100),
  subcategory: z.string().max(100).nullable().optional(),
  applyToExisting: z.boolean().default(true),
})

Deno.serve(
  withAuth({ schema: RuleSchema, requireRole: 'member' }, async (ctx) => {
    const { merchantKey, merchantDisplay, category, subcategory, applyToExisting } = ctx.body

    // Validate against the taxonomy here too. The UI only offers valid values,
    // but the UI is not the security boundary — a hand-rolled request must not
    // be able to introduce an 8th category and break the chart palette.
    const matchedCat = [...ALL_CATEGORIES, UNCATEGORIZED]
      .find((c) => c.toLowerCase() === category.trim().toLowerCase())
    if (!matchedCat) {
      throw new Error(`Unknown category: ${category}`)
    }
    const validSubs = FULL_TAXONOMY[matchedCat] ?? []
    const matchedSub = subcategory
      ? validSubs.find((s) => s.toLowerCase() === subcategory.trim().toLowerCase()) ?? null
      : null

    // Upsert WITHOUT ignoreDuplicates: a user correction is meant to replace
    // whatever the AI previously cached for this merchant.
    const { error: ruleErr } = await ctx.db
      .from('merchant_rules')
      .upsert({
        tenant_id: ctx.tenantId,
        merchant_key: merchantKey,
        merchant_display: merchantDisplay,
        category: matchedCat,
        subcategory: matchedSub,
        source: 'user',
        confidence: 1,
      }, { onConflict: 'tenant_id,merchant_key' })
    if (ruleErr) throw ruleErr

    let updated = 0
    if (applyToExisting) {
      const { data, error } = await ctx.db.rpc('apply_merchant_rule', {
        p_tenant_id: ctx.tenantId,
        p_merchant_key: merchantDisplay,
        p_category: matchedCat,
        p_subcategory: matchedSub,
      })
      if (error) throw error
      updated = Number(data ?? 0)
    }

    await ctx.audit('merchant_rule.applied', {
      merchant_key: merchantKey,
      category: matchedCat,
      subcategory: matchedSub,
      transactions_updated: updated,
    })

    return { success: true, category: matchedCat, subcategory: matchedSub, updated }
  }),
)
