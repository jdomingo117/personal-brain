import { withAuth } from '../_shared/withAuth.ts'
import { BudgetCommand, budgetFailure } from '../_shared/budgetApi.ts'

Deno.serve(withAuth({schema:BudgetCommand,requireRole:'owner',maxBodyBytes:262144,
  rateLimit:{limit:10,windowSec:60,onError:'closed'}},async ctx => {
  const {request_id,...command}=ctx.body
  // SQL resolves duplicate receipts before inspecting mutable drafts, then validates the stored
  // ready setup in the same transaction. A pre-read here would introduce a receipt/draft race.
  const {data,error}=await ctx.admin().rpc('budget_command',{
    p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_request:request_id,p_input:command,
    p_enabled:Deno.env.get('BUDGET_V1_ENABLED')==='true',
  })
  if(error)budgetFailure(error)
  // The SQL operation is the authoritative audit and commit receipt; transport audit is additive.
  await ctx.audit('budget.command_committed',{target_type:'budget_operation',target_id:data.operation_id,action:command.action})
  return data
}))
