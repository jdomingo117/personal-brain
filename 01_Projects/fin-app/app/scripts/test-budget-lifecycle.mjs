import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

/** Only invoked by the existing positively identified disposable provisioner. */
export async function runBudgetLifecycleChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL}){
 const {runBudgetImpactPreparationChecks}=await import('./test-budget-impact-preparation.mjs')
 await runBudgetImpactPreparationChecks({newUser,sql,quote,check,edge,source,commandSQL})
 const {runBudgetAccountPolicyChecks}=await import('./test-budget-account-policies.mjs')
 await runBudgetAccountPolicyChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL})
 const {runBudgetFrequencyChecks}=await import('./test-budget-frequency.mjs')
 await runBudgetFrequencyChecks({newUser,sql,quote,check,edge,source,sqlAsync,commandSQL})
 const u=await newUser(),foreign=await newUser(),everyday=randomUUID(),reserve=randomUUID()
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Lifecycle fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const start=sql(`SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '2 months')::date;`)
 const snap=(id)=>JSON.parse(sql(`SELECT public.budget_query(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify({action:'snapshot',...(id?{period_id:id}:{})}))}::jsonb);`))
 const command=(body,request=randomUUID(),enabled=true)=>{const s=snap();return JSON.parse(sql(commandSQL(u,request,{expected_source:source(u.tenant),expected_plan:s.plan?.version,plan_id:s.plan?.id,period_id:s.period?.id,...body},enabled)))}
 const details=id=>{const s=snap(id);return JSON.parse(sql(`SELECT public.budget_details(${quote(u.tenant)},${quote(u.id)},${quote(s.plan.id)},${quote(s.period.id)},${source(u.tenant)},${quote(s.plan.version)});`))}
 command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[account],destination_account_ids:[],income_cents:20000,opening_drawdown_cents:0,lines:[{id:everyday,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0},{id:reserve,kind:'reserve',name:'Registration',allocation_cents:10000,opening_cents:60000}]}})
 command({action:'activate',expected_draft:'1',accept_gap:false})
 const first=snap().period
 const tx=(date,amount)=>sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(account)},${quote(date)},'Lifecycle fixture','Lifecycle','lifecycle','Shopping',${amount},'expense','user',false) RETURNING id;`).split('\n')[0]
 const spent=tx(first.start_date,-12500)
 assert.throws(()=>command({action:'save_review',carry_mode:'carry',accept_incomplete:false}),/budget_invalid_incomplete_review/)
 check('incomplete history needs explicit review qualification',true)
 const reviewed=command({action:'save_review',carry_mode:'carry',accept_incomplete:true,period_id:first.id})
 check('review records signed closing variance',details(first.id).lifecycle.review.payload.closing_everyday_cents,-2500)
 check('saved review is immediately consistent',details(first.id).lifecycle.changed_since_review,false)
 const nextBody={action:'open_next_period',period_id:first.id,income_cents:20000,lines:[{line_id:everyday,amount_cents:10000},{line_id:reserve,amount_cents:10000}],accept_gap:false}
 const request=randomUUID(),s0=snap(),canonical={expected_source:source(u.tenant),expected_plan:s0.plan.version,plan_id:s0.plan.id,...nextBody}
 const races=await Promise.allSettled([sqlAsync(commandSQL(u,request,canonical)),sqlAsync(commandSQL(u,randomUUID(),canonical))])
 check('concurrent next-period creation commits only one contiguous period',races.filter(r=>r.status==='fulfilled').length,1)
 const opened=races.find(r=>r.status==='fulfilled'),receipt=JSON.parse(opened.value)
 const second=snap(receipt.result.period_id).period
 check('same-key next-period retry replays exactly even with writes disabled',JSON.parse(sql(commandSQL(u,receipt.request_id,canonical,false))),receipt)
 check('next period starts at the exact old end',second.start_date,first.end_date)
 check('new period never repeats opening cash',snap(second.id).revision.drawdown_cents,0)
 check('reserve opening intent is not credited a second time',details(second.id).items.find(i=>i.line_id===reserve).reserve_cents,80000)
 assert.throws(()=>command({action:'move_allocation',period_id:second.id,from_line_id:everyday,to_line_id:reserve,amount_cents:8000}),/budget_source_capacity/)
 check('negative opening carry protects already-needed new allowance from a move',true)
 tx(second.start_date,-5000)
 check('signed carry minus spending reconciles across periods',details(second.id).lifecycle.facts.closing_everyday_cents,2500)
 check('carry is not new income or a new allocation',[snap(second.id).revision.income_cents,snap(second.id).lines.find(l=>l.id===everyday).allocation_cents],[20000,10000])
 command({action:'save_review',period_id:second.id,carry_mode:'carry',accept_incomplete:true})
 const before=details(second.id).lifecycle.review.payload
 const thirdReceipt=command({...nextBody,period_id:second.id})
 const third=snap(thirdReceipt.result.period_id).period
 check('default snapshot opens today instead of the last viewed period',snap().period.id,third.id)
 check('second signed carry enters Other exactly once',details(third.id).lifecycle.facts.opening_carry_cents,2500)
 sql(`UPDATE public.transactions SET amount=-13500 WHERE id=${quote(spent)};`)
 check('late correction recomputes the full carry chain',details(third.id).lifecycle.facts.opening_carry_cents,1500)
 check('late correction marks original review changed',details(first.id).lifecycle.changed_since_review,true)
 check('recorded review totals remain immutable after source change',details(second.id).lifecycle.review.payload,before)
 assert.throws(()=>command({action:'undo',operation_id:reviewed.operation_id}),/budget_undo_conflict/)
 check('older review undo cannot erase dependent periods or source changes',true)
 const reopened=command({action:'reopen_review',period_id:second.id})
 check('reopening appends history without discarding the carry choice',[details(second.id).lifecycle.review.state,details(third.id).lifecycle.facts.opening_carry_cents],['reopened',1500])
 command({action:'undo',operation_id:reopened.operation_id})
 check('compatible review undo appends the previous state',details(second.id).lifecycle.review.state,'reviewed')
 const fresh=command({action:'save_review',period_id:second.id,carry_mode:'fresh',accept_incomplete:true})
 check('explicit start-fresh changes next carry, not the old signed variance',[details(third.id).lifecycle.facts.opening_carry_cents,details(second.id).lifecycle.facts.closing_everyday_cents],[0,1500])
 command({action:'undo',operation_id:fresh.operation_id})
 check('undo restores prior carry intent and derived downstream totals',details(third.id).lifecycle.facts.opening_carry_cents,1500)
 const current=snap(),currentInput={action:'save_review',request_id:randomUUID(),plan_id:current.plan.id,period_id:third.id,expected_source:source(u.tenant),expected_plan:current.plan.version,carry_mode:'fresh',accept_incomplete:true}
 check('real Edge rejects a completed review for an in-progress period',(await edge(u,'manage-budget',currentInput)).status,422)
 check('workspace can retrieve an explicit saved period',(await edge(u,'query-budget',{action:'workspace',period_id:first.id})).body.period.id,first.id)
 check('foreign workspace period is not disclosed',(await edge(foreign,'query-budget',{action:'workspace',period_id:first.id})).status,404)
 assert.throws(()=>sql(`UPDATE public.budget_period_reviews SET payload='{}' WHERE id=${quote(details(first.id).lifecycle.review.id)};`),/budget_immutable_history/)
 check('review financial snapshots cannot be rewritten',true)
 assert.throws(()=>command({...nextBody,period_id:first.id}),/budget_stale_plan/)
 check('an old period cannot create an overlapping next period',true)
 // Delete keeps audited scope, invalidates the chain and suppresses unknown
 // carry rather than inventing zero financial results.
 sql(`DELETE FROM public.accounts WHERE id=${quote(account)};`)
 const missing=details(third.id)
 check('unavailable history suppresses carry and everyday remainder',[missing.lifecycle.chain_valid,missing.lifecycle.facts.opening_carry_cents,missing.items.find(i=>i.line_id===everyday).remaining_cents],[false,null,null])
 // A reserve release belongs to its own period. Carrying that result into the
 // next period cannot add the historical release a second time.
 const manual=await newUser(),e=randomUUID(),r=randomUUID()
 const ms=()=>JSON.parse(sql(`SELECT public.budget_query(${quote(manual.tenant)},${quote(manual.id)},'{"action":"snapshot"}');`))
 const mc=body=>{const s=ms();return JSON.parse(sql(commandSQL(manual,randomUUID(),{expected_source:source(manual.tenant),expected_plan:s.plan?.version,plan_id:s.plan?.id,period_id:s.period?.id,...body})))}
 mc({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[],destination_account_ids:[],income_cents:200,opening_drawdown_cents:0,lines:[{id:e,kind:'everyday',name:'Everyday',allocation_cents:100,opening_cents:0},{id:r,kind:'reserve',name:'Fund',allocation_cents:100,opening_cents:600}]}})
 mc({action:'activate',expected_draft:'1',accept_gap:false})
 mc({action:'release_reserve',from_line_id:r,to_line_id:e,amount_cents:50})
 mc({action:'save_review',carry_mode:'carry',accept_incomplete:true})
 const mp=mc({action:'open_next_period',income_cents:200,lines:[{line_id:e,amount_cents:100},{line_id:r,amount_cents:100}],accept_gap:false})
 const m=ms(),md=JSON.parse(sql(`SELECT public.budget_details(${quote(manual.tenant)},${quote(manual.id)},${quote(m.plan.id)},${quote(mp.result.period_id)},${source(manual.tenant)},${quote(m.plan.version)});`))
 check('released reserve rights are carried exactly once',[md.lifecycle.facts.opening_carry_cents,md.items.find(i=>i.line_id===e).remaining_cents,md.items.find(i=>i.line_id===r).reserve_cents],[150,250,750])
 check('reviewed manual history remains explicitly provisional',md.lifecycle.provisional_carry,true)
}
