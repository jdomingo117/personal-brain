#!/usr/bin/env node
/** M2 integration: new project/ports only; no existing target accepted, no personal env copied. */
import assert from 'node:assert/strict'
import { spawn,spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname,resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSafeTestTarget } from './lib/assertSafeTestTarget.mjs'

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const project=`halcyon-budget-m2-${randomUUID().replaceAll('-','').slice(0,16)}`
const work=mkdtempSync(resolve(tmpdir(),'halcyon-budget-m2-'))
const container=`supabase_db_${project}`, cli=process.env.SUPABASE_CLI??'supabase'
const api='http://127.0.0.1:57421'
let functions,attempted=false,anon,checks=0,temporalFixtures=[],historyFixture
const users=[]
function run(cmd,args,input,timeout=60_000) {
 const r=spawnSync(cmd,args,{cwd:repo,input,encoding:'utf8',timeout,maxBuffer:16*1024*1024})
 if(r.status!==0)throw new Error(`${cmd} failed: ${r.error?.message??r.stderr}${cmd===cli&&args[0]==='start'?String(r.stdout).slice(-6000):''}`)
 return r.stdout.trim()
}
const quote=v=>`'${String(v).replaceAll("'","''")}'`
const sql=q=>run('docker',['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q)
function check(label,value,expected=true){assert.deepEqual(value,expected,label);checks++;console.log(`PASS ${label}`)}
function sqlAsync(query) {
 return new Promise((res,rej)=>{
  const p=spawn('docker',['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']})
  let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b)
  p.on('error',rej);p.on('close',code=>code===0?res(out.trim()):rej(new Error(err)));p.stdin.end(query)
 })
}
async function edge(user,name,body){const r=await fetch(`${api}/functions/v1/${name}`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json',...(user?{Authorization:`Bearer ${user.token}`}:{})},body:JSON.stringify(name==='manage-budget'?{expected_method:'budget-foundation-v1',...body}:body)});return {status:r.status,body:await r.json()}}
async function newUser(){
 const password=`Budget-proof-${randomUUID()}!`
 const r=await fetch(`${api}/auth/v1/signup`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:`budget-${randomUUID()}@example.test`,password})})
 const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));assert(data.access_token)
 const user={id:data.user.id,token:data.access_token,session:data};users.push(user)
 user.tenant=sql(`SELECT default_tenant_id FROM public.profiles WHERE id=${quote(user.id)};`)
 return user
}
const source=tenant=>sql(`SELECT coalesce((SELECT revision FROM public.budget_source_versions WHERE tenant_id=${quote(tenant)}),0);`)
const commandSQL=(user,request,body,enabled=true)=>`SELECT public.budget_command(${quote(user.tenant)},${quote(user.id)},${quote(request)},${quote(JSON.stringify({expected_method:'budget-foundation-v1',...body}))}::jsonb,${enabled});`
function sqlCommand(user,request,body,enabled=true){return JSON.parse(sql(commandSQL(user,request,body,enabled)))}
async function startFunctions(){
 functions=spawn(cli,['functions','serve','--workdir',work,'--env-file',resolve(work,'budget.env'),'--no-verify-jwt'],{cwd:repo,stdio:['ignore','pipe','pipe']})
 // Deliberately do not print runtime output or generated auth keys.
 functions.stdout.on('data',()=>{});functions.stderr.on('data',()=>{})
 for(let n=0;n<120;n++){
  try{const r=await fetch(`${api}/functions/v1/query-budget`,{method:'OPTIONS'});if(r.status<500)return}catch{}
  await new Promise(r=>setTimeout(r,500))
 }
 throw new Error('Isolated Budget functions failed to start')
}
async function stopFunctions(){
 if(!functions||functions.exitCode!==null)return
 const child=functions,exited=new Promise(r=>child.once('exit',r))
 child.kill('SIGTERM')
 await Promise.race([exited,new Promise(r=>setTimeout(r,3000))])
 if(child.exitCode===null)child.kill('SIGKILL')
}
async function waitForSleep(name){
 for(let n=0;n<80;n++){
  if(sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name=${quote(name)} AND wait_event='PgSleep';`)==='1')return
  await new Promise(r=>setTimeout(r,25))
 }
 throw new Error('Concurrent gate-holder readiness timeout')
}
try{
 assert.match(project,/^halcyon-budget-m2-[0-9a-f]{16}$/)
 assertSafeTestTarget({SUPABASE_URL:api,HALCYON_TEST_TARGET_ID:project,HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES:'isolated-only'})
 cpSync(resolve(repo,'supabase/migrations'),resolve(work,'supabase/migrations'),{recursive:true})
 cpSync(resolve(repo,'supabase/functions'),resolve(work,'supabase/functions'),{recursive:true})
 writeFileSync(resolve(work,'supabase/config.toml'),`project_id = "${project}"
[api]
port = 57421
schemas = ["public", "graphql_public", "private"]
max_rows = 1000
[db]
port = 57422
shadow_port = 57420
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = false
[analytics]
enabled = false
[auth]
site_url = "http://localhost:57300"
enable_signup = true
[auth.email]
enable_confirmations = false
`)
 writeFileSync(resolve(work,'budget.env'),'BUDGET_V1_ENABLED=true\nALLOWED_ORIGINS=http://127.0.0.1:57300\n')
 console.log(`Target: ${project}; API=${api}; DB=127.0.0.1:57422/postgres; fixtures=isolated-only`)
 attempted=true
 run(cli,['start','--workdir',work],undefined,240_000)
 const info=JSON.parse(run('docker',['inspect',container]))[0]
 assert.equal(info.Config.Labels['com.supabase.cli.project'],project)
 check('new isolated target has no identities or financial data',JSON.parse(sql("SELECT json_build_array((SELECT count(*) FROM auth.users),(SELECT count(*) FROM public.tenants),(SELECT count(*) FROM public.accounts),(SELECT count(*) FROM public.transactions));")),[0,0,0,0])
 const stack=JSON.parse(run(cli,['status','--workdir',work,'--output','json']))
 assert.equal(stack.API_URL,api);anon=stack.ANON_KEY
 check('all migrations replayed',Number(sql('SELECT count(*) FROM supabase_migrations.schema_migrations;')),readdirSync(resolve(repo,'supabase/migrations')).filter(n=>n.endsWith('.sql')).length)
 await startFunctions()
 if(process.argv.includes('--performance-only')){
  const {runBudgetImpactPreparationChecks}=await import('./test-budget-impact-preparation.mjs')
  await runBudgetImpactPreparationChecks({newUser,sql,quote,check,edge,source,commandSQL})
  const {runBudgetPerformanceChecks}=await import('./test-budget-performance.mjs')
  historyFixture=await runBudgetPerformanceChecks({newUser,sql,quote,check,edge,source,commandSQL})
  if(process.argv.includes('--stress'))await runBudgetPerformanceChecks({newUser,sql,quote,check,edge,source,commandSQL,periods:120,perPeriod:1000})
 }
 if(process.argv.includes('--lifecycle')||process.argv.includes('--temporal-only')){
  const {runBudgetTemporalChecks}=await import('./test-budget-temporal.mjs')
  temporalFixtures=await runBudgetTemporalChecks({newUser,sql,quote,check,edge,source,commandSQL})
 }
 if(process.argv.includes('--lifecycle')||process.argv.includes('--attention-only')){
  const {runBudgetAttentionChecks}=await import('./test-budget-attention.mjs')
  await runBudgetAttentionChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL})
 }
 if(!process.argv.includes('--attention-only')&&!process.argv.includes('--temporal-only')&&!process.argv.includes('--performance-only')){
 if(process.argv.includes('--lifecycle')){
  const {runBudgetControlChecks}=await import('./test-budget-controls.mjs')
  await runBudgetControlChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL})
 }
 if(process.argv.includes('--lifecycle')){
  const {runBudgetRolloverChecks}=await import('./test-budget-rollover.mjs')
  await runBudgetRolloverChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL})
 }
 const a=await newUser(),b=await newUser(),viewer=await newUser(),member=await newUser()
 for(const [user,role]of[[viewer,'viewer'],[member,'member']]){
  sql(`INSERT INTO public.tenant_members(tenant_id,user_id,role,joined_at) VALUES(${quote(a.tenant)},${quote(user.id)},${quote(role)},'2000-01-01');`)
 }
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(a.id)},${quote(a.tenant)},'Fictional Budget account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const everyday=randomUUID(),fixed=randomUUID()
 const payload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:'2026-10-20',account_ids:[account],destination_account_ids:[],income_cents:600000,opening_drawdown_cents:0,
  lines:[{id:everyday,kind:'everyday',name:'Everyday',allocation_cents:180000,opening_cents:0},{id:fixed,kind:'fixed',name:'Bills',allocation_cents:250000,opening_cents:0}]}
 check('unauthenticated endpoint denied',(await edge(null,'query-budget',{action:'snapshot'})).status,401)
 check('viewer cannot write',(await edge(viewer,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:'0',expected_draft:'0',payload:{}})).status,403)
 check('member cannot write',(await edge(member,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:'0',expected_draft:'0',payload:{}})).status,403)
 const invalid=await edge(a,'manage-budget',{action:'revise',request_id:randomUUID(),expected_source:'0',expected_plan:'0',plan_id:randomUUID(),period_id:randomUUID(),scope:'period',income_cents:.1,opening_drawdown_cents:0,accept_gap:false,lines:[]})
 check('Zod rejects invalid cent payload',invalid.status,422)
 check('malformed version is a validation error, not an exception',(await edge(a,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:'invalid',expected_draft:'0',payload:{}})).status,422)
 const savedBody={action:'save_draft',request_id:randomUUID(),expected_source:source(a.tenant),expected_draft:'0',payload}
 const saved=await edge(a,'manage-budget',savedBody)
 if(saved.status!==200){const{request_id,...input}=savedBody;sqlCommand(a,request_id,input)} // Disposable SQL diagnostic; never run on a personal target.
 check('owner saves durable draft',saved.status,200)
 const replay=await edge(a,'manage-budget',savedBody);check('lost-response retry returns identical receipt',replay.body,saved.body)
 check('changed payload cannot reuse request ID',(await edge(a,'manage-budget',{...savedBody,payload:{name:'different'}})).status,409)
 check('draft survives fresh read',(await edge(a,'query-budget',{action:'draft'})).body.draft,payload)
 const activation={action:'activate',request_id:randomUUID(),expected_source:source(a.tenant),expected_draft:'1',accept_gap:false}
 const started=await edge(a,'manage-budget',activation)
 if(started.status!==200){const{request_id,...input}=activation;sqlCommand(a,request_id,input)} // Diagnostic only on this verified fictional target.
 check('atomic activation succeeds',started.status,200)
 const plan=started.body.result.plan_id,period=started.body.result.period_id
 const snap=await edge(a,'query-budget',{action:'snapshot'});check('snapshot revision is durable',snap.body.plan.version,'1')
 check('durable resource summary matches exact-cent foundation',snap.body.unallocated_cents,170000)
 check('unknown coverage is not labelled fresh',snap.body.state,'incomplete')
 check('viewer reads plan without receiving owner draft',(await edge(viewer,'query-budget',{action:'snapshot'})).status,200)
 check('viewer draft read denied',(await edge(viewer,'query-budget',{action:'draft'})).status,403)
 check('foreign plan is not exposed',(await edge(b,'query-budget',{action:'snapshot',plan_id:plan})).status,404)
 const leaked=await fetch(`${api}/rest/v1/budget_plans?id=eq.${plan}`,{headers:{apikey:anon,Authorization:`Bearer ${b.token}`}})
 check('direct foreign table read is RLS-filtered',await leaked.json(),[])
 const direct=await fetch(`${api}/rest/v1/rpc/budget_command`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:JSON.stringify({p_tenant:a.tenant,p_actor:a.id,p_request:randomUUID(),p_input:{},p_enabled:true})})
 check('authenticated browser cannot call mutation RPC',direct.status,403)
 const directWrite=await fetch(`${api}/rest/v1/budget_drafts`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:JSON.stringify({tenant_id:a.tenant})})
 check('authenticated browser cannot write tables',directWrite.status,403)
 const privateDraft=await fetch(`${api}/rest/v1/budget_drafts`,{headers:{apikey:anon,Authorization:`Bearer ${member.token}`}})
 check('member cannot read owner-only setup payloads',await privateDraft.json(),[])
 assert.throws(()=>sql(`SELECT public.budget_validate_setup(${quote(b.tenant)},${quote(JSON.stringify(payload))}::jsonb);`),/budget_account_unavailable/);check('SQL rejects foreign account IDs',true)
 assert.throws(()=>sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision) VALUES(${quote(b.tenant)},${quote(account)},${quote(account)},'2026-10-01','2026-11-01','user_confirmed','{}',0);`),/budget_account_unavailable/);check('live-reference ownership trigger rejects cross-tenant evidence',true)
 assert.throws(()=>sql(`SELECT public.budget_validate_setup(${quote(a.tenant)},${quote(JSON.stringify({...payload,income_cents:.1}))}::jsonb);`),/budget_invalid_money/);check('SQL independently rejects fractional cents',true)
 const foreignCurrency=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(a.id)},${quote(a.tenant)},'Fictional USD','Liquid',0,'USD') RETURNING id;`).split('\n')[0]
 assert.throws(()=>sql(`SELECT public.budget_validate_setup(${quote(a.tenant)},${quote(JSON.stringify({...payload,account_ids:[foreignCurrency]}))}::jsonb);`),/budget_account_unavailable/);check('SQL rejects non-AUD selected accounts',true)
 sql(`DELETE FROM public.accounts WHERE id=${quote(foreignCurrency)};`)

 const revise={action:'revise',expected_method:'budget-foundation-v1',plan_id:plan,period_id:period,expected_source:source(a.tenant),expected_plan:'1',scope:'period-and-future',income_cents:600000,opening_drawdown_cents:0,accept_gap:false,lines:[{line_id:everyday,amount_cents:190000},{line_id:fixed,amount_cents:250000}]}
 assert.throws(()=>sqlCommand(a,randomUUID(),{...revise,lines:[{line_id:randomUUID(),amount_cents:1},{line_id:fixed,amount_cents:250000}]}),/budget_invalid_lines/);check('invalid line references cannot enter a revision',true)
 assert.throws(()=>sqlCommand(a,randomUUID(),{...revise,expected_method:'older-method'}),/budget_stale_method/);check('old calculation method cannot silently change a live plan',true)
 const raceId=randomUUID()
 const raced=await Promise.all([sqlAsync(commandSQL(a,raceId,revise)),sqlAsync(commandSQL(a,raceId,revise))])
 check('concurrent same-key writes commit one result',JSON.parse(raced[0]),JSON.parse(raced[1]))
 check('concurrent request has one durable operation',sql(`SELECT count(*) FROM public.budget_operations WHERE tenant_id=${quote(a.tenant)} AND request_id=${quote(raceId)};`),'1')
 const revised=JSON.parse(raced[0])
 const undone=sqlCommand(a,randomUUID(),{action:'undo',operation_id:revised.operation_id,expected_source:source(a.tenant)})
 check('undo appends a new version',undone.result.plan_version,'3')
 check('undo preserves original activated revision',sql(`SELECT (activated_revision_id<>current_revision_id)::text FROM public.budget_periods WHERE id=${quote(period)};`),'true')
 assert.throws(()=>sqlCommand(a,randomUUID(),{action:'undo',operation_id:revised.operation_id,expected_source:source(a.tenant)}),/budget_undo_conflict/);check('undo cannot be applied twice',true)
 const disabledId=randomUUID(),draftCommand={action:'save_draft',expected_source:source(a.tenant),expected_draft:'1',payload:{unfinished:'preserved'}}
 const d=sqlCommand(a,disabledId,draftCommand)
 check('disabled exposure still recovers committed result',sqlCommand(a,disabledId,draftCommand,false),d)
 assert.throws(()=>sqlCommand(a,randomUUID(),{...draftCommand,expected_draft:'2'},false),/budget_disabled/);check('disabled exposure blocks new writes',true)
 assert.throws(()=>sqlCommand({...a,id:b.id},randomUUID(),draftCommand),/budget_forbidden/);check('SQL rechecks verified owner independently of Edge',true)
 // Complete SQL actuals above the API response cap; source revision changes invalidate saved previews.
 const oldSource=source(a.tenant)
 sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,dedupe_hash)
  SELECT ${quote(a.id)},${quote(a.tenant)},${quote(account)},'2026-10-01'::date+(g%20),'Fictional M2 '||g,'M2','m2','Shopping',-101,'expense','user',decode(md5('m2-'||g),'hex') FROM generate_series(1,1500)g;`)
 check('bulk source mutation advances revision',BigInt(source(a.tenant))>BigInt(oldSource))
 const actual=JSON.parse(sql(`SELECT public.budget_query(${quote(a.tenant)},${quote(a.id)},'{"action":"snapshot"}');`))
 check('snapshot totals exceed detail cap without truncation',actual.actuals.net_expense_cents,151500)
 const stale={...revise,expected_plan:'3',expected_source:oldSource}
 assert.throws(()=>sqlCommand(a,randomUUID(),stale),/budget_stale_source/);check('stale source rejects revision',true)
 const vBefore=source(a.tenant)
 sql(`BEGIN; DELETE FROM public.transactions WHERE tenant_id=${quote(a.tenant)}; ROLLBACK;`)
 check('source rollback also rolls back invalidation',source(a.tenant),vBefore)
 // Inject a failure after the revision header and during allocation insertion.
 const failureBody={...revise,expected_plan:'3',expected_source:source(a.tenant),lines:[{line_id:fixed,amount_cents:250000},{line_id:everyday,amount_cents:777}]}
 const revisionsBefore=sql(`SELECT count(*) FROM public.budget_revisions WHERE plan_id=${quote(plan)};`)
 sql(`BEGIN; CREATE FUNCTION public.isolated_m2_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.amount_cents=777 THEN RAISE EXCEPTION 'isolated_second_leg_failure';END IF;RETURN NEW;END $$;
 CREATE TRIGGER isolated_m2_fail BEFORE INSERT ON public.budget_allocations FOR EACH ROW EXECUTE FUNCTION public.isolated_m2_fail();
 DO $proof$ BEGIN BEGIN PERFORM public.budget_command(${quote(a.tenant)},${quote(a.id)},${quote(randomUUID())},${quote(JSON.stringify(failureBody))}::jsonb,true);RAISE EXCEPTION 'expected injected failure';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'isolated_second_leg_failure' THEN RAISE;END IF;END;END $proof$;
 DROP TRIGGER isolated_m2_fail ON public.budget_allocations; DROP FUNCTION public.isolated_m2_fail(); COMMIT;`)
 check('failed allocation write rolls back revision header',sql(`SELECT count(*) FROM public.budget_revisions WHERE plan_id=${quote(plan)};`),revisionsBefore)
 check('failed write preserves current plan version',sql(`SELECT version FROM public.budget_plans WHERE id=${quote(plan)};`),'3')
 // Real classification/split RPCs and source deletion must invalidate; deletion must not be blocked by Budget.
 const tx=sql(`SELECT id FROM public.transactions WHERE tenant_id=${quote(a.tenant)} AND amount=-101 ORDER BY id LIMIT 1;`)
 const classBefore=source(a.tenant)
 sql(`SELECT public.edit_transaction_classification(${quote(a.tenant)},${quote(tx)},${quote(a.id)},'expense',false,false,NULL,false,false);`)
 check('real classification RPC invalidates Budget',BigInt(source(a.tenant))>BigInt(classBefore))
 const splitBefore=source(a.tenant)
 sql(`SELECT public.replace_transaction_allocations(${quote(a.tenant)},${quote(tx)},${quote(a.id)},'[ {"position":0,"amount":-70,"kind":"expense","category":"Shopping"},{"position":1,"amount":-31,"kind":"expense","category":"Shopping"} ]');`)
 check('real split RPC invalidates Budget',BigInt(source(a.tenant))>BigInt(splitBefore))
 const importBefore=source(a.tenant),batch=randomUUID()
 const importedRows=[{date:'2026-10-20',original_description:'Fictional M2 import',merchant:'M2 import',category:'Shopping',subcategory:null,amount:-200,category_source:'user',needs_review:false,dedupe_hash_hex:'1'.repeat(64),occurrence:0,transfer_candidate:false}]
 sql(`BEGIN; SELECT set_config('request.jwt.claim.sub',${quote(a.id)},true); SET LOCAL ROLE authenticated;
 SELECT public.import_transactions_atomic(${quote(a.tenant)},${quote(account)},${quote(JSON.stringify(importedRows))}::jsonb,${quote(batch)},NULL,'m2-fixture.csv',1,0); COMMIT;`)
 check('real CSV import transaction invalidates Budget',BigInt(source(a.tenant))>BigInt(importBefore))
 const undoImportBefore=source(a.tenant)
 sql(`BEGIN; SELECT set_config('request.jwt.claim.sub',${quote(a.id)},true); SET LOCAL ROLE authenticated;
 SELECT public.delete_upload_batch_atomic(${quote(a.tenant)},${quote(batch)},${quote(account)}); COMMIT;`)
 check('real CSV undo invalidates Budget without blocked deletion',BigInt(source(a.tenant))>BigInt(undoImportBefore))
 const decisionBefore=source(a.tenant)
 sql(`BEGIN; SELECT set_config('request.jwt.claim.sub',${quote(a.id)},true); SET LOCAL ROLE authenticated;
 SELECT public.decide_transfer_leg(${quote(a.tenant)},${quote(tx)},'rejected',NULL); COMMIT;`)
 check('real transfer decision invalidates Budget',BigInt(source(a.tenant))>BigInt(decisionBefore))
 const concurrentSource=source(a.tenant), concurrentBody={...revise,expected_plan:'3',expected_source:concurrentSource}
 const held=sqlAsync(`BEGIN; SET LOCAL application_name='budget-m2-source-race';SELECT public.budget_lock_source(${quote(a.tenant)});SELECT pg_sleep(2);${commandSQL(a,randomUUID(),concurrentBody)} COMMIT;`)
 await waitForSleep('budget-m2-source-race')
 const writer=sqlAsync(`SELECT public.edit_transaction_classification(${quote(a.tenant)},${quote(tx)},${quote(a.id)},'expense',false,false,NULL,false,true);`)
 await Promise.all([held,writer])
 check('real source row writer and Budget command complete without reversed-row-lock deadlock',true)
 check('post-wait read sees newly committed source version',JSON.parse(sql(`SELECT public.budget_query(${quote(a.tenant)},${quote(a.id)},'{"action":"snapshot"}');`)).source_revision,source(a.tenant))
 assert.throws(()=>sqlCommand(a,randomUUID(),{action:'undo',operation_id:revised.operation_id,expected_source:source(a.tenant)}),/budget_undo_conflict|budget_stale_source/);check('old undo cannot erase a dependent change',true)
 const conflictId=randomUUID(),conflictBody={...revise,expected_plan:'4',expected_source:source(a.tenant)}
 const conflicts=await Promise.allSettled([sqlAsync(commandSQL(a,conflictId,conflictBody)),sqlAsync(commandSQL(a,conflictId,{...conflictBody,income_cents:600001}))])
 check('same-key different-payload race has one winner',conflicts.filter(r=>r.status==='fulfilled').length,1)
 check('same-key race rejects different canonical payload',conflicts.some(r=>r.status==='rejected'&&String(r.reason).includes('budget_request_conflict')))
 const versionBody={...revise,expected_plan:'5',expected_source:source(a.tenant)}
 const versions=await Promise.allSettled([sqlAsync(commandSQL(a,randomUUID(),versionBody)),sqlAsync(commandSQL(a,randomUUID(),versionBody))])
 check('two tabs with same expected revision cannot both commit',versions.filter(r=>r.status==='fulfilled').length,1)
 check('losing tab gets stale-plan conflict',versions.some(r=>r.status==='rejected'&&String(r.reason).includes('budget_stale_plan')))
 assert.throws(()=>sql(`UPDATE public.budget_revisions SET income_cents=1 WHERE id=(SELECT current_revision_id FROM public.budget_periods WHERE id=${quote(period)});`),/budget_immutable_history/);check('history cannot be rewritten in place',true)
 assert.throws(()=>sql(`UPDATE public.budget_lines SET opening_cents=1 WHERE id=${quote(everyday)};`),/budget_immutable_history/);check('opening intent cannot be rewritten in place',true)
 assert.throws(()=>sql(`UPDATE public.budget_periods SET timezone='UTC' WHERE id=${quote(period)};`),/budget_immutable_history/);check('historical period timezone cannot be rewritten',true)
 assert.throws(()=>sql(`UPDATE public.budget_plans SET template_revision_id=(SELECT current_revision_id FROM public.budget_periods WHERE id=${quote(period)}) WHERE id=${quote(plan)};`),/budget_invalid_template/);check('period revision cannot masquerade as a future template',true)
 assert.throws(()=>sql(`INSERT INTO public.budget_periods(tenant_id,plan_id,start_date,end_date,timezone,frequency) VALUES(${quote(a.tenant)},${quote(plan)},'2026-10-01','2026-11-01','Australia/Sydney','monthly');`),/conflicting key|exclusion/);check('overlapping persisted periods are rejected',true)
 sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by)
 VALUES(${quote(a.tenant)},${quote(account)},${quote(account)},'2026-10-01','2026-11-01','user_confirmed','{}',${source(a.tenant)},${quote(a.id)});`)
 check('explicit complete coverage is recognized',JSON.parse(sql(`SELECT public.budget_query(${quote(a.tenant)},${quote(a.id)},'{"action":"snapshot"}');`)).coverage_complete,true)
 for(const [label,date,pending]of[['pending-charge removal','2026-10-10',true],['outside-range settled deletion','2026-09-10',false]]){
  const harmless=sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending)
   VALUES(${quote(a.id)},${quote(a.tenant)},${quote(account)},${quote(date)},'Fictional coverage probe','M2','m2','Shopping',-5,'expense','user',${pending}) RETURNING id;`).split('\n')[0]
  sql(`DELETE FROM public.transactions WHERE id=${quote(harmless)};`)
  check(`${label} does not revoke unrelated complete coverage`,sql(`SELECT count(*) FROM public.account_activity_coverage WHERE tenant_id=${quote(a.tenant)} AND revoked_at IS NULL;`),'1')
 }
 const provider=sql(`INSERT INTO public.provider_connections(tenant_id,user_id,provider) VALUES(${quote(a.tenant)},${quote(a.id)},'up') RETURNING id;`).split('\n')[0]
 const mapping=sql(`INSERT INTO public.account_connections(tenant_id,connection_id,account_id,provider,provider_account_id,cutover_date) VALUES(${quote(a.tenant)},${quote(provider)},${quote(account)},'up','fictional-provider-id','2026-11-01') RETURNING id;`).split('\n')[0]
 sql(`UPDATE public.account_connections SET last_synced_at=now() WHERE id=${quote(mapping)};`)
 check('routine sync timestamp does not revoke coverage',sql(`SELECT count(*) FROM public.account_activity_coverage WHERE tenant_id=${quote(a.tenant)} AND revoked_at IS NULL;`),'1')
 sql(`UPDATE public.account_connections SET cutover_date='2026-10-15' WHERE id=${quote(mapping)};`)
 check('provider history remapping revokes old proof',sql(`SELECT count(*) FROM public.account_activity_coverage WHERE tenant_id=${quote(a.tenant)} AND revoked_reason='account_mapping_changed';`),'1')
 // A new explicit confirmation is a new evidence row, never erasure of the revoked proof.
 sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by)
 VALUES(${quote(a.tenant)},${quote(account)},${quote(account)},'2026-10-01','2026-11-01','user_confirmed','{"reconfirmed":true}',${source(a.tenant)},${quote(a.id)});`)
 // B's earlier forbidden lookup rolled its lazy gate creation back. Establish a successful
 // read first, so this test actually covers two existing tenant source snapshots.
 sql(`SELECT public.budget_query(${quote(b.tenant)},${quote(b.id)},'{"action":"draft"}');`)
 const globalBefore=source(b.tenant)
 sql("UPDATE public.taxonomy_categories SET active=active WHERE id='shopping';")
 check('global taxonomy edits invalidate each existing tenant gate',BigInt(source(b.tenant))>BigInt(globalBefore))
 const deleteBefore=source(a.tenant)
 sql(`DELETE FROM public.transactions WHERE id=${quote(tx)};`)
 check('source delete invalidates even though row disappears',BigInt(source(a.tenant))>BigInt(deleteBefore))
 check('source delete revokes dependent coverage without erasing prior proof',sql(`SELECT count(*) FROM public.account_activity_coverage WHERE tenant_id=${quote(a.tenant)} AND revoked_at IS NOT NULL;`),'2')
 sql(`DELETE FROM public.accounts WHERE id=${quote(account)};`)
 check('account deletion preserves audited scope identity',sql(`SELECT count(*) FROM public.budget_account_memberships WHERE plan_id=${quote(plan)} AND account_id IS NULL AND original_account_id=${quote(account)};`),'1')
 check('missing account yields unknown actuals, not false zero',JSON.parse(sql(`SELECT public.budget_query(${quote(a.tenant)},${quote(a.id)},'{"action":"snapshot"}');`)).actuals,null)
 const draftUndo=sqlCommand(a,randomUUID(),{action:'undo',operation_id:d.operation_id,expected_source:source(a.tenant)})
 check('draft undo appends a new saved revision',draftUndo.result.draft_version,'3')
 check('draft undo restores original user input, not an empty reset',JSON.parse(sql(`SELECT public.budget_query(${quote(a.tenant)},${quote(a.id)},'{"action":"draft"}');`)).draft,payload)
 // A second owner's fortnightly activation races a real account deletion.
 const bAccount=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(b.id)},${quote(b.tenant)},'Fictional fortnight','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const bPayload={...payload,frequency:'fortnightly',anchor:'2026-10-01',income_cents:0,account_ids:[bAccount],lines:[{id:randomUUID(),kind:'everyday',name:'Everyday',allocation_cents:1,opening_cents:0}]}
 sqlCommand(b,randomUUID(),{action:'save_draft',expected_method:'older-method',expected_draft:'0',expected_source:source(b.tenant),payload:bPayload})
 check('outdated-method draft preserves edits but is labelled stale',JSON.parse(sql(`SELECT public.budget_query(${quote(b.tenant)},${quote(b.id)},'{"action":"draft"}');`)).stale,true)
 assert.throws(()=>sqlCommand(b,randomUUID(),{action:'activate',expected_source:source(b.tenant),expected_draft:'1',accept_gap:true}),/budget_stale_method/);check('stale-method draft cannot activate without review',true)
 sqlCommand(b,randomUUID(),{action:'save_draft',expected_draft:'1',expected_source:source(b.tenant),payload:bPayload})
 assert.throws(()=>sqlCommand(b,randomUUID(),{action:'activate',expected_source:source(b.tenant),expected_draft:'2',accept_gap:false}),/budget_gap_confirmation_required/);check('funding gap needs explicit acceptance',true)
 const bActivation={action:'activate',expected_source:source(b.tenant),expected_draft:'2',accept_gap:true}
 const bHold=sqlAsync(`BEGIN;SET LOCAL application_name='budget-m2-account-race';SELECT public.budget_lock_source(${quote(b.tenant)});SELECT pg_sleep(2);${commandSQL(b,randomUUID(),bActivation)}COMMIT;`)
 await waitForSleep('budget-m2-account-race')
 await Promise.all([bHold,sqlAsync(`DELETE FROM public.accounts WHERE id=${quote(bAccount)};`)])
 const bSnapshot=JSON.parse(sql(`SELECT public.budget_query(${quote(b.tenant)},${quote(b.id)},'{"action":"snapshot"}');`))
 check('fortnightly activation stores real anchor-aligned boundaries',[bSnapshot.period.start_date,bSnapshot.period.end_date],['2026-10-15','2026-10-29'])
 check('concurrent account deletion does not deadlock activation or pretend cash exists',bSnapshot.actuals,null)
 check('archived live reference retains its original identity',sql(`SELECT count(*) FROM public.budget_account_memberships WHERE original_account_id=${quote(bAccount)} AND account_id IS NULL;`),'1')
 const bActivationOp=sql(`SELECT id FROM public.budget_operations WHERE tenant_id=${quote(b.tenant)} AND action='activate';`)
 assert.throws(()=>sqlCommand(b,randomUUID(),{action:'undo',operation_id:bActivationOp,expected_source:source(b.tenant)}),/budget_stale_source/);check('source-dependent undo rejects later source changes',true)
 const noBank={...payload,income_cents:0,account_ids:[],lines:[{id:randomUUID(),kind:'everyday',name:'Everyday',allocation_cents:0,opening_cents:0}]}
 sqlCommand(member,randomUUID(),{action:'save_draft',expected_draft:'0',expected_source:source(member.tenant),payload:noBank})
 const noBankActivation=sqlCommand(member,randomUUID(),{action:'activate',expected_source:source(member.tenant),expected_draft:'1',accept_gap:false})
 check('manual zero-income no-bank setup activates',noBankActivation.result.unallocated_cents,0)
 const noBankUndo=sqlCommand(member,randomUUID(),{action:'undo',operation_id:noBankActivation.operation_id,expected_source:source(member.tenant)})
 check('activation undo archives instead of deleting history',noBankUndo.result.state,'archived')
 check('activation undo retains period and template revisions',sql(`SELECT count(*) FROM public.budget_revisions WHERE plan_id=${quote(noBankActivation.result.plan_id)};`),'2')
 const cashLine=randomUUID(),cashPayload={...noBank,opening_drawdown_cents:100,lines:[{id:cashLine,kind:'everyday',name:'Everyday',allocation_cents:100,opening_cents:0}]}
 sqlCommand(viewer,randomUUID(),{action:'save_draft',expected_draft:'0',expected_source:source(viewer.tenant),payload:cashPayload})
 assert.throws(()=>sqlCommand(viewer,randomUUID(),{action:'activate',expected_draft:'1',expected_source:source(viewer.tenant),accept_gap:false}),/budget_gap_confirmation_required/);check('one-off cash cannot silently fund an unfunded future template',true)
 const cashActivation=sqlCommand(viewer,randomUUID(),{action:'activate',expected_draft:'1',expected_source:source(viewer.tenant),accept_gap:true})
 check('current and continuing funding gaps remain separate',[cashActivation.result.unallocated_cents,cashActivation.result.future_unallocated_cents],[0,-100])
 const cashSnapshot=JSON.parse(sql(`SELECT public.budget_query(${quote(viewer.tenant)},${quote(viewer.id)},'{"action":"snapshot"}');`))
 check('one-off opening drawdown is not repeated in future resources',[cashSnapshot.revision.drawdown_cents,cashSnapshot.future_template.opening_drawdown_cents],[100,0])
 sqlCommand(viewer,randomUUID(),{action:'revise',plan_id:cashActivation.result.plan_id,period_id:cashActivation.result.period_id,expected_plan:'1',expected_source:source(viewer.tenant),scope:'period-and-future',income_cents:200,opening_drawdown_cents:100,accept_gap:false,lines:[{line_id:cashLine,amount_cents:100}]})
 check('future-scope revision also excludes one-off cash',JSON.parse(sql(`SELECT public.budget_query(${quote(viewer.tenant)},${quote(viewer.id)},'{"action":"snapshot"}');`)).future_template.opening_drawdown_cents,0)
 check('all Budget tables deny anonymous reads and authenticated writes',sql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (left(c.relname,7)='budget_' OR c.relname='account_activity_coverage') AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'INSERT') OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE'));`),'0')
 check('all Budget SQL helpers are service-only',sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,7)='budget_' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'));"),'0')
 if(process.argv.includes('--items')) {
  const {runBudgetItemChecks}=await import('./test-budget-items.mjs')
  await runBudgetItemChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL})
 }
 if(process.argv.includes('--lifecycle')) {
  const {runBudgetLifecycleChecks}=await import('./test-budget-lifecycle.mjs')
  await runBudgetLifecycleChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL})
 }
 if(process.argv.includes('--workspace')) {
  const {runBudgetWorkspaceChecks}=await import('./test-budget-workspace.mjs')
  await runBudgetWorkspaceChecks({repo,api,anon,newUser,sql,quote,check,edge,temporalFixtures})
 }
 // Roll back exposure at the real Edge layer without hiding committed outcomes.
 await stopFunctions()
 const runtime=`supabase_edge_runtime_${project}`
 const runtimeIds=run('docker',['ps','-aq','--filter',`name=^${runtime}$`]).split(/\s+/).filter(Boolean)
 for(const id of runtimeIds){const info=JSON.parse(run('docker',['inspect',id]))[0];assert.equal(info.Config.Labels['com.supabase.cli.project'],project);run('docker',['rm','-f',id])}
 writeFileSync(resolve(work,'budget.env'),'BUDGET_V1_ENABLED=false\nALLOWED_ORIGINS=http://127.0.0.1:57300\n')
 await startFunctions()
 check('disabled Edge still returns original commit receipt',(await edge(a,'manage-budget',savedBody)).body,saved.body)
 check('disabled Edge rejects new writes',(await edge(a,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(a.tenant),expected_draft:'2',payload:{}})).status,503)
 check('disabled Edge preserves authenticated plan reads',(await edge(a,'query-budget',{action:'snapshot'})).status,200)
 if(process.argv.includes('--workspace'))check('disabled workspace reads expose paused writes',(await edge(a,'query-budget',{action:'workspace'})).body.write_enabled,false)
 check('disabled Edge exposes durable outcome lookup',(await edge(a,'query-budget',{action:'operation',request_id:savedBody.request_id})).body.outcome,saved.body)
 }else if(process.argv.includes('--workspace')){
  const {runBudgetWorkspaceChecks}=await import('./test-budget-workspace.mjs')
  await runBudgetWorkspaceChecks({repo,api,anon,newUser,sql,quote,check,edge,attentionOnly:process.argv.includes('--attention-only'),temporalOnly:process.argv.includes('--temporal-only'),temporalFixtures,historyFixture})
 }
 // Auth/tenant deletion cascades must not resurrect source gates or fail on immutable history.
 for(const u of users)sql(`DELETE FROM auth.users WHERE id=${quote(u.id)};`)
 for(const tenant of new Set(users.map(u=>u.tenant)))sql(`DELETE FROM public.tenants WHERE id=${quote(tenant)};`)
 check('only created fixture identities removed',sql('SELECT count(*) FROM auth.users;'),'0')
 check('fixture accounts and transactions removed',JSON.parse(sql('SELECT json_build_array((SELECT count(*) FROM public.accounts),(SELECT count(*) FROM public.transactions));')),[0,0])
 check('tenant cascades leave no Budget plans or source gates',sql('SELECT (SELECT count(*) FROM public.budget_plans)+(SELECT count(*) FROM public.budget_source_versions);'),'0')
 console.log(`${checks} durable-boundary integration checks passed.`)
}finally{
 await stopFunctions()
 if(attempted)for(const kind of ['container','volume','network']){
  const listing=kind==='container'?['ps','-aq']:kind==='volume'?['volume','ls','-q']:['network','ls','-q']
  const ids=run('docker',[...listing,'--filter',`label=com.supabase.cli.project=${project}`]).split(/\s+/).filter(Boolean)
  for(const id of ids){const obj=JSON.parse(run('docker',[...(kind==='container'?['inspect']: [kind,'inspect']),id]))[0];assert.equal(kind==='container'?obj.Config.Labels['com.supabase.cli.project']:obj.Labels['com.supabase.cli.project'],project);run('docker',kind==='container'?['rm','-f',id]:[kind,'rm',id])}
 }
 rmSync(work,{recursive:true,force:true})
 console.log(`Removed only disposable resources for ${project}; no personal stack cleanup.`)
}
