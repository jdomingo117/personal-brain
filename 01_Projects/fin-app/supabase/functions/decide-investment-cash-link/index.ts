import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'

const Payload = z.object({
  link_id: z.string().uuid(),
  verdict: z.enum(['confirmed', 'rejected']),
  note: z.string().max(500).optional(),
})

Deno.serve(withAuth({ schema: Payload, rateLimit: LIMITS.writePerUser }, async (ctx) => {
  const { data: visibleLink, error: visibleError } = await ctx.db
    .from('investment_cash_links').select('id').eq('id', ctx.body.link_id).maybeSingle()
  if (visibleError) throw visibleError
  if (!visibleLink) throw new Error('Investment cash link not found')

  const { data: decisionId, error } = await ctx.admin().rpc('decide_investment_cash_link', {
    p_tenant_id: ctx.tenantId,
    p_link_id: ctx.body.link_id,
    p_verdict: ctx.body.verdict,
    p_decided_by: ctx.user.id,
    p_note: ctx.body.note ?? null,
  })
  if (error) throw error

  await ctx.audit('investment.cash_link_decided', {
    link_id: ctx.body.link_id,
    verdict: ctx.body.verdict,
    decision_id: decisionId,
  })
  return { decision_id: decisionId }
}))
