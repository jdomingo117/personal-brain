import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

/** Final security/telemetry checks run only inside the guarded candidate stack. */
export async function runBudgetSecurityChecks({repo,project,container,api,anon,newUser,sql,quote:q,check,edge,source,run}){
 assert(process.argv.includes('--release-candidate')&&['http://127.0.0.1:57521','http://127.0.0.1:57721'].includes(api))
 const info=JSON.parse(run('docker',['inspect',container]))[0];assert.equal(info.Config.Labels['com.supabase.cli.project'],project)
 const out=resolve(repo,'docs/budget-m7/candidate',project);mkdirSync(out,{recursive:true})
 const inventory=JSON.parse(sql(`SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'anonymous_access',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND starts_with(c.relname,'budget_')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definer',p.prosecdef,'config',p.proconfig,'anonymous_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND starts_with(p.proname,'budget_')),
 'private_analytics',(SELECT jsonb_build_object('invoker',coalesce(c.reloptions @> ARRAY['security_invoker=true'],false),'anonymous_read',has_table_privilege('anon',c.oid,'SELECT'),'authenticated_read',has_table_privilege('authenticated',c.oid,'SELECT')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='budget_transactions_analytic'));
 `))
 check('all Budget tables retain RLS with no anonymous access or client writes',inventory.tables.filter(t=>!t.rls||t.anonymous_access||t.authenticated_write),[])
 check('all Budget functions deny anonymous and authenticated direct execution',inventory.functions.filter(f=>f.anonymous_execute||f.authenticated_execute),[])
 check('Budget definer functions pin their search path',inventory.functions.filter(f=>f.definer&&!f.config?.some(c=>c.startsWith('search_path='))),[])
 check('private Budget analytics is invoker-secure and inaccessible to clients',inventory.private_analytics,{invoker:true,anonymous_read:false,authenticated_read:false})
 const owner=await newUser(),foreign=await newUser(),limiter=await newUser(),canary=`M77_PRIVATE_${randomUUID()}`
 async function raw(fn,body,headers={},method='POST',authenticated=true){
  const response=await fetch(`${api}/functions/v1/${fn}`,{method,headers:{apikey:anon,...(authenticated?{Authorization:`Bearer ${owner.token}`} : {}),...(method==='POST'?{'Content-Type':'application/json'}:{}),...headers},...(method==='POST'?{body}: {})})
  return {status:response.status,body:await response.json(),headers:response.headers}
 }
 check('candidate rejects unauthenticated reads',(await raw('query-budget','{"action":"snapshot"}',{},'POST',false)).status,401)
 check('candidate rejects forged JWT',(await raw('query-budget','{"action":"snapshot"}',{Authorization:'Bearer invalid-token'})).status,401)
 check('candidate rejects foreign browser origin',(await raw('query-budget','{"action":"snapshot"}',{Origin:'https://untrusted.invalid'})).status,403)
 check('candidate rejects non-POST reads',(await raw('query-budget',null,{},'GET')).status,405)
 check('candidate rejects malformed JSON',(await raw('query-budget','{')).status,400)
 check('candidate rejects oversized request body',(await raw('manage-budget',JSON.stringify({payload:canary.repeat(7000)}))).status,413)
 check('candidate rejects unknown command fields',(await raw('query-budget',JSON.stringify({action:'snapshot',secret:canary}))).status,422)
 const request={action:'save_draft',request_id:randomUUID(),expected_source:source(owner.tenant),expected_draft:'0',payload:{unfinished:canary,amount_cents:987654321}}
 const saved=await edge(owner,'manage-budget',request);check('candidate owner saves private unfinished input',saved.status,200)
 check('candidate duplicate commit retains exact receipt',(await edge(owner,'manage-budget',request)).body,saved.body)
 check('candidate conflict is explicit',(await edge(owner,'manage-budget',{...request,payload:{unfinished:'different'}})).status,409)
 check('candidate foreign owner draft remains empty',(await edge(foreign,'query-budget',{action:'draft'})).body.draft,null)
 check('candidate owner retains private input',(await edge(owner,'query-budget',{action:'draft'})).body.draft,request.payload)
 for(let n=0;n<10;n++)check(`candidate write limiter counts invalid request ${n+1}`,(await edge(limiter,'manage-budget',{invalid:true})).status,422)
 const limited=await fetch(`${api}/functions/v1/manage-budget`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${limiter.token}`,'Content-Type':'application/json'},body:'{}'})
 check('candidate write limiter rejects request eleven',limited.status,429)
 check('candidate limiter provides bounded retry guidance',Number(limited.headers.get('Retry-After'))>0&&Number(limited.headers.get('Retry-After'))<=60)
 const audit=JSON.parse(sql(`SELECT coalesce(jsonb_agg(metadata ORDER BY id),'[]'::jsonb) FROM public.audit_log WHERE tenant_id=${q(owner.tenant)} AND action='budget.command_committed';`))
 check('successful transport audits record only operation/action references',audit.length>=1&&audit.every(v=>JSON.stringify(Object.keys(v).sort())===JSON.stringify(['action','target_id','target_type'])&&!JSON.stringify(v).includes(canary)))
 check('duplicate retries produce only one authoritative operation',sql(`SELECT count(*) FROM public.budget_operations WHERE tenant_id=${q(owner.tenant)};`),'1')
 let samples=[]
 for(let n=0;n<20;n++){
  const r=spawnSync('docker',['logs',`supabase_edge_runtime_${project}`],{encoding:'utf8',maxBuffer:32*1024*1024})
  assert.equal(r.status,0)
  const lines=(r.stdout+r.stderr).replace(/\x1b\[[0-9;]*m/g,'').split('\n')
  samples=lines.map(line=>line.match(/\{"event":"budget\.request\.v1".*?\}/)?.[0]).filter(Boolean).map(line=>JSON.parse(line))
  if(samples.some(s=>s.status===429))break
  await new Promise(r=>setTimeout(r,250))
 }
 check('real Edge emits fixed-field request metrics',samples.length>0&&samples.every(s=>JSON.stringify(Object.keys(s).sort())===JSON.stringify(['duration_ms','endpoint','event','outcome','status'])&&['manage-budget','query-budget'].includes(s.endpoint)&&Number.isInteger(s.duration_ms)&&s.duration_ms>=0))
 for(const outcome of ['success','conflict','denied','rejected','rate_limited'])check(`real Edge telemetry records ${outcome}`,samples.some(s=>s.outcome===outcome))
 check('private payload canary is absent from actual telemetry',!JSON.stringify(samples).includes(canary))
 writeFileSync(resolve(out,'security.json'),JSON.stringify({project,api,migration_count:Number(sql('SELECT count(*) FROM supabase_migrations.schema_migrations;')),inventory,telemetry_samples:samples,transport_audit_schema_only:true,authoritative_duplicate_count:1},null,2)+'\n')
}
