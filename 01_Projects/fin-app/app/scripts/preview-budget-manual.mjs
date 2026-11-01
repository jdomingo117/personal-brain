import {confirmBudgetAssistance} from './lib/budgetAssistanceUI.mjs'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'

/** Reuses the disposable provisioner, retaining the preview until an explicit stop. */
export async function runBudgetManualPreview({repo,work,project,api,anon,newUser,edge,source,assistanceFixture,sql,quote}){
 const url='http://127.0.0.1:57300'
 try{await fetch(url);throw Error('Manual Budget preview port is already occupied')}catch(e){if(!String(e).includes('fetch failed'))throw e}
 const sample=assistanceFixture.user,blank=await newUser()
 const from=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;"),until=sql("SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')+interval '1 month')::date;")
 // Same headline example as the BUI-04 review captures, on this new disposable
 // project's captured fixture identity/account only. Historical assistance remains.
 sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES
 (${quote(sample.id)},${quote(sample.tenant)},${quote(assistanceFixture.account)},${quote(from)},'Manual review fixture','Everyday review example','review-everyday','Shopping',-151000,'expense','user',false),
 (${quote(sample.id)},${quote(sample.tenant)},${quote(assistanceFixture.account)},${quote(from)},'Manual review fixture','Income review example','review-income','Income',300000,'income','user',false);
 INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(sample.tenant)},${quote(assistanceFixture.account)},${quote(assistanceFixture.account)},${quote(from)},${quote(until)},'user_confirmed','{}',0,${quote(sample.id)});`)
 const evidence=(await edge(sample,'query-budget',{action:'assisted_setup',frequency:'monthly',start_date:from,account_ids:[assistanceFixture.account]})).body
 assert.equal(evidence.eligible,true)
 const everyday=randomUUID(),goal=randomUUID()
 const payload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:evidence.start_date,anchor:evidence.start_date,account_ids:[assistanceFixture.account],destination_account_ids:[],income_cents:600000,opening_drawdown_cents:0,
  lines:[{id:everyday,kind:'everyday',name:'Everyday spending',allocation_cents:180000,opening_cents:0},{id:goal,kind:'reserve',name:'Weekend away',allocation_cents:10000,opening_cents:0},
   {id:randomUUID(),kind:'fixed',name:'Bills',allocation_cents:250000,opening_cents:0},{id:randomUUID(),kind:'reserve',name:'Upcoming costs',allocation_cents:40000,opening_cents:0},{id:randomUUID(),kind:'contribution',name:'Longer-term savings',allocation_cents:100000,opening_cents:0}],
  assistance:{method:'budget-assist-v1',fingerprint:evidence.fingerprint,source_revision:evidence.source_revision,manual:true,periods:evidence.periods.map(p=>({start_date:p.start_date,end_date:p.end_date})),provenance:{income:'fictional-manual-estimate',everyday:'fictional-manual-estimate'},goal_intent:{line_id:goal,name:'Weekend away',target_cents:30000,needed_by:null}}}
 const saved=await edge(sample,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(sample.tenant),expected_draft:'0',payload})
 assert.equal(saved.status,200,JSON.stringify(saved.body))
 const activated=await edge(sample,'manage-budget',{action:'activate',request_id:randomUUID(),expected_source:source(sample.tenant),expected_draft:saved.body.result.draft_version,accept_gap:false})
 assert.equal(activated.status,200,JSON.stringify(activated.body))
 let reviewUser=null,reviewPeriod=null
 if(process.argv.includes('--lookback-preview')){
  reviewUser=await newUser()
  const previous=sql("SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '1 month')::date;"),line=randomUUID()
  const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(reviewUser.id)},${quote(reviewUser.tenant)},'Review fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  const command=input=>{const s=JSON.parse(sql(`SELECT public.budget_query(${quote(reviewUser.tenant)},${quote(reviewUser.id)},'{"action":"snapshot"}');`));const result=JSON.parse(sql(`SELECT public.budget_command(${quote(reviewUser.tenant)},${quote(reviewUser.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_source:source(reviewUser.tenant),expected_method:'budget-foundation-v1',plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}))}::jsonb,true);`));assert.equal(result.status,'committed');return result}
  command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:previous,account_ids:[account],destination_account_ids:[],income_cents:20000,opening_drawdown_cents:0,lines:[{id:line,kind:'everyday',name:'Everyday spending',allocation_cents:10000,opening_cents:0}]}})
  reviewPeriod=command({action:'activate',expected_draft:'1',accept_gap:false}).result.period_id
  const transaction=sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(reviewUser.id)},${quote(reviewUser.tenant)},${quote(account)},${quote(previous)},'Review fictional purchase','Review example','review-example','Shopping',-12500,'expense','user',false) RETURNING id;`).split('\n')[0]
  command({action:'save_review',carry_mode:'carry',accept_incomplete:true})
  command({action:'open_next_period',income_cents:20000,accept_gap:false,lines:[{line_id:line,amount_cents:10000}]})
  sql(`UPDATE public.transactions SET amount=-13500 WHERE id=${quote(transaction)};`)
 }
 let eligibilityUser=null,eligibilityAccount=null
 if(process.argv.includes('--eligibility-preview')){
  eligibilityUser=await newUser()
  eligibilityAccount=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(eligibilityUser.id)},${quote(eligibilityUser.tenant)},'Eligibility fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(eligibilityUser.tenant)},${quote(eligibilityAccount)},${quote(eligibilityAccount)},'2026-05-15','2026-08-07','verified_statement','{"fixture":"r02-preview"}',0,${quote(eligibilityUser.id)});
   INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
   SELECT ${quote(eligibilityUser.id)},${quote(eligibilityUser.tenant)},${quote(eligibilityAccount)},'2026-05-16'::date+14*n,'Eligibility fictional expense','Eligibility example','eligibility-example','Shopping',-1000,'expense','user',false,false FROM generate_series(0,5) n;`)
 }
 let readinessUser=null
 if(process.argv.includes('--readiness-preview')){
  readinessUser=await newUser()
  const a=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(readinessUser.id)},${quote(readinessUser.tenant)},'Readiness fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
   SELECT ${quote(readinessUser.id)},${quote(readinessUser.tenant)},${quote(a)},d::date,'Readiness expense','Shop','readiness-shop','Shopping',-20000,'expense','user',false,false FROM generate_series(${quote(from)}::date-interval '6 months',${quote(from)}::date-1,interval '1 month') d;
   INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
   SELECT ${quote(readinessUser.id)},${quote(readinessUser.tenant)},${quote(a)},d::date,'Readiness income','Employer','readiness-pay','Income',50000,'income','user',false,false FROM generate_series(${quote(from)}::date-interval '6 months',${quote(from)}::date-1,interval '1 month') d;
   INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
   VALUES(${quote(readinessUser.id)},${quote(readinessUser.tenant)},${quote(a)},${quote(from)},'Current recorded spending','Shop','readiness-current','Shopping',-8100,'expense','user',false,false);
   INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by)
   VALUES(${quote(readinessUser.tenant)},${quote(a)},${quote(a)},${quote(from)}::date-interval '6 months',${quote(until)},'verified_statement','{"fixture":"r03-preview"}',0,${quote(readinessUser.id)});`)
 }
 let inputReviewUser=null,inputReviewPay=null
 if(process.argv.includes('--input-review-preview')){
  inputReviewUser=await newUser()
  inputReviewPay=sql(`SELECT (${quote(from)}::date+14)::date;`)
  const a=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(inputReviewUser.id)},${quote(inputReviewUser.tenant)},'Input review fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
   SELECT ${quote(inputReviewUser.id)},${quote(inputReviewUser.tenant)},${quote(a)},d::date,'Input review expense','Shop','input-review-shop','Shopping',-10000,'expense','user',false,false FROM generate_series(${quote(from)}::date-interval '6 months',${quote(from)}::date-1,interval '1 month') d;
   INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
   SELECT ${quote(inputReviewUser.id)},${quote(inputReviewUser.tenant)},${quote(a)},d::date+14,'Input review income','Employer','input-review-pay','Income',50000,'income','user',false,false FROM generate_series(${quote(from)}::date-interval '6 months',${quote(from)}::date-1,interval '1 month') d;
   INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by)
   VALUES(${quote(inputReviewUser.tenant)},${quote(a)},${quote(a)},${quote(from)}::date-interval '6 months',${quote(until)},'verified_statement','{"fixture":"r04-preview"}',0,${quote(inputReviewUser.id)});
   INSERT INTO public.recurring_series_overrides(tenant_id,account_id,merchant_key,state,cadence_override,expected_amount_override,next_expected_override) VALUES
   (${quote(inputReviewUser.tenant)},${quote(a)},'Phone plan','active','Monthly',1000,${quote(from)}),
   (${quote(inputReviewUser.tenant)},${quote(a)},'Annual insurance','active','Annual',20000,(${quote(from)}::date+interval '2 months')::date);`)
  const payload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:from,anchor:from,account_ids:[a],destination_account_ids:[],income_cents:70000,opening_drawdown_cents:5000,lines:[{id:randomUUID(),kind:'everyday',name:'Everyday spending',allocation_cents:30000,opening_cents:0},{id:randomUUID(),kind:'fixed',name:'Protected rent',allocation_cents:20000,opening_cents:0},{id:randomUUID(),kind:'reserve',name:'Protected trip',allocation_cents:5000,opening_cents:10000}]}
  const saved=await edge(inputReviewUser,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:source(inputReviewUser.tenant),expected_draft:'0',payload})
  assert.equal(saved.status,200,JSON.stringify(saved.body))
 }
 let estimatorUser=null,estimatorPay=null
 if(process.argv.includes('--estimator-preview')){
  estimatorUser=await newUser();estimatorPay=sql(`SELECT (${quote(from)}::date+14)::date;`)
  const a=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(estimatorUser.id)},${quote(estimatorUser.tenant)},'Signed estimator fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  const months=JSON.parse(sql(`SELECT jsonb_agg(d::date ORDER BY d) FROM generate_series(${quote(from)}::date-interval '6 months',${quote(from)}::date-1,interval '1 month') d;`))
  for(let i=0;i<6;i++)sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES
   (${quote(estimatorUser.id)},${quote(estimatorUser.tenant)},${quote(a)},${quote(months[i])},'Signed historical observation','Shop','signed-shop','Shopping',${[300,200,100,1,0,-20][i]},${quote(i<4?'refund':'expense')},'user',false,false),
   (${quote(estimatorUser.id)},${quote(estimatorUser.tenant)},${quote(a)},${quote(months[i])}::date+14,'Historical earned income','Employer','signed-pay','Income',50000,'income','user',false,false);`)
  sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES
   (${quote(estimatorUser.id)},${quote(estimatorUser.tenant)},${quote(a)},${quote(from)},'Current settled expense','Shop','current-shop','Shopping',-1000,'expense','user',false,false),
   (${quote(estimatorUser.id)},${quote(estimatorUser.tenant)},${quote(a)},${quote(from)},'Current unassigned credit','Shop','current-credit','Shopping',800,'refund','user',false,false);
   INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(estimatorUser.tenant)},${quote(a)},${quote(a)},${quote(months[0])},${quote(until)},'verified_statement','{"fixture":"r05-preview"}',0,${quote(estimatorUser.id)});`)
 }
 let forecastUser=null
 if(process.argv.includes('--forecast-preview')){const {createBudgetForecastPreview}=await import('./preview-budget-forecast.mjs');forecastUser=await createBudgetForecastPreview({newUser,sql,quote,source})}
 const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','57300','--strictPort'],{cwd:resolve(repo,'app'),env:{...process.env,HALCYON_GOLDEN_SUPABASE_TARGET:api,VITE_SUPABASE_URL:`${url}/supabase`,VITE_SUPABASE_ANON_KEY:anon,VITE_BUDGET_V1_ENABLED:'true'},stdio:['ignore','pipe','pipe']})
 vite.stdout.on('data',()=>{});vite.stderr.on('data',()=>{})
 let browser
 const stopSignals=['SIGINT','SIGTERM','SIGHUP']
 let stop
 const stopped=new Promise(r=>{stop=r})
 for(const signal of stopSignals)process.once(signal,stop)
 vite.once('exit',stop)
 try{
  let ready=false
  for(let n=0;n<100;n++){
   if(vite.exitCode!==null)throw Error('Preview Vite exited before readiness')
   try{if((await fetch(url)).ok){ready=true;break}}catch{}
   await new Promise(r=>setTimeout(r,100))
  }
  assert(ready,'Preview server did not become ready')
  browser=await chromium.launch()
  for(const [kind,user]of[['sample',sample],['fresh setup',blank],...(reviewUser?[['recorded review',reviewUser]]:[]),...(eligibilityUser?[['limited eligibility',eligibilityUser]]:[]),...(readinessUser?[['readiness',readinessUser]]:[]),...(inputReviewUser?[['individual inputs',inputReviewUser]]:[]),...(estimatorUser?[['signed estimator',estimatorUser]]:[]),...(forecastUser?[['spending forecast',forecastUser]]:[])]){
   const context=await browser.newContext({reducedMotion:'reduce'})
   const page=await context.newPage(),errors=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.goto(`${url}/budget`)
   await page.getByLabel('Email',{exact:true}).fill(user.session.user.email)
   await page.getByLabel('Password',{exact:true}).fill(user.previewPassword)
   await page.getByRole('button',{name:'Sign in',exact:true}).click()
   await page.waitForURL(u=>!u.pathname.includes('login'),{timeout:30000})
   await page.goto(`${url}/budget`)
   await expect(page.getByRole('navigation').getByRole('button',{name:'Budget',exact:true})).toBeVisible({timeout:30000})
   await expect(page.getByRole('button',{name:kind==='fresh setup'||kind==='limited eligibility'||kind==='readiness'||kind==='individual inputs'||kind==='signed estimator'?'Enter my own amounts':'My plan',exact:true})).toBeEnabled({timeout:30000})
   if(kind==='spending forecast'){await expect(page.getByRole('region',{name:'Spending estimate',exact:true})).toContainText('Flexible spending: projected')}
   if(kind==='sample'){
    for(const [name,amount]of[['hero-remaining','$290.00'],['hero-expected','$6,000.00'],['hero-received','$3,000.00'],['hero-unallocated','$200.00']])await expect(page.locator(`[data-budget-value="${name}"] [data-budget-amount]`)).toHaveText(amount)
    await expect(page.getByRole('heading',{name:'Weekend away',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'Save for something',exact:true}).click()
    await expect(page.getByRole('dialog',{name:'Save for something',exact:true})).toBeVisible()
    await page.keyboard.press('Escape')
   }
   if(kind==='recorded review'){
    await page.getByRole('button',{name:'Look back',exact:true}).click()
    await page.getByRole('combobox',{name:'Saved budget period',exact:true}).selectOption(reviewPeriod)
    const history=page.getByRole('region',{name:'Budget periods and review',exact:true})
    await expect(history).toContainText('Changed since review')
    await expect(history.locator('[data-history-value="latest-remainder"]')).toHaveText('-$35.00')
    await expect(history.getByRole('region',{name:'Recorded review snapshot',exact:true})).toContainText('net spending $125.00')
   }
   if(kind==='limited eligibility'){
    await page.getByRole('button',{name:'Help me build a budget',exact:true}).click()
    await page.getByLabel('Budget rhythm').selectOption('fortnightly')
    await page.getByLabel('Start with the period containing').fill('2026-08-07')
    await page.getByLabel('Two-week cycle start date').fill('2026-05-15')
    await page.getByRole('checkbox',{name:/Eligibility fictional account/}).check()
    await page.getByRole('button',{name:'Check my history',exact:true}).click()
    await expect(page.getByRole('heading',{name:'History needs more information',exact:true})).toBeVisible()
    await expect(page.getByText(/2 complete calendar months in the separate/)).toBeVisible()
    await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toHaveCount(0)
   }
   if(kind==='readiness'){
    await page.getByRole('button',{name:'Help me build a budget',exact:true}).click()
    await page.getByRole('checkbox',{name:/Readiness fictional account/}).check()
    await page.getByRole('button',{name:'Check my history',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Enough complete history for a starting point'})).toBeVisible()
    await page.getByRole('checkbox',{name:/These are the accounts and dated periods/}).check()
    await page.getByLabel(/Have your income/).selectOption('no')
    await page.getByRole('checkbox',{name:/I checked the income/}).check()
    await confirmBudgetAssistance(page,from)
    await page.getByRole('checkbox',{name:/Try one optional change/}).check()
    await page.getByLabel('Amount to redirect from everyday spending').fill('100')
    await page.getByLabel('Leave room for').selectOption('goal')
    await page.getByLabel('Goal name').fill('Review bike')
    await page.getByLabel('Estimated target (optional)').fill('600')
    await page.getByLabel('Already set aside for this goal (AUD; enter 0 if none)').fill('30')
    await page.getByLabel('Needed by (optional)').fill(sql(`SELECT (${quote(from)}::date+interval '3 months')::date;`))
    await page.getByRole('checkbox',{name:/I confirmed expected income and pay dates/}).check()
    await expect(page.getByText('If you keep this contribution',{exact:true})).toBeVisible()
    await expect(page.getByText(/Planned shortfall by/)).toBeVisible()
    await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toBeEnabled()
   }
   if(kind==='individual inputs'){
    await page.getByRole('button',{name:'Help me build a budget',exact:true}).click()
    await page.getByRole('button',{name:'Check my history',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Enough complete history for a starting point'})).toBeVisible()
    await page.getByRole('checkbox',{name:/These are the accounts and dated periods/}).check()
    await page.getByLabel(/Have your income/).selectOption('no')
    await page.getByRole('checkbox',{name:/I checked the income/}).check()
    await confirmBudgetAssistance(page,inputReviewPay,{keepIncome:true})
    await expect(page.getByLabel('Confirmed take-home income (AUD)')).toHaveValue('700.00')
    await expect(page.getByRole('region',{name:'Confirm individual setup inputs'})).toContainText('Phone plan')
    await expect(page.getByRole('region',{name:'Confirm individual setup inputs'})).toContainText('Annual insurance')
   }
   if(kind==='signed estimator'){
    await page.getByRole('button',{name:'Help me build a budget',exact:true}).click()
    await page.getByRole('checkbox',{name:/Signed estimator fictional account/}).check()
    await page.getByRole('button',{name:'Check my history',exact:true}).click()
    await expect(page.getByText('-$0.51',{exact:true})).toBeVisible()
    await page.getByRole('checkbox',{name:/These are the accounts and dated periods/}).check()
    await page.getByLabel(/Have your income/).selectOption('no')
    await page.getByRole('checkbox',{name:/Replace expected income with/}).check()
    await page.getByLabel('Confirmed take-home income (AUD)').fill('100')
    await page.getByLabel('Expected pay dates in this budget (YYYY-MM-DD, separated by commas)').fill(estimatorPay)
    await page.getByRole('checkbox',{name:/I confirm this expected/}).check()
    await expect(page.getByRole('checkbox',{name:/Replace only my everyday allowance/})).toBeDisabled()
    await page.getByLabel('Everyday amount I choose (AUD; optional override)').fill('25')
    await page.getByRole('checkbox',{name:/I checked essential costs/}).check()
    await page.getByRole('checkbox',{name:/I checked the income, regular costs/}).check()
    await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toBeEnabled()
   }
   assert.deepEqual(errors,[],`${kind} preview runtime errors`)
   await page.screenshot({path:`/tmp/halcyon-budget-manual-${kind==='sample'?'sample':kind==='fresh setup'?'setup':kind==='recorded review'?'review':kind==='readiness'?'readiness':kind==='individual inputs'?'inputs':kind==='signed estimator'?'estimator':kind==='spending forecast'?'forecast':'eligibility'}.png`,fullPage:true})
   await context.close()
   console.log(`PASS real password sign-in, Budget navigation and ${kind} controls`)
  }
  await browser.close();browser=null
  const details={project,pid:process.pid,url:`${url}/budget`,accounts:[{purpose:'Explore the active sample budget',email:sample.session.user.email,password:sample.previewPassword},{purpose:'Start a fresh manual budget',email:blank.session.user.email,password:blank.previewPassword},...(reviewUser?[{purpose:'Explore a recorded review with a late correction',email:reviewUser.session.user.email,password:reviewUser.previewPassword}]:[]),...(eligibilityUser?[{purpose:'Inspect six fortnights with only two complete months',email:eligibilityUser.session.user.email,password:eligibilityUser.previewPassword}]:[]),...(readinessUser?[{purpose:'Inspect current-period room and conditional goal timing',email:readinessUser.session.user.email,password:readinessUser.previewPassword}]:[]),...(inputReviewUser?[{purpose:'Review individual income/pay dates and costs while preserving an existing draft',email:inputReviewUser.session.user.email,password:inputReviewUser.previewPassword}]:[]),...(estimatorUser?[{purpose:'Inspect signed observations, unassigned credits and a user-chosen allowance',email:estimatorUser.session.user.email,password:estimatorUser.previewPassword}]:[]),...(forecastUser?[{purpose:'Inspect R01 spending forecast, pending charges and matched rent',email:forecastUser.session.user.email,password:forecastUser.previewPassword}]:[])]}
  const path=resolve(work,'manual-preview.json')
  writeFileSync(path,JSON.stringify(details,null,2),{mode:0o600})
  console.log(`MANUAL_PREVIEW_READY ${JSON.stringify(details)}`)
  console.log(`Disposable session details: ${path}. Preview stays running until stopped; stopping removes fictional data.`)
  await stopped
 }finally{
  for(const signal of stopSignals)process.removeListener(signal,stop)
  if(browser)await browser.close()
  if(vite.exitCode===null){const exited=new Promise(r=>vite.once('exit',r));vite.kill('SIGTERM');await exited}
 }
}
