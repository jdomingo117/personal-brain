import {openAllowanceTools,openIncomeDetails} from './lib/budgetOverviewUI.mjs'
import {randomUUID} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Real production controls and canonical snapshots on the guarded new target only. */
export async function budgetCandidateChecks({repo,newUser,sql,quote,check,signedPage,snapshotSQL,settled}){
 const out=resolve(repo,process.argv.includes('--release-candidate')?'docs/budget-m7/candidate/visual/candidate':process.argv.includes('--overview-pass3')?'docs/budget-ui/overview-pass3/candidate':process.argv.includes('--forecast-only')?'docs/budget-ui/r01/candidate':'docs/budget-ui/bui-10/candidate');mkdirSync(out,{recursive:true})
 const manifest=[]
 const month=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;"),previous=sql("SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '1 month')::date;")
 const amount=(p,name)=>p.locator(`[data-budget-value="${name}"] [data-budget-amount]`)
 async function matrix(page,state,{surface='.budget-workspace',focus,verify}={}){
  for(const width of [320,390,768,1024,1440])for(const dark of [false,true]){
   await page.setViewportSize({width,height:1100});await page.evaluate(v=>document.documentElement.classList.toggle('dark',v),dark)
   await settled(page);if(verify)await verify()
   if(focus)await focus.scrollIntoViewIfNeeded();else await page.locator('.scroll-region').evaluate(el=>{el.scrollTop=0})
   const root=page.locator(surface)
   if((state==='funding-gap'||state==='failed-refresh')&&width<=390){
    const notice=page.locator('.budget-phone-funding-notice');await expect(notice).toBeVisible();await expect(notice).toContainText('-$300.00')
    check(`${state} ${width} ${dark?'dark':'light'} funding gap precedes positive allowance`,(await notice.boundingBox()).y<(await page.locator('.budget-hero-amount').boundingBox()).y)
    if(state==='failed-refresh')await expect(notice).toContainText('Previously loaded funding gap')
   }
   if(state==='healthy')check(`${width} ${dark?'dark':'light'} theme control stays in the header without covering money`,await page.getByRole('button',{name:'Toggle dark mode',exact:true}).evaluate(el=>{const a=el.getBoundingClientRect();return !!el.closest('.budget-page-header')&&getComputedStyle(el).position==='static'&&[...document.querySelectorAll('[data-budget-amount]')].filter(n=>n.getClientRects().length).every(n=>{const b=n.getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom})}))
   check(`${state} ${width} ${dark?'dark':'light'} page and surface fit`,await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1))
   const scan=await new AxeBuilder({page}).include(surface).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
   check(`${state} ${width} ${dark?'dark':'light'} WCAG scan`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
   await page.screenshot({path:resolve(out,`${state}-${width}-${dark?'dark':'light'}.png`)})
   if(state==='healthy'){
    await openAllowanceTools(page);await page.locator('.budget-everyday').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`healthy-body-${width}-${dark?'dark':'light'}.png`)});await page.locator('.budget-allowance-tools > summary').click()
   }
   manifest.push({state,width,dark,surface,violations:scan.violations.length})
  }
 }
 async function fixture(start=month){
  const user=await newUser(),everyday=randomUUID(),reserve=randomUUID(),goal=randomUUID()
  const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(user.id)},${quote(user.tenant)},'Candidate fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  const command=input=>{const s=snapshotSQL(user);return JSON.parse(sql(`SELECT public.budget_command(${quote(user.tenant)},${quote(user.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_source:s.source_revision,expected_method:'budget-foundation-v1',plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}))}::jsonb,true);`))}
  command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[account],destination_account_ids:[],income_cents:600000,opening_drawdown_cents:0,lines:[{id:everyday,kind:'everyday',name:'Everyday',allocation_cents:180000,opening_cents:0},{id:randomUUID(),kind:'fixed',name:'Bills',allocation_cents:250000,opening_cents:0},{id:reserve,kind:'reserve',name:'Upcoming costs',allocation_cents:40000,opening_cents:10000},{id:randomUUID(),kind:'contribution',name:'Longer-term savings',allocation_cents:100000,opening_cents:0}]}})
  command({action:'activate',expected_draft:'1',accept_gap:false})
  if(start===month)command({action:'save_item',line_id:goal,item:{type:'goal',name:'Flights to Japan',target_cents:300000,amount_cents:10000,state:'saving',featured:true,estimated:true,due_date:null,cadence:'monthly',anchor:start,recurring_id:null,planning_goal_id:null},opening_cents:60000,opening_date:start,accept_gap:false})
  const expense=sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES(${quote(user.id)},${quote(user.tenant)},${quote(account)},${quote(start)},'Candidate expense','Shop','candidate-shop','Shopping',-151000,'expense','user',false,false) RETURNING id;`).split('\n')[0]
  sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES(${quote(user.id)},${quote(user.tenant)},${quote(account)},${quote(start)},'Candidate earned income','Employer','candidate-pay','Income',300000,'income','user',false,false);
   INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(user.tenant)},${quote(account)},${quote(account)},${quote(start)},(${quote(start)}::date+interval '1 month')::date,'verified_statement','{"fixture":"bui10"}',0,${quote(user.id)});`)
  return {user,everyday,reserve,goal,account,expense,command}
 }
 const f=await fixture(),page=await signedPage(f.user,1440,true),writes=[]
 page.on('request',r=>{if(r.url().includes('/functions/v1/manage-budget'))writes.push(r.postDataJSON())})
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.log('Candidate main-frame navigation:',frame.url())})
 page.on('console',message=>{if(message.text().includes('[vite]'))console.log('Candidate dev-server:',message.text())})
 const healthy=async()=>{await expect(amount(page,'hero-remaining')).toHaveText('$290.00');await expect(amount(page,'hero-expected')).toHaveText('$6,000.00');await expect(amount(page,'hero-received')).toHaveText('$3,000.00');await expect(amount(page,'hero-unallocated')).toHaveText('$200.00');await expect(amount(page,`goal-reserve:${f.goal}`)).toHaveText('$700.00');await expect(amount(page,`goal-summary-reserve:${f.goal}`)).toHaveText('$700.00');await expect(amount(page,`goal-summary-reserve:${f.goal}`)).toBeVisible()}
 await matrix(page,'healthy',{verify:healthy})
 await openIncomeDetails(page);await expect(amount(page,'hero-expected')).toBeVisible();await expect(amount(page,'hero-received')).toBeVisible();await page.locator('.budget-income-disclosure > summary').click()
 check('matched candidate preserves canonical money including separate goal opening reserve and on-demand income',true)
 const theme=page.getByRole('button',{name:'Toggle dark mode',exact:true}),pressed=await theme.getAttribute('aria-pressed')
 await theme.click();await expect(theme).toHaveAttribute('aria-pressed',pressed==='true'?'false':'true')
 await expect.poll(()=>page.evaluate(()=>document.documentElement.classList.contains('dark'))).toBe(pressed!=='true')
 await theme.click();await expect(theme).toHaveAttribute('aria-pressed',pressed)
 check('inline theme control preserves the actual shared preference toggle',true)
 await page.getByRole('navigation').getByRole('button',{name:'Landing',exact:true}).click()
 await expect(theme).toHaveCount(1);await expect.poll(()=>theme.evaluate(el=>getComputedStyle(el).position)).toBe('fixed')
 await page.getByRole('navigation').getByRole('button',{name:'Budget',exact:true}).click()
 await expect(theme).toHaveCount(1);await expect.poll(()=>theme.evaluate(el=>getComputedStyle(el).position)).toBe('static')
 check('other routes keep one floating theme control and Budget keeps one in-flow control',true)

 await page.getByRole('button',{name:'My plan',exact:true}).click()
 await matrix(page,'my-plan',{verify:async()=>{await expect(amount(page,'plan-income')).toHaveText('$6,000.00');await expect(amount(page,'plan-unallocated')).toHaveText('$200.00')}})
 await page.getByRole('button',{name:'Overview',exact:true}).click()
 check('candidate layout and view inspection create no write',writes,[])
 f.command({action:'release_reserve',from_line_id:f.reserve,to_line_id:f.everyday,amount_cents:5000})
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(amount(page,'hero-remaining')).toHaveText('$340.00');await expect(amount(page,'hero-planned')).toHaveText('$1,800.00');await expect(amount(page,'hero-spent')).toHaveText('$1,510.00')
 check('candidate reads rights-inclusive canonical remainder rather than planned minus spending',true)
 const s=snapshotSQL(f.user),lines=s.lines.map(l=>({line_id:l.id,amount_cents:l.allocation_cents}))
 f.command({action:'revise',scope:'period-and-future',income_cents:550000,opening_drawdown_cents:0,accept_gap:true,lines})
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await matrix(page,'funding-gap',{verify:async()=>{await expect(amount(page,'hero-unallocated')).toHaveText('-$300.00');await expect(page.locator('.budget-unallocated')).toContainText('Funding gap');await expect(amount(page,'hero-remaining')).toHaveText('$340.00')}})
 await page.route('**/functions/v1/query-budget',route=>route.request().postDataJSON()?.action==='workspace'?route.abort('failed'):route.continue())
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await matrix(page,'failed-refresh',{verify:async()=>{await expect(page.locator('[data-budget-value="hero-remaining"]')).toHaveAttribute('data-freshness','stale');await expect(page.locator('.budget-hero-evidence')).toContainText('Previously loaded');await expect(page.getByRole('button',{name:'Refresh saved data',exact:true})).toBeEnabled()}})
 await page.unroute('**/functions/v1/query-budget');await page.getByRole('button',{name:'Refresh saved data',exact:true}).click();await page.close()
 const blank=await signedPage(await newUser(),390)
 await matrix(blank,'no-history',{verify:async()=>{await expect(blank.getByRole('region',{name:'Budget overview'})).toHaveCount(0);await expect(blank.getByRole('button',{name:'Help me build a budget',exact:true})).toBeEnabled();await expect(blank.getByRole('button',{name:'Enter my own amounts',exact:true})).toBeEnabled()}});await blank.close()
 const old=await fixture(previous)
 old.command({action:'save_review',carry_mode:'fresh',accept_incomplete:false})
 const history=await signedPage(old.user,390,true);await history.getByRole('button',{name:'Look back',exact:true}).click()
 await expect(history.getByRole('region',{name:'Budget periods and review'})).toContainText('Reviewed. Your recorded snapshot is preserved.')
 sql(`UPDATE public.transactions SET amount=-161000 WHERE id=${quote(old.expense)};`)
 await history.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(history.getByRole('region',{name:'Budget periods and review'})).toContainText('Changed since review')
 await history.getByText('Compare allowances and recorded activity',{exact:true}).click()
 const comparison=history.getByRole('region',{name:'Historical allowance comparison',exact:true})
 await matrix(history,'changed-history',{focus:comparison,verify:async()=>{await expect(history.getByRole('region',{name:'Budget periods and review'})).toContainText('When last recorded: net spending $1,510.00');await expect(comparison).toContainText('$1,610.00')}})
 await history.close()
 const pendingUser=await newUser(),pending=await signedPage(pendingUser,390),requests=[]
 pending.on('request',r=>{if(r.url().includes('/functions/v1/manage-budget'))requests.push(r.postDataJSON())})
 await pending.getByRole('button',{name:'Enter my own amounts',exact:true}).click()
 const panel=pending.getByRole('dialog',{name:'Build your budget',exact:true})
 await panel.getByLabel('Expected income this period (AUD)',{exact:true}).fill('500');await panel.getByLabel('Planned for Everyday spending (AUD)',{exact:true}).fill('250')
 await panel.getByRole('button',{name:'Review my plan',exact:true}).click()
 let dropped=false
 await pending.route('**/functions/v1/manage-budget',async route=>{if(route.request().postDataJSON()?.action==='save_draft'&&!dropped){dropped=true;await route.fetch();await route.abort('failed')}else await route.continue()})
 await panel.getByRole('button',{name:'Save setup draft',exact:true}).click()
 await expect(panel.getByRole('button',{name:'Check saved result',exact:true})).toBeVisible()
 await matrix(pending,'interrupted-save',{surface:'dialog[open]',focus:panel.getByRole('button',{name:'Check saved result',exact:true}),verify:async()=>{await expect(panel.getByRole('button',{name:'Check saved result',exact:true})).toBeEnabled();await expect(panel).toContainText('Your original request is retained');check('pending candidate still has no active plan',snapshotSQL(pendingUser).plan,null)}})
 await panel.getByRole('button',{name:'Check saved result',exact:true}).click();await expect(pending.getByRole('button',{name:'Review saved draft',exact:true})).toBeEnabled()
 check('candidate receipt recovery commits exactly one draft with its original request',[requests.length,requests[0].action,snapshotSQL(pendingUser).plan],[1,'save_draft',null])
 const draft=JSON.parse(sql(`SELECT public.budget_query(${quote(pendingUser.tenant)},${quote(pendingUser.id)},'{"action":"draft"}');`))
 check('recovered draft retains exact chosen income and allowance',[draft.draft_version,draft.draft.income_cents,draft.draft.lines[0].allocation_cents],['1',50000,25000])
 await pending.close()
 writeFileSync(resolve(out,'manifest.json'),JSON.stringify({scope:'Fictional production candidate; no personal migration or exposure',baseline:{income:600000,everyday:180000,spent:151000,remaining:29000,unallocated:20000},matrix:manifest},null,2)+'\n')
 check('candidate matrix covers seven states at five widths in both themes',manifest.length,70)
}
