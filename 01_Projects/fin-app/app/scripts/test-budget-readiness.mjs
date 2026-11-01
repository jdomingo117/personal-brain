import {confirmBudgetAssistance} from './lib/budgetAssistanceUI.mjs'
import assert from 'node:assert/strict'
import AxeBuilder from '@axe-core/playwright'
import {expect} from '@playwright/test'

/** Invoked only within the disposable runner's positive target guard. */
export async function runBudgetReadinessChecks({newUser,sql,quote,check,edge,signedPage}){
 const u=await newUser(),a=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Readiness fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const dates=JSON.parse(sql(`SELECT json_build_object('start',date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date,'today',(now() AT TIME ZONE 'Australia/Sydney')::date,'first',(date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '6 months')::date,'next',(date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')+interval '1 month')::date);`))
 const req={action:'assisted_setup',frequency:'monthly',start_date:dates.today,timezone:'Australia/Sydney',account_ids:[a]}
 const query=()=>JSON.parse(sql(`SELECT public.budget_assisted_setup(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(req))}::jsonb);`))
 sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(u.tenant)},${quote(a)},${quote(a)},${quote(dates.first)},${quote(dates.today)}::date+1,'verified_statement','{"fixture":"r03"}',0,${quote(u.id)});
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
 SELECT ${quote(u.id)},${quote(u.tenant)},${quote(a)},d::date,'History fixture','Shop','r03-shop','Shopping',-20000,'expense','user',false,false FROM generate_series(${quote(dates.first)}::date,${quote(dates.start)}::date-1,interval '1 month') d;
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
 SELECT ${quote(u.id)},${quote(u.tenant)},${quote(a)},d::date,'Income fixture','Employer','r03-pay','Income',50000,'income','user',false,false FROM generate_series(${quote(dates.first)}::date,${quote(dates.start)}::date-1,interval '1 month') d;
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
 SELECT ${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(dates.start)},'Many current rows','Shop','r03-current','Shopping',-1,'expense','user',false,false FROM generate_series(1,1100);
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES
 (${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(dates.start)},'Current expense','Shop','r03-current','Shopping',-10000,'expense','user',false,false),
 (${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(dates.start)},'Current refund','Shop','r03-current','Shopping',3000,'refund','user',false,false),
 (${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(dates.start)},'Pending','Shop','r03-pending','Shopping',-999999,'expense','user',true,false),
 (${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(dates.start)},'Own transfer','Own account','r03-transfer','Transfer',-8888,'transfer','user',false,false),
 (${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(dates.today)}::date+1,'Future row','Shop','r03-future','Shopping',-7777,'expense','user',false,false);`)
 function reconfirm(){sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(u.tenant)},${quote(a)},${quote(a)},${quote(dates.first)},${quote(dates.today)}::date+1,'verified_statement','{"fixture":"r03-reconfirmed"}',0,${quote(u.id)});`)}
 const response=await edge(u,'query-budget',req);assert.equal(response.status,200,JSON.stringify(response.body))
 check('R03 target is normalized to the true calendar start and server-local date',[response.body.target.start_date,response.body.target.end_date,response.body.target.as_of],[dates.start,dates.next,dates.today])
 check('R03 usage reads all 1100 rows and excludes pending, own transfer and future activity',[response.body.target.coverage_complete,response.body.target.integrity_ok,response.body.target.settled_everyday_cents],[true,true,11100])
 check('R03 covered history remains eligible',response.body.eligible,true)
 const prior=response.body.fingerprint
 sql(`INSERT INTO public.recurring_series_overrides(tenant_id,account_id,merchant_key,state,cadence_override,expected_amount_override,next_expected_override) VALUES(${quote(u.tenant)},${quote(a)},'r03-bill','active','Monthly',2000,${quote(dates.start)});
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(dates.start)},'Confirmed bill','Bill','r03-bill','Shopping',-2000,'expense','user',false,false);`)
 check('R05 an unmatched current bill stays in gross usage until explicit matching',query().target.settled_everyday_cents,13100)
 check('R03 source and target evidence invalidate the old fingerprint',query().fingerprint!==prior)
 sql(`UPDATE public.account_activity_coverage SET revoked_at=now() WHERE tenant_id=${quote(u.tenant)};`)
 check('R03 missing current coverage is unknown, never zero',[query().target.coverage_complete,query().target.settled_everyday_cents],[false,null])
 sql(`UPDATE public.account_activity_coverage SET revoked_at=NULL WHERE tenant_id=${quote(u.tenant)};
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(dates.start)},'Ambiguous movement','Unknown','r03-ambiguous','Shopping',-100,'expense','derived',false,true);`)
 check('R03 ambiguous current movement blocks usage without fabricating zero',[query().target.integrity_ok,query().target.settled_everyday_cents],[false,null])
 sql(`DELETE FROM public.transactions WHERE tenant_id=${quote(u.tenant)} AND merchant_key='r03-ambiguous';`)
 reconfirm()
 check('R03 fixture coverage is re-confirmed after the source deletion invalidates it',query().eligible,true)
 if(signedPage){
  const page=await signedPage(u,390,false)
  await page.getByRole('button',{name:'Help me build a budget',exact:true}).click()
  await page.getByLabel('Start with the period containing').fill(dates.today)
  await page.getByRole('checkbox',{name:/Readiness fictional account/}).check()
  await page.getByRole('button',{name:'Check my history',exact:true}).click()
  try{await expect(page.getByRole('heading',{name:'Enough complete history for a starting point'})).toBeVisible({timeout:10000})}catch(e){console.log('R03 fictional result:',query());console.log('R03 fictional UI:',await page.locator('.budget-workspace').innerText());throw e}
  await page.getByRole('checkbox',{name:/These are the accounts and dated periods/}).check()
  await page.getByLabel(/Have your income/).selectOption('no')
  await page.getByRole('checkbox',{name:/I checked the income/}).check()
  await confirmBudgetAssistance(page,dates.today)
  await page.getByRole('checkbox',{name:/Try one optional change/}).check()
  await page.getByLabel('Amount to redirect from everyday spending').fill('69.01')
  await expect(page.getByRole('alert')).toContainText('unused everyday room')
  await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toBeDisabled()
  await page.getByLabel('Amount to redirect from everyday spending').fill('69')
  await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toBeEnabled()
  await page.getByLabel('Leave room for').selectOption('goal')
  await page.getByLabel('Goal name').fill('Readiness bike')
  await page.getByLabel('Estimated target (optional)').fill('500')
  await page.getByLabel('Already set aside for this goal (AUD; enter 0 if none)').fill('0')
  await expect(page.getByText('If you keep this contribution',{exact:true})).toHaveCount(0)
  await page.getByRole('checkbox',{name:/I confirmed expected income and pay dates/}).check()
  await expect(page.getByText('If you keep this contribution',{exact:true})).toBeVisible()
  await page.getByLabel('Estimated target (optional)').fill('501')
  await expect(page.getByRole('checkbox',{name:/I confirmed expected income and pay dates/})).not.toBeChecked()
  await expect(page.getByText('If you keep this contribution',{exact:true})).toHaveCount(0)
  check('R03 phone rejects overspent room, accepts exact boundary and invalidates outcome confirmation after edits',true)
  for(const width of [390,1440])for(const dark of [false,true]){
   await page.setViewportSize({width,height:1050});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark)
   const scan=await new AxeBuilder({page}).include('dialog[open]').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
   check(`R03 ${width} ${dark?'dark':'light'} readiness accessibility`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
   check(`R03 ${width} ${dark?'dark':'light'} readiness fits`,await page.locator('dialog[open]').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1))
   await page.screenshot({path:`/tmp/halcyon-r03-${width}-${dark?'dark':'light'}.png`,fullPage:true})
  }
 }
 const parent=sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(dates.start)},'Split fixture','Shop','r03-split','Shopping',-5000,'expense','user',false,false) RETURNING id;`).split('\n')[0]
 sql(`INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,category_id) VALUES(${quote(u.tenant)},${quote(parent)},0,-3000,'expense','Shopping','shopping'),(${quote(u.tenant)},${quote(parent)},1,-2000,'expense','Shopping','shopping');`)
 reconfirm()
 check('R03 split allocations replace their parent exactly once',query().target.settled_everyday_cents,18100)
 const future=JSON.parse(sql(`SELECT public.budget_assisted_setup(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify({...req,start_date:dates.next}))}::jsonb);`))
 check('R03 future window is explicit and does not invent current usage',[future.target.start_date,future.target.coverage_complete,future.target.settled_everyday_cents],[dates.next,false,null])
 check('R03 query and preview create no saved draft or plan',sql(`SELECT (SELECT count(*) FROM public.budget_plans WHERE tenant_id=${quote(u.tenant)})+(SELECT count(*) FROM public.budget_drafts WHERE tenant_id=${quote(u.tenant)});`),'0')
}
