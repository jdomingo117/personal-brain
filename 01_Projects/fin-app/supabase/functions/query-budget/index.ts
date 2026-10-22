import { withAuth, SafeHttpError } from '../_shared/withAuth.ts'
import { BudgetQuery,budgetFailure } from '../_shared/budgetApi.ts'
import { budgetRecurring } from '../_shared/budgetRecurring.ts'

Deno.serve(withAuth({schema:BudgetQuery,requireRole:'viewer',maxBodyBytes:262144,
  rateLimit:{limit:30,windowSec:60,onError:'closed'}},async ctx => {
  const workspace = ctx.body.action === 'workspace'
  if(ctx.body.action==='assisted_setup'){
    const {data,error}=await ctx.admin().rpc('budget_assisted_setup',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_input:ctx.body})
    if(error){
      if(['57014','55P03'].includes(error.code))throw new SafeHttpError(503,{code:'assistance_unavailable',message:'The complete history check could not finish. Your manual setup is still available; try assistance again later.',retryable:true})
      budgetFailure(error)
    }
    return data
  }
  if(ctx.body.action==='prepare_history'){
    const {data,error}=await ctx.admin().rpc('budget_prepare_history',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_plan:ctx.body.plan_id,p_period:ctx.body.period_id,p_source:ctx.body.expected_source,p_version:ctx.body.expected_plan})
    if(error){
      if(['57014','55P03'].includes(error.code))throw new SafeHttpError(503,{code:'history_batch_unavailable',message:'This history batch could not finish. Completed batches are still saved. Try continuing again.',retryable:true})
      budgetFailure(error)
    }
    return {state:'preparing',tenant_id:ctx.tenantId,preparation:data}
  }
  if(ctx.body.action==='preview_control'){
    const {data,error}=await ctx.admin().rpc('budget_begin_impact',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_kind:'control',p_input:ctx.body})
    if(error)budgetFailure(error)
    return data
  }
  if(ctx.body.action==='preview_rollover'){
    const {data,error}=await ctx.admin().rpc('budget_begin_impact',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_kind:'rollover',p_input:ctx.body})
    if(error)budgetFailure(error)
    return data
  }
  if(ctx.body.action==='preview_account_scope'){
    const {data,error}=await ctx.admin().rpc('budget_begin_impact',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_kind:'account_scope',p_input:ctx.body})
    if(error)budgetFailure(error)
    return data
  }
  if(ctx.body.action==='sources'){
    const {data,error}=await ctx.admin().rpc('budget_sources_page',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_input:ctx.body})
    if(error)budgetFailure(error)
    return data
  }
  const {data,error}=await ctx.admin().rpc('budget_query',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_input:workspace?{action:'snapshot',...('period_id' in ctx.body?{period_id:ctx.body.period_id}:{})}:ctx.body})
  if(error)budgetFailure(error)
  if(workspace) {
    // RLS reads only. Never send account balances, credentials or raw ledger rows to setup.
    // A source change between these reads and a command is rejected by the SQL source gate.
    const accounts=await ctx.db.from('accounts').select('id,name,currency').eq('tenant_id',ctx.tenantId).order('id').limit(501)
    if(accounts.error)budgetFailure(accounts.error)
    if((accounts.data?.length??0)>500)throw new SafeHttpError(422,{code:'account_scope_limit',message:'This private Budget version supports up to 500 accounts.',retryable:false})
    const scope=data.plan?await ctx.db.from('budget_account_memberships').select('original_account_id,account_id,role,start_date,end_date').eq('tenant_id',ctx.tenantId).eq('plan_id',data.plan.id).order('id').limit(501):{data:[],error:null}
    if(scope.error)budgetFailure(scope.error)
    if((scope.data?.length??0)>500)throw new SafeHttpError(422,{code:'account_scope_limit',message:'This budget has more account history than this private version supports.',retryable:false})
    let details=null
    if(data.plan){
      const read=await ctx.admin().rpc('budget_workspace_details',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_plan:data.plan.id,p_period:data.period.id,p_source:data.source_revision,p_version:data.plan.version})
      if(read.error){
        if(read.error.message?.includes('budget_history_required')){
          const progress=await ctx.admin().rpc('budget_history_status',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_plan:data.plan.id,p_period:data.period.id,p_source:data.source_revision,p_version:data.plan.version})
          if(progress.error)budgetFailure(progress.error)
          // No partial financial snapshot accompanies preparation progress.
          return {state:'preparing',tenant_id:ctx.tenantId,preparation:progress.data}
        }
        budgetFailure(read.error)
      }
      details=read.data
      const evidence=await ctx.admin().rpc('budget_recurring_evidence',{p_tenant:ctx.tenantId,p_actor:ctx.user.id,p_plan:data.plan.id,p_source:data.source_revision,p_version:data.plan.version})
      // A bounded detector timeout must not gate the manual Budget workspace.
      // Version/tenant errors still fail the refresh rather than mix snapshots.
      if(evidence.error){
        if(['57014','55P03'].includes(evidence.error.code))details={...details,recurring_unavailable:true}
        else budgetFailure(evidence.error)
      }else details={...details,recurring_evidence:budgetRecurring(evidence.data)}
    }
    return {...data,...(details?.lifecycle?.chain_valid===false?{scope_valid:false,state:'unavailable'}:{}),details,tenant_id:ctx.tenantId,accounts:accounts.data,account_scope:scope.data,write_enabled:Deno.env.get('BUDGET_V1_ENABLED')==='true'}
  }
  return data
}))
