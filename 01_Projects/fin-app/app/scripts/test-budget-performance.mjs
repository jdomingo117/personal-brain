import {randomUUID} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {writeFileSync} from 'node:fs'

/** Only invoked inside the guarded new-project provisioner. */
export async function runBudgetPerformanceChecks({newUser,sql,quote,check,edge,source,commandSQL,periods=60,perPeriod=300}){
 const u=await newUser(),e=randomUUID(),g=randomUUID(),limit=randomUUID()
 const start=sql(`SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-make_interval(months=>${periods-1}))::date;`)
 const a=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'History fictional cash','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const snap=()=>JSON.parse(sql(`SELECT public.budget_query(${quote(u.tenant)},${quote(u.id)},'{"action":"snapshot"}');`))
 const command=input=>{const s=snap();return JSON.parse(sql(commandSQL(u,randomUUID(),{expected_source:source(u.tenant),expected_plan:s.plan?.version,plan_id:s.plan?.id,period_id:s.period?.id,...input})))}
 command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[a],destination_account_ids:[],income_cents:300000,opening_drawdown_cents:0,lines:[{id:e,kind:'everyday',name:'Everyday',allocation_cents:100000,opening_cents:0}]}})
 command({action:'activate',expected_draft:'1',accept_gap:false})
 const config={type:'goal',name:'Long-history flight',amount_cents:10000,target_cents:1000000,estimated:true,due_date:null,cadence:'monthly',anchor:start,state:'saving',recurring_id:null,planning_goal_id:null}
 command({action:'save_item',line_id:g,item:config,opening_cents:50000,opening_date:start,accept_gap:false})
 const first=snap(),lines=[{line_id:e,amount_cents:100000},{line_id:g,amount_cents:10000}],limits=[{id:limit,category_id:'shopping',subcategory_id:null,custom_subcategory_id:null,amount_cents:50000}]
 command({action:'set_limits',limits})
 const intent={limits,rules:[{id:limit,mode:'carry',target:null},{id:'other',mode:'carry',target:null}]}
 const s=snap(),input={expected_method:'budget-foundation-v1',expected_source:source(u.tenant),plan_id:s.plan.id,period_id:s.period.id,expected_plan:s.plan.version,...intent}
 const p=JSON.parse(sql(`SELECT public.budget_preview_rollover(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(input))}::jsonb);`))
 command({action:'set_rollover',...intent,preview_hash:p.preview_hash,accept_impact:true,accept_incomplete:true})
 // Bulk period construction is a fictional passage-of-time fixture, not 59
 // historical user commands or a production clock override.
 sql(`DO $$ DECLARE n int;pid uuid;rid uuid;v bigint;BEGIN
  SELECT version INTO v FROM public.budget_plans WHERE id=${quote(first.plan.id)};
  FOR n IN 1..${periods-1} LOOP
   INSERT INTO public.budget_periods(tenant_id,plan_id,start_date,end_date,timezone,frequency)
   VALUES(${quote(u.tenant)},${quote(first.plan.id)},(${quote(start)}::date+make_interval(months=>n))::date,(${quote(start)}::date+make_interval(months=>n+1))::date,'Australia/Sydney','monthly') RETURNING id INTO pid;
   rid:=public.budget_write_revision(${quote(u.tenant)},${quote(first.plan.id)},pid,v,${source(u.tenant)},300000,0,${quote(JSON.stringify(lines))}::jsonb,true);
   UPDATE public.budget_periods SET activated_revision_id=rid,current_revision_id=rid WHERE id=pid;
   INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(${quote(u.tenant)},${quote(first.plan.id)},pid,v,${quote(JSON.stringify(limits))}::jsonb,${quote(u.id)});
  END LOOP;END $$;
  INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending)
  SELECT ${quote(u.id)},${quote(u.tenant)},${quote(a)},p.start_date+(n%28),'History fixture','History fixture','history fixture','Shopping',-100,'expense','user',false
  FROM public.budget_periods p CROSS JOIN generate_series(1,${perPeriod}) n WHERE p.plan_id=${quote(first.plan.id)};
  ANALYZE public.transactions;ANALYZE public.budget_periods;`)
 const latest=snap(),args=`${quote(u.tenant)},${quote(u.id)},${quote(latest.plan.id)},${quote(latest.period.id)},${source(u.tenant)},${quote(latest.plan.version)}`
 check(`history fixture has ${periods} budgets and ${periods*perPeriod} transactions`,JSON.parse(sql(`SELECT json_build_array((SELECT count(*) FROM public.budget_periods WHERE plan_id=${quote(first.plan.id)}),(SELECT count(*) FROM public.transactions WHERE tenant_id=${quote(u.tenant)}));`)),[periods,periods*perPeriod])
 const measurements={periods,transactions:periods*perPeriod}
 const composer=sql(`SELECT to_regprocedure('public.budget_workspace_details_uncached(uuid,uuid,uuid,uuid,bigint,bigint)') IS NOT NULL;`)==='t'?'budget_workspace_details_uncached':'budget_workspace_details'
 for(const [name,query] of [['base',`SELECT public.budget_details_m4(${args});`],['complete',`SELECT public.${composer}(${args});`]]){
  const t=performance.now()
  try{sql(`SET statement_timeout='8s';${query}`);measurements[name]={ms:Math.round(performance.now()-t),complete:true}}
  catch(error){if(!/statement timeout/.test(String(error)))throw error;measurements[name]={ms:Math.round(performance.now()-t),complete:false,timeout:true}}
 }
 const plan=JSON.parse(sql(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id,date,amount FROM public.transactions WHERE tenant_id=${quote(u.tenant)} AND account_id=${quote(a)} AND date>=${quote(latest.period.start_date)} AND date<${quote(latest.period.end_date)};`))
 measurements.source_plan=plan
 console.log('History baseline:',JSON.stringify(measurements))
 writeFileSync(`/tmp/halcyon-budget-history-${periods}.json`,JSON.stringify(measurements,null,2))
 const fixture={user:u,plan:latest.plan.id,period:latest.period.id,first:first.period.id,everyday:e,goal:g,limit,account:a,measurements}
 if(!process.argv.includes('--profile-baseline')){
  const {verifyBudgetHistory}=await import('./test-budget-history.mjs')
  await verifyBudgetHistory({...fixture,sql,quote,check,edge,source,newUser,commandSQL})
  if(periods===120){
   const {verifyBudgetImpactScale}=await import('./test-budget-impact-scale.mjs')
   await verifyBudgetImpactScale({...fixture,sql,quote,check,edge,source,commandSQL})
  }
 }
 return fixture
}
