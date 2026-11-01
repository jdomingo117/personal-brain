import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {cpus,totalmem,platform,arch} from 'node:os'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

// Called only by test-budget-durable --performance-only --capacity. All rows
// belong to newly captured users in its positively identified disposable stack.
export async function runBudgetCapacityChecks({newUser,sql,sqlAsync,profileSQL,quote:q,check,edge,source,commandSQL,project,api,repo}){
 const {runBudgetTransferReadChecks}=await import('./test-budget-transfer-reads.mjs')
 await runBudgetTransferReadChecks({newUser,sql,quote:q,check})
 const {runBudgetAttentionChecks}=await import('./test-budget-attention.mjs')
 await runBudgetAttentionChecks({newUser,sql,quote:q,check,edge,source,sqlAsync,commandSQL})
 const {runBudgetForecastChecks}=await import('./test-budget-forecast.mjs')
 await runBudgetForecastChecks({newUser,sql,quote:q,check,edge,source,commandSQL})
 const profiling=process.argv.includes('--capacity-profile')
 const out=resolve(repo,profiling?'docs/budget-m7/r06-profile':'docs/budget-m7/r06-capacity');mkdirSync(out,{recursive:true})
 const report={date:'2026-10-29',project,api,environment:{platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logical_cpus:cpus().length,host_memory_bytes:totalmem(),postgres:sql('SELECT version();'),settings:JSON.parse(sql("SELECT json_build_object('shared_buffers',current_setting('shared_buffers'),'work_mem',current_setting('work_mem'),'max_connections',current_setting('max_connections'));"))},method:{sql_samples:20,edge_samples:5,percentile:'nearest rank; p95 of five Edge samples is the maximum, not a stable production percentile',cache:'first after fixture load/ANALYZE plus warm repetitions; no OS/shared-buffer flush and no true cold-cache claim',limits:'Existing 8s SQL cancellation bound; unchanged Edge authentication and rate limits',concurrency:'sequential request samples; retained visual-preview stack also exists on different ports',transport:'Capacity API samples close each HTTP connection to avoid stale idle sockets after long SQL/fixture intervals; no retries are hidden' },scales:[],hosted:'not measured; no hosted target authorized',failures:[]}
 const readTimes=[]
 const reserveRead=async()=>{while(readTimes.length&&Date.now()-readTimes[0]>=60000)readTimes.shift();if(readTimes.length>=24){console.log('CAPACITY respecting normal read-rate window');await new Promise(r=>setTimeout(r,Math.max(1,60050-(Date.now()-readTimes[0]))));while(readTimes.length&&Date.now()-readTimes[0]>=60000)readTimes.shift()}readTimes.push(Date.now())}
 const read=async(user,body)=>{await reserveRead();return edge(user,'query-budget',body,true)}
 const save=()=>writeFileSync(resolve(out,'measurements.json'),JSON.stringify(report,null,2)+'\n')
 const summarize=s=>{const ordered=[...s].sort((a,b)=>a-b),pick=p=>ordered[Math.ceil(ordered.length*p)-1];return {n:s.length,p50_ms:pick(.5),p95_ms:pick(.95),min_ms:ordered[0],max_ms:ordered.at(-1),samples_ms:s}}
 const u=await newUser(),foreign=await newUser(),accounts=[]
 for(let n=0;n<3;n++)accounts.push(sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${q(u.id)},${q(u.tenant)},'Capacity fictional ${n}','Liquid',0,'AUD') RETURNING id;`).split('\n')[0])
 const start=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;"),first=sql(`SELECT (${q(start)}::date-interval '11 months')::date;`),end=sql(`SELECT (${q(start)}::date+interval '1 month')::date;`)
 for(const a of accounts)sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${q(u.tenant)},${q(a)},${q(a)},${q(first)},${q(end)},'verified_statement','{"fixture":"m75-capacity"}',${source(u.tenant)},${q(u.id)});`)
 const everyday=randomUUID(),payload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:accounts,destination_account_ids:[],income_cents:100000000,opening_drawdown_cents:0,lines:[{id:everyday,kind:'everyday',name:'Capacity everyday',allocation_cents:50000000,opening_cents:0}]}
 let r=await edge(u,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(u.tenant),expected_draft:'0',payload});assert.equal(r.status,200)
 r=await edge(u,'manage-budget',{action:'activate',request_id:randomUUID(),expected_source:source(u.tenant),expected_draft:r.body.result.draft_version,accept_gap:false});assert.equal(r.status,200)
 let prior=0
 const request={action:'assisted_setup',frequency:'monthly',start_date:start,account_ids:accounts}
 const assistanceQuery=`SELECT public.budget_assisted_setup(${q(u.tenant)},${q(u.id)},${q(JSON.stringify(request))}::jsonb);`
 async function series(label,query,body,validate,scale){
  const row={sql_wall_ms:[],sql_execution_ms:[],edge_ms:[],errors:[]};scale[label]=row;save()
  for(let n=0;n<20;n++){
   const t=performance.now()
   try{const plan=JSON.parse(sql(`SET statement_timeout='8s';EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query}`).replace(/^SET\n/,''));row.sql_wall_ms.push(Math.round(performance.now()-t));row.sql_execution_ms.push(plan[0]['Execution Time']);if(n===0)row.first_plan=plan}
   catch(error){row.errors.push({stage:'sql',sample:n,timeout:/statement timeout/.test(String(error)),message:String(error).slice(0,400)});report.failures.push(`${scale.rows} ${label} SQL`);break}
  }
  if(row.sql_execution_ms.length)row.sql_summary=summarize(row.sql_execution_ms)
  for(let n=0;body&&n<5;n++){
   await reserveRead();const t=performance.now(),res=await edge(u,'query-budget',body,true);row.edge_ms.push(Math.round(performance.now()-t))
   if(res.status!==200){row.errors.push({stage:'edge',sample:n,status:res.status,code:res.body.code??null});report.failures.push(`${scale.rows} ${label} Edge`);break}
   validate(res.body)
  }
  if(row.edge_ms.length)row.edge_summary=summarize(row.edge_ms)
  save();console.log(`CAPACITY ${scale.rows} ${label}: SQL p95=${row.sql_summary?.p95_ms??'unavailable'}ms; Edge p95=${row.edge_summary?.p95_ms??'unavailable'}ms; errors=${row.errors.length}`)
 }
 for(const size of profiling?[100000]:[10000,100000,1000000]){
  console.log(`CAPACITY loading ${size} raw rows (all source triggers enabled)`)
  const scale={rows:size,fixture_started_at:new Date().toISOString()};report.scales.push(scale);save()
  const loaded=performance.now()
  await sqlAsync(`SET statement_timeout='240s';INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
   SELECT ${q(u.id)},${q(u.tenant)},(ARRAY[${accounts.map(q).join(',')}]::uuid[])[1+((n/12)%3)],(${q(first)}::date+make_interval(months=>(n%12)::int))::date+((n/12)%28)::int,
    'Capacity fictional row '||n,'Capacity shop '||(n%100),'capacity-shop-'||(n%100),CASE WHEN n%10=0 THEN 'Income' WHEN n%10=2 THEN 'Transfer' ELSE 'Shopping' END,
    CASE WHEN n%10=0 THEN 1000 WHEN n%10=1 THEN 20 ELSE -100 END,CASE WHEN n%10=0 THEN 'income' WHEN n%10=1 THEN 'refund' WHEN n%10=2 THEN 'transfer' ELSE 'expense' END,'user',false,false
   FROM generate_series(${prior+1},${size}) n;
   INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,category_id)
   SELECT t.tenant_id,t.id,p,CASE WHEN p=0 THEN -60 ELSE -40 END,'expense','Shopping','shopping' FROM public.transactions t CROSS JOIN generate_series(0,1) p
   WHERE t.tenant_id=${q(u.tenant)} AND t.original_description LIKE 'Capacity fictional row %' AND substring(t.original_description from '[0-9]+$')::bigint BETWEEN ${prior+1} AND ${size} AND substring(t.original_description from '[0-9]+$')::bigint%10=3;
   ANALYZE public.transactions;ANALYZE public.transaction_allocations;`)
  scale.fixture_load_ms=Math.round(performance.now()-loaded);prior=size
  check(`${size} capacity raw rows and split children`,JSON.parse(sql(`SELECT json_build_array((SELECT count(*) FROM public.transactions WHERE tenant_id=${q(u.tenant)}),(SELECT count(*) FROM public.transaction_allocations WHERE tenant_id=${q(u.tenant)}));`)),[size,size/5])
  const snapshot=JSON.parse(sql(`SELECT public.budget_query(${q(u.tenant)},${q(u.id)},'{"action":"snapshot"}');`)),version=snapshot.plan.version,plan=snapshot.plan.id,period=snapshot.period.id,sourceVersion=source(u.tenant)
  const args=`${q(u.tenant)},${q(u.id)},${q(plan)},${q(period)},${sourceVersion},${q(version)}`,recurringArgs=`${q(u.tenant)},${q(u.id)},${q(plan)},${sourceVersion},${q(version)}`
  if(profiling){
   const trace=profileSQL(`LOAD 'auto_explain';SET client_min_messages='notice';SET auto_explain.log_min_duration='10ms';SET auto_explain.log_nested_statements=on;SET auto_explain.log_analyze=on;SET auto_explain.log_buffers=on;SET auto_explain.log_format='json';SET auto_explain.log_level='notice';SET statement_timeout='8s';DO $$ BEGIN PERFORM public.budget_query(${q(u.tenant)},${q(u.id)},'{"action":"snapshot"}');PERFORM public.budget_workspace_details(${args});PERFORM public.budget_recurring_evidence(${recurringArgs});PERFORM public.budget_assisted_setup(${q(u.tenant)},${q(u.id)},${q(JSON.stringify(request))}::jsonb);END $$;`)
   writeFileSync(resolve(out,'nested-plans.log'),trace);report.status='profile-only';save();console.log('CAPACITY nested SQL profile saved; no latency admission claimed');return report
  }
  const expected=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('start_date',d::date,'expense_cents',(SELECT coalesce(sum(CASE WHEN kind='expense' THEN -amount WHEN kind='refund' THEN -amount ELSE 0 END),0) FROM public.transactions WHERE tenant_id=${q(u.tenant)} AND date>=d AND date<d+interval '1 month'),'income_cents',(SELECT coalesce(sum(amount),0) FROM public.transactions WHERE tenant_id=${q(u.tenant)} AND kind='income' AND date>=d AND date<d+interval '1 month')) ORDER BY d),'[]') FROM generate_series(${q(start)}::date-interval '6 months',${q(start)}::date-interval '1 month',interval '1 month') d;`))
  const validate=b=>{assert.equal(b.eligible,true);assert.equal(b.period_count,6);for(const p of b.periods){const e=expected.find(x=>x.start_date===p.start_date);assert(e);assert.equal(p.expense_cents,e.expense_cents);assert.equal(p.income_cents,e.income_cents)}}
  await series('workspace',`SELECT jsonb_build_object('snapshot',public.budget_query(${q(u.tenant)},${q(u.id)},'{"action":"snapshot"}'),'details',public.budget_workspace_details(${args}),'recurring_evidence',public.budget_recurring_evidence(${recurringArgs}));`,{action:'workspace'},b=>{assert.equal(b.plan.id,plan);assert(b.details);assert.equal(b.source_revision,sourceVersion)},scale)
  await series('assistance',assistanceQuery,request,validate,scale)
  // This is the actual three-year detector evidence query, including its explicit
  // group/observation limits; an overflow must remain disclosed, not sampled.
  await series('recurring',`SELECT public.budget_recurring_evidence(${recurringArgs});`,null,()=>{},scale)
  scale.recurring.edge_scope='SQL-only; detector is included in workspace Edge timings, not a standalone Edge endpoint'
  let evidence
  try{evidence=JSON.parse(sql(`SET statement_timeout='8s';SELECT public.budget_recurring_evidence(${recurringArgs});`).split('\n').at(-1))}catch(error){scale.recurring.evidence_error=String(error).slice(0,400);report.failures.push(`${size} recurring evidence`)}
  if(evidence){
  check(`${size} recurring evidence declares overflow without sampling charges`,evidence.group_count>=evidence.groups.length&&evidence.groups.length<=evidence.group_limit&&evidence.groups.every(g=>g.count>evidence.observation_limit?g.charges.length===0:g.charges.length===g.count))
  scale.recurring.evidence_summary={groups_total:evidence.group_count,groups_returned:evidence.groups.length,group_limit:evidence.group_limit,observation_limit:evidence.observation_limit,overflow_groups_returned:evidence.groups.filter(g=>g.count>evidence.observation_limit).length,annual_from:evidence.annual_from}
  }
  scale.source_plan=JSON.parse(sql(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id,date,amount FROM public.transactions WHERE tenant_id=${q(u.tenant)} AND account_id=${q(accounts[0])} AND date>=${q(start)} AND date<${q(end)};`))
  if(size===100000&&sql("SELECT to_regclass('public.budget_transactions_analytic') IS NOT NULL;")==='t')check('R06 dense 100k canonical view parity includes every field and duplicate',sql(`SELECT NOT EXISTS(SELECT to_jsonb(c) FROM public.transactions_analytic c WHERE tenant_id=${q(u.tenant)} EXCEPT ALL SELECT to_jsonb(c)-'budget_custom_subcategory_id' FROM public.budget_transactions_analytic c WHERE tenant_id=${q(u.tenant)}) AND NOT EXISTS(SELECT to_jsonb(c)-'budget_custom_subcategory_id' FROM public.budget_transactions_analytic c WHERE tenant_id=${q(u.tenant)} EXCEPT ALL SELECT to_jsonb(c) FROM public.transactions_analytic c WHERE tenant_id=${q(u.tenant)});`),'t')
  const foreignRead=await edge(foreign,'query-budget',{...request,account_ids:accounts});check(`${size} foreign account scope cannot obtain suggestions`,[foreignRead.status,foreignRead.body.eligible,foreignRead.body.period_count],[200,false,0])
  const before={source:source(u.tenant),version:sql(`SELECT version FROM public.budget_plans WHERE id=${q(plan)};`),rows:sql(`SELECT count(*) FROM public.transactions WHERE tenant_id=${q(u.tenant)};`)}
  const pages=[];let cursor={};for(let n=0;n<(size===1000000?20:3);n++){
   const page=await read(u,{action:'sources',plan_id:plan,period_id:period,...cursor});if(page.status!==200){scale.pagination_error={status:page.status,code:page.body.code??null};report.failures.push(`${size} source pagination`);break}assert(page.body.rows.length<=50);pages.push(page.body);const last=page.body.rows.at(-1);if(!page.body.has_more||!last)break;cursor={after_date:last.booking_date,after_key:last.source_key}
  }
  const keys=pages.flatMap(p=>p.rows.map(x=>x.source_key));check(`${size} source pages preserve disjoint keys and complete totals`,new Set(keys).size===keys.length&&pages.length>0&&pages.every(p=>p.total===pages[0].total))
  check(`${size} reads preserve ledger/source/plan versions`,{source:source(u.tenant),version:sql(`SELECT version FROM public.budget_plans WHERE id=${q(plan)};`),rows:sql(`SELECT count(*) FROM public.transactions WHERE tenant_id=${q(u.tenant)};`)},before)
  scale.pagination={pages:pages.length,rows:keys.length,total:pages[0]?.total??null,financial_state_unchanged:true};scale.finished_at=new Date().toISOString();save()
  if(size===10000&&sql("SELECT to_regprocedure('public.budget_details_m4_r06_unmemoized(uuid,uuid,uuid,uuid,bigint,bigint)') IS NOT NULL;")==='t'){
   const sentinel={tenant:u.tenant,actor:u.id,plan,period,source:sourceVersion,version,role:'owner',snapshot:{poisoned:true}}
   sql(`DO $$ BEGIN PERFORM set_config('halcyon.workspace_memo',${q(JSON.stringify(sentinel))},true);IF public.budget_query_m4(${q(u.tenant)},${q(u.id)},'{"action":"snapshot"}') ? 'poisoned' THEN RAISE EXCEPTION 'default_snapshot_reused_selected_scope';END IF;END $$;`)
   check('R06 default snapshot cannot reuse a selected-period-only slot',true)
   sql(`DO $$ BEGIN PERFORM set_config('halcyon.workspace_memo','{"sentinel":true}',true);PERFORM public.budget_workspace_details(${args});IF current_setting('halcyon.workspace_memo')::jsonb<>'{"sentinel":true}'::jsonb THEN RAISE EXCEPTION 'workspace_context_escaped';END IF;END $$;`)
   check('R06 workspace restores the caller context after success',true)
   check('R06 lean source rows equal every pre-optimization source field',sql(`SELECT NOT EXISTS(SELECT * FROM public.budget_activity_amounts(${q(u.tenant)},${q(plan)},${q(start)},${q(end)}) EXCEPT ALL SELECT * FROM public.budget_activity_amounts_r06_reference(${q(u.tenant)},${q(plan)},${q(start)},${q(end)})) AND NOT EXISTS(SELECT * FROM public.budget_activity_amounts_r06_reference(${q(u.tenant)},${q(plan)},${q(start)},${q(end)}) EXCEPT ALL SELECT * FROM public.budget_activity_amounts(${q(u.tenant)},${q(plan)},${q(start)},${q(end)}));`),'t')
  }
  if(size===10000&&sql("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.budget_history_facts'::regclass AND attname='forecast_read');")==='t'){
   const slot=`tenant_id=${q(u.tenant)} AND plan_id=${q(plan)} AND period_id=${q(period)} AND actor_id=${q(u.id)}`
   const stamps=()=>JSON.parse(sql(`SELECT jsonb_build_array(forecast_read_at,recurring_read_at,forecast_role,recurring_role) FROM public.budget_history_facts WHERE ${slot};`))
   let stamp=stamps();const hit=await read(u,{action:'workspace'});assert.equal(hit.status,200)
   check('R06 unchanged source and plan reuse complete derived checkpoints without rewriting them',stamps(),stamp)
   check('R06 cached forecast equals the uncached complete financial kernel',sql(`SELECT (forecast_read-'checked_at')=(public.budget_forecast_facts_r06_uncached(${args},public.budget_details(${args}))-'checked_at') FROM public.budget_history_facts WHERE ${slot};`),'t')
   check('R06 cached recurring evidence equals the uncached complete detector input',sql(`SELECT recurring_read=public.budget_recurring_evidence_r06_uncached(${recurringArgs}) FROM public.budget_history_facts WHERE ${slot};`),'t')
   sql(`UPDATE public.tenant_members SET role='viewer' WHERE tenant_id=${q(u.tenant)} AND user_id=${q(u.id)};`)
   const viewer=await read(u,{action:'workspace'});check('R06 same actor role change cannot reuse owner checkpoints or Undo',[viewer.status,viewer.body.details.undo_operation_id,stamps().slice(2)],[200,null,['viewer','viewer']])
   sql(`UPDATE public.tenant_members SET role='owner' WHERE tenant_id=${q(u.tenant)} AND user_id=${q(u.id)};`);assert.equal((await read(u,{action:'workspace'})).status,200)
   stamp=stamps()
   sql(`UPDATE public.budget_account_memberships SET end_date=(${q(start)}::date+interval '1 year')::date WHERE tenant_id=${q(u.tenant)} AND plan_id=${q(plan)} AND role='activity' AND account_id=${q(accounts[0])};`)
   assert.equal((await read(u,{action:'workspace'})).status,200)
   check('R06 same-version hypothetical scope does not borrow the actual-scope checkpoint',stamps()[0]!==stamp[0]&&stamps()[1]!==stamp[1])
   sql(`UPDATE public.budget_account_memberships SET end_date=NULL WHERE tenant_id=${q(u.tenant)} AND plan_id=${q(plan)} AND role='activity' AND account_id=${q(accounts[0])};`);assert.equal((await read(u,{action:'workspace'})).status,200)
   sql(`UPDATE public.budget_history_facts SET forecast_read=jsonb_set(forecast_read,'{as_of}',to_jsonb((current_date-1)::text)),recurring_read=jsonb_set(recurring_read,'{as_of}',to_jsonb((current_date-1)::text)) WHERE ${slot};`)
   assert.equal((await read(u,{action:'workspace'})).status,200)
   check('R06 previous local-date checkpoints are recomputed',sql(`SELECT forecast_read->>'as_of'=((now() AT TIME ZONE 'Australia/Sydney')::date)::text AND recurring_read->>'as_of'=((now() AT TIME ZONE 'Australia/Sydney')::date)::text FROM public.budget_history_facts WHERE ${slot};`),'t')
   sql(`UPDATE public.budget_history_facts SET forecast_read_at=now()-interval '25 hours',recurring_read_at=now()-interval '25 hours' WHERE ${slot};`)
   assert.equal((await read(u,{action:'workspace'})).status,200)
   check('R06 expired derived checkpoints are rebuilt instead of relabelled fresh',sql(`SELECT forecast_read_at>now()-interval '1 minute' AND recurring_read_at>now()-interval '1 minute' FROM public.budget_history_facts WHERE ${slot};`),'t')
   sql(`UPDATE public.budget_history_facts SET forecast_read=jsonb_set(forecast_read,'{source_revision}','"-1"'::jsonb),recurring_source=-1 WHERE ${slot};`)
   assert.equal((await read(u,{action:'workspace'})).status,200)
   check('R06 old-generation payloads cannot borrow a refreshed base-slot identity',sql(`SELECT forecast_read->>'source_revision'=${q(sourceVersion)} AND recurring_source=${sourceVersion} FROM public.budget_history_facts WHERE ${slot};`),'t')
  }
  if(size===10000){
   // A small real committed import overlaps a real authenticated workspace read.
   // Coordinate on PgSleep, not a guessed delay; delete only its captured ID.
   const imported=randomUUID(),application=`capacity-import-${randomUUID()}`
   const pendingImport=sqlAsync(`BEGIN;SET LOCAL application_name=${q(application)};SELECT public.budget_lock_source(${q(u.tenant)});INSERT INTO public.transactions(id,user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES(${q(imported)},${q(u.id)},${q(u.tenant)},${q(accounts[0])},${q(start)},'Capacity concurrent fictional import','Capacity concurrent','capacity-concurrent','Income',1234,'income','user',false,false);SELECT pg_sleep(1);COMMIT;`)
   let sleeping=false
   for(let n=0;n<30;n++){if(sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${q(application)} AND wait_event='PgSleep');`)==='t'){sleeping=true;break}await new Promise(r=>setTimeout(r,20))}
   assert(sleeping,'concurrent import must be waiting before workspace begins')
   const began=performance.now(),concurrent=await read(u,{action:'workspace'});await pendingImport
   check('concurrent committed import returns a coherent version-bound workspace',[concurrent.status,concurrent.body.source_revision,concurrent.body.details?.forecast?.source_revision],[200,source(u.tenant),source(u.tenant)])
   check('concurrent fixture imported exactly the captured transaction',sql(`SELECT amount FROM public.transactions WHERE id=${q(imported)} AND tenant_id=${q(u.tenant)};`),'1234')
   sql(`DELETE FROM public.transactions WHERE id=${q(imported)} AND tenant_id=${q(u.tenant)};`)
   check('deleting the captured import correctly revokes affected coverage',Number(sql(`SELECT count(*) FROM public.account_activity_coverage WHERE tenant_id=${q(u.tenant)} AND account_id=${q(accounts[0])} AND revoked_reason='source_activity_deleted';`))>0)
   // Explicitly renew known-complete fictional coverage after removing the one
   // captured row; never weaken the production deletion/coverage protection.
   sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${q(u.tenant)},${q(accounts[0])},${q(accounts[0])},${q(first)},${q(end)},'verified_statement','{"fixture":"m75-renewed-after-captured-import-removal"}',${source(u.tenant)},${q(u.id)});`)
   scale.concurrent_import={workspace_ms:Math.round(performance.now()-began),coherent:true,captured_fixture_removed:true};save()
  }
 }
 report.targets={workspace_sql_p95_under_1s:report.scales.every(s=>s.workspace.sql_summary?.n===20&&s.workspace.sql_summary.p95_ms<1000),workspace_edge_samples_under_2s:report.scales.every(s=>!s.workspace.errors.length&&s.workspace.edge_summary?.n===5&&s.workspace.edge_summary.p95_ms<2000),assistance_edge_samples_under_3s:report.scales.every(s=>!s.assistance.errors.length&&s.assistance.edge_summary?.n===5&&s.assistance.edge_summary.p95_ms<3000)}
 for(const [target,passed] of Object.entries(report.targets))if(!passed)report.failures.push(target)
 report.status=report.failures.length?'measured-with-findings':'local-measured';save()
 check('local representative workspace SQL p95 below 1s',report.scales.every(s=>s.workspace.sql_summary?.n===20&&s.workspace.sql_summary.p95_ms<1000))
 check('local representative workspace Edge samples below 2s',report.scales.every(s=>!s.workspace.errors.length&&s.workspace.edge_summary?.n===5&&s.workspace.edge_summary.p95_ms<2000))
 check('local assistance Edge samples below 3s',report.scales.every(s=>!s.assistance.errors.length&&s.assistance.edge_summary?.n===5&&s.assistance.edge_summary.p95_ms<3000))
 return report
}
