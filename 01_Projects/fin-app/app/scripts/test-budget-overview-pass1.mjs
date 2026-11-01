/** Read-only production UI check on the retained fictional preview. Response
 * variants exercise presentation guards only; they are not financial fixtures. */
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {assertSafeTestTarget} from './lib/assertSafeTestTarget.mjs'
const previewPath=process.argv[2];assert(previewPath,'Pass the private disposable manual-preview.json path')
const preview=JSON.parse(readFileSync(previewPath,'utf8'));assert.equal(preview.url,'http://127.0.0.1:57300/budget')
assertSafeTestTarget({SUPABASE_URL:'http://127.0.0.1:57421',HALCYON_TEST_TARGET_ID:preview.project,HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES:'isolated-only'})
const user=preview.accounts.find(x=>x.purpose.includes('R01'));assert(user)
const out=resolve(dirname(fileURLToPath(import.meta.url)),'../../docs/budget-ui/overview-pass1');mkdirSync(out,{recursive:true})
const browser=await chromium.launch(),errors=[],writes=[],matrix=[]
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),page=await context.newPage()
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/functions/v1/manage-budget'))writes.push(r.postDataJSON())})
 const workspace=page.waitForResponse(r=>r.url().includes('/functions/v1/query-budget')&&r.request().postDataJSON()?.action==='workspace'&&r.status()===200)
 await page.goto(preview.url);await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign in',exact:true}).click()
 const base=await (await workspace).json();assert(base.details.forecast.flexible.available,'R01 preview must have a genuine eligible forecast')
 const hero=page.getByRole('region',{name:'Budget overview',exact:true}),forecast=hero.getByRole('region',{name:'Spending estimate',exact:true})
 await expect(forecast).toBeVisible();assert.equal(await page.getByRole('region',{name:'Spending estimate',exact:true}).count(),1)
 const original=structuredClone(base);let scenario='real'
 await page.route('**/functions/v1/query-budget',async route=>{
  if(route.request().postDataJSON()?.action!=='workspace')return route.continue()
  if(scenario==='real')return route.continue()
  if(scenario==='failed')return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Fictional refresh failure"}'})
  const value=structuredClone(base),f=value.details.forecast,v=f.flexible
  if(scenario==='ordinary'){v.projected_cents=8500;v.status='within_plan';v.pending_expense_cents=0;v.pending_overage=false}
  if(scenario==='overspend'){v.projected_cents=14500;v.status='likely_to_exceed';v.pending_expense_cents=0;v.pending_overage=false}
  if(scenario==='history'){v.available=false;v.projected_cents=null;v.status='unavailable';v.reason='not_enough_history';v.history=v.history.slice(0,2);v.median=null}
  if(scenario==='funding'){value.unallocated_cents=-5000;value.revision.income_cents=15000}
  if(scenario==='signed'){v.settled_net_cents=-1000;v.projected_cents=500;v.remaining_allocation_cents=11000}
  if(scenario==='zero'){v.settled_net_cents=0;v.projected_cents=0;v.status='within_plan';v.pending_expense_cents=0;v.pending_overage=false}
  if(scenario==='future'){f.phase='future';f.through_date=null;v.settled_net_cents=null;v.remaining_allocation_cents=null;v.pending_expense_cents=null;v.coverage_complete=false}
  if(scenario==='large'){v.allocation_cents=Number.MAX_SAFE_INTEGER;v.projected_cents=Number.MAX_SAFE_INTEGER;v.status='within_plan'}
  if(scenario==='old-date')f.as_of='2000-01-01'
  if(scenario==='wrong-source')f.source_revision='-1'
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)})
 })
 const refresh=async()=>{await page.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(page.getByRole('button',{name:'Refresh saved data',exact:true})).toBeEnabled()}
 for(const state of ['real','ordinary','overspend','history','funding']){
  scenario=state;await refresh()
  if(state==='history'){await expect(forecast).toContainText('Not enough history');await expect(forecast.getByRole('img')).toHaveCount(0)}else await expect(forecast.getByRole('img')).toHaveCount(1)
  if(state==='funding')await expect(page.locator('.budget-income-disclosure > summary')).toContainText('Funding gap')
  for(const width of [320,390,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:1100});const toggle=page.getByRole('button',{name:'Toggle dark mode',exact:true});if((await toggle.getAttribute('aria-pressed')==='true')!==(theme==='dark'))await toggle.click()
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${state}/${width}/${theme} page overflow`)
   const scan=await new AxeBuilder({page}).include('[aria-label="Budget overview"]').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(scan.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)})),[],`${state}/${width}/${theme} WCAG`)
   await hero.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`${state}-${width}-${theme}.png`),fullPage:true});matrix.push({state,width,theme,violations:0});console.log('PASS',state,width,theme)
  }
 }
 await page.setViewportSize({width:320,height:1100})
 for(const state of ['signed','zero','future','large']){scenario=state;await refresh();if(state==='signed'){await expect(forecast.getByRole('img')).toHaveCount(0);await expect(forecast).toContainText('without a comparison bar')}else{await expect(forecast.getByRole('img')).toHaveCount(1);if(state==='future'){await expect(forecast).toContainText('no observed activity');assert(!(await forecast.getByRole('img').getAttribute('aria-label')).includes('Recorded spending'))}}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),state+' fit');console.log('PASS boundary',state)}
 for(const state of ['old-date','wrong-source','failed']){scenario=state;await refresh();await expect(forecast.getByRole('img')).toHaveCount(0);await expect(forecast.locator('[data-budget-forecast-value]')).toHaveCount(0);console.log('PASS suppress',state)}
 scenario='real';await refresh();const summary=forecast.locator('summary');await summary.focus();await page.keyboard.press('Enter');await expect(forecast).toContainText('median of those three daily averages');await expect(forecast).toContainText('Fixed bills use dates');await expect(forecast).toContainText('Unmatched does not prove unpaid');await expect(summary).toBeFocused()
 await page.getByRole('button',{name:'My plan',exact:true}).click();await expect(page.getByRole('region',{name:'Spending estimate'})).toHaveCount(0);await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(hero.getByRole('region',{name:'Spending estimate'})).toBeVisible()
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(base,original)
 writeFileSync(resolve(out,'verification.json'),JSON.stringify({project:preview.project,scope:'Pass 1 production presentation; genuine eligible read plus response-only variants (not financial engine proof)',matrix,boundaries:['signed','zero','future','large'],suppression:['old-date','wrong-source','failed'],keyboard_method:true,view_navigation:true,financial_writes:writes.length,runtime_errors:errors},null,2)+'\n')
 console.log('30 production hero/forecast WCAG cases, seven guard/boundary cases, disclosure/navigation passed; zero Budget writes.')
}finally{await browser.close()}
