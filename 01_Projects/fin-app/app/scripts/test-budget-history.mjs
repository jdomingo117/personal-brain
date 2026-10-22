import assert from 'node:assert/strict'
import {performance} from 'node:perf_hooks'
import {writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'

// SQL entity aggregates without ORDER BY have no presentation-order contract.
// Compare every field by stable identity; retain ordered period/occurrence lists.
function canonical(value,key=''){
 if(Array.isArray(value)){
  const rows=value.map(v=>canonical(v))
  if(['items','claims','limits'].includes(key)&&rows.every(v=>v&&typeof v==='object'&&(v.id||v.line_id)))rows.sort((a,b)=>String(a.id??a.line_id).localeCompare(String(b.id??b.line_id)))
  return rows
 }
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k],k)]))
 return value
}
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')

export async function verifyBudgetHistory({user:u,plan,period,first,everyday,goal,limit,account,measurements,sql,quote,check,edge,source,newUser,commandSQL}){
 const version=()=>sql(`SELECT version FROM public.budget_plans WHERE id=${quote(plan)};`)
 const args=()=>`${quote(u.tenant)},${quote(u.id)},${quote(plan)},${quote(period)},${source(u.tenant)},${version()}`
 const status=()=>JSON.parse(sql(`SELECT public.budget_history_status(${args()});`))
 const step=()=>JSON.parse(sql(`SELECT public.budget_prepare_history(${args()});`))
 const initial=await edge(u,'query-budget',{action:'workspace'})
 check('long workspace returns count-only progress, not partial money',[initial.status,initial.body.state,Object.keys(initial.body).sort()],[200,'preparing',['preparation','state','tenant_id']])
 const versions=[source(u.tenant),version()],p=step()
 check('bounded preparation checkpoints complete periods only',p.completed>0&&p.completed<=8&&p.completed<p.total)
 const resume={action:'prepare_history',plan_id:plan,period_id:period,expected_source:source(u.tenant),expected_plan:version()}
 const resumed=await edge(u,'query-budget',resume)
 check('real authenticated continuation resumes committed work',resumed.body.preparation.completed>p.completed)
 check('preparation leaves financial and source versions unchanged',[source(u.tenant),version()],versions)
 const beforeFailure=status().completed
 sql(`CREATE FUNCTION public.isolated_history_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated_history_failure';END $$;CREATE TRIGGER isolated_history_failure BEFORE INSERT OR UPDATE ON public.budget_history_facts FOR EACH ROW EXECUTE FUNCTION public.isolated_history_failure();`)
 assert.throws(step,/isolated_history_failure/)
 sql('DROP TRIGGER isolated_history_failure ON public.budget_history_facts;DROP FUNCTION public.isolated_history_failure();')
 check('failed batch preserves previously committed checkpoints',status().completed,beforeFailure)
 const times=[]
 while(!status().ready){const t=performance.now();step();times.push(Math.round(performance.now()-t))}
 check('all periods are prepared without truncation',status().completed,measurements.periods)
 let t=performance.now(),ready=await edge(u,'query-budget',{action:'workspace'})
 measurements.warm_edge_ms=Math.round(performance.now()-t);measurements.batch_ms=times
 check('prepared real workspace loads a complete canonical chain',ready.status,200)
 check('complete prepared goal and signed category carry reconcile',[ready.body.details.items.find(i=>i.line_id===goal).reserve_cents,ready.body.details.items.find(i=>i.line_id===everyday).remaining_cents],[50000+measurements.periods*10000,measurements.periods*(100000-measurements.transactions/measurements.periods*100)])
 const {recurring_evidence,recurring_unavailable,...preparedDetails}=ready.body.details
 let reference
 if(measurements.complete.complete){try{reference=JSON.parse(sql(`SET statement_timeout='8s';SELECT public.budget_workspace_details_uncached(${args()});`).split('\n').at(-1))}catch(error){if(!/statement timeout/.test(String(error)))throw error;measurements.reference_timeout=true}}
 if(reference)check('prepared entity facts match every field of the uncached reference',digest(preparedDetails),digest(reference))
 else check('prepared base period matches every field of the uncached kernel',digest(JSON.parse(sql(`SELECT details FROM public.budget_history_facts WHERE period_id=${quote(period)} AND actor_id=${quote(u.id)};`))),digest(JSON.parse(sql(`SELECT public.budget_details_m4_uncached(${args()});`))))
 const ownerDetails=ready.body.details
 const foreign=await newUser()
 check('foreign owner cannot prepare another tenant history',(await edge(foreign,'query-budget',resume)).status,409)
 const viewer=await newUser();sql(`INSERT INTO public.tenant_members(tenant_id,user_id,role,joined_at) VALUES(${quote(u.tenant)},${quote(viewer.id)},'viewer','2000-01-01');`)
 const viewerStatus=JSON.parse(sql(`SELECT public.budget_history_status(${quote(u.tenant)},${quote(viewer.id)},${quote(plan)},${quote(period)},${source(u.tenant)},${version()});`))
 check('actor-specific checkpoints cannot leak owner Undo to a viewer',viewerStatus.completed,0)
 sql(`UPDATE public.transactions SET amount=-200 WHERE id=(SELECT id FROM public.transactions WHERE tenant_id=${quote(u.tenant)} ORDER BY date,id LIMIT 1);`)
 check('old continuation rejects a late historical source correction',(await edge(u,'query-budget',resume)).status,409)
 check('new source generation does not reuse old checkpoints',status().completed,0)
 while(!status().ready)step()
 ready=await edge(u,'query-budget',{action:'workspace'})
 check('late correction recomputes exact carry without changing prior cached authority',[ready.body.details.items.find(i=>i.line_id===everyday).remaining_cents,ownerDetails.items.find(i=>i.line_id===everyday).remaining_cents],[measurements.periods*(100000-measurements.transactions/measurements.periods*100)-100,measurements.periods*(100000-measurements.transactions/measurements.periods*100)])
 check('one slot per actor/period bounds obsolete generations',Number(sql(`SELECT count(*) FROM public.budget_history_facts WHERE actor_id=${quote(u.id)} AND plan_id=${quote(plan)};`)),measurements.periods)
 sql(`UPDATE public.budget_history_facts SET prepared_at=now()-interval '25 hours' WHERE actor_id=${quote(u.id)} AND period_id=${quote(first)};`)
 check('expired checkpoint forces reconstruction rather than claiming freshness',status().completed,measurements.periods-1)
 step()
 check('expired checkpoint can be reconstructed',status().ready,true)
 const oldPlan=version(),beforePlanResume={...resume,expected_source:source(u.tenant),expected_plan:oldPlan}
 const {randomUUID}=await import('node:crypto')
 sql(commandSQL(u,randomUUID(),{action:'move_allocation',plan_id:plan,period_id:period,expected_source:source(u.tenant),expected_plan:oldPlan,from_line_id:goal,to_line_id:everyday,amount_cents:100}))
 check('a real financial write cannot retain old-version checkpoint authority',Number(sql(`SELECT count(*) FROM public.budget_history_facts WHERE actor_id=${quote(u.id)} AND plan_id=${quote(plan)} AND plan_version=${oldPlan};`)),0)
 check('old plan continuation cannot rebase itself',(await edge(u,'query-budget',beforePlanResume)).status,409)
 const scope={expected_method:'budget-foundation-v1',plan_id:plan,period_id:period,expected_source:source(u.tenant),expected_plan:version(),scope:'future',activity_account_ids:[account],destination_account_ids:[]}
 measurements.scope_prepare_ms=[]
 for(let n=1;n<=2;n++){
  const started=performance.now(),progress=JSON.parse(sql(`SET statement_timeout='8s';SELECT public.budget_begin_impact(${quote(u.tenant)},${quote(u.id)},'account_scope',${quote(JSON.stringify(scope))}::jsonb);`).split('\n').at(-1))
  measurements.scope_prepare_ms.push(Math.round(performance.now()-started))
  check(`long-history complete impact checkpoint ${n} exposes counts only`,[progress.state,progress.completed,progress.total,Object.keys(progress).sort()],['preparing_impact',n,2,['completed','period_id','plan_id','plan_version','source_revision','state','total']])
 }
 t=performance.now()
 let preview
 try{preview=JSON.parse(sql(`SET statement_timeout='8s';SELECT public.budget_preview_account_scope(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(scope))}::jsonb);`).split('\n').at(-1));measurements.scope_preview={ms:Math.round(performance.now()-t),complete:true}}
 catch(error){if(!/statement timeout/.test(String(error)))throw error;measurements.scope_preview={ms:Math.round(performance.now()-t),complete:false,timeout:true}}
 check('complete long-history impact preview fits the unchanged SQL bound',measurements.scope_preview.complete,true)
 check('impact includes every saved period and the hypothetical next one',[preview.before.length,preview.after.length],[measurements.periods+1,measurements.periods+1])
 const input={...scope,action:'set_account_scope',preview_hash:preview.preview_hash,accept_impact:true,accept_incomplete:true},key=randomUUID()
 t=performance.now()
 const receipt=JSON.parse(sql(`SET statement_timeout='8s';${commandSQL(u,key,input)}`).split('\n').at(-1))
 measurements.scope_commit_ms=Math.round(performance.now()-t)
 check('large-history accepted policy commits one exact financial version',version(),String(BigInt(scope.expected_plan)+1n))
 check('large-history same-key replay survives disabled writes',JSON.parse(sql(commandSQL(u,key,input,false))),receipt)
 t=performance.now()
 sql(`SET statement_timeout='8s';${commandSQL(u,randomUUID(),{action:'undo',plan_id:plan,period_id:period,expected_source:source(u.tenant),expected_plan:version(),operation_id:receipt.operation_id})}`)
 measurements.scope_undo_ms=Math.round(performance.now()-t)
 check('large-history guarded Undo appends compensation',version(),String(BigInt(scope.expected_plan)+2n))
 console.log('History prepared measurements:',JSON.stringify(measurements))
 writeFileSync(`/tmp/halcyon-budget-history-${measurements.periods}.json`,JSON.stringify(measurements,null,2))
}
