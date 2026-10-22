import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

/** Combined boundaries, only inside the disposable provisioner. Pending events
 * below are explicit passage-of-time fixtures, not a production clock override. */
export async function runBudgetTemporalChecks({newUser,sql,quote,check,edge,source,commandSQL}){
 const fixtures=[]
 for(const frequency of ['monthly','fortnightly']){
  const u=await newUser(),e=randomUUID(),g=randomUUID(),category=randomUUID()
  const prefix=`${frequency} temporal`
  const account=name=>sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(name)},'Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  const a=account(`${prefix} kept`),b=account(`${prefix} excluded next`)
  const start=sql(`SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '2 months')::date;`)
  const snap=id=>JSON.parse(sql(`SELECT public.budget_query(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify({action:'snapshot',...(id?{period_id:id}:{})}))}::jsonb);`))
  const body=input=>{const s=snap();return {expected_method:'budget-foundation-v1',expected_source:source(u.tenant),plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}}
  const command=input=>JSON.parse(sql(commandSQL(u,randomUUID(),body(input))))
  const details=id=>{const s=snap(id);return JSON.parse(sql(`SELECT public.budget_details(${quote(u.tenant)},${quote(u.id)},${quote(s.plan.id)},${quote(s.period.id)},${source(u.tenant)},${quote(s.plan.version)});`))}
  const preview=(fn,input)=>JSON.parse(sql(`SELECT public.${fn}(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(body(input)))}::jsonb);`))
  command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency,anchor:start,start_date:start,account_ids:[a,b],destination_account_ids:[],income_cents:30000,opening_drawdown_cents:0,lines:[{id:e,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0}]}})
  command({action:'activate',expected_draft:'1',accept_gap:false})
  const config={type:'goal',name:'Flight',amount_cents:1000,target_cents:90000,estimated:true,due_date:null,cadence:'monthly',anchor:start,state:'saving',recurring_id:null,planning_goal_id:null}
  command({action:'save_item',line_id:g,item:config,opening_cents:5000,opening_date:start,accept_gap:false})
  const first=snap(),firstGoal=details().items.find(i=>i.line_id===g).reserve_cents
  const tx=(acc,date,amount,kind='expense')=>sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(acc)},${quote(date)},'Temporal fixture','Temporal fixture','temporal fixture','Shopping',${amount},${quote(kind)},'user',false) RETURNING id;`).split('\n')[0]
  const ordinary=tx(a,start,-4000),purchase=tx(a,start,-2000)
  const claim=command({action:'claim_source',line_id:g,purpose:'purchase',source_key:`t:${purchase}`,amount_cents:2000,occurrence_date:null,occurrence_revision_id:null,related_claim_id:null,complete:false})
  const limits=[{id:category,category_id:'shopping',subcategory_id:null,custom_subcategory_id:null,amount_cents:3000}]
  command({action:'set_limits',limits})
  const scope={scope:'future',activity_account_ids:[a],destination_account_ids:[]}
  assert.throws(()=>preview('budget_preview_account_scope',scope),/budget_historical_readonly/)
  // Persist the dated projection as if saved before time elapsed. The normal
  // preview/save/undo path has its own current-window account-policy suite.
  sql(`SELECT public.budget_replace_account_scope(${quote(u.tenant)},${quote(first.plan.id)},${quote(first.period.end_date)},NULL,${quote(JSON.stringify([a]))}::jsonb,'[]'::jsonb);
   INSERT INTO public.budget_account_policies(tenant_id,plan_id,period_id,version,action,effective_from,payload,impact,source_revision,actor_id)
   VALUES(${quote(u.tenant)},${quote(first.plan.id)},${quote(first.period.id)},${quote(snap().plan.version)},'saved',${quote(first.period.end_date)},${quote(JSON.stringify(scope))}::jsonb,'{"fixture":"saved before ended boundary"}',${source(u.tenant)},${quote(u.id)});`)
  const rollover={limits,rules:[{id:category,mode:'carry',target:null},{id:'other',mode:'carry',target:null}]},rp=preview('budget_preview_rollover',rollover)
  command({action:'set_rollover',...rollover,preview_hash:rp.preview_hash,accept_impact:true,accept_incomplete:true})
  command({action:'save_review',carry_mode:'fresh',accept_incomplete:true})
  const reviewed=details(first.period.id).lifecycle.review
  const savedRevision=snap().revision
  const nextFrequency=frequency==='monthly'?'fortnightly':'monthly'
  const initial={income_cents:30000,accept_gap:false,lines:[{line_id:e,amount_cents:10000},{line_id:g,amount_cents:3000}]}
  const continuing={...initial,lines:[{line_id:e,amount_cents:12000},{line_id:g,amount_cents:7000}]}
  // The real scheduling path is covered separately. This event represents the
  // reviewed intent having reached its effective date, without changing now().
  sql(`INSERT INTO public.budget_frequency_changes(change_id,tenant_id,plan_id,period_id,version,state,frequency,effective_date,initial_end,continuing_end,initial_revision_id,continuing_revision_id,source_revision,payload,actor_id)
   SELECT gen_random_uuid(),p.tenant_id,p.plan_id,p.id,b.version,'pending',${quote(nextFrequency)},p.end_date,
    CASE WHEN ${quote(nextFrequency)}='fortnightly' THEN p.end_date+14 ELSE (date_trunc('month',p.end_date)+interval '1 month')::date END,
    CASE WHEN ${quote(nextFrequency)}='fortnightly' THEN p.end_date+28 ELSE (date_trunc('month',p.end_date)+interval '2 months')::date END,
    b.template_revision_id,b.template_revision_id,${source(u.tenant)},${quote(JSON.stringify({initial,continuing,limits,accepted_incomplete:true}))}::jsonb,${quote(u.id)}
   FROM public.budget_periods p JOIN public.budget_plans b ON b.id=p.plan_id WHERE p.id=${quote(first.period.id)};`)
  const changed=command({action:'apply_frequency'}),second=snap(changed.result.period_id),sd=details(second.period.id)
  check(`${prefix}: exact transition boundary and original goal cadence`,[second.period.start_date,second.period.frequency,sd.items.find(i=>i.line_id===g).config.cadence],[first.period.end_date,nextFrequency,'monthly'])
  check(`${prefix}: explicit initial override and reserve opening counted once`,[sd.items.find(i=>i.line_id===g).planned_cents,sd.items.find(i=>i.line_id===g).reserve_cents],[3000,firstGoal-2000+3000])
  check(`${prefix}: signed category and Other carry survive switch`,[sd.rollover.parts.find(p=>p.id===category).opening_carry_cents,sd.other_opening_carry_cents],[-1000,7000])
  tx(b,second.period.start_date,-9999);tx(a,second.period.start_date,-500)
  check(`${prefix}: future account scope excludes only later activity`,[details(second.period.id).actuals?.net_expense_cents??snap(second.period.id).actuals?.net_expense_cents,details(first.period.id).items.find(i=>i.line_id===e).used_cents],[500,4000])
  const refund=tx(a,second.period.start_date,500,'refund')
  command({action:'claim_source',line_id:g,purpose:'refund',source_key:`t:${refund}`,amount_cents:500,occurrence_date:null,occurrence_revision_id:null,related_claim_id:claim.result.claim_id,complete:false})
  const thirdId=command({action:'open_next_period',...continuing}).result.period_id,third=snap(thirdId),td=details(thirdId)
  check(`${prefix}: historical navigation lists later saved periods without changing historical balances`,[details(first.period.id).lifecycle.periods.map(p=>p.id),details(first.period.id).items.find(i=>i.line_id===g).reserve_cents],[[first.period.id,second.period.id,thirdId],firstGoal-2000])
  check(`${prefix}: full continuing period keeps explicit override, not cadence rescaling`,[third.period.start_date,td.items.find(i=>i.line_id===g).planned_cents,td.items.find(i=>i.line_id===g).reserve_cents],[second.period.end_date,7000,firstGoal-2000+3000+500+7000])
  check(`${prefix}: child debt and Other carry are composed once`,[td.rollover.parts.find(p=>p.id===category).opening_carry_cents,td.other_opening_carry_cents],[1500,14000])
  sql(`UPDATE public.transactions SET amount=-5000 WHERE id=${quote(ordinary)};`)
  check(`${prefix}: late historical correction recomputes through both boundaries`,details(thirdId).rollover.parts.find(p=>p.id===category).opening_carry_cents,500)
  check(`${prefix}: immutable review remains separate from latest facts`,[details(first.period.id).lifecycle.changed_since_review,details(first.period.id).lifecycle.review],[true,reviewed])
  sql(`DELETE FROM public.transactions WHERE id=${quote(purchase)};`)
  const invalid=details(thirdId)
  check(`${prefix}: original deletion invalidates cross-period refund without minting reserve`,[invalid.items.find(i=>i.line_id===g).reserve_cents,invalid.claims.filter(c=>!c.valid).length],[firstGoal+3000+7000,2])
  const savedConfig=invalid.items.find(i=>i.line_id===g).config
  check(`${prefix}: account policy and goal schedule survive source recomputation`,[savedConfig.cadence,savedConfig.amount_cents,savedConfig.anchor,snap(first.period.id).revision],['monthly',1000,start,savedRevision])
  const workspace=await edge(u,'query-budget',{action:'workspace',period_id:thirdId})
  check(`${prefix}: real Edge composes the same latest goal and child balances`,[workspace.status,workspace.body.details.items.find(i=>i.line_id===g).reserve_cents,workspace.body.details.rollover.parts.find(p=>p.id===category).opening_carry_cents],[200,firstGoal+10000,500])
  assert.throws(()=>command({action:'revise',period_id:first.period.id,scope:'period',...initial,opening_drawdown_cents:0}),/budget_historical_readonly/)
  check(`${prefix}: earlier plan is not rewritable after dependent periods`,true)
  const paused=command({action:'save_item',line_id:g,item:{...config,state:'paused'},opening_cents:5000,opening_date:start,accept_gap:false})
  check(`${prefix}: goal pause preserves override and rights, stops only future refill`,[details(thirdId).items.find(i=>i.line_id===g).planned_cents,details(thirdId).items.find(i=>i.line_id===g).reserve_cents,snap().future_template.allocations.find(a=>a.line_id===g).amount_cents],[7000,firstGoal+10000,0])
  command({action:'undo',operation_id:paused.operation_id})
  check(`${prefix}: compatible goal undo restores explicit continuing override`,[snap().future_template.allocations.find(a=>a.line_id===g).amount_cents,details(thirdId).items.find(i=>i.line_id===g).config.state],[7000,'saving'])
  fixtures.push({user:u,goal:g,first:first.period.id,second:second.period.id,third:thirdId,firstGoal})
 }
 return fixtures
}
