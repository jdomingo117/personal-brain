import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const Payload = z.object({ ai_confidence_threshold: z.number().min(0.5).max(1), review_ai_missing_subcategory: z.boolean() })
Deno.serve(withAuth({ schema: Payload, requireRole: 'member' }, async (ctx) => {
  const { data, error } = await ctx.admin().rpc('set_classification_review_policy', { p_tenant: ctx.tenantId, p_actor: ctx.user.id, p_threshold: ctx.body.ai_confidence_threshold, p_missing: ctx.body.review_ai_missing_subcategory })
  if (error) throw error
  await ctx.audit('classification.policy_updated', { target_type: 'tenant', target_id: ctx.tenantId, ...data })
  return data
}))
