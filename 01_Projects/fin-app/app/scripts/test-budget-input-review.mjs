import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {confirmBudgetAssistance} from './lib/budgetAssistanceUI.mjs'

/** Called only by the positively guarded fresh disposable Budget runner. */
export async function runBudgetInputReviewChecks({newUser,sql,quote,check,edge,signedPage,snapshotSQL,assistanceFixture,sqlAsync}){
 const u=assistanceFixture.user,account=assistanceFixture.account
 const from=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;"),pay=sql(`SELECT (${quote(from)}::date+14)::date;`)
 const source=()=>snapshotSQL(u).source_revision
 const recurring=sql(`SELECT id FROM public.recurring_series_overrides WHERE tenant_id=${quote(u.tenant)} AND merchant_key='m6-rent';`).split('\n')[0]
 const ids=[0,1,2,3,4].map(()=>randomUUID())
 const historyEvidence=await edge(u,'query-budget',{action:'assisted_setup',frequency:'monthly',start_date:from,account_ids:[account]})
 check('R04 observed earned income keeps its actual receipt dates',historyEvidence.body.income_dates.length,6)
 check('R04 dated earned income excludes refunds and own transfers',historyEvidence.body.income_dates.map(d=>d.income_cents),[50000,50000,50000,50000,50000,50000])
 const payload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:from,anchor:from,account_ids:[account],destination_account_ids:[],income_cents:70000,opening_drawdown_cents:5000,
  lines:[{id:ids[0],kind:'everyday',name:'My everyday',allocation_cents:10000,opening_cents:0},{id:ids[1],kind:'fixed',name:'Protected rent',allocation_cents:20000,opening_cents:0},{id:ids[2],kind:'reserve',name:'Protected trip',allocation_cents:5000,opening_cents:10000},{id:ids[3],kind:'fixed',name:'Reviewed rent',allocation_cents:2000,opening_cents:0},{id:ids[4],kind:'reserve',name:'Annual insurance',allocation_cents:1000,opening_cents:3000}],
  assistance:{method:'budget-assist-v2',fingerprint:'a'.repeat(64),source_revision:source(),manual:false,periods:[{start_date:'2026-09-01',end_date:'2026-10-01'}],provenance:{income:'user-confirmed-expected-income-and-pay-dates',costs:'individually-reviewed-schedules-and-reserves'},goal_intent:{line_id:ids[2],name:'Protected trip',target_cents:90000,needed_by:'2027-06-01'},
   reviewed_inputs:{apply_income:false,apply_everyday:true,income:{amount_cents:70000,pay_dates:[pay],confirmed:true},irregular_confirmed:true,costs:[{line_id:ids[3],name:'Reviewed rent',selected:true,confirmed:true,paid:false,type:'bill',amount_cents:2000,opening_cents:0,cadence:'monthly',anchor:from,due_date:null,recurring_id:recurring,target_cents:null},{line_id:ids[4],name:'Annual insurance',selected:true,confirmed:true,paid:false,type:'reserve',amount_cents:1000,opening_cents:3000,cadence:'annual',anchor:from,due_date:'2027-06-01',recurring_id:null,target_cents:12000}]}}}
 check('R04 reviewed setup validates against durable SQL',JSON.parse(sql(`SELECT public.budget_validate_setup(${quote(u.tenant)},${quote(JSON.stringify(payload))}::jsonb);`)).resources_cents,75000)
 const saved=await edge(u,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(),expected_draft:'0',payload})
 check('R04 saves individually reviewed inputs through the real Edge',saved.status,200)
 check('R04 saving still does not activate a plan',snapshotSQL(u).plan,null)
 const read=()=>JSON.parse(sql(`SELECT payload FROM public.budget_draft_revisions WHERE tenant_id=${quote(u.tenant)} ORDER BY version DESC LIMIT 1;`))
 check('R04 income, pay dates, individual bills, deadlines and opening reserves round-trip',read().assistance,payload.assistance)
 for(const [name,mutate]of [
  ['income confirmation',p=>{p.assistance.reviewed_inputs.income.confirmed=false}],
  ['expected pay date',p=>{p.assistance.reviewed_inputs.income.pay_dates=[]}],
  ['out-of-window pay date',p=>{p.assistance.reviewed_inputs.income.pay_dates=['2027-12-01']}],
  ['duplicate pay date',p=>{p.assistance.reviewed_inputs.income.pay_dates=[pay,pay]}],
  ['individual cost confirmation',p=>{p.assistance.reviewed_inputs.costs[0].confirmed=false}],
  ['already paid cost',p=>{p.assistance.reviewed_inputs.costs[0].paid=true}],
  ['unresolved essential target',p=>{p.assistance.reviewed_inputs.costs[1].target_cents=null}],
  ['changed cost without re-review',p=>{p.lines[3].allocation_cents=1}],
 ]){
  const bad=structuredClone(payload);mutate(bad)
  if(name==='income confirmation'||name==='already paid cost'){
   const result=await edge(u,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(),expected_draft:'1',payload:bad})
   check(`R04 rejects missing/invalid ${name}`,result.status,422)
  }else{assert.throws(()=>sql(`SELECT public.budget_validate_setup(${quote(u.tenant)},${quote(JSON.stringify(bad))}::jsonb);`));check(`R04 rejects missing/invalid ${name}`,true)}
 }
 check('R04 rejected reviews append no draft revision',sql(`SELECT version FROM public.budget_drafts WHERE tenant_id=${quote(u.tenant)};`),'1')
 const zero=structuredClone(payload);zero.income_cents=0;zero.assistance.reviewed_inputs.income={amount_cents:0,pay_dates:[],confirmed:true}
 check('R04 intentional zero income permits an explicit known-gap draft',JSON.parse(sql(`SELECT public.budget_validate_setup(${quote(u.tenant)},${quote(JSON.stringify(zero))}::jsonb);`)).resources_cents,5000)
 const foreign=await newUser(),foreignAccount=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(foreign.id)},${quote(foreign.tenant)},'Foreign fixture','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const foreignRecurring=sql(`INSERT INTO public.recurring_series_overrides(tenant_id,account_id,merchant_key,state,cadence_override,expected_amount_override,next_expected_override) VALUES(${quote(foreign.tenant)},${quote(foreignAccount)},'foreign-r04','active','Monthly',2000,${quote(from)}) RETURNING id;`).split('\n')[0]
 const bad=structuredClone(payload);bad.assistance.reviewed_inputs.costs[0].recurring_id=foreignRecurring
 const rejected=await edge(u,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(),expected_draft:'1',payload:bad})
 check('R04 rejects a foreign recurring reference without changing the saved draft',rejected.status,422)
 const activation={action:'activate',request_id:randomUUID(),expected_method:'budget-foundation-v1',expected_source:source(),expected_draft:'1',accept_gap:false}
 const activated=await edge(u,'manage-budget',activation);check('R04 individually reviewed setup activates separately',activated.status,200)
 const s=snapshotSQL(u),items=JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('line_id',line_id,'config',payload) ORDER BY line_id) FROM public.budget_item_revisions WHERE tenant_id=${quote(u.tenant)};`))
 check('R04 activation preserves all protected allocations and opening reserves',s.lines.map(l=>[l.id,l.allocation_cents,l.opening_cents]).sort(),payload.lines.map(l=>[l.id,l.allocation_cents,l.opening_cents]).sort())
 const bill=items.find(i=>i.line_id===ids[3]).config,reserve=items.find(i=>i.line_id===ids[4]).config,goal=items.find(i=>i.line_id===ids[2]).config
 check('R04 keeps an individual bill identity with its actual amount, cadence and occurrence start',[bill.type,bill.amount_cents,bill.cadence,bill.anchor,bill.recurring_id],['bill',2000,'monthly',from,recurring])
 check('R04 retains the annual deadline and reserve target with contributions on budget dates',[reserve.type,reserve.target_cents,reserve.due_date,reserve.amount_cents,reserve.cadence],['reserve',12000,'2027-06-01',1000,'monthly'])
 check('R04 retains the original protected goal target and deadline',[goal.type,goal.target_cents,goal.due_date],['goal',90000,'2027-06-01'])
 const edited=structuredClone(payload);edited.assistance.manual=true;edited.assistance.reviewed_inputs.income.confirmed=false
 const after=await edge(u,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(),expected_draft:'1',payload:edited});check('R04 manual edits remain saveable with visible unresolved confirmation',after.status,200)
 const replay=JSON.parse(sql(`SELECT public.budget_command(${quote(u.tenant)},${quote(u.id)},${quote(activation.request_id)},${quote(JSON.stringify(Object.fromEntries(Object.entries(activation).filter(([key])=>key!=='request_id'))))}::jsonb,false);`))
 check('R04 exact activation receipt replays even after a newer draft and with writes disabled',replay,activated.body)
 check('R04 replay does not duplicate goal or cost configurations',sql(`SELECT count(*) FROM public.budget_item_revisions WHERE tenant_id=${quote(u.tenant)};`),'3')

 const concurrent=await newUser(),copy=structuredClone(payload),mapping=new Map(ids.map(id=>[id,randomUUID()]))
 copy.account_ids=[];copy.assistance.source_revision=snapshotSQL(concurrent).source_revision
 for(const line of copy.lines)line.id=mapping.get(line.id)
 copy.assistance.goal_intent.line_id=mapping.get(copy.assistance.goal_intent.line_id)
 for(const cost of copy.assistance.reviewed_inputs.costs){cost.line_id=mapping.get(cost.line_id);cost.recurring_id=null}
 const queuedSave=await edge(concurrent,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:copy.assistance.source_revision,expected_draft:'0',payload:copy})
 check('R04 concurrency fixture saves reviewed inputs',queuedSave.status,200)
 const request=randomUUID(),body={action:'activate',expected_method:'budget-foundation-v1',expected_source:copy.assistance.source_revision,expected_draft:'1',accept_gap:false}
 const held=sqlAsync(`BEGIN; SELECT public.budget_lock_source(${quote(concurrent.tenant)}); /* r04-race-hold */ SELECT pg_sleep(1.2); COMMIT;`)
 let asleep=false
 for(let i=0;i<20;i++){if(sql("SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%r04-race-hold%' AND wait_event='PgSleep';")==='1'){asleep=true;break}await new Promise(r=>setTimeout(r,30))}
 assert(asleep,'Concurrency fixture must hold the actual tenant source gate')
 const statement=`/* r04-race-request */ SELECT public.budget_command(${quote(concurrent.tenant)},${quote(concurrent.id)},${quote(request)},${quote(JSON.stringify(body))}::jsonb,true);`
 const racing=Promise.allSettled([sqlAsync(statement),sqlAsync(statement)])
 let waiting=false
 for(let i=0;i<20;i++){if(Number(sql("SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%r04-race-request%' AND wait_event_type='Lock';"))===2){waiting=true;break}await new Promise(r=>setTimeout(r,30))}
 const outcomes=await racing;await held
 check('R04 duplicate activation requests both wait behind the real source gate',waiting,true)
 check('R04 both concurrent copies return the same durable receipt',outcomes.map(o=>o.status),['fulfilled','fulfilled'])
 check('R04 concurrent receipt outcomes agree',JSON.parse(outcomes[0].value),JSON.parse(outcomes[1].value))
 check('R04 concurrent activation creates one plan and exactly three item configurations',JSON.parse(sql(`SELECT json_build_array((SELECT count(*) FROM public.budget_plans WHERE tenant_id=${quote(concurrent.tenant)}),(SELECT count(*) FROM public.budget_item_revisions WHERE tenant_id=${quote(concurrent.tenant)}));`)),[1,3])

 if(!signedPage){console.log('R04 backend activation/review scope complete; browser presentation not run.');return}
 const v=await newUser(),a=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(v.id)},${quote(v.tenant)},'Input review fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
 SELECT ${quote(v.id)},${quote(v.tenant)},${quote(a)},d::date,'R04 historical expense','Shop','r04-shop','Shopping',-10000,'expense','user',false,false FROM generate_series(${quote(from)}::date-interval '6 months',${quote(from)}::date-1,interval '1 month') d;
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
 SELECT ${quote(v.id)},${quote(v.tenant)},${quote(a)},d::date,'R04 historical income','Employer','r04-pay','Income',50000,'income','user',false,false FROM generate_series(${quote(from)}::date-interval '6 months',${quote(from)}::date-1,interval '1 month') d;
 INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(v.tenant)},${quote(a)},${quote(a)},${quote(from)}::date-interval '6 months',(now() AT TIME ZONE 'Australia/Sydney')::date+1,'verified_statement','{"fixture":"r04"}',0,${quote(v.id)});
 INSERT INTO public.recurring_series_overrides(tenant_id,account_id,merchant_key,state,cadence_override,expected_amount_override,next_expected_override) VALUES(${quote(v.tenant)},${quote(a)},'r04-rent','active','Monthly',2000,${quote(from)}),(${quote(v.tenant)},${quote(a)},'r04-phone','active','Monthly',1000,${quote(from)});`)
 const page=await signedPage(v,390,false)
 await page.getByRole('button',{name:'Enter my own amounts',exact:true}).click()
 await page.getByLabel('Expected income this period (AUD)',{exact:true}).fill('700')
 await page.getByLabel('Existing cash to use this period (AUD)',{exact:true}).fill('50')
 await page.getByLabel('Planned for Everyday spending (AUD)',{exact:true}).fill('300')
 await page.getByRole('button',{name:'Add regular bills',exact:true}).click()
 await page.getByLabel('Allowance name · Regular bills',{exact:true}).fill('Protected rent')
 await page.getByLabel('Planned for Protected rent (AUD)',{exact:true}).fill('200')
 await page.getByRole('button',{name:'Add set money aside',exact:true}).click()
 await page.getByLabel('Allowance name · Set money aside',{exact:true}).fill('Protected trip')
 await page.getByLabel('Planned for Protected trip (AUD)',{exact:true}).fill('50')
 await page.getByLabel('Already set aside for Protected trip (AUD)',{exact:true}).fill('100')
 async function history(){
  await page.getByRole('button',{name:'Check history for this draft',exact:true}).click()
  await page.getByRole('checkbox',{name:/Input review fictional account/}).check()
  await page.getByRole('button',{name:'Check my history',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Enough complete history for a starting point'})).toBeVisible()
 }
 await history();await page.getByRole('button',{name:'Back to my draft',exact:true}).click()
 await expect(page.getByLabel('Expected income this period (AUD)',{exact:true})).toHaveValue('700.00')
 await expect(page.getByLabel('Planned for Protected trip (AUD)',{exact:true})).toHaveValue('50.00')
 check('R04 cancelling assistance returns the original edited draft',true)
 await history()
 await page.getByRole('checkbox',{name:/These are the accounts and dated periods/}).check()
 await page.getByLabel(/Have your income/).selectOption('no')
 await page.getByRole('checkbox',{name:/I checked the income/}).check()
 await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toBeDisabled()
 await confirmBudgetAssistance(page,pay,{keepIncome:true})
 await page.getByRole('checkbox',{name:/Replace expected income with my confirmed amount/}).check()
 await page.getByLabel('Confirmed take-home income (AUD)').fill('750')
 await page.getByRole('button',{name:'Check different history',exact:true}).click()
 await page.getByRole('button',{name:'Check my history',exact:true}).click()
 await expect(page.getByLabel('Confirmed take-home income (AUD)')).toHaveValue('750.00')
 await expect(page.getByRole('checkbox',{name:/I confirm this expected take-home amount/})).not.toBeChecked()
 await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toBeDisabled()
 check('R04 rechecking unsaved inputs retains edited income but clears confirmation',true)
 await expect(page.getByRole('checkbox',{name:/These are the accounts and dated periods/})).not.toBeChecked()
 await page.getByRole('checkbox',{name:/These are the accounts and dated periods/}).check()
 await page.getByRole('checkbox',{name:/Replace expected income with my confirmed amount/}).uncheck()
 await page.getByRole('checkbox',{name:/I checked the income/}).check()
 await confirmBudgetAssistance(page,pay,{keepIncome:true})
 for(const width of [390,1440])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1050});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark)
  const scan=await new AxeBuilder({page}).include('dialog[open]').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  check(`R04 ${width} ${dark?'dark':'light'} individual input accessibility`,scan.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)})),[])
  check(`R04 ${width} ${dark?'dark':'light'} input form fits`,await page.locator('dialog[open]').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1))
  await page.screenshot({path:`/tmp/halcyon-r04-${width}-${dark?'dark':'light'}.png`,fullPage:true})
 }
 await page.getByRole('button',{name:'Use this draft',exact:true}).click()
 await expect(page.getByLabel('Expected income this period (AUD)',{exact:true})).toHaveValue('700.00')
 await expect(page.getByLabel('Existing cash to use this period (AUD)',{exact:true})).toHaveValue('50.00')
 await expect(page.getByLabel('Planned for Everyday spending (AUD)',{exact:true})).toHaveValue('100.00')
 await expect(page.getByLabel('Planned for Protected rent (AUD)',{exact:true})).toHaveValue('200.00')
 await expect(page.getByLabel('Planned for Protected trip (AUD)',{exact:true})).toHaveValue('50.00')
 await expect(page.getByLabel('Already set aside for Protected trip (AUD)',{exact:true})).toHaveValue('100.00')
 await expect(page.getByLabel('Planned for r04-rent (AUD)',{exact:true})).toHaveValue('20.00')
 await expect(page.getByLabel('Planned for r04-phone (AUD)',{exact:true})).toHaveValue('10.00')
 check('R04 browser applies only selected everyday and individual cost fields; protected intent remains',true)
 await page.getByRole('button',{name:'Review my plan',exact:true}).click();await page.getByRole('button',{name:'Save setup draft',exact:true}).click()
 const first=JSON.parse(sql(`SELECT payload FROM public.budget_draft_revisions WHERE tenant_id=${quote(v.tenant)} ORDER BY version DESC LIMIT 1;`))
 check('R04 browser save retains five separate allowance identities and explicit pay dates',[first.lines.length,first.assistance.reviewed_inputs.income.pay_dates],[5,[pay]])
 await page.reload();await page.getByRole('button',{name:'Continue saved draft',exact:true}).click()
 await expect(page.getByRole('region',{name:'Individual setup input review',exact:true})).toContainText(pay)
 await page.getByRole('button',{name:'Check history for this draft',exact:true}).click()
 await page.getByRole('button',{name:'Check my history',exact:true}).click()
 await page.getByRole('checkbox',{name:/These are the accounts and dated periods/}).check();await page.getByLabel(/Have your income/).selectOption('no');await page.getByRole('checkbox',{name:/I checked the income/}).check()
 await confirmBudgetAssistance(page,pay,{keepIncome:true})
 await page.getByRole('button',{name:'Use this draft',exact:true}).click()
 await page.getByRole('button',{name:'Review my plan',exact:true}).click();await page.getByRole('button',{name:'Save setup draft',exact:true}).click()
 const second=JSON.parse(sql(`SELECT payload FROM public.budget_draft_revisions WHERE tenant_id=${quote(v.tenant)} ORDER BY version DESC LIMIT 1;`))
 check('R04 rechecking a saved draft never duplicates or replaces its existing cost identities',second.lines.map(l=>l.id).sort(),first.lines.map(l=>l.id).sort())
 check('R04 repeated browser review/save still never activates',snapshotSQL(v).plan,null)
}
