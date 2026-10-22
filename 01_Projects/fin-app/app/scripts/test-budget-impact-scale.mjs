import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {writeFileSync} from 'node:fs'

// Invoked only inside the fresh-project guarded provisioner. This extends the
// dense ten-year corpus with multiple accounts, lines, splits and linked claims.
export async function verifyBudgetImpactScale({user:u,plan,period,first,goal,everyday,account,measurements,sql,quote,check,edge,source,commandSQL}){
 const accounts=[]
 for(let n=0;n<2;n++)accounts.push(sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Mixed history fictional ${n}','Liquid',0,'AUD') RETURNING id;`).split('\n')[0])
 const start=sql(`SELECT start_date FROM public.budget_periods WHERE id=${quote(first)};`)
 for(const a of accounts)sql(`INSERT INTO public.budget_account_memberships(tenant_id,plan_id,account_id,original_account_id,role,start_date) VALUES(${quote(u.tenant)},${quote(plan)},${quote(a)},${quote(a)},'activity',${quote(start)});`)
 // Fictional passage-of-time construction, like the dense fixture: no
 // production clock override, personal data or shortcut in the command path.
 for(let n=0;n<10;n++){
  const line=randomUUID(),type=n%3===0?'bill':n%3===1?'reserve':'goal',kind=type==='bill'?'fixed':'reserve'
  const config={type,name:`Mixed fictional ${type} ${n}`,amount_cents:1000,target_cents:type==='bill'?null:100000,estimated:true,due_date:null,cadence:'monthly',anchor:start,state:'saving',recurring_id:null,planning_goal_id:null,schedule_id:randomUUID()}
  sql(`INSERT INTO public.budget_lines(id,tenant_id,plan_id,kind,name,opening_cents,opening_date) VALUES(${quote(line)},${quote(u.tenant)},${quote(plan)},${quote(kind)},${quote(config.name)},10000,${quote(start)});
   INSERT INTO public.budget_allocations(tenant_id,plan_id,revision_id,line_id,amount_cents) SELECT tenant_id,plan_id,id,${quote(line)},1000 FROM public.budget_revisions WHERE plan_id=${quote(plan)};
   INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id) VALUES(${quote(u.tenant)},${quote(plan)},${quote(line)},${quote(first)},1,${quote(JSON.stringify(config))}::jsonb,${quote(u.id)});`)
 }
 sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending)
  SELECT ${quote(u.id)},${quote(u.tenant)},${quote(accounts[0])},p.start_date,'Mixed history expense','Mixed fixture','mixed fixture','Shopping',-500,'expense','user',false FROM public.budget_periods p WHERE p.plan_id=${quote(plan)};
  INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending)
  SELECT ${quote(u.id)},${quote(u.tenant)},${quote(accounts[1])},p.start_date,'Mixed history refund','Mixed fixture','mixed fixture','Shopping',20,'refund','user',false FROM public.budget_periods p WHERE p.plan_id=${quote(plan)};
  INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,category_id)
  SELECT t.tenant_id,t.id,n,CASE WHEN n=0 THEN -60 ELSE -40 END,'expense','Shopping','shopping' FROM
   (SELECT DISTINCT ON(date_trunc('month',date)) id,tenant_id FROM public.transactions WHERE tenant_id=${quote(u.tenant)} AND account_id=${quote(account)} AND amount=-100 ORDER BY date_trunc('month',date),date,id) t CROSS JOIN generate_series(0,1) n;
  INSERT INTO public.budget_source_claims(tenant_id,plan_id,line_id,purpose,source_key,source_fingerprint,source_date,source_identity,amount_cents,source_revision,actor_id)
  SELECT ${quote(u.tenant)},${quote(plan)},${quote(goal)},'purchase',a.source_key,a.fingerprint,a.booking_date,a.identity,60,${source(u.tenant)},${quote(u.id)}
  FROM public.budget_activity(${quote(u.tenant)},${quote(plan)},'0001-01-01','9999-12-31') a JOIN public.transaction_allocations x ON a.source_key='a:'||x.id AND x.position=0;
  INSERT INTO public.budget_source_claims(tenant_id,plan_id,line_id,purpose,source_key,source_fingerprint,source_date,source_identity,amount_cents,related_claim_id,source_revision,actor_id)
  SELECT ${quote(u.tenant)},${quote(plan)},${quote(goal)},'refund',a.source_key,a.fingerprint,a.booking_date,a.identity,20,c.id,${source(u.tenant)},${quote(u.id)}
  FROM public.budget_activity(${quote(u.tenant)},${quote(plan)},'0001-01-01','9999-12-31') a JOIN public.budget_source_claims c ON c.plan_id=${quote(plan)} AND c.purpose='purchase' AND date_trunc('month',c.source_date)=date_trunc('month',a.booking_date) WHERE a.source_type='refund';
  ANALYZE public.transactions;ANALYZE public.transaction_allocations;ANALYZE public.budget_source_claims;`)
 check('mixed ten-year admission includes accounts, lines, splits and linked claims',JSON.parse(sql(`SELECT json_build_array((SELECT count(*) FROM public.accounts WHERE tenant_id=${quote(u.tenant)}),(SELECT count(*) FROM public.budget_lines WHERE plan_id=${quote(plan)}),(SELECT count(*) FROM public.transaction_allocations WHERE tenant_id=${quote(u.tenant)}),(SELECT count(*) FROM public.budget_source_claims WHERE plan_id=${quote(plan)}));`)),[3,12,240,240])
 check('claimed-key evidence matches the complete full-ledger resolver',sql(`SELECT NOT EXISTS(SELECT * FROM public.budget_live_claims_reference(${quote(u.tenant)},${quote(plan)}) EXCEPT ALL SELECT * FROM public.budget_live_claims_full_source_reference(${quote(u.tenant)},${quote(plan)})) AND NOT EXISTS(SELECT * FROM public.budget_live_claims_full_source_reference(${quote(u.tenant)},${quote(plan)}) EXCEPT ALL SELECT * FROM public.budget_live_claims_reference(${quote(u.tenant)},${quote(plan)}));`),'t')
 const version=()=>sql(`SELECT version FROM public.budget_plans WHERE id=${quote(plan)};`)
 const args=()=>`${quote(u.tenant)},${quote(u.id)},${quote(plan)},${quote(period)},${source(u.tenant)},${version()}`
 const normalize=value=>{
  for(const name of ['items','claims','limits'])value[name]?.sort((a,b)=>String(a.id??a.line_id).localeCompare(String(b.id??b.line_id)))
  return value
 }
 check('grouped mixed financial facts match every original kernel field',normalize(JSON.parse(sql(`SELECT public.budget_details_m4_before_controls(${args()});`))),normalize(JSON.parse(sql(`SELECT public.budget_details_m4_evidence_reference(${args()});`))))
 check('lean amounts exactly match evidence rows without constructing unused fingerprints',sql(`SELECT NOT EXISTS(SELECT source_key,source_type,booking_date,capacity,category_id,subcategory_id,custom_subcategory_id FROM public.budget_activity(${quote(u.tenant)},${quote(plan)},'0001-01-01','9999-12-31') EXCEPT ALL SELECT * FROM public.budget_activity_amounts(${quote(u.tenant)},${quote(plan)},'0001-01-01','9999-12-31')) AND NOT EXISTS(SELECT * FROM public.budget_activity_amounts(${quote(u.tenant)},${quote(plan)},'0001-01-01','9999-12-31') EXCEPT ALL SELECT source_key,source_type,booking_date,capacity,category_id,subcategory_id,custom_subcategory_id FROM public.budget_activity(${quote(u.tenant)},${quote(plan)},'0001-01-01','9999-12-31'));`),'t')
 const scope={expected_method:'budget-foundation-v1',plan_id:plan,period_id:period,expected_source:source(u.tenant),expected_plan:version(),scope:'future',activity_account_ids:[account,accounts[0]],destination_account_ids:[]}
 const measure=(label,query)=>{
  const t=performance.now()
  try{const result=JSON.parse(sql(`SET statement_timeout='8s';${query}`).split('\n').at(-1));measurements[label]=Math.round(performance.now()-t);return result}
  catch(error){measurements[label]=Math.round(performance.now()-t);measurements[`${label}_timeout`]=/statement timeout/.test(String(error));throw error}
 }
 const unchanged=()=>sql(`SELECT jsonb_build_array((SELECT version FROM public.budget_plans WHERE id=${quote(plan)}),(SELECT count(*) FROM public.budget_operations WHERE tenant_id=${quote(u.tenant)}),(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.budget_account_memberships m WHERE plan_id=${quote(plan)}));`)
 const initialState=unchanged()
 for(let n=1;n<=2;n++){
  const progress=measure(`mixed_prepare_${n}_ms`,`SELECT public.budget_begin_impact(${quote(u.tenant)},${quote(u.id)},'account_scope',${quote(JSON.stringify(scope))}::jsonb);`)
  check(`mixed complete checkpoint ${n} returns no partial financial result`,[progress.state,progress.completed,progress.total,Object.keys(progress).sort()],['preparing_impact',n,2,['completed','period_id','plan_id','plan_version','source_revision','state','total']])
  check(`mixed checkpoint ${n} commits no financial change`,unchanged(),initialState)
 }
 const preview=measure('mixed_preview_ms',`SELECT public.budget_preview_account_scope(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(scope))}::jsonb);`)
 check('mixed preview evaluates all saved and next periods',[preview.before.length,preview.after.length],[121,121])
 const rawBefore=measure('mixed_before_reference_ms',`SELECT public.budget_scope_impact_unprepared(${quote(u.tenant)},${quote(u.id)},${quote(plan)},${source(u.tenant)},${version()});`)
 check('mixed complete before checkpoint equals the uncached projection field for field',preview.before.map(normalize),rawBefore.map(normalize))
 const refStart=performance.now()
 const rawAfter=JSON.parse(sql(`BEGIN;SET statement_timeout='8s';SELECT public.budget_replace_account_scope(${quote(u.tenant)},${quote(plan)},${quote(preview.effective_from)}::date,${preview.effective_until?`${quote(preview.effective_until)}::date`:'NULL'},${quote(JSON.stringify(scope.activity_account_ids))}::jsonb,'[]'::jsonb);SELECT public.budget_scope_impact_unprepared(${quote(u.tenant)},${quote(u.id)},${quote(plan)},${source(u.tenant)},${version()});ROLLBACK;`).split('\n').at(-2))
 measurements.mixed_after_reference_ms=Math.round(performance.now()-refStart)
 check('mixed complete after checkpoint equals the uncached hypothetical projection',preview.after.map(normalize),rawAfter.map(normalize))
 check('mixed exact source evidence retains every linked claim',preview.before.find(x=>x.key===period).claims.filter(c=>c.valid).length,240)
 const current=preview.before.find(x=>x.key===period)
 check('mixed signed carry and linked purchase/refund reserve reconcile exactly',[current.items.find(i=>i.line_id===goal).reserve_cents,current.items.find(i=>i.line_id===everyday).remaining_cents],[1245100,-52800])
 const edgePreview=await edge(u,'query-budget',{action:'preview_account_scope',...scope})
 check('real authenticated mixed preview matches the complete SQL review',[edgePreview.status,edgePreview.body.preview_hash],[200,preview.preview_hash])
 // Compare the hit path against complete reference chains before attempting
 // admission, so a slow commit cannot hide a prefix-equivalence regression.
 const context=sql(`SELECT chain_context FROM public.budget_history_facts WHERE period_id=${quote(period)} AND actor_id=${quote(u.id)};`)
 for(const name of ['budget_lifecycle_pool','budget_partition_chain']){
  check(`${name} exact-context prefix equals the retained full reference`,sql(`BEGIN;SELECT set_config('halcyon.history_cache','on',true);SELECT set_config('halcyon.chain_context',${quote(context)},true);SELECT public.${name}(${args()})=public.${name}_reference(${args()});ROLLBACK;`).split('\n').at(-2),'t')
 }
 const input={...scope,action:'set_account_scope',preview_hash:preview.preview_hash,accept_impact:true,accept_incomplete:true},key=randomUUID()
 const committedState=()=>sql(`SELECT jsonb_build_object('version',(SELECT version FROM public.budget_plans WHERE id=${quote(plan)}),'source',${source(u.tenant)},
  'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.budget_account_memberships m WHERE m.plan_id=${quote(plan)}),
  'operations',(SELECT count(*) FROM public.budget_operations WHERE tenant_id=${quote(u.tenant)}),
  'policies',(SELECT count(*) FROM public.budget_account_policies WHERE plan_id=${quote(plan)}),
  'history',md5((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.period_id,c.actor_id)::text FROM public.budget_history_facts c WHERE c.plan_id=${quote(plan)})),
  'claim_cache',md5((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.actor_id)::text FROM public.budget_projection_claims c WHERE c.plan_id=${quote(plan)})));`)
 const beforeSave=committedState()
 let receipt
 try{receipt=measure('mixed_commit_ms',commandSQL(u,key,input))}
 catch(error){
  if(!/statement timeout/.test(String(error)))throw error
  check('mixed save timeout rolls back money, scope, audit receipts and derived caches',committedState(),beforeSave)
  measurements.mixed_gate='open-atomic-save-timeout'
  console.log('OPEN M5 mixed atomic-save gate:',JSON.stringify(measurements))
  writeFileSync('/tmp/halcyon-budget-impact-mixed.json',JSON.stringify(measurements,null,2))
  throw error // Keep the performance gate red; successful rollback is not admission.
 }
 check('mixed accepted save advances exactly one version',version(),String(BigInt(scope.expected_plan)+1n))
 check('mixed lost response replay is identical even when disabled',JSON.parse(sql(commandSQL(u,key,input,false))),receipt)
 check('real authenticated mixed receipt recovery matches the committed operation',(await edge(u,'manage-budget',{...input,request_id:key})).body,receipt)
 measure('mixed_undo_ms',commandSQL(u,randomUUID(),{action:'undo',plan_id:plan,period_id:period,expected_source:source(u.tenant),expected_plan:version(),operation_id:receipt.operation_id}))
 check('mixed guarded compensation advances one more version',version(),String(BigInt(scope.expected_plan)+2n))
 const t=performance.now()
 let readStarted=t
 let workspace=await edge(u,'query-budget',{action:'workspace'})
 if(workspace.body.state==='preparing'){
  for(let n=0;n<20;n++){
   const continued=await edge(u,'query-budget',{action:'prepare_history',plan_id:plan,period_id:period,expected_source:source(u.tenant),expected_plan:version()})
   check(`mixed post-Undo history continuation ${n+1} is authenticated and bounded`,continued.status,200)
   if(continued.body.preparation.ready)break
  }
  readStarted=performance.now()
  workspace=await edge(u,'query-budget',{action:'workspace'})
 }
 measurements.mixed_workspace_edge_ms=Math.round(performance.now()-readStarted)
 measurements.mixed_workspace_resume_ms=Math.round(performance.now()-t)
 check('real mixed workspace remains complete after guarded Undo',[workspace.status,workspace.body.details?.items.find(i=>i.line_id===goal).reserve_cents,workspace.body.details?.items.find(i=>i.line_id===everyday).remaining_cents],[200,1245100,-52800])
 // Admit all three preparation consumers on the unchanged mixed corpus, not
 // just account scope. Completed history is the same prerequisite as the UI.
 for(const scenario of ['rollover','control','archive']){
  const kind=scenario==='archive'?'control':scenario
  const historyArgs=()=>`${quote(u.tenant)},${quote(u.id)},${quote(plan)},${quote(period)},${source(u.tenant)},${version()}`
  while(!JSON.parse(sql(`SELECT public.budget_history_status(${historyArgs()});`)).ready)sql(`SELECT public.budget_prepare_history(${historyArgs()});`)
  const limits=JSON.parse(sql(`SELECT payload FROM public.budget_limit_revisions WHERE period_id=${quote(period)} ORDER BY version DESC LIMIT 1;`))
  const archive=sql(`SELECT id FROM public.budget_lines WHERE plan_id=${quote(plan)} AND name='Mixed fictional reserve 1';`)
  const choices=scenario==='archive'?{control:'archive_line',line_id:archive,disposition:'release',target_line_id:null}:kind==='control'?{control:'pause_budget',line_id:null,disposition:null,target_line_id:null}:{limits,rules:[...limits.map(l=>({id:l.id,mode:'carry',target:null})),{id:'other',mode:'retain',target:null}]}
  const intent={expected_method:'budget-foundation-v1',plan_id:plan,period_id:period,expected_source:source(u.tenant),expected_plan:version(),...choices}
  for(let n=1;n<=2;n++){
   const p=measure(`mixed_${scenario}_prepare_${n}_ms`,`SELECT public.budget_begin_impact(${quote(u.tenant)},${quote(u.id)},${quote(kind)},${quote(JSON.stringify(intent))}::jsonb);`)
   check(`mixed ${scenario} complete projection ${n} stays bounded`,[p.state,p.completed],['preparing_impact',n])
  }
  const review=measure(`mixed_${scenario}_review_ms`,`SELECT public.budget_begin_impact(${quote(u.tenant)},${quote(u.id)},${quote(kind)},${quote(JSON.stringify(intent))}::jsonb);`)
  check(`mixed ${scenario} review includes all saved and next periods`,[review.before.length,review.after.length],[121,121])
  const saved=measure(`mixed_${scenario}_commit_ms`,commandSQL(u,randomUUID(),{...intent,action:kind==='control'?'set_control':'set_rollover',preview_hash:review.preview_hash,accept_impact:true,accept_incomplete:true,...(kind==='control'?{accept_carry:true}:{})}))
  measure(`mixed_${scenario}_undo_ms`,commandSQL(u,randomUUID(),{action:'undo',plan_id:plan,period_id:period,expected_source:source(u.tenant),expected_plan:version(),operation_id:saved.operation_id}))
  check(`mixed ${scenario} guarded Undo restores the semantic financial inputs`,sql(`SELECT public.budget_impact_proof(${quote(u.tenant)},${quote(plan)})=before_proof FROM public.budget_impact_preparations WHERE plan_id=${quote(plan)} AND actor_id=${quote(u.id)} AND kind=${quote(kind)};`),'t')
 }
 assert.equal(sql(`SELECT coalesce(current_setting('halcyon.chain_context',true),'')||coalesce(current_setting('halcyon.claim_context',true),'');`),'')
 check('projection contexts do not escape their requests',true)
 measurements.mixed_gate='passed'
 console.log('Mixed impact scale:',JSON.stringify(measurements))
 writeFileSync('/tmp/halcyon-budget-impact-mixed.json',JSON.stringify(measurements,null,2))
}
