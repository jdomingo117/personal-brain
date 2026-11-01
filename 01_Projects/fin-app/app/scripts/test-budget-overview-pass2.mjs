/** Production UI, positively identified retained fictional accounts only.
 * One reversible reminder acknowledgement is undone through the real UI.
 * Display-only variants never reach the financial command endpoint. */
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {assertSafeTestTarget} from './lib/assertSafeTestTarget.mjs'
assert(process.argv[2],'Private preview metadata path required')
const meta=JSON.parse(readFileSync(process.argv[2],'utf8'));assert.equal(meta.url,'http://127.0.0.1:57300/budget')
assertSafeTestTarget({SUPABASE_URL:'http://127.0.0.1:57421',HALCYON_TEST_TARGET_ID:meta.project,HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES:'isolated-only'})
const out=resolve(dirname(fileURLToPath(import.meta.url)),'../../docs/budget-ui/overview-pass2');mkdirSync(out,{recursive:true})
const browser=await chromium.launch(),errors=[],writes=[],matrix=[]
const financial=s=>JSON.stringify({plan:s.plan,period:s.period,revision:s.revision,lines:s.lines,actuals:s.actuals,future_template:s.future_template,unallocated_cents:s.unallocated_cents,items:s.details.items,source_revision:s.source_revision,financial_undo:s.details.undo_operation_id})
async function login(user){const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('request',r=>{if(r.url().includes('/functions/v1/manage-budget'))writes.push(r.postDataJSON())});const wait=page.waitForResponse(r=>r.url().includes('/functions/v1/query-budget')&&r.request().postDataJSON()?.action==='workspace'&&r.status()===200);await page.goto(meta.url);await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();const data=await(await wait).json();await expect(page.getByRole('button',{name:'My plan',exact:true})).toBeEnabled();return {page,data}}
const nextRead=page=>page.waitForResponse(r=>r.url().includes('/functions/v1/query-budget')&&r.request().postDataJSON()?.action==='workspace'&&r.status()===200).then(r=>r.json())
try{
 const {page,data}=await login(meta.accounts.find(x=>x.purpose.includes('R01'))),checks=page.getByRole('region',{name:'Budget checks',exact:true}),hero=page.getByRole('region',{name:'Budget overview',exact:true})
 assert(data.details.attention.items.some(i=>i.state==='active'),'Need the original active fictional pending issue')
 const first=data.details.attention.items.find(i=>i.state==='active')
 await expect(hero.getByRole('region',{name:'Budget checks'})).toBeVisible();await expect(checks.locator('.budget-check-row')).toHaveCount(1)
 assert.equal(await checks.locator('.budget-check-row h4').innerText(),first.label)
 await expect(checks.getByRole('link',{name:'Review pending charges',exact:true})).toHaveAttribute('href','/ledger');await checks.getByText('Reminder options',{exact:true}).click();await checks.getByRole('button',{name:'Inspect allowance',exact:true}).click();await expect(page.locator('.budget-allowance-tools')).toHaveAttribute('open','')
 await checks.getByRole('button',{name:'Review this check',exact:true}).click()
 const form=checks.getByRole('form',{name:'Review budget check'});await expect(form).toBeVisible()
 await page.getByRole('button',{name:'My plan',exact:true}).click();await expect(form).toBeHidden();await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(form).toBeVisible()
 await form.getByRole('radio',{name:'Remind me on a date I choose.',exact:true}).check();await expect(form.getByLabel('Show this again on',{exact:true})).toBeVisible()
 await form.getByRole('radio',{name:/I’ve reviewed this/}).check()
 await page.route('**/functions/v1/query-budget',route=>{if(route.request().postDataJSON()?.action!=='workspace')return route.continue();const changed=structuredClone(data);changed.details.attention.version=String(BigInt(changed.details.attention.version)+1n);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(changed)})})
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(page.getByRole('button',{name:'Refresh saved data',exact:true})).toBeEnabled();await expect(form).toContainText('saved facts changed');await expect(form.getByRole('button',{name:'Save review preference',exact:true})).toBeDisabled()
 await form.getByRole('button',{name:'Review latest check',exact:true}).click();await page.unroute('**/functions/v1/query-budget');await page.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(page.getByRole('button',{name:'Refresh saved data',exact:true})).toBeEnabled();await expect(form).toBeVisible();await form.getByRole('button',{name:'Review latest check',exact:true}).click()
 await form.getByLabel('I understand the budget amounts and any shortfall stay unchanged.').check()
 let acknowledged=false
 try{
  const afterAck=nextRead(page);await form.getByRole('button',{name:'Save review preference',exact:true}).click();const saved=await afterAck;acknowledged=true
  assert.equal(saved.details.attention.items.find(i=>i.key===first.key).state,'acknowledged');assert.equal(financial(saved),financial(data))
  const undo=checks.getByRole('button',{name:'Undo last review preference',exact:true});await expect(undo).toBeEnabled();const afterUndo=nextRead(page);await undo.click();const restored=await afterUndo;acknowledged=false
  assert.equal(restored.details.attention.items.find(i=>i.key===first.key).state,'active');assert.equal(financial(restored),financial(data))
 }finally{if(acknowledged){const undo=checks.getByRole('button',{name:'Undo last review preference',exact:true});await undo.click();await expect(checks.getByText(first.label,{exact:true})).toBeVisible()}}
 console.log('PASS canonical priority, inspect disclosure, cross-view retained review, real acknowledgement/Undo and unchanged financial facts')
 await page.context().close()
 const sample=await login(meta.accounts.find(x=>x.purpose==='Explore the active sample budget')),p=sample.page,base=sample.data
 const goal=base.details.items.find(i=>i.config?.type==='goal');assert(goal,'Need the retained sample goal')
 const goals=p.getByRole('region',{name:'Your savings goals',exact:true}),commitments=p.getByRole('region',{name:'Your commitments',exact:true}),g=goals.locator(`[data-budget-goal-detail="${goal.line_id}"]`)
 await expect(g).not.toHaveAttribute('open','');await expect(g.locator('summary')).toContainText('Plan amounts, not confirmed cash')
 await g.locator('summary').focus();await p.keyboard.press('Enter');await expect(g.locator('article')).toBeVisible();await expect(g).toContainText('Transfers matched');await expect(g).toContainText('They are not added together')
 await g.getByRole('button',{name:`Adjust ${goal.name}`,exact:true}).click();await expect(p.getByRole('dialog')).toBeVisible();await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
 await g.getByRole('button',{name:'Match activity',exact:true}).click();await expect(p.getByRole('dialog')).toContainText('Match recorded activity');await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
 const bill=commitments.locator('[data-budget-commitment]').first();await bill.locator('summary').click();await expect(bill.getByRole('button',{name:/Set up/})).toBeVisible()
 await bill.getByRole('button',{name:/Set up/}).click();await expect(p.getByRole('dialog')).toBeVisible();await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
 console.log('PASS compact goal and bill disclosures; original goal adjust/match and bill setup tasks')
 await g.locator('summary').click();await bill.locator('summary').click()
 let state='real'
 await p.route('**/functions/v1/query-budget',route=>{if(route.request().postDataJSON()?.action!=='workspace')return route.continue();if(state==='failed')return route.fulfill({status:503,contentType:'application/json',body:'{"message":"Fictional read failure"}'});if(state==='real')return route.continue();const s=structuredClone(base),item=s.details.items.find(i=>i.line_id===goal.line_id)
  if(state==='multi'){const all=s.details.attention.items,seed=all[0]??data.details.attention.items[0];s.details.attention.items=[{...seed,key:'fixture:first',label:'First canonical check',state:'active'},{...seed,key:'fixture:second',label:'Second canonical check',state:'active'},{...seed,key:'fixture:reviewed',label:'Reviewed shortfall',state:'acknowledged',kind:'overspend',gap_cents:1000}];s.details.attention.total=3;s.details.attention.active_count=2}
  if(state==='funding'){s.unallocated_cents=-5000;s.revision.income_cents=1000}
  if(state==='changed'){item.changed_claims=1}
  if(state==='paused'){item.config.state='paused'}
  if(state==='draft'){item.config.state='draft';item.config.target_cents=null}
  if(state==='bad-target'){item.config.target_cents=Number.MAX_SAFE_INTEGER+1}
  if(state==='purchased'){item.config.state='purchase-recorded'}
  if(state==='unknown'){s.scope_valid=false;s.details.lifecycle.facts.scope_valid=false}
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(s)})})
 const refresh=async()=>{await p.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(p.getByRole('button',{name:'Refresh saved data',exact:true})).toBeEnabled()}
 for(const name of ['real','multi','funding','unknown','changed']){state=name;await refresh();const c=p.getByRole('region',{name:'Budget checks',exact:true})
  if(name==='multi'){await expect(c.locator('.budget-check-row')).toHaveCount(1);await expect(c.locator('.budget-check-row h4')).toHaveText('First canonical check');await expect(c).toContainText('These gaps still remain');await c.getByRole('button',{name:'See all 3 budget checks',exact:true}).click();await expect(c.locator('.budget-check-row')).toHaveCount(3);await c.getByRole('button',{name:'Show priority check',exact:true}).click()}
  if(name==='funding')await expect(p.locator('.budget-income-disclosure > summary')).toContainText('Funding gap')
  if(name==='changed')await expect(g.locator('summary')).toContainText('Matches need review')
  for(const width of [320,390,1440])for(const theme of ['light','dark']){await p.setViewportSize({width,height:1100});const toggle=p.getByRole('button',{name:'Toggle dark mode',exact:true});if((await toggle.getAttribute('aria-pressed')==='true')!==(theme==='dark'))await toggle.click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow');const scan=await new AxeBuilder({page:p}).include('.budget-workspace').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);await p.locator('.scroll-region').evaluate(el=>el.scrollTop=0);await p.screenshot({path:resolve(out,`${name}-${width}-${theme}.png`),fullPage:true});matrix.push({state:name,width,theme,violations:0});console.log('PASS',name,width,theme)}
 }
 state='bad-target';await refresh();await expect(g.locator('[data-budget-value="goal-summary-target:'+goal.line_id+'"]')).toContainText('Unavailable');await expect(g.locator('summary').getByRole('progressbar')).toHaveCount(0)
 for(const name of ['paused','draft','purchased']){state=name;await refresh();await expect(g.locator('summary')).toContainText(name==='paused'?'Paused':name==='draft'?'Draft':'Purchase recorded');if(name!=='paused')await expect(g.locator('summary').getByRole('progressbar')).toHaveCount(0)}
 state='failed';await refresh();await expect(goals).toContainText('Previously loaded figures');state='real';await refresh()
 assert.deepEqual(errors,[]);assert.equal(writes.length,2);assert.deepEqual(writes.map(w=>w.action),['set_attention','undo'])
 writeFileSync(resolve(out,'verification.json'),JSON.stringify({project:meta.project,matrix,real_preference_acknowledgement_and_undo:true,financial_facts_unchanged:true,persistent_review_across_views:true,stale_review_guard:true,snooze_choice_accessible:true,original_goal_and_bill_tasks:true,all_checks_preserved:true,extra_display_states:['paused','draft','purchased','unsafe target','failed refresh'],runtime_errors:errors,write_actions:writes.map(w=>w.action),response_variants_are_display_only:true},null,2)+'\n')
 console.log('30 full-workspace WCAG cases passed; original tasks, priority/all/reviewed gaps and reversible real reminder controls passed.')
}finally{await browser.close()}
