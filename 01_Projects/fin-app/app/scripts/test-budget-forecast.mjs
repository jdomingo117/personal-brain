import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {mkdirSync} from 'node:fs'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

/** Called only by the guarded disposable database runner. No existing target accepted. */
export async function runBudgetForecastChecks({newUser,sql,quote:q,check,edge,source,commandSQL}){
 const dates=JSON.parse(sql(`SELECT json_build_object('start',date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date,'today',(now() AT TIME ZONE 'Australia/Sydney')::date,'end',(date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')+interval '1 month')::date,'months',(SELECT json_agg(json_build_object('start',d::date,'end',(d+interval '1 month')::date,'days',((d+interval '1 month')::date-d::date)) ORDER BY d) FROM generate_series(date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '3 months',date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '1 month',interval '1 month') d));`))
 const u=await newUser(),line=randomUUID(),account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${q(u.id)},${q(u.tenant)},'Forecast fictional','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const snap=()=>JSON.parse(sql(`SELECT public.budget_query(${q(u.tenant)},${q(u.id)},'{"action":"snapshot"}');`))
 const cmd=i=>{const s=snap();return JSON.parse(sql(commandSQL(u,randomUUID(),{expected_method:'budget-foundation-v1',expected_source:source(u.tenant),plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...i})))}
 const details=()=>{const s=snap();return JSON.parse(sql(`SELECT public.budget_workspace_details(${q(u.tenant)},${q(u.id)},${q(s.plan.id)},${q(s.period.id)},${source(u.tenant)},${q(s.plan.version)});`))}
 const forecast=()=>details().forecast,flex=()=>forecast().flexible
 const row=(date,amount,kind='expense',pending=false,merchant='forecast-shop')=>sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash) VALUES(${q(u.id)},${q(u.tenant)},${q(account)},${q(date)},'Forecast fixture',${q(merchant)},${q(merchant)},'Shopping',${amount},${q(kind)},'user',${pending},false,decode(md5(${q(randomUUID())}),'hex')) RETURNING id;`).split('\n')[0]
 const cover=(from=dates.months[0].start,to=dates.end)=>sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${q(u.tenant)},${q(account)},${q(account)},${q(from)},${q(to)},'verified_statement','{"fixture":"r01"}',0,${q(u.id)});`)
 cmd({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:dates.start,account_ids:[account],destination_account_ids:[],income_cents:100000,opening_drawdown_cents:0,lines:[{id:line,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0}]}})
 cmd({action:'activate',expected_draft:'1',accept_gap:false})
 check('R01 absent history suppresses forecast rather than inventing zero',[flex().available,flex().reason,flex().projected_cents],[false,'not_enough_history',null])
 const ids=dates.months.map((m,i)=>row(m.start,-m.days*(i+1)*100));cover();row(dates.today,-2000);row(dates.today,5000,'refund');row(dates.months[0].start,99999,'refund')
 const f=forecast(),remaining=Number(sql(`SELECT ${q(dates.end)}::date-${q(dates.today)}::date-1;`))
 check('R01 approved samples are monthly gross divided by full calendar days',f.flexible.history.map(m=>[m.start_date,m.gross_cents,m.days]),dates.months.map((m,i)=>[m.start,m.days*(i+1)*100,m.days]))
 check('R01 median rate stays exact and uses tomorrow through period end',[f.flexible.median.start_date,f.flexible.remaining_days,f.flexible.projected_cents],[dates.months[1].start,remaining,2000+200*remaining])
 check('R01 unassigned and historical credits do not free flexible capacity',[f.flexible.settled_net_cents,f.flexible.remaining_allocation_cents],[2000,8000])
 check('R01 sufficient complete evidence enables within-plan estimate',[f.flexible.available,f.flexible.status],[true,'within_plan'])
 const s=snap();check('R01 forecast carries exact method, source, plan, period and local date',[f.method,f.source_revision,f.plan_version,f.period_id,f.as_of],['budget-forecast-v1',String(source(u.tenant)),String(s.plan.version),s.period.id,dates.today])
 const financialSnapshot=()=>{const value=snap();delete value.generated_at;return value},financial=financialSnapshot(),counts=sql(`SELECT (SELECT count(*) FROM public.budget_operations)||':'||(SELECT count(*) FROM public.budget_attention_events);`)
 details();details();check('R01 repeated forecast reads do not mutate financial state or attention history',[financialSnapshot(),sql(`SELECT (SELECT count(*) FROM public.budget_operations)||':'||(SELECT count(*) FROM public.budget_attention_events);`)],[financial,counts])
 const pending=row(dates.today,-30000,'expense',true),p=flex()
 check('R01 pending is conditional and excluded from settled projection',[p.projected_cents,p.settled_net_cents,p.pending_expense_cents,p.pending_overage],[f.flexible.projected_cents,2000,30000,true])
 check('R01 pending alert is distinct from settled overspend',details().attention.items.some(i=>i.key==='pending:flexible'&&i.kind==='pending_overage'),true)
 let pendingAttention=details().attention,pendingIssue=pendingAttention.items.find(i=>i.key==='pending:flexible')
 const pendingAck=cmd({action:'set_attention',expected_attention:pendingAttention.version,issue_key:pendingIssue.key,issue_hash:pendingIssue.issue_hash,state:'acknowledged',until:null})
 const morePending=row(dates.today,-1,'expense',true)
 check('R01 ordinary pending growth below materiality stays reviewed',details().attention.items.find(i=>i.key==='pending:flexible').state,'acknowledged')
 sql(`UPDATE public.transactions SET merchant_key='reinterpreted-pending' WHERE id=${q(pending)};`)
 check('R01 changed existing pending evidence reopens without a larger total',[details().attention.items.find(i=>i.key==='pending:flexible').state,details().attention.items.find(i=>i.key==='pending:flexible').reopen_reason],['active','evidence_changed'])
 pendingAttention=details().attention;pendingIssue=pendingAttention.items.find(i=>i.key==='pending:flexible')
 const stalePending={action:'set_attention',expected_attention:pendingAttention.version,issue_key:pendingIssue.key,issue_hash:pendingIssue.issue_hash,state:'acknowledged',until:null}
 cmd(stalePending)
 sql(`DELETE FROM public.transactions WHERE id=${q(pending)};`);row(dates.today,-30000,'expense',true,'replacement-pending')
 check('R01 replacement of old pending evidence reopens a reviewed warning',details().attention.items.find(i=>i.key==='pending:flexible').reopen_reason,'evidence_changed')
 assert.throws(()=>cmd(stalePending),/budget_stale_attention/)
 check('R01 pending preference rejects a stale source/issue basis',true)
 sql(`DELETE FROM public.transactions WHERE tenant_id=${q(u.tenant)} AND pending;`)
 sql(`DELETE FROM public.transactions WHERE id=${q(pending)};`)
 row(dates.months[1].start,-99999,'expense',true);row(dates.months[1].start,-99999,'transfer');check('R01 pending holds and repayment transfers do not inflate historical gross',flex().median.gross_cents,dates.months[1].days*200)
 const split=row(dates.months[0].start,-3100)
 sql(`INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,category_id) VALUES(${q(u.tenant)},${q(split)},0,-1000,'transfer','Transfer','transfer'),(${q(u.tenant)},${q(split)},1,-2100,'expense','Shopping','shopping');`)
 check('R01 split expense replaces parent once and omits principal',flex().history[0].gross_cents,dates.months[0].days*100+2100)
 sql(`DELETE FROM public.transactions WHERE id=${q(split)};`)
 const bad=row(dates.months[0].start,-800,'transfer')
 sql(`UPDATE public.transactions SET kind_source='derived',transfer_candidate=true WHERE id=${q(bad)};SELECT public.decide_transfer_leg(${q(u.tenant)},${q(bad)},'rejected');`);cover()
 check('R01 rejected derived transfer is restored to expense',flex().history[0].gross_cents,dates.months[0].days*100+800)
 sql(`DELETE FROM public.transactions WHERE id=${q(bad)};`)
 sql(`DELETE FROM public.account_activity_coverage WHERE tenant_id=${q(u.tenant)};`);cover(dates.months[0].end)
 check('R01 partially covered historical sample is excluded',[flex().history.length,flex().available,flex().reason],[2,false,'not_enough_history'])
 cover();sql(`UPDATE public.transactions SET amount=0 WHERE id=${q(ids[0])};`)
 check('R01 covered zero spending remains a genuine zero month',flex().history[0].gross_cents,0)
 sql(`UPDATE public.transactions SET amount=${-dates.months[0].days*100} WHERE id=${q(ids[0])};DELETE FROM public.account_activity_coverage WHERE tenant_id=${q(u.tenant)};`);cover(dates.months[0].start,dates.start)
 check('R01 missing current coverage prevents an all-clear',[flex().available,flex().reason,flex().status],[false,'incomplete_coverage','check_data']);cover()
 sql(`DELETE FROM public.account_activity_coverage WHERE tenant_id=${q(u.tenant)};`);cover('2024-01-01','2024-04-01');cover(dates.start,dates.end)
 row('2024-01-01',-3100);row('2024-02-01',-5800);row('2024-03-01',-9300)
 check('R01 last covered months can be older and use leap February exactly',[flex().history.map(x=>x.days),flex().median.start_date,flex().projected_cents],[[31,29,31],'2024-02-01',2000+200*remaining]);cover()
 // Independent exact integer-cents reference. No copy of the SQL estimator.
 sql(`UPDATE public.transactions SET amount=-200000 WHERE id IN(${ids.map(q).join(',')});`)
 const large=flex();const ordered=dates.months.map(m=>({n:200000n,d:BigInt(m.days)})).sort((a,b)=>a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0),median=ordered[1],numerator=2000n*median.d+median.n*BigInt(remaining),want=Number((2n*numerator+median.d)/(2n*median.d))
 check('R01 uneven month lengths retain exact rational rate until final cent',large.projected_cents,want)
 check('R01 material projected overspend has its own attention issue',[large.status,details().attention.items.some(i=>i.key==='forecast:flexible'&&i.kind==='projected_overspend')],['likely_to_exceed',true])
 const derive=allocation=>{const st=snap();return JSON.parse(sql(`SELECT public.budget_forecast_facts(${q(u.tenant)},${q(u.id)},${q(st.plan.id)},${q(st.period.id)},${source(u.tenant)},${q(st.plan.version)},jsonb_set(public.budget_workspace_details(${q(u.tenant)},${q(u.id)},${q(st.plan.id)},${q(st.period.id)},${source(u.tenant)},${q(st.plan.version)}),'{items,0,planned_cents}',to_jsonb(${allocation}::numeric)));`)).flexible}
 check('R01 unsafe combined allocation fails closed',derive('9007199254740992').reason,'amount_too_large')
 if(remaining>0){
  // Keep the allowance below $500 so the $25 floor, rather than 5%, governs this case on any run date.
  const floorRate=Math.ceil(4000/remaining),floorProjection=2000+floorRate*remaining
  dates.months.forEach((m,i)=>sql(`UPDATE public.transactions SET amount=${-m.days*floorRate} WHERE id=${q(ids[i])};`))
  check('R01 exactly $25 projected excess is below strict alert trigger',derive(floorProjection-2500).status,'within_plan')
  check('R01 one cent beyond $25 projected excess triggers warning',derive(floorProjection-2501).status,'likely_to_exceed')
  const rate=Math.floor(100000/(remaining+1)),actual=105000-rate*remaining
  dates.months.forEach((m,i)=>sql(`UPDATE public.transactions SET amount=${-m.days*rate} WHERE id=${q(ids[i])};`))
  sql(`UPDATE public.transactions SET amount=${-actual} WHERE tenant_id=${q(u.tenant)} AND date=${q(dates.today)} AND amount=-2000;`)
  check('R01 exactly 5 percent above a larger allocation stays below strict trigger',derive(100000).status,'within_plan')
  sql(`UPDATE public.transactions SET amount=${-actual-1} WHERE tenant_id=${q(u.tenant)} AND date=${q(dates.today)} AND amount=${-actual};`)
  check('R01 one cent beyond 5 percent triggers warning',derive(100000).status,'likely_to_exceed')
  sql(`UPDATE public.transactions SET amount=-2000 WHERE tenant_id=${q(u.tenant)} AND date=${q(dates.today)} AND amount=${-actual-1};UPDATE public.transactions SET amount=-200000 WHERE id IN(${ids.map(q).join(',')});`)
 }
 const issue=details().attention.items.find(i=>i.key==='forecast:flexible'),before=snap(),attention=details().attention
 const ack=cmd({action:'set_attention',expected_attention:attention.version,issue_key:issue.key,issue_hash:issue.issue_hash,state:'acknowledged',until:null})
 check('R01 acknowledging forecast leaves plan and projected amount unchanged',[details().attention.items.find(i=>i.key===issue.key).state,snap().plan.version,flex().projected_cents],['acknowledged',before.plan.version,want])
 assert.equal(ack.status,'committed')
 sql(`UPDATE public.transactions SET amount=-400000 WHERE id=${q(ids[1])};`)
 check('R01 changing historical assumptions reopens reviewed forecast',details().attention.items.find(i=>i.key===issue.key).state,'active')
 const foreign=await newUser();check('R01 foreign tenant cannot read the forecast',(await edge(foreign,'query-budget',{action:'workspace',period_id:s.period.id})).status,404)
 const owner=await edge(u,'query-budget',{action:'workspace'});check('R01 actual authenticated workspace includes forecast',owner.status,200);check('R01 public forecast omits source transaction details',JSON.stringify(owner.body.details.forecast).includes('original_description'),false)
 check('R01 authenticated roles cannot call internal forecast derivation',sql("SELECT has_function_privilege('authenticated','public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb)','EXECUTE');"),'f')
 const fixed=randomUUID();cmd({action:'save_item',line_id:fixed,item:{type:'bill',name:'Rent',target_cents:null,estimated:true,due_date:null,planning_goal_id:null,amount_cents:10000,cadence:'monthly',anchor:dates.start,state:'draft',recurring_id:null},opening_cents:0,opening_date:dates.start,accept_gap:true})
 check('R01 incomplete fixed schedule prevents flexible all-clear',[flex().available,flex().reason],[false,'incomplete_fixed_schedule'])
 const billItem={type:'bill',name:'Rent',source_account_id:account,source_merchant_key:'rent',target_cents:null,estimated:true,due_date:null,planning_goal_id:null,amount_cents:10000,cadence:'monthly',anchor:dates.start,state:'saving',recurring_id:null}
 cmd({action:'save_item',line_id:fixed,item:billItem,opening_cents:0,opening_date:dates.start,accept_gap:true})
 row(dates.months[1].start,-100000,'expense',false,'rent')
 check('R01 saved explicit fixed source mapping excludes historical bill from flexible rate',flex().history[1].gross_cents,400000)
 let fixedFact=forecast().fixed.find(x=>x.line_id===fixed)
 check('R01 fixed monthly bill is scheduled once rather than linearly paced',[fixedFact.projected_cents,fixedFact.expected_remaining_cents,fixedFact.overdue_expected_cents],[10000,10000,10000])
 const move=cmd({action:'move_allocation',from_line_id:fixed,to_line_id:line,amount_cents:6000})
 check('R01 dated fixed excess has its own forecast attention',[forecast().fixed.find(x=>x.line_id===fixed).status,details().attention.items.some(x=>x.key===`forecast:${fixed}`&&x.kind==='fixed_projected_overspend')],['likely_to_exceed',true])
 cmd({action:'undo',operation_id:move.operation_id})
 const paid=row(dates.start,-10000,'expense',false,'rent'),rawBill=details().items.find(x=>x.line_id===fixed)
 cmd({action:'claim_source',line_id:fixed,purpose:'expense',source_key:`t:${paid}`,amount_cents:10000,occurrence_date:dates.start,occurrence_revision_id:rawBill.config.schedule_id,related_claim_id:null,complete:false})
 fixedFact=forecast().fixed.find(x=>x.line_id===fixed)
 check('R01 matched bill counts once and removes remaining occurrence',[fixedFact.projected_cents,fixedFact.settled_net_cents,fixedFact.expected_remaining_cents],[10000,10000,0])
 check('R01 explicit bill claim is excluded from current flexible net',flex().settled_net_cents,2000)
 const expense=sql(`SELECT id FROM public.transactions WHERE tenant_id=${q(u.tenant)} AND date=${q(dates.today)} AND amount=-2000 LIMIT 1;`)
 const linked=cmd({action:'claim_source',line_id:line,purpose:'expense',source_key:`t:${expense}`,amount_cents:2000,occurrence_date:null,occurrence_revision_id:null,related_claim_id:null,complete:false})
 const refund=row(dates.today,1000,'refund')
 cmd({action:'claim_source',line_id:line,purpose:'refund',source_key:`t:${refund}`,amount_cents:1000,occurrence_date:null,occurrence_revision_id:null,related_claim_id:linked.result.claim_id,complete:false})
 check('R01 explicitly linked flexible refund lowers current net only',flex().settled_net_cents,1000)
 for(const [label,start,frequency]of [['future',dates.end,'monthly'],['past',dates.months[2].start,'monthly'],['fortnight',dates.today,'fortnightly']]){
  const v=await newUser(),vl=randomUUID(),va=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${q(v.id)},${q(v.tenant)},'Boundary fictional','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  const vs=()=>JSON.parse(sql(`SELECT public.budget_query(${q(v.tenant)},${q(v.id)},'{"action":"snapshot"}');`))
  const vc=input=>{const st=vs();return JSON.parse(sql(commandSQL(v,randomUUID(),{expected_method:'budget-foundation-v1',expected_source:source(v.tenant),plan_id:st.plan?.id,period_id:st.period?.id,expected_plan:st.plan?.version,...input})))}
  vc({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency,start_date:start,anchor:start,account_ids:[va],destination_account_ids:[],income_cents:100000,opening_drawdown_cents:0,lines:[{id:vl,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0}]}});vc({action:'activate',expected_draft:'1',accept_gap:false})
  sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${q(v.tenant)},${q(va)},${q(va)},${q(dates.months[0].start)},${q(dates.end)},'verified_statement','{}',0,${q(v.id)});`)
  const st=vs(),bf=JSON.parse(sql(`SELECT public.budget_workspace_details(${q(v.tenant)},${q(v.id)},${q(st.plan.id)},${q(st.period.id)},${source(v.tenant)},${q(st.plan.version)});`)).forecast
  if(label==='future')check('R01 future period is provisional with no fabricated actuals',[bf.phase,bf.through_date,bf.flexible.settled_net_cents,bf.flexible.projected_cents],['future',null,null,0])
  if(label==='past')check('R01 past period does not generate a retrospective forecast',[bf.phase,bf.flexible.reason,bf.flexible.projected_cents],['past','historical_period',null])
  if(label==='fortnight')check('R01 fortnight uses exact local days rather than half a month',[bf.flexible.remaining_days,bf.flexible.available],[13,true])
 }
 return {user:u,account,line,dates}

}

export async function runBudgetForecastBrowserChecks({fixture,signedPage,check,repo}){
 const capture=process.argv.includes('--release-candidate')?'docs/budget-m7/candidate/visual/forecast':process.argv.includes('--overview-pass3')?'docs/budget-ui/overview-pass3/forecast':'docs/budget-ui/r01'
 mkdirSync(`${repo}/${capture}`,{recursive:true})
 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  const page=await signedPage(fixture.user,width,true)
  const toggle=page.getByRole('button',{name:'Toggle dark mode',exact:true})
  if((await toggle.getAttribute('aria-pressed')==='true')!==(theme==='dark'))await toggle.click()
  const region=page.getByRole('region',{name:'Spending estimate',exact:true})
  await expect(region.locator('[data-budget-forecast-value]')).not.toHaveText('Unavailable')
  await expect(page.getByRole('region',{name:'Budget overview'}).getByRole('region',{name:'Spending estimate'})).toBeVisible()
  await expect(page.getByRole('region',{name:'Budget overview'})).toContainText('not your bank balance')
  const summary=region.locator('summary');await summary.focus();await page.keyboard.press('Enter')
  await expect(region).toContainText('median of those three daily averages')
  await expect(region).toContainText('Bills, by their due dates')
  await expect(region).toContainText('Unmatched does not prove unpaid')
  for(const m of fixture.dates.months)await expect(region).toContainText(m.start)
  const violations=(await new AxeBuilder({page}).include('[aria-label="Spending estimate"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations
  check(`R01 forecast WCAG scan ${width} ${theme}`,violations,[])
  check(`R01 forecast scale labels stay separate ${width} ${theme}`,await region.locator('.budget-forecast-scale > span').evaluateAll(([start,allowance])=>{
   const left=start.getBoundingClientRect(),right=allowance.getBoundingClientRect()
   return left.right<=right.left||left.bottom<=right.top
  }),true)
  check(`R01 no horizontal overflow ${width} ${theme}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.screenshot({path:`${repo}/${capture}/forecast-${width}-${theme}.png`,fullPage:true})
  if(width===390&&theme==='light'){
   await page.route('**/functions/v1/query-budget',route=>route.request().postDataJSON()?.action==='workspace'?route.fulfill({status:503,contentType:'application/json',body:'{"message":"Fictional refresh failure"}'}):route.continue())
   await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
   await expect(region).toContainText('Previously loaded facts may be out of date')
   await expect(region).not.toContainText('Flexible spending: projected')
   check('R01 failed refresh suppresses retained projected amounts and all-clear',true)
   await page.unroute('**/functions/v1/query-budget')
   await page.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(region).toContainText('Flexible spending: projected')
  }
  await page.context().close()
 }
}
