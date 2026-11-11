import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {chmodSync,cpSync,mkdirSync,readdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

/** No arbitrary target: called only after the guarded provisioner verifies its new empty stack. */
export async function runBudgetRecoveryChecks(c){
 const {repo,work,project,container,cli,api,anon,newUser,sql,quote:q,check,edge,source,startFunctions,stopFunctions,run}=c
 assert.match(project,/^halcyon-budget-m2-[0-9a-f]{16}$/)
 assert.equal(api,'http://127.0.0.1:57521')
 const inspect=id=>JSON.parse(run('docker',['inspect',id]))[0]
 const own=id=>{const info=inspect(id);assert.equal(info.Config.Labels['com.supabase.cli.project'],project);return info}
 own(container)
 const backupDir=resolve(repo,'backups/budget-m7',project),evidenceDir=resolve(repo,'docs/budget-m7/recovery',project)
 mkdirSync(backupDir,{recursive:true,mode:0o700});chmodSync(backupDir,0o700)
 mkdirSync(evidenceDir,{recursive:true})
 const report={project,api,database:'postgres',started_at:new Date().toISOString(),scope:'Isolated local platform; separate recovery databases; no personal/hosted migration',backups:[],restores:[]}
 function binary(args,input,logName){
  const r=spawnSync('docker',args,{input,timeout:120000,maxBuffer:96*1024*1024})
  if(r.status!==0){const path=resolve(backupDir,logName);writeFileSync(path,r.stderr??String(r.error),{mode:0o600});throw new Error(`Private recovery diagnostic: ${path}`)}
  return r.stdout
 }
 function dbSQL(db,query){
  assert(db==='postgres'||restoreDBs.has(db),'Only source or captured recovery database accepted')
  return run('docker',['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',db],query)
 }
 const restoreDBs=new Set(),clones=[]
 const parse=out=>JSON.parse(out.split('\n').findLast(line=>line.startsWith('{')||line.startsWith('[')))
 // Canonical row hashes are computed by SQL, including empty tables; no row contents leave Postgres.
 const manifestSQL=`DO $manifest$ DECLARE t record; n bigint; h text; result jsonb:='{}'; BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('auth','public','private') AND c.relkind IN ('r','p') ORDER BY 1,2 LOOP
 EXECUTE format('SELECT count(*),encode(extensions.digest(coalesce(string_agg(to_jsonb(x)::text,E''\\n'' ORDER BY to_jsonb(x)::text),''''),''sha256''),''hex'') FROM %I.%I x',t.nspname,t.relname) INTO n,h;
 result:=result||jsonb_build_object(t.nspname||'.'||t.relname,jsonb_build_object('count',n,'sha256',h)); END LOOP;
 PERFORM set_config('budget_recovery.manifest',result::text,false); END $manifest$; SELECT current_setting('budget_recovery.manifest');`
 const manifest=(db='postgres')=>parse(dbSQL(db,manifestSQL))
 const sequences=(db='postgres')=>parse(dbSQL(db,"SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.schemaname,s.sequencename),'[]'::jsonb) FROM pg_sequences s WHERE schemaname IN ('auth','public','private');"))
 const totalsSQL=`SELECT jsonb_build_object('accounts',(SELECT jsonb_agg(x ORDER BY x.id) FROM (SELECT id,tenant_id,balance,currency FROM public.accounts) x),
 'ledger',(SELECT jsonb_agg(x ORDER BY x.tenant_id,x.account_id) FROM (SELECT tenant_id,account_id,count(*) AS rows,sum(amount) AS signed_cents FROM public.transactions GROUP BY 1,2) x),
 'analytics',(SELECT jsonb_agg(x ORDER BY x.tenant_id,x.kind) FROM (SELECT tenant_id,kind,count(*) AS rows,sum(amount) AS signed_cents FROM public.transactions_analytic GROUP BY 1,2) x));`
 const totals=(db='postgres')=>parse(dbSQL(db,totalsSQL))
 const constraintsSQL=`SELECT jsonb_build_object('invalid_constraints',(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','private') AND NOT c.convalidated),
 'public_without_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity),
 'unsafe_public_views',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v' AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'],false)),
 'direct_budget_command',has_function_privilege('authenticated','public.budget_command(uuid,uuid,uuid,jsonb,boolean)','EXECUTE'));
 `
 const auth=`supabase_auth_${project}`;own(auth)
 const authInfo=inspect(auth)
 const authEnvironment=authInfo.Config.Env.map(value=>[value.slice(0,value.indexOf('=')),value.slice(value.indexOf('=')+1)])
 const network=Object.keys(authInfo.NetworkSettings.Networks)[0]
 const netInfo=JSON.parse(run('docker',['network','inspect',network]))[0]
 assert.equal(netInfo.Labels['com.supabase.cli.project'],project)
 async function login(url,user){
  const response=await fetch(`${url}/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify(user.recoveryCredentials)})
  const data=await response.json();check('original credentials authenticate original user ID',[response.status,data.user?.id],[200,user.id]);return data
 }
 async function exposure(enabled){
  await stopFunctions()
  const runtime=`supabase_edge_runtime_${project}`
  for(const id of run('docker',['ps','-aq','--filter',`name=^${runtime}$`]).split(/\s+/).filter(Boolean)){own(id);run('docker',['rm','-f',id])}
  writeFileSync(resolve(work,'budget.env'),`BUDGET_V1_ENABLED=${enabled}\nBUDGET_TEST_SHARED_ACCESS=true\nALLOWED_ORIGINS=http://127.0.0.1:57300\n`,{mode:0o600})
  await startFunctions()
 }
 function archive(label){
  own(container)
  const path=resolve(backupDir,`${label}.dump`)
  assert.equal(run('git',['check-ignore',path]),path,'Raw backup must be ignored before it is written')
  const bytes=binary(['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--format=custom'],undefined,`${label}-dump-error.log`)
  writeFileSync(path,bytes,{mode:0o600});chmodSync(path,0o600)
  const catalog=binary(['exec','-i',container,'pg_restore','--list'],bytes,`${label}-catalog-error.log`).toString()
  writeFileSync(resolve(backupDir,`${label}-catalog.txt`),catalog,{mode:0o600})
  for(const table of ['auth users','public profiles','public tenants','public accounts','public transactions','public budgets'])check(`${label} catalog contains ${table}`,catalog.includes(`TABLE DATA ${table} `))
  const value={label,path: path.slice(repo.length+1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),catalog_entries:catalog.split('\n').filter(line=>/^\d+;/.test(line)).length}
  report.backups.push(value);return {bytes,value}
 }
 async function restore(label,backup,expected,expectedTotals,expectedSequences,people){
  const db=`budget_m7_restore_${randomUUID().replaceAll('-','').slice(0,12)}`
  assert.match(db,/^budget_m7_restore_[0-9a-f]{12}$/)
  check('recovery database name is new',sql(`SELECT count(*) FROM pg_database WHERE datname=${q(db)};`),'0')
  own(container);run('docker',['exec',container,'createdb','-U','supabase_admin','--template=template0',db]);restoreDBs.add(db)
  check('recovery database has no auth or application tables',dbSQL(db,"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('auth','public','private') AND c.relkind IN ('r','p');"),'0')
  // No --create and never a restore over source postgres. Strict, atomic restore into a captured new database.
  binary(['exec','-i',container,'pg_restore','-U','supabase_admin','-d',db,'--exit-on-error','--single-transaction'],backup.bytes,`${label}-restore-error.log`)
  const actual=manifest(db)
  check(`${label} restored every auth/application table count and canonical row digest`,actual,expected)
  check(`${label} restored exact ledger/account/income/expense aggregates`,totals(db),expectedTotals)
  check(`${label} restored sequence definitions and positions`,sequences(db),expectedSequences)
  for(const person of people){
   check(`${label} original profile/default tenant recovered`,dbSQL(db,`SELECT default_tenant_id FROM public.profiles WHERE id=${q(person.id)};`),person.tenant)
   check(`${label} owner membership recovered`,dbSQL(db,`SELECT role FROM public.tenant_members WHERE user_id=${q(person.id)} AND tenant_id=${q(person.tenant)};`),'owner')
   const rls=parse(dbSQL(db,`BEGIN; SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',${q(person.id)},true);SELECT set_config('request.jwt.claims',${q(JSON.stringify({sub:person.id,role:'authenticated'}))},true);SELECT json_build_array((SELECT count(*) FROM public.accounts),(SELECT count(*) FROM public.accounts WHERE tenant_id<>${q(person.tenant)}));ROLLBACK;`))
   check(`${label} recovered account RLS exposes own account only`,rls,[1,0])
  }
  if(label==='after-budget')check('restored constraints, RLS, view security and command grants',parse(dbSQL(db,constraintsSQL)),{invalid_constraints:0,public_without_rls:0,unsafe_public_views:0,direct_budget_command:false})
  // Use the existing isolated platform image/config, point GoTrue at the separate recovery DB only.
  const port=57531+clones.length,name=`supabase_auth_recovery_${project}_${clones.length}`
  const env=new Map(authEnvironment),databaseURL=new URL(env.get('GOTRUE_DB_DATABASE_URL'));databaseURL.pathname=`/${db}`
  env.set('GOTRUE_DB_DATABASE_URL',databaseURL.toString());env.set('GOTRUE_API_PORT','9999');env.set('GOTRUE_API_HOST','0.0.0.0')
  const envPath=resolve(work,`${label}-auth.env`);writeFileSync(envPath,[...env].map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600})
  run('docker',['run','-d','--name',name,'--label',`com.supabase.cli.project=${project}`,'--network',network,'--env-file',envPath,'-p',`127.0.0.1:${port}:9999`,authInfo.Config.Image]);clones.push(name);own(name)
  let healthy=false
  for(let n=0;n<60;n++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
  check(`${label} recovery Auth starts on its separate database`,healthy)
  for(const person of people)await login(`http://127.0.0.1:${port}`,person)
  check(`${label} real recovery login preserves financial aggregates`,totals(db),expectedTotals)
  run('docker',['rm','-f',name]);clones.pop()
  report.restores.push({label,database:db,tables_compared:Object.keys(expected).length,table_parity:true,aggregate_parity:true,original_password_login:true,tenant_rls:true})
  return db
 }
 try{
  check('legacy baseline has no new Budget plans',sql("SELECT to_regclass('public.budget_plans') IS NULL;"),'t')
  const a=await newUser(),b=await newUser(),people=[a,b],accountIDs=[]
  const start=sql("SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '1 month')::date;")
  report.fixture_start=start
  for(const u of people){
   const account=randomUUID();accountIDs.push(account)
   sql(`INSERT INTO public.accounts(id,user_id,tenant_id,name,type,balance,currency) VALUES(${q(account)},${q(u.id)},${q(u.tenant)},'Recovery fictional cash','Liquid',123456,'AUD');
    INSERT INTO public.budgets(user_id,tenant_id,category,amount_limit) VALUES(${q(u.id)},${q(u.tenant)},'Shopping',120000);
    INSERT INTO public.merchant_rules(tenant_id,merchant_key,merchant_display,category,source) VALUES(${q(u.tenant)},'recovery-shop','Recovery shop','Shopping','user');
    INSERT INTO public.audit_log(actor_id,tenant_id,action,metadata) VALUES(${q(u.id)},${q(u.tenant)},'recovery.fixture_pre_budget','{"fictional":true}');`)
   for(const [kind,amount,category]of [['income',600000,'Income'],['expense',-12000,'Shopping'],['refund',1500,'Shopping'],['transfer',-20000,'Transfer']]){
    sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,category_source,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash) VALUES(${q(u.id)},${q(u.tenant)},${q(account)},${q(start)}::date+4,'Recovery fixture','Recovery shop','recovery-shop',${q(category)},'user',${amount},${q(kind)},'user',false,false,decode(md5(${q(randomUUID())}),'hex'));`)
   }
   const expense=sql(`SELECT id FROM public.transactions WHERE tenant_id=${q(u.tenant)} AND kind='expense';`)
   sql(`INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,category_id,note) VALUES(${q(u.tenant)},${q(expense)},0,-7000,'expense','Shopping','shopping','Fictional manual split'),(${q(u.tenant)},${q(expense)},1,-5000,'expense','Shopping','shopping','Fictional second split');`)
  }
  check('nonzero legacy preservation fixture',[sql('SELECT count(*) FROM auth.users;'),sql('SELECT count(*) FROM public.budgets;'),sql('SELECT count(*) FROM public.transaction_allocations;')],['2','2','4'])
  own(auth);run('docker',['stop',auth])
  const before=manifest(),beforeTotals=totals(),beforeSequences=sequences(),pre=archive('before-budget')
  report.legacy_manifest=before;report.legacy_totals=beforeTotals;report.legacy_sequences=beforeSequences
  console.log('Recovery: secured pre-migration archive; applying forward-only migrations to populated disposable target.')
  cpSync(resolve(repo,'supabase/migrations'),resolve(work,'supabase/migrations'),{recursive:true})
  run(cli,['migration','up','--local','--workdir',work],undefined,120000)
  check('populated target reaches all repository migrations',Number(sql('SELECT count(*) FROM supabase_migrations.schema_migrations;')),readdirSync(resolve(repo,'supabase/migrations')).filter(n=>n.endsWith('.sql')).length)
  const migrated=manifest()
  for(const [table,value]of Object.entries(before))check(`additive migration preserves ${table}`,migrated[table],value)
  check('additive migration preserves exact financial aggregates',totals(),beforeTotals)
  check('legacy budgets do not invent plans or reserves',sql('SELECT (SELECT count(*) FROM public.budget_plans)+(SELECT count(*) FROM public.budget_periods);'),'0')
  check('migrated constraints, RLS, view security and command grants',parse(dbSQL('postgres',constraintsSQL)),{invalid_constraints:0,public_without_rls:0,unsafe_public_views:0,direct_budget_command:false})
  run('docker',['start',auth]);await new Promise(r=>setTimeout(r,1000))
  for(const u of people){const session=await login(`${api}/auth/v1`,u);u.token=session.access_token}
  await exposure(false)
  check('initial disabled exposure rejects new Budget writes',(await edge(a,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(a.tenant),expected_draft:'0',payload:{}})).status,503)
  await exposure(true)
  const payload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[accountIDs[0]],destination_account_ids:[],income_cents:600000,opening_drawdown_cents:0,lines:[{id:randomUUID(),kind:'everyday',name:'Everyday spending',allocation_cents:180000,opening_cents:0},{id:randomUUID(),kind:'reserve',name:'Bike fund',allocation_cents:10000,opening_cents:30000}]}
  const savedBody={action:'save_draft',request_id:randomUUID(),expected_source:source(a.tenant),expected_draft:'0',payload},saved=await edge(a,'manage-budget',savedBody)
  check('authenticated owner saves post-migration Budget draft',saved.status,200)
  const activationBody={action:'activate',request_id:randomUUID(),expected_source:source(a.tenant),expected_draft:saved.body.result.draft_version,accept_gap:false}
  const activated=await edge(a,'manage-budget',activationBody);check('authenticated owner activates plan',activated.status,200)
  const snap=()=>edge(a,'query-budget',{action:'snapshot'})
  async function command(body){const state=(await snap()).body;const response=await edge(a,'manage-budget',{request_id:randomUUID(),expected_source:source(a.tenant),expected_plan:state.plan.version,plan_id:state.plan.id,period_id:state.period.id,...body});check(`authenticated recovery fixture ${body.action}`,response.status,200);return response}
  await command({action:'save_item',line_id:payload.lines[1].id,item:{type:'goal',name:'Bike fund',amount_cents:10000,target_cents:150000,estimated:true,due_date:null,cadence:'monthly',anchor:start,state:'saving',recurring_id:null,planning_goal_id:null},opening_cents:0,opening_date:start,accept_gap:false})
  await command({action:'release_reserve',from_line_id:payload.lines[1].id,to_line_id:payload.lines[0].id,amount_cents:1000})
  await command({action:'save_review',carry_mode:'carry',accept_incomplete:true})
  await command({action:'open_next_period',income_cents:600000,lines:payload.lines.map(line=>({line_id:line.id,amount_cents:line.allocation_cents})),accept_gap:false})
  check('recovery fixture contains immutable review, reserve events and multiple periods',parse(sql("SELECT json_build_array((SELECT count(*)>0 FROM public.budget_period_reviews),(SELECT count(*)>0 FROM public.budget_reserve_moves),(SELECT count(*)>1 FROM public.budget_periods));")),[true,true,true])
  const otherPayload={...payload,account_ids:[accountIDs[1]],income_cents:500000}
  const draft=await edge(b,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(b.tenant),expected_draft:'0',payload:otherPayload});check('second owner saves unactivated draft',draft.status,200)
  const draft2=await edge(b,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(b.tenant),expected_draft:draft.body.result.draft_version,payload:{...otherPayload,income_cents:510000}});check('edited draft has a second durable revision',draft2.status,200)
  const workspace=await edge(a,'query-budget',{action:'workspace'});check('post-migration workspace is readable',workspace.status,200)
  check('foreign owner cannot read original plan',(await edge(b,'query-budget',{action:'snapshot',plan_id:activated.body.result.plan_id})).status,404)
  await stopFunctions();own(auth);run('docker',['stop',auth])
  const after=manifest(),afterTotals=totals(),afterSequences=sequences(),post=archive('after-budget')
  report.budget_manifest=after;report.budget_totals=afterTotals;report.budget_sequences=afterSequences
  const preDB=await restore('before-budget',pre,before,beforeTotals,beforeSequences,people)
  check('pre-Budget restore has legacy model and no invented Budget model',dbSQL(preDB,"SELECT to_regclass('public.budgets') IS NOT NULL AND to_regclass('public.budget_plans') IS NULL;"),'t')
  const postDB=await restore('after-budget',post,after,afterTotals,afterSequences,people)
  check('recovered committed outcome equals exact original receipt',parse(dbSQL(postDB,`SELECT public.budget_query(${q(a.tenant)},${q(a.id)},${q(JSON.stringify({action:'operation',request_id:activationBody.request_id}))}::jsonb);`)).outcome,activated.body)
  check('recovered edited draft equals original saved input',parse(dbSQL(postDB,`SELECT public.budget_query(${q(b.tenant)},${q(b.id)},'{"action":"draft"}'::jsonb);`)).draft,{...otherPayload,income_cents:510000})
  check('separate recovery databases did not mutate source tables',manifest(),after)
  // Legitimate audit/rate-limit/derived read writes are kept separate from authoritative financial preservation.
  const authoritative=m=>Object.fromEntries(Object.entries(m).filter(([table])=>table.startsWith('public.')&&!['public.audit_log','public.rate_limit_buckets'].includes(table)))
  const preserved=authoritative(manifest())
  run('docker',['start',auth]);await new Promise(r=>setTimeout(r,1000));await exposure(false)
  check('disabled exposure rejects fresh owner writes',(await edge(a,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(a.tenant),expected_draft:'1',payload:{}})).status,503)
  check('disabled exposure preserves exact committed retry',(await edge(a,'manage-budget',activationBody)).body,activated.body)
  check('disabled exposure preserves durable outcome lookup',(await edge(a,'query-budget',{action:'operation',request_id:activationBody.request_id})).body.outcome,activated.body)
  check('disabled exposure preserves snapshot reads',(await edge(a,'query-budget',{action:'snapshot'})).status,200)
  const paused=await edge(a,'query-budget',{action:'workspace'});check('disabled exposure advertises writes paused',[paused.status,paused.body.write_enabled],[200,false])
  check('disabled exposure retains edited owner draft',(await edge(b,'query-budget',{action:'draft'})).body.draft,{...otherPayload,income_cents:510000})
  check('disable preserves all authoritative application row counts and hashes',authoritative(manifest()),preserved)
  check('disable preserves ledger/account/analytics cents',totals(),afterTotals)
  await exposure(true)
  check('reenabled reads work',(await edge(a,'query-budget',{action:'workspace'})).status,200)
  check('reenabling retains idempotent original receipt',(await edge(a,'manage-budget',activationBody)).body,activated.body)
  check('reenabling does not duplicate financial operations',authoritative(manifest()),preserved)
  report.disable_preservation=true;report.reenable_preservation=true;report.completed_at=new Date().toISOString()
  report.migration_count=Number(sql('SELECT count(*) FROM supabase_migrations.schema_migrations;'))
  writeFileSync(resolve(evidenceDir,'verification.json'),JSON.stringify(report,null,2)+'\n')
  console.log(`Recovery evidence: ${evidenceDir}; private archives: ${backupDir}`)
 }finally{
  for(const name of clones){own(name);run('docker',['rm','-f',name])}
 }
}
