import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

/** M6 checks; invoked only by the positively identified disposable Budget provisioner. */
export async function runBudgetAssistanceChecks({newUser,sql,quote,check,edge,source}){
  const u=await newUser(),foreign=await newUser()
  const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Assistance fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  const start=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;")
  const first=sql(`SELECT (${quote(start)}::date-interval '6 months')::date;`)
  const request={action:'assisted_setup',frequency:'monthly',start_date:start,account_ids:[account]}
  sql(`SELECT public.budget_assisted_setup(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(request))}::jsonb);`)
  const missing=await edge(u,'query-budget',request)
  assert.equal(missing.status,200,JSON.stringify(missing.body))
  check('assistance never treats missing coverage as zero',[missing.status,missing.body.eligible,missing.body.period_count],[200,false,0])
  check('assistance names every excluded account window',missing.body.missing_coverage.length,6)
  sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by)
    VALUES(${quote(u.tenant)},${quote(account)},${quote(account)},${quote(first)},${quote(start)},'verified_statement','{"fixture":"m6"}',${source(u.tenant)},${quote(u.id)});`)
  sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash)
    SELECT ${quote(u.id)},${quote(u.tenant)},${quote(account)},d::date+4,'M6 expense','M6 shop','m6-shop','Shopping',-10000,'expense','user',false,false,decode(md5('m6-e-'||d),'hex') FROM generate_series(${quote(first)}::date,${quote(start)}::date-1,interval '1 month') d;
    INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash)
    SELECT ${quote(u.id)},${quote(u.tenant)},${quote(account)},d::date+9,'M6 refund','M6 shop','m6-shop','Shopping',1000,'refund','user',false,false,decode(md5('m6-r-'||d),'hex') FROM generate_series(${quote(first)}::date,${quote(start)}::date-1,interval '1 month') d;
    INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash)
    SELECT ${quote(u.id)},${quote(u.tenant)},${quote(account)},d::date+14,'M6 income','Employer','employer','Income',50000,'income','user',false,false,decode(md5('m6-i-'||d),'hex') FROM generate_series(${quote(first)}::date,${quote(start)}::date-1,interval '1 month') d;
    INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash)
    SELECT ${quote(u.id)},${quote(u.tenant)},${quote(account)},d::date+19,'M6 transfer','Own account','own-account','Transfer',-99999,'transfer','user',false,false,decode(md5('m6-t-'||d),'hex') FROM generate_series(${quote(first)}::date,${quote(start)}::date-1,interval '1 month') d;`)
  sql(`INSERT INTO public.recurring_series_overrides(tenant_id,account_id,merchant_key,state,cadence_override,expected_amount_override,next_expected_override)
    VALUES(${quote(u.tenant)},${quote(account)},'m6-rent','active','Monthly',2000,${quote(start)});`)
  const ready=await edge(u,'query-budget',request)
  check('eligible assistance uses six complete calendar months',[ready.status,ready.body.eligible,ready.body.period_count],[200,true,6])
  check('a future confirmed bill is not falsely subtracted from unrelated historical spending',ready.body.suggestions.everyday_cents,9000)
  check('income suggestion is exact median earned income',ready.body.suggestions.income_cents,50000)
  check('confirmed recurring dates produce a separate bill suggestion',ready.body.suggestions.bills_cents,2000)
  check('suggestion binds method, source and 256-bit fingerprint',[ready.body.method,ready.body.source_revision,ready.body.fingerprint.length],['budget-assist-v1',source(u.tenant),64])
  sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash)
    SELECT ${quote(u.id)},${quote(u.tenant)},${quote(account)},d::date+2,'M6 rent','M6 rent','m6-rent','Shopping',-2000,'expense','user',false,false,decode(md5('m6-rent-'||d),'hex') FROM generate_series(${quote(first)}::date,${quote(start)}::date-1,interval '1 month') d;`)
  const separated=await edge(u,'query-budget',request)
  check('only matching canonical recurring history is removed from everyday medians',[separated.body.periods.every(p=>p.recurring_expense_cents===2000&&p.everyday_cents===9000),separated.body.suggestions.everyday_cents],[true,9000])
  const fortnight=await edge(u,'query-budget',{...request,frequency:'fortnightly',anchor:first})
  check('fortnightly assistance requires and returns aligned complete windows',[fortnight.status,fortnight.body.eligible,fortnight.body.period_count>=6],[200,true,true])
  const foreignRead=await edge(foreign,'query-budget',request)
  check('foreign account selection produces no financial suggestion',[foreignRead.body.eligible,foreignRead.body.period_count,foreignRead.body.suggestions.everyday_cents],[false,0,0])
  const activationUser=await newUser()
  const activationAccount=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(activationUser.id)},${quote(activationUser.tenant)},'Assisted activation account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  const everyday=randomUUID(),goalLine=randomUUID(),activationSource=source(activationUser.tenant)
  const payload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,anchor:start,account_ids:[activationAccount],destination_account_ids:[],income_cents:50000,opening_drawdown_cents:0,
    lines:[{id:everyday,kind:'everyday',name:'Everyday spending',allocation_cents:40000,opening_cents:0},{id:goalLine,kind:'reserve',name:'Bike fund',allocation_cents:1000,opening_cents:0}],
    assistance:{method:'budget-assist-v1',fingerprint:'a'.repeat(64),source_revision:'0',manual:true,periods:[{start_date:first,end_date:start}],provenance:{income:'user-estimate-preserved-from-assisted-draft'},goal_intent:{line_id:goalLine,name:'Bike fund',target_cents:12000,needed_by:'2027-12-01'}}}
  const saved=await edge(activationUser,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:activationSource,expected_draft:'0',payload})
  assert.equal(saved.status,200,JSON.stringify(saved.body))
  const activationRequest=randomUUID(),activationBody={action:'activate',request_id:activationRequest,expected_method:'budget-foundation-v1',expected_source:activationSource,expected_draft:saved.body.result.draft_version,accept_gap:false}
  const activated=JSON.parse(sql(`SELECT public.budget_command(${quote(activationUser.tenant)},${quote(activationUser.id)},${quote(activationRequest)},${quote(JSON.stringify(activationBody))}::jsonb,true);`))
  assert.equal(activated.status,'committed',JSON.stringify(activated))
  const activatedSnapshot=await edge(activationUser,'query-budget',{action:'workspace'})
  const activatedGoal=activatedSnapshot.body.details.items.find(i=>i.line_id===goalLine)
  check('activation accepts validated provenance and preserves manual goal/future intent',[activatedGoal.config.type,activatedGoal.config.target_cents,activatedGoal.config.due_date,activatedSnapshot.body.future_template.allocations.find(a=>a.line_id===goalLine).amount_cents],['goal',12000,'2027-12-01',1000])
  assert.throws(()=>sql(`BEGIN;SET LOCAL ROLE authenticated;SELECT public.budget_assisted_setup(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(request))}::jsonb);ROLLBACK;`))
  check('authenticated clients cannot call assistance SQL directly',sql("SELECT has_function_privilege('authenticated','public.budget_assisted_setup(uuid,uuid,jsonb)','EXECUTE');"),'f')
  sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash)
    VALUES(${quote(u.id)},${quote(u.tenant)},${quote(account)},${quote(first)},'M6 unresolved movement','Unknown','m6-unresolved','Shopping',-100,'expense','derived',false,true,decode(md5('m6-unresolved'),'hex'));`)
  const blocked=await edge(u,'query-budget',request)
  check('unresolved transfer ambiguity blocks affected suggestions',[blocked.body.integrity_ok,blocked.body.eligible],[false,false])
  sql(`DELETE FROM public.transactions WHERE tenant_id=${quote(u.tenant)} AND merchant_key='m6-unresolved';
    INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by)
    VALUES(${quote(u.tenant)},${quote(account)},${quote(account)},${quote(first)},${quote(start)},'verified_statement','{"fixture":"m6-browser"}',${source(u.tenant)},${quote(u.id)});`)
  return {user:u,account}
}
