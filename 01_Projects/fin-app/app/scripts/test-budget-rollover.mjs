import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prepareTestImpact} from './budget-test-impact.mjs'

/** Invoked only by the guarded, disposable lifecycle provisioner. */
export async function runBudgetRolloverChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL}){
 const u=await newUser(),foreign=await newUser(),everyday=randomUUID(),shopping=randomUUID(),food=randomUUID()
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Rollover fictional','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const start=sql(`SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '3 months')::date;`)
 const snap=id=>JSON.parse(sql(`SELECT public.budget_query(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify({action:'snapshot',...(id?{period_id:id}:{})}))}::jsonb);`))
 const body=input=>{const s=snap();return {plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,expected_source:source(u.tenant),expected_method:'budget-foundation-v1',...input}}
 const command=(input,key=randomUUID(),enabled=true)=>JSON.parse(sql(commandSQL(u,key,body(input),enabled)))
 const preview=intent=>prepareTestImpact({sql,quote,user:u,kind:'rollover',input:body(intent)})
 const details=id=>{const s=snap(id);return JSON.parse(sql(`SELECT public.budget_details(${quote(u.tenant)},${quote(u.id)},${quote(s.plan.id)},${quote(s.period.id)},${source(u.tenant)},${quote(s.plan.version)});`))}
 const limit=(id,category_id,amount_cents)=>({id,category_id,subcategory_id:null,custom_subcategory_id:null,amount_cents})
 const limits=[limit(shopping,'shopping',3000),limit(food,'food-and-drink',2000)]
 command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[account],destination_account_ids:[],income_cents:10000,opening_drawdown_cents:0,lines:[{id:everyday,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0}]}})
 command({action:'activate',expected_draft:'1',accept_gap:false});command({action:'set_limits',limits})
 const first=snap().period
 const tx=(date,amount,category='Shopping')=>sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(account)},${quote(date)},'Rollover fixture','Rollover fixture','rollover fixture',${quote(category)},${amount},'expense','user',false) RETURNING id;`).split('\n')[0]
 const expense=tx(start,-4000);tx(start,-500,'Food & drink');tx(start,-1000,'Travel')
 const intent={limits,rules:[{id:shopping,mode:'carry',target:null},{id:food,mode:'carry',target:null},{id:'other',mode:'carry',target:null}]}
 const before=sql(`SELECT count(*) FROM public.budget_periods WHERE plan_id=${quote(snap().plan.id)};`),version=snap().plan.version,p=preview(intent),next=p.after.at(-1)
 check('rollover preview leaves periods, policy history and version unchanged',[sql(`SELECT count(*) FROM public.budget_periods WHERE plan_id=${quote(snap().plan.id)};`),sql(`SELECT count(*) FROM public.budget_rollover_policies WHERE plan_id=${quote(snap().plan.id)};`),snap().plan.version],[before,'0',version])
 check('signed category and Other opening balances reconcile without parent duplication',[next.rollover.parts.map(x=>[x.id,x.opening_carry_cents]).sort(),next.opening_carry_cents,next.closing_everyday_cents],[[[shopping,-1000],[food,1500],['other',4000]].sort(),4500,14500])
 assert.throws(()=>command({action:'set_rollover',...intent,preview_hash:p.preview_hash,accept_impact:false,accept_incomplete:true}),/budget_invalid_scope_acceptance/)
 assert.throws(()=>command({action:'set_rollover',...intent,preview_hash:p.preview_hash,accept_impact:true,accept_incomplete:false}),/budget_invalid_incomplete_review/)
 assert.throws(()=>command({action:'set_rollover',...intent,preview_hash:'0'.repeat(64),accept_impact:true,accept_incomplete:true}),/budget_stale_preview/)
 check('rollover requires authoritative preview and explicit impact/incomplete acceptance',true)
 const countBeforeFailure=sql(`SELECT count(*) FROM public.budget_rollover_policies WHERE plan_id=${quote(snap().plan.id)};`)
 sql(`CREATE FUNCTION public.isolated_rollover_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.impact<>'{}'::jsonb THEN RAISE EXCEPTION 'isolated_rollover_failure';END IF;RETURN NEW;END $$;CREATE TRIGGER isolated_rollover_failure BEFORE INSERT ON public.budget_rollover_policies FOR EACH ROW EXECUTE FUNCTION public.isolated_rollover_failure();`)
 assert.throws(()=>command({action:'set_rollover',...intent,preview_hash:p.preview_hash,accept_impact:true,accept_incomplete:true}),/isolated_rollover_failure/)
 sql('DROP TRIGGER isolated_rollover_failure ON public.budget_rollover_policies;DROP FUNCTION public.isolated_rollover_failure();')
 check('failed final policy history write rolls back version and all temporary policy rows',[snap().plan.version,sql(`SELECT count(*) FROM public.budget_rollover_policies WHERE plan_id=${quote(snap().plan.id)};`)],[version,countBeforeFailure])
 for(const bad of [{...intent,rules:intent.rules.slice(1)},{...intent,rules:[...intent.rules,intent.rules[0]]},{...intent,limits:[],rules:intent.rules},{...intent,rules:intent.rules.map(r=>r.id===shopping?{...r,mode:'transfer',target:randomUUID()}:r)},{...intent,limits:limits.map(l=>l.id===shopping?{...l,category_id:'travel'}:l)}])assert.throws(()=>preview(bad),/budget_invalid_rollover/)
 check('missing/duplicate/orphan routes and identity remapping are rejected',true)
 const input=body({action:'set_rollover',...intent,preview_hash:p.preview_hash,accept_impact:true,accept_incomplete:true})
 const races=await Promise.allSettled([sqlAsync(commandSQL(u,randomUUID(),input)),sqlAsync(commandSQL(u,randomUUID(),input))])
 check('concurrent rollover saves have exactly one winner',races.filter(r=>r.status==='fulfilled').length,1)
 const receipt=JSON.parse(races.find(r=>r.status==='fulfilled').value)
 check('rollover receipt replay works with writes disabled',JSON.parse(sql(commandSQL(u,receipt.request_id,input,false))),receipt)
 command({action:'undo',operation_id:receipt.operation_id})
 check('compatible undo restores the previous timeline',details().rollover_policy.timeline,[])
 let p2=preview(intent);command({action:'set_rollover',...intent,preview_hash:p2.preview_hash,accept_impact:true,accept_incomplete:true})
 const raw={action:'preview_rollover',...body(intent)}
 check('real owner Edge rollover preview succeeds',(await edge(u,'query-budget',raw)).status,200)
 check('foreign rollover preview does not expose a plan',(await edge(foreign,'query-budget',{...raw,expected_source:source(foreign.tenant)})).status,404)
 const viewer=await newUser();sql(`INSERT INTO public.tenant_members(tenant_id,user_id,role,joined_at) VALUES(${quote(u.tenant)},${quote(viewer.id)},'viewer','2000-01-01');`)
 check('same-tenant viewer cannot preview rollover mutations',(await edge(viewer,'query-budget',raw)).status,403)
 assert.throws(()=>command({action:'set_limits',limits:[]}),/budget_invalid_policy_limits/)
 assert.throws(()=>command({action:'save_review',carry_mode:'carry',accept_incomplete:true}),/budget_invalid_policy_review/)
 check('legacy limits/review controls cannot silently bypass a category policy',true)
 const open=()=>command({action:'open_next_period',income_cents:10000,lines:[{line_id:everyday,amount_cents:10000}],accept_gap:false})
 const secondId=open().result.period_id,second=snap(secondId).period
 check('saved next period uses signed child/Other carry and unchanged new income',[details(secondId).rollover.parts.find(x=>x.id===shopping).opening_carry_cents,details(secondId).other_opening_carry_cents,snap(secondId).revision.income_cents],[-1000,4000,10000])
 command({action:'save_review',period_id:secondId,carry_mode:'fresh',accept_incomplete:true})
 check('category-aware review is immediately consistent',details(secondId).lifecycle.changed_since_review,false)
 sql(`UPDATE public.transactions SET amount=-5000 WHERE id=${quote(expense)};`)
 check('late source correction updates child carry and preserves reviewed facts',[details(secondId).rollover.parts.find(x=>x.id===shopping).opening_carry_cents,details(secondId).lifecycle.changed_since_review,details(secondId).lifecycle.review.payload.closing_everyday_cents],[-2000,true,14500])
 const retain={limits:[limits[0]],rules:[{id:shopping,mode:'carry',target:null},{id:food,mode:'retain',target:null},{id:'other',mode:'release',target:null}]}
 const rp=preview(retain),rn=rp.after.at(-1)
 check('removed category moves its full balance aside and releases Other explicitly',[rn.rollover.protected_cents,rn.rollover.released_variance_cents,rn.rollover.parts.find(x=>x.id===shopping).opening_carry_cents,rn.rollover.parts.find(x=>x.id==='other').opening_carry_cents],[3500,9000,1000,0])
 command({action:'set_rollover',...retain,preview_hash:rp.preview_hash,accept_impact:true,accept_incomplete:true})
 const thirdId=open().result.period_id
 check('removed category is absent from saved next limits; protected money is not spendable',[details(thirdId).limits.map(l=>l.id),details(thirdId).rollover.protected_cents,details(thirdId).items.find(i=>i.kind==='everyday').remaining_cents],[[shopping],3500,11000])
 check('removed categories retain a named server-owned identity in later periods',details(thirdId).rollover_policy.timeline.at(-1).identities.find(x=>x.id===food).label,'Food & drink')
 const transfer={...retain,rules:retain.rules.map(r=>r.id===food?{...r,mode:'transfer',target:'other'}:r)}
 const tp=preview(transfer)
 check('protected money can be moved once into Other at a later boundary',[tp.after.at(-1).rollover.protected_cents,tp.after.at(-1).rollover.parts.find(x=>x.id==='other').opening_carry_cents],[0,3500])
 const saved=command({action:'set_rollover',...transfer,preview_hash:tp.preview_hash,accept_impact:true,accept_incomplete:true})
 const template={income_cents:10000,accept_gap:false,lines:[{line_id:everyday,amount_cents:10000}]}
 // Passage-of-time fixture, like the existing frequency suite: seed a persisted
 // pending intent at an ended boundary, without changing the production clock.
 sql(`INSERT INTO public.budget_frequency_changes(change_id,tenant_id,plan_id,period_id,version,state,frequency,effective_date,initial_end,continuing_end,initial_revision_id,continuing_revision_id,source_revision,payload,actor_id)
 SELECT gen_random_uuid(),p.tenant_id,p.plan_id,p.id,b.version,'pending','fortnightly',p.end_date,p.end_date+14,p.end_date+28,b.template_revision_id,b.template_revision_id,${source(u.tenant)},${quote(JSON.stringify({initial:template,continuing:template,limits:retain.limits,accepted_incomplete:true}))}::jsonb,${quote(u.id)} FROM public.budget_periods p JOIN public.budget_plans b ON b.id=p.plan_id WHERE p.id=${quote(thirdId)};`)
 assert.throws(()=>preview(transfer),/budget_frequency_pending/)
 const fourthId=command({action:'apply_frequency'}).result.period_id
 check('frequency application preserves the effective category partition and exact 14-day window',[snap(fourthId).period.frequency,sql(`SELECT end_date-start_date FROM public.budget_periods WHERE id=${quote(fourthId)};`),details(fourthId).limits.map(l=>l.id)],['fortnightly','14',[shopping]])
 check('restored protected money is credited once without creating income',[details(fourthId).other_opening_carry_cents,details(fourthId).rollover.protected_cents,snap(fourthId).revision.income_cents],[3500,0,10000])
 assert.throws(()=>command({action:'undo',operation_id:saved.operation_id}),/budget_undo_conflict/)
 check('later dependent period opening prevents destructive policy undo',true)
 const history=sql(`SELECT id FROM public.budget_rollover_policies WHERE plan_id=${quote(snap().plan.id)} LIMIT 1;`)
 assert.throws(()=>sql(`UPDATE public.budget_rollover_policies SET timeline='[]' WHERE id=${quote(history)};`),/budget_immutable_history/)
 check('rollover policy history is immutable',true)
 // A retained category's later negative correction becomes a visible obligation.
 tx(first.start_date,-10000,'Food & drink')
 check('late negative retained balance reduces Other instead of becoming savings',details(thirdId).rollover.parts.find(x=>x.id==='other').opening_carry_cents,-6500)
 sql(`DELETE FROM public.accounts WHERE id=${quote(account)};`)
 check('missing source history is unavailable, never zero carry',[details(fourthId).rollover.protected_cents,details(fourthId).rollover.parts.every(x=>x.opening_carry_cents===null)],[null,true])
 // Keeping money aside must not silently pay a later category shortfall.
 const heldUser=await newUser(),he=randomUUID(),hl=randomUUID()
 const ha=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(heldUser.id)},${quote(heldUser.tenant)},'Protected fictional','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const hs=()=>JSON.parse(sql(`SELECT public.budget_query(${quote(heldUser.tenant)},${quote(heldUser.id)},'{"action":"snapshot"}');`))
 const hb=input=>{const s=hs();return {plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,expected_source:source(heldUser.tenant),expected_method:'budget-foundation-v1',...input}}
 const hc=input=>JSON.parse(sql(commandSQL(heldUser,randomUUID(),hb(input))))
 const hp=intent=>JSON.parse(sql(`SELECT public.budget_preview_rollover(${quote(heldUser.tenant)},${quote(heldUser.id)},${quote(JSON.stringify(hb(intent)))}::jsonb);`))
 const hd=()=>{const s=hs();return JSON.parse(sql(`SELECT public.budget_details(${quote(heldUser.tenant)},${quote(heldUser.id)},${quote(s.plan.id)},${quote(s.period.id)},${source(heldUser.tenant)},${quote(s.plan.version)});`))}
 const hlimits=[limit(hl,'shopping',3000)]
 hc({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[ha],destination_account_ids:[],income_cents:10000,opening_drawdown_cents:0,lines:[{id:he,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0}]}})
 hc({action:'activate',expected_draft:'1',accept_gap:false});hc({action:'set_limits',limits:hlimits})
 const htx=(date,amount)=>sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(heldUser.id)},${quote(heldUser.tenant)},${quote(ha)},${quote(date)},'Protected fixture','Protected fixture','protected fixture','Shopping',${amount},'expense','user',false);`)
 htx(start,-1000)
 const hold={limits:hlimits,rules:[{id:hl,mode:'retain',target:null},{id:'other',mode:'release',target:null}]},holdPreview=hp(hold)
 hc({action:'set_rollover',...hold,preview_hash:holdPreview.preview_hash,accept_impact:true,accept_incomplete:true})
 const hopen=()=>hc({action:'open_next_period',income_cents:10000,lines:[{line_id:he,amount_cents:10000}],accept_gap:false})
 hopen();htx(hs().period.start_date,-5000);hopen()
 check('retained savings stay protected while a later category shortfall reduces Other',[hd().rollover.protected_cents,hd().other_opening_carry_cents,hd().items.find(i=>i.kind==='everyday').remaining_cents],[2000,-2000,8000])
 const heldFlow=hd().rollover.flows.find(f=>f.id===hl)
 check('preview evidence separates earlier protection from a new signed shortfall',[heldFlow.previous_protected_cents,heldFlow.period_balance_cents,heldFlow.shortfall_cents],[2000,-2000,-2000])
 // Source changes invalidate the old preview even if the user retains choices.
 const stalePreview=hp(hold);htx(hs().period.start_date,-1)
 assert.throws(()=>hc({action:'set_rollover',...hold,preview_hash:stalePreview.preview_hash,accept_impact:true,accept_incomplete:true}),/budget_stale_preview/)
 check('late activity cannot reuse an older rollover effect hash',true)
 hopen() // The current monthly window can schedule an actual future change.
 const smaller={...hold,limits:[{...hlimits[0],amount_cents:1000}]},sp=hp(smaller)
 hc({action:'set_rollover',...smaller,preview_hash:sp.preview_hash,accept_impact:true,accept_incomplete:true})
 const futureTemplate={income_cents:2000,accept_gap:false,lines:[{line_id:he,amount_cents:2000}]}
 hc({action:'schedule_frequency',frequency:'fortnightly',initial:futureTemplate,continuing:futureTemplate,keep_limits:true,accept_incomplete:true})
 check('real scheduling uses dated future limits rather than the larger old category amount',hd().frequency_change.payload.limits[0].amount_cents,1000)
 hc({action:'cancel_frequency'})
 const oldVersion=hs().plan.version
 assert.throws(()=>hc({action:'revise',scope:'period-and-future',income_cents:10000,opening_drawdown_cents:0,accept_gap:false,lines:[{line_id:he,amount_cents:500}]}),/budget_invalid_limits/)
 check('a later allowance edit cannot commit a future category capacity failure',hs().plan.version,oldVersion)
}
