import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
/** Fictional forecast account, created only inside the guarded disposable preview. */
export async function createBudgetForecastPreview({newUser,sql,quote:q,source}){
 const user=await newUser(),line=randomUUID(),bill=randomUUID()
 const dates=JSON.parse(sql(`SELECT json_build_object('start',date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date,'today',(now() AT TIME ZONE 'Australia/Sydney')::date,'end',(date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')+interval '1 month')::date);`))
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${q(user.id)},${q(user.tenant)},'Forecast fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const snap=()=>JSON.parse(sql(`SELECT public.budget_query(${q(user.tenant)},${q(user.id)},'{"action":"snapshot"}');`))
 const cmd=input=>{const s=snap();const result=JSON.parse(sql(`SELECT public.budget_command(${q(user.tenant)},${q(user.id)},${q(randomUUID())},${q(JSON.stringify({expected_method:'budget-foundation-v1',expected_source:source(user.tenant),plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}))}::jsonb,true);`));assert.equal(result.status,'committed');return result}
 cmd({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:dates.start,account_ids:[account],destination_account_ids:[],income_cents:100000,opening_drawdown_cents:0,lines:[{id:line,kind:'everyday',name:'Everyday spending',allocation_cents:10000,opening_cents:0}]}})
 cmd({action:'activate',expected_draft:'1',accept_gap:false})
 sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
 SELECT ${q(user.id)},${q(user.tenant)},${q(account)},d::date,'Forecast historical fixture','Forecast shop','forecast-shop','Shopping',-3000*((d+interval '1 month')::date-d::date),'expense','user',false,false FROM generate_series(${q(dates.start)}::date-interval '3 months',${q(dates.start)}::date-interval '1 month',interval '1 month') d;
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES
 (${q(user.id)},${q(user.tenant)},${q(account)},${q(dates.today)},'Forecast current fixture','Forecast shop','forecast-shop','Shopping',-2000,'expense','user',false,false),
 (${q(user.id)},${q(user.tenant)},${q(account)},${q(dates.today)},'Forecast pending fixture','Forecast shop','forecast-shop','Shopping',-9000,'expense','user',true,false);
 INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${q(user.tenant)},${q(account)},${q(account)},${q(dates.start)}::date-interval '3 months',${q(dates.end)},'verified_statement','{"fixture":"r01-preview"}',0,${q(user.id)});`)
 cmd({action:'save_item',line_id:bill,item:{type:'bill',name:'Monthly rent',target_cents:null,estimated:true,due_date:null,planning_goal_id:null,amount_cents:10000,cadence:'monthly',anchor:dates.start,state:'saving',recurring_id:null},opening_cents:0,opening_date:dates.start,accept_gap:false})
 const paid=sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES(${q(user.id)},${q(user.tenant)},${q(account)},${q(dates.start)},'Forecast rent fixture','Monthly rent','forecast-rent','Shopping',-10000,'expense','user',false,false) RETURNING id;`).split('\n')[0]
 const st=snap(),d=JSON.parse(sql(`SELECT public.budget_workspace_details(${q(user.tenant)},${q(user.id)},${q(st.plan.id)},${q(st.period.id)},${source(user.tenant)},${q(st.plan.version)});`))
 cmd({action:'claim_source',line_id:bill,purpose:'expense',source_key:`t:${paid}`,amount_cents:10000,occurrence_date:dates.start,occurrence_revision_id:d.items.find(x=>x.line_id===bill).config.schedule_id,related_claim_id:null,complete:false})
 return user
}
