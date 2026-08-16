import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { SafeHttpError, withAuth } from '../_shared/withAuth.ts'

const Payload = z.object({ action: z.literal('delete'), rule_id: z.string().uuid() })
Deno.serve(withAuth({ schema: Payload, requireRole: 'member' }, async (ctx) => {
  const { data: rule, error: readError } = await ctx.db.from('merchant_rules').select('id,merchant_key,source').eq('id', ctx.body.rule_id).maybeSingle()
  if (readError) throw readError
  if (!rule || rule.source !== 'user') throw new SafeHttpError(404, { error: 'User merchant rule not found' })
  const { data, error } = await ctx.admin().rpc('delete_user_merchant_rule', { p_tenant: ctx.tenantId, p_rule: rule.id })
  if (error) throw error
  await ctx.audit('merchant_rule.deleted', { target_type: 'merchant_rule', target_id: rule.id, merchant_key: rule.merchant_key })
  return data
}))
