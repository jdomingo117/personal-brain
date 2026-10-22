import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

/** Invoked only by the disposable, positively identified Budget provisioner. */
export async function runBudgetAttentionChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL}){
 const u=await newUser(),foreign=await newUser(),line=randomUUID()
 check('percentage materiality rounds up in exact integer cents',sql("SELECT public.budget_attention_issue('x','overspend','Test',1,100001,NULL,2,'{}')->>'threshold_cents';"),'5001')
 const start=sql(`SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;`),today=sql(`SELECT (now() AT TIME ZONE 'Australia/Sydney')::date;`)
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Attention fictional','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const snap=()=>JSON.parse(sql(`SELECT public.budget_query(${quote(u.tenant)},${quote(u.id)},'{"action":"snapshot"}');`))
 const body=i=>{const s=snap();return {plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,expected_source:source(u.tenant),expected_method:'budget-foundation-v1',...i}}
 const cmd=(i,key=randomUUID(),enabled=true)=>JSON.parse(sql(commandSQL(u,key,body(i),enabled)))
 const details=()=>{const s=snap();return JSON.parse(sql(`SELECT public.budget_workspace_details(${quote(u.tenant)},${quote(u.id)},${quote(s.plan.id)},${quote(s.period.id)},${source(u.tenant)},${quote(s.plan.version)});`))}
 const a=()=>details().attention,issue=key=>a().items.find(i=>i.key===key),balance=`balance:${line}`
 const input=(key,state='acknowledged',until=null)=>{const q=a(),i=q.items.find(i=>i.key===key);return {action:'set_attention',expected_attention:q.version,issue_key:key,issue_hash:i.issue_hash,state,until}}
 const tx=(amount,category='Shopping',owner=u,acc=account)=>sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(owner.id)},${quote(owner.tenant)},${quote(acc)},${quote(start)},'Attention fixture','Attention fixture','attention fixture',${quote(category)},${amount},'expense','user',false) RETURNING id;`).split('\n')[0]
 cmd({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[account],destination_account_ids:[],income_cents:10000,opening_drawdown_cents:0,lines:[{id:line,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0}]}});cmd({action:'activate',expected_draft:'1',accept_gap:false})
 const original=tx(-11000),before=snap(),undo=details().undo_operation_id
 check('queue derives signed overspend and a separate missing-history issue',[issue(balance).gap_cents,issue(balance).threshold_cents,!!issue('data:coverage')],[1000,2500,true])
 check('public queue exposes no raw source maps or baseline evidence',a().items.every(i=>!('basis'in i)&&!('evidence'in i)))
 const size=sql(`SELECT count(*) FROM public.budget_attention_events;`);details();details()
 check('attention reads are side-effect free',sql(`SELECT count(*) FROM public.budget_attention_events;`),size)
 const ownerRead=await edge(u,'query-budget',{action:'workspace'})
 check('real owner workspace composes the counted queue',ownerRead.body.details.attention.active_count,a().active_count)
 check('foreign workspace cannot disclose another budget',(await edge(foreign,'query-budget',{action:'workspace',period_id:before.period.id})).status,404)
 check('foreign owner cannot change another tenant attention preference',(await edge(foreign,'manage-budget',{...body(input(balance)),expected_source:source(foreign.tenant),request_id:randomUUID()})).status,404)
 const viewer=await newUser();sql(`INSERT INTO public.tenant_members(tenant_id,user_id,role,joined_at) VALUES(${quote(u.tenant)},${quote(viewer.id)},'viewer','2000-01-01');`)
 check('viewer reads attention but cannot save a preference',[(await edge(viewer,'query-budget',{action:'workspace'})).status,(await edge(viewer,'manage-budget',{...body(input(balance)),request_id:randomUUID()})).status],[200,403])
 const payload=body(input(balance)),races=await Promise.allSettled([sqlAsync(commandSQL(u,randomUUID(),payload)),sqlAsync(commandSQL(u,randomUUID(),payload))])
 if(!races.some(x=>x.status==='fulfilled'))throw new Error(races.map(x=>x.reason?.message).join('\n'))
 check('same attention revision has one concurrent winner',races.filter(x=>x.status==='fulfilled').length,1)
 const saved=JSON.parse(races.find(x=>x.status==='fulfilled').value)
 check('attention receipt replays exactly with writes disabled',JSON.parse(sql(commandSQL(u,saved.request_id,payload,false))),saved)
 check('acknowledgement preserves money, plan version, template and financial Undo',[issue(balance).state,details().items.find(i=>i.line_id===line).remaining_cents,snap().plan.version,snap().plan.template_revision_id,details().undo_operation_id],['acknowledged',-1000,before.plan.version,before.plan.template_revision_id,undo])
 cmd({action:'undo',operation_id:saved.operation_id});check('compatible attention Undo restores active through a new event',issue(balance).state,'active')
 cmd(input(balance))
 const otherAccount=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Not selected fictional','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 tx(-1,'Travel',u,otherAccount)
 check('unrelated source invalidation does not reopen a reviewed issue',issue(balance).state,'acknowledged')
 tx(-2499);check('ordinary spending below the saved materiality threshold stays quiet',issue(balance).state,'acknowledged')
 tx(-1);check('exact material deterioration reopens without changing the saved acknowledgement',[issue(balance).state,issue(balance).reopen_reason,issue(balance).gap_cents],['active','gap_worsened',3500])
 cmd(input(balance));sql(`UPDATE public.transactions SET category='Travel' WHERE id=${quote(original)};`)
 check('a relevant existing source reinterpretation reopens even with unchanged gap',[issue(balance).state,issue(balance).reopen_reason,issue(balance).gap_cents],['active','evidence_changed',3500])
 const stale=input(balance);tx(-1)
 assert.throws(()=>cmd(stale),/budget_stale_attention/)
 assert.throws(()=>cmd({...input(balance),expected_attention:'0'}),/budget_stale_attention/)
 for(const until of [today,'9999-12-31',null])assert.throws(()=>cmd({...input(balance,'snoozed',until)}),/budget_invalid_attention_date/)
 check('stale issue hashes, stale attention versions and invalid snooze dates fail closed',true)
 const paused=cmd(input(balance,'snoozed',before.period.end_date));check('snoozing has an explicit bounded expiry',[issue(balance).state,issue(balance).until],['snoozed',before.period.end_date])
 cmd(input(balance,'active'));check('show again now restores the issue without editing the plan',issue(balance).state,'active')
 assert.throws(()=>cmd({action:'undo',operation_id:paused.operation_id}),/budget_undo_conflict/)
 const oldCount=sql(`SELECT count(*) FROM public.budget_attention_events WHERE plan_id=${quote(before.plan.id)};`),v=a().version
 sql(`CREATE FUNCTION public.isolated_attention_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated_attention_failure';END $$;CREATE TRIGGER isolated_attention_failure BEFORE INSERT ON public.budget_operations FOR EACH ROW WHEN(NEW.action='set_attention') EXECUTE FUNCTION public.isolated_attention_failure();`)
 assert.throws(()=>cmd(input(balance)),/isolated_attention_failure/)
 sql('DROP TRIGGER isolated_attention_failure ON public.budget_operations;DROP FUNCTION public.isolated_attention_failure();')
 check('failed operation history insert rolls back attention event atomically',[a().version,sql(`SELECT count(*) FROM public.budget_attention_events WHERE plan_id=${quote(before.plan.id)};`)],[v,oldCount])
 cmd(input(balance,'snoozed',before.period.end_date))
 // Passage-of-time fixture, not a production clock override or mutable history.
 sql(`INSERT INTO public.budget_attention_events(tenant_id,plan_id,period_id,version,issue_key,payload,source_revision,operation_id,actor_id) SELECT tenant_id,plan_id,period_id,version+1,issue_key,jsonb_set(payload,'{until}',to_jsonb(${quote(today)}::text)),source_revision,operation_id,actor_id FROM public.budget_attention_events WHERE plan_id=${quote(before.plan.id)} ORDER BY version DESC LIMIT 1;`)
 check('snooze expires on the named local date',[issue(balance).state,issue(balance).reopen_reason],['active','expired'])
 assert.throws(()=>sql(`UPDATE public.budget_attention_events SET payload='{}' WHERE plan_id=${quote(before.plan.id)};`),/budget_immutable_history/)
 check('attention history is immutable',true)
 // Financial setup gaps and goal dates are independent checks, never fabricated forecasts.
 const goal=randomUUID(),item={type:'goal',name:'Flight',target_cents:10000,estimated:true,due_date:today,cadence:'monthly',anchor:start,amount_cents:1000,state:'saving',recurring_id:null,planning_goal_id:null}
 cmd({action:'save_item',line_id:goal,item,opening_cents:0,opening_date:start,accept_gap:true})
 check('funding and dated goal shortfall coexist without a cash forecast',[issue('funding:current').gap_cents,issue(`target:${goal}`).gap_cents,a().forecast_available],[1000,9000,false])
 cmd(input(`target:${goal}`));cmd({action:'save_item',line_id:goal,item:{...item,due_date:before.period.end_date},opening_cents:0,opening_date:start,accept_gap:true})
 check('target date changes reopen the same stable issue',[issue(`target:${goal}`).state,issue(`target:${goal}`).reopen_reason],['active','due_date_changed'])
 const frequency={action:'schedule_frequency',frequency:'fortnightly',initial:{income_cents:20000,accept_gap:false,lines:[{line_id:line,amount_cents:10000},{line_id:goal,amount_cents:1000}]},continuing:{income_cents:20000,accept_gap:false,lines:[{line_id:line,amount_cents:10000},{line_id:goal,amount_cents:1000}]},keep_limits:true,accept_incomplete:true}
 cmd(frequency);cmd(input(balance));check('presentation preference does not stale a saved frequency change',details().frequency_change.needs_review,false)
 const period=before.period;sql(`UPDATE public.budget_source_versions SET revision=revision+1 WHERE tenant_id=${quote(u.tenant)};`)
 check('generic source change alone does not manufacture an income-date or forecast alert',a().items.every(i=>!['income_late','projected_overspend'].includes(i.kind)))
 const shopping=randomUUID();cmd({action:'set_limits',limits:[{id:shopping,category_id:'shopping',subcategory_id:null,custom_subcategory_id:null,amount_cents:2000}]})
 check('parent category attention uses its readable taxonomy label, not a raw slug',issue(`category:${shopping}`).label,'Shopping')
}
