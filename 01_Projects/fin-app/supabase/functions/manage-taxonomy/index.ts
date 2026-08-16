import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const Payload = z.object({ action: z.literal('create_subcategory'), category: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(48) })
Deno.serve(withAuth({ schema: Payload, requireRole: 'member' }, async (ctx) => {
  const { data, error } = await ctx.admin().rpc('create_tenant_subcategory', { p_tenant: ctx.tenantId, p_actor: ctx.user.id, p_category: ctx.body.category, p_name: ctx.body.name })
  if (error) throw error
  await ctx.audit('taxonomy.subcategory_created', { target_type: 'tenant_subcategory', target_id: data.id, category: ctx.body.category, display_name: data.display_name })
  return data
}))
