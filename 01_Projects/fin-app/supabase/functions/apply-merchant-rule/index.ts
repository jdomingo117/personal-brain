import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { ALL_CATEGORIES, FULL_TAXONOMY, UNCATEGORIZED } from '../_shared/taxonomy.ts'
import { normalizeMerchant } from '../_shared/normalizeMerchant.ts'

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
  action: z.enum(['preview', 'apply']).default('apply'),
  merchantKey: z.string().min(1).max(200),
  merchantDisplay: z.string().min(1).max(200),
  category: z.string().max(100),
  subcategory: z.string().max(100).nullable().optional(),
  applyToExisting: z.boolean().default(true),
})

Deno.serve(
  withAuth({ schema: RuleSchema, requireRole: 'member' }, async (ctx) => {
    const { action, merchantKey, merchantDisplay, category, subcategory, applyToExisting } = ctx.body
    if (normalizeMerchant(merchantDisplay).key !== merchantKey) {
      throw new Error('Merchant identity does not match its display name.')
    }

    // Validate against the taxonomy here too. The UI only offers valid values,
    // but the UI is not the security boundary — a hand-rolled request must not
    // be able to introduce an 8th category and break the chart palette.
    const matchedCat = [...ALL_CATEGORIES, UNCATEGORIZED]
      .find((c) => c.toLowerCase() === category.trim().toLowerCase())
    if (!matchedCat) {
      throw new Error(`Unknown category: ${category}`)
    }
    const validSubs = FULL_TAXONOMY[matchedCat] ?? []
    let matchedSub = subcategory
      ? validSubs.find((s) => s.toLowerCase() === subcategory.trim().toLowerCase()) ?? null
      : null
    if (subcategory && !matchedSub) {
      const { data: categoryRow } = await ctx.db.from('taxonomy_categories').select('id').eq('display_name', matchedCat).maybeSingle()
      const { data: custom } = categoryRow ? await ctx.db.from('tenant_subcategories').select('display_name').eq('category_id', categoryRow.id).eq('active', true).ilike('display_name', subcategory.trim()).maybeSingle() : { data: null }
      matchedSub = custom?.display_name ?? null
      if (!matchedSub) throw new Error('Subcategory does not belong to this category')
    }

    if (matchedCat === 'Transfer' && matchedSub === 'Reconciliation') {
      throw new Error('Reconciliation is reserved for system entries.')
    }

    if (action === 'preview') {
      const { data: impact, error: impactError } = await ctx.admin().rpc('preview_user_merchant_rule', {
        p_tenant_id: ctx.tenantId,
        p_merchant_key: merchantKey,
        p_category: matchedCat,
        p_subcategory: matchedSub,
      })
      if (impactError) throw impactError
      return {
        merchant_key: merchantKey,
        existing_matches: Number(impact.existing_matches),
        transactions_to_update: Number(impact.transactions_to_update),
        category: matchedCat,
        subcategory: matchedSub,
      }
    }

    const { data, error } = await ctx.admin().rpc('apply_user_merchant_rule', {
      p_tenant_id: ctx.tenantId,
      p_merchant_key: merchantKey,
      p_merchant_display: merchantDisplay,
      p_actor_id: ctx.user.id,
      p_category: matchedCat,
      p_subcategory: matchedSub,
      p_apply_to_existing: applyToExisting,
    })
    if (error) throw error

    await ctx.audit('merchant_rule.applied', {
      merchant_key: merchantKey,
      category: matchedCat,
      subcategory: matchedSub,
      transactions_updated: data.updated,
      existing_matches: data.existing_matches,
      operation_id: data.operation_id,
      scope: 'merchant_rule',
    })

    return { success: true, ...data }
  }),
)
