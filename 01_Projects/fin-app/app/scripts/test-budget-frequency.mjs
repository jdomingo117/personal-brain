import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

/** All fixtures are owned by the guarded disposable lifecycle provisioner. */
export async function runBudgetFrequencyChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL}){
 const u=await newUser(),e=randomUUID(),r=randomUUID()
 const snap=()=>JSON.parse(sql(`SELECT public.budget_query(${quote(u.tenant)},${quote(u.id)},'{"action":"snapshot"}');`))
 const body=input=>{const s=snap();return {plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,expected_source:source(u.tenant),...input}}
 const command=(input,key=randomUUID(),enabled=true)=>JSON.parse(sql(commandSQL(u,key,body(input),enabled)))
 const detail=()=>{const s=snap();return JSON.parse(sql(`SELECT public.budget_details(${quote(u.tenant)},${quote(u.id)},${quote(s.plan.id)},${quote(s.period.id)},${source(u.tenant)},${quote(s.plan.version)});`))}
 const start=sql(`SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;`)
 command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[],destination_account_ids:[],income_cents:20000,opening_drawdown_cents:0,lines:[{id:e,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0},{id:r,kind:'reserve',name:'Snowboard',allocation_cents:10000,opening_cents:50000}]}})
 command({action:'activate',expected_draft:'1',accept_gap:false})
 command({action:'set_limits',limits:[{id:randomUUID(),category_id:'shopping',subcategory_id:null,custom_subcategory_id:null,amount_cents:5000}]})
 const old=snap(),template={income_cents:20000,accept_gap:false,lines:[{line_id:e,amount_cents:10000},{line_id:r,amount_cents:10000}]}
 const schedule={action:'schedule_frequency',frequency:'fortnightly',initial:template,continuing:{...template,income_cents:21000},keep_limits:true,accept_incomplete:true}
 const revisions=sql(`SELECT count(*) FROM public.budget_revisions WHERE plan_id=${quote(old.plan.id)};`)
 assert.throws(()=>command({...schedule,initial:{...template,lines:template.lines.map(l=>l.line_id===e?{...l,amount_cents:1}:l)}}),/budget_invalid_limits/)
 check('preserved limits must fit each new pool and failed preview writes roll back',sql(`SELECT count(*) FROM public.budget_revisions WHERE plan_id=${quote(old.plan.id)};`),revisions)
 assert.throws(()=>command({...schedule,accept_incomplete:false}),/budget_invalid_incomplete_review/)
 check('frequency preview requires explicit incomplete-history acceptance',true)
 const canonical=body(schedule),key=randomUUID()
 const races=await Promise.allSettled([sqlAsync(commandSQL(u,key,canonical)),sqlAsync(commandSQL(u,randomUUID(),canonical))])
 check('concurrent schedules leave exactly one pending intent',races.filter(r=>r.status==='fulfilled').length,1)
 const receipt=JSON.parse(races.find(r=>r.status==='fulfilled').value)
 check('pending receipt replays before disabled/version checks',JSON.parse(sql(commandSQL(u,receipt.request_id,canonical,false))),receipt)
 const c=detail().frequency_change
 check('scheduling preserves active dates, revision and frequency',[snap().period,snap().revision,snap().plan.frequency],[old.period,old.revision,'monthly'])
 check('initial and continuing templates retain separately reviewed amounts',[c.payload.initial.income_cents,c.payload.continuing.income_cents],[20000,21000])
 check('monthly-to-fortnight boundaries are exact',sql(`SELECT ${quote(c.initial_end)}::date-${quote(c.effective_date)}::date;`),'14')
 assert.throws(()=>command(schedule),/budget_frequency_pending/)
 assert.throws(()=>command({action:'apply_frequency'}),/budget_invalid_frequency_boundary/)
 assert.throws(()=>command({action:'open_next_period',...template}),/budget_frequency_pending/)
 check('duplicate intent, early apply and ordinary period opening cannot bypass pending change',true)
 const cancelled=command({action:'cancel_frequency'})
 check('cancel appends state without changing current template',[detail().frequency_change.state,snap().future_template],['cancelled',old.future_template])
 command({action:'undo',operation_id:cancelled.operation_id})
 check('compatible cancellation undo restores pending intent',detail().frequency_change.state,'pending')
 const cancel2=command({action:'cancel_frequency'})
 const scheduled=command(schedule)
 command({action:'undo',operation_id:scheduled.operation_id})
 check('schedule undo is append-only cancellation',detail().frequency_change.state,'cancelled')
 const change=command(schedule)
 // A plan write does not silently mutate/rebase the saved pending templates.
 command({action:'revise',scope:'period',income_cents:20001,opening_drawdown_cents:0,accept_gap:false,lines:template.lines})
 check('later plan edits mark saved frequency intent as requiring fresh review',detail().frequency_change.needs_review,true)
 assert.throws(()=>command({action:'undo',operation_id:change.operation_id}),/budget_undo_conflict/)
 const staleCancel=command({action:'cancel_frequency'})
 assert.throws(()=>command({action:'undo',operation_id:staleCancel.operation_id}),/budget_undo_conflict/)
 check('undo cannot launder an outdated pending preview into a fresh one',true)
 const foreign=await newUser()
 check('foreign reader cannot inspect frequency history through workspace',(await edge(foreign,'query-budget',{action:'workspace',period_id:old.period.id})).status,404)
 assert.throws(()=>sql(`UPDATE public.budget_frequency_changes SET payload='{}' WHERE id=${quote(c.id)};`),/budget_immutable_history/)
 check('frequency review snapshots are immutable',true)
 // Passage-of-time fixture: install the same persisted pending intent shape
 // against an ended fortnight. No clock override or personal stack is used.
 const bridge=await newUser(),be=randomUUID(),br=randomUUID()
 const cash=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(bridge.id)},${quote(bridge.tenant)},'Frequency fictional cash','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const bs=()=>JSON.parse(sql(`SELECT public.budget_query(${quote(bridge.tenant)},${quote(bridge.id)},'{"action":"snapshot"}');`))
 const bc=input=>{const s=bs();return JSON.parse(sql(commandSQL(bridge,randomUUID(),{expected_source:source(bridge.tenant),expected_plan:s.plan?.version,plan_id:s.plan?.id,period_id:s.period?.id,...input})))}
 const past=sql(`SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '1 month')::date;`)
 bc({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'fortnightly',anchor:past,start_date:past,account_ids:[cash],destination_account_ids:[],income_cents:20000,opening_drawdown_cents:0,lines:[{id:be,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0},{id:br,kind:'reserve',name:'Flight',allocation_cents:10000,opening_cents:50000}]}})
 bc({action:'activate',expected_draft:'1',accept_gap:false})
 const before=bs(),bt={income_cents:20000,accept_gap:false,lines:[{line_id:be,amount_cents:10000},{line_id:br,amount_cents:10000}]},ft={...bt,income_cents:40000,lines:bt.lines.map(l=>({...l,amount_cents:20000}))}
 sql(`INSERT INTO public.budget_frequency_changes(change_id,tenant_id,plan_id,period_id,version,state,frequency,effective_date,initial_end,continuing_end,initial_revision_id,continuing_revision_id,source_revision,payload,actor_id)
 SELECT gen_random_uuid(),p.tenant_id,p.plan_id,p.id,b.version,'pending','monthly',p.end_date,(date_trunc('month',p.end_date)+interval '1 month')::date,(date_trunc('month',p.end_date)+interval '2 months')::date,b.template_revision_id,b.template_revision_id,${source(bridge.tenant)},${quote(JSON.stringify({initial:bt,continuing:ft,limits:[],accepted_incomplete:true}))}::jsonb,${quote(bridge.id)} FROM public.budget_periods p JOIN public.budget_plans b ON b.id=p.plan_id WHERE p.id=${quote(before.period.id)};`)
 const applyBody={action:'apply_frequency',expected_source:source(bridge.tenant),plan_id:before.plan.id,period_id:before.period.id,expected_plan:before.plan.version}
 const applies=await Promise.allSettled([sqlAsync(commandSQL(bridge,randomUUID(),applyBody)),sqlAsync(commandSQL(bridge,randomUUID(),applyBody))])
 check('concurrent bridge application commits once',applies.filter(r=>r.status==='fulfilled').length,1)
 const applied=JSON.parse(applies.find(r=>r.status==='fulfilled').value),after=bs()
 check('applied transition receipt replays exactly with writes disabled',JSON.parse(sql(commandSQL(bridge,applied.request_id,applyBody,false))),applied)
 check('bridge opens at exact boundary with immutable short-month dates',[after.period.start_date,after.period.end_date,after.period.transition,after.plan.frequency],[before.period.end_date,start,true,'monthly'])
 check('bridge and full continuing amounts remain distinct',[after.revision.income_cents,after.future_template.income_cents],[20000,40000])
 check('old activated plan remains unchanged',JSON.parse(sql(`SELECT public.budget_query(${quote(bridge.tenant)},${quote(bridge.id)},${quote(JSON.stringify({action:'snapshot',period_id:before.period.id}))}::jsonb);`)).revision,before.revision)
 assert.throws(()=>bc({action:'undo',operation_id:applied.operation_id}),/budget_undo_conflict/)
 assert.throws(()=>bc({action:'revise',period_id:before.period.id,scope:'period',income_cents:20000,opening_drawdown_cents:0,accept_gap:false,lines:bt.lines}),/budget_historical_readonly/)
 check('applied periods cannot be deleted or historical plans rewritten',true)
 const latest=sql(`SELECT id FROM public.budget_periods WHERE plan_id=${quote(before.plan.id)} ORDER BY start_date DESC LIMIT 1;`)
 const opened=bc({action:'open_next_period',period_id:latest,...ft})
 const end=bs(),d=JSON.parse(sql(`SELECT public.budget_details(${quote(bridge.tenant)},${quote(bridge.id)},${quote(end.plan.id)},${quote(opened.result.period_id)},${source(bridge.tenant)},${quote(end.plan.version)});`))
 check('first full month follows bridge without gaps',end.period.start_date,start)
 check('reserve opening rights are not duplicated by the frequency switch',d.items.find(i=>i.line_id===br).reserve_cents,90000)
 bc({action:'save_review',period_id:before.period.id,carry_mode:'fresh',accept_incomplete:true})
 const tx=(amount,kind,date)=>sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(bridge.id)},${quote(bridge.tenant)},${quote(cash)},${quote(date)},'Frequency fixture','Frequency fixture','frequency fixture','Shopping',${amount},${quote(kind)},'user',false) RETURNING id;`).split('\n')[0]
 const expense=tx(-20000,'expense',before.period.start_date),refund=tx(5000,'refund',end.period.start_date)
 const matched=bc({action:'claim_source',line_id:br,purpose:'expense',source_key:`t:${expense}`,amount_cents:20000,occurrence_date:null,occurrence_revision_id:null,related_claim_id:null,complete:false})
 bc({action:'claim_source',line_id:br,purpose:'refund',source_key:`t:${refund}`,amount_cents:5000,occurrence_date:null,occurrence_revision_id:null,related_claim_id:matched.result.claim_id,complete:false})
 const final=bs(),facts=JSON.parse(sql(`SELECT public.budget_details(${quote(bridge.tenant)},${quote(bridge.id)},${quote(final.plan.id)},${quote(final.period.id)},${source(bridge.tenant)},${quote(final.plan.version)});`))
 check('a linked refund across fortnight, bridge and monthly windows restores reserve once',[facts.items.find(i=>i.line_id===br).reserve_cents,facts.items.find(i=>i.line_id===be).used_cents],[75000,0])
 const historical=JSON.parse(sql(`SELECT public.budget_details(${quote(bridge.tenant)},${quote(bridge.id)},${quote(final.plan.id)},${quote(before.period.id)},${source(bridge.tenant)},${quote(final.plan.version)});`))
 check('late cross-frequency matching marks reviewed history changed without rewriting its snapshot',[historical.lifecycle.changed_since_review,historical.lifecycle.review.payload.actuals.net_expense_cents],[true,0])
}
