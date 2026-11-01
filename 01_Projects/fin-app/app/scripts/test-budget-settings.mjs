import {randomUUID} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {openBudgetSettings,settingsPanel,stayInBudgetSettings,closeBudgetSettings} from './lib/budgetSettingsUI.mjs'
import {budgetTaskPanelChecks} from './test-budget-task-panel.mjs'

export async function budgetSettingsChecks(args){
 const {repo,newUser,sql,quote,check,edge,signedPage,snapshotSQL,settled}=args
 const out=resolve(repo,process.argv.includes('--settings-lifecycle')?'docs/budget-ui/bui-07c/captures':process.argv.includes('--settings-forms')?'docs/budget-ui/bui-07b/captures':'docs/budget-ui/bui-07a/captures');mkdirSync(out,{recursive:true})
 const u=await newUser(),line=randomUUID(),date=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;"),previous=sql("SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '1 month')::date;")
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Settings fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const extra=process.argv.includes('--settings-forms')?[{id:randomUUID(),kind:'fixed',name:'Test bill'},{id:randomUUID(),kind:'reserve',name:'Later cost'},{id:randomUUID(),kind:'contribution',name:'Long-term savings'},{id:randomUUID(),kind:'reserve',name:'Test goal'}].map(line=>({...line,allocation_cents:1000,opening_cents:0})):[]
 const command=input=>{const s=snapshotSQL(u);return JSON.parse(sql(`SELECT public.budget_command(${quote(u.tenant)},${quote(u.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_source:s.source_revision,expected_method:'budget-foundation-v1',plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}))}::jsonb,true);`))}
 command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:previous,account_ids:[],destination_account_ids:[],income_cents:600000,opening_drawdown_cents:0,lines:[{id:line,kind:'everyday',name:'Everyday',allocation_cents:180000,opening_cents:0},...extra]}});command({action:'activate',expected_draft:'1',accept_gap:false})
 const first=snapshotSQL(u).period.id;command({action:'open_next_period',income_cents:600000,accept_gap:false,lines:[{line_id:line,amount_cents:180000},...extra.map(item=>({line_id:item.id,amount_cents:1000}))]});const current=snapshotSQL(u).period.id
 if(extra.length)command({action:'save_item',line_id:extra[3].id,item:{type:'goal',name:'Test goal',target_cents:10000,estimated:true,due_date:null,cadence:'monthly',anchor:date,amount_cents:1000,state:'saving',recurring_id:null,planning_goal_id:null},opening_cents:0,opening_date:date,accept_gap:false})
 const page=await signedPage(u,1440,true),selector=page.getByRole('combobox',{name:'Saved budget period',exact:true})
 await selector.selectOption(first);await selector.selectOption(current)
 let writes=[];page.on('request',r=>{if(r.url().includes('/functions/v1/manage-budget'))writes.push(r.postDataJSON())})
 const panel=await openBudgetSettings(page)
 await expect(panel).toBeFocused()
 check('settings has one native modal and no nested dialog',await panel.evaluate(el=>[el instanceof HTMLDialogElement,document.querySelectorAll('dialog:modal,[role="dialog"][aria-modal="true"]').length]),[true,1])
 for(const name of ['Change budget frequency','Change budget accounts','Change rollover rules','Manage budget and allowances'])await expect(panel.getByRole('button',{name,exact:true})).toHaveCount(1)
 check('all four settings entries are available exactly once without a command',writes.length,0)
 for(const width of [320,390,768,1440])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark)
  check(`${width} ${dark?'dark':'light'} settings summary fits`,await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  const scan=await new AxeBuilder({page}).include('dialog[open]').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  check(`${width} ${dark?'dark':'light'} settings summary accessibility`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
  await page.screenshot({path:resolve(out,`${width}-${dark?'dark':'light'}-summary.png`)})
 }
 await panel.getByRole('button',{name:'Change budget frequency',exact:true}).click();const form=panel.getByRole('form',{name:'Change frequency preview',exact:true})
 await expect.poll(()=>form.evaluate(el=>el.contains(document.activeElement))).toBe(true)
 if(process.argv.includes('--settings-forms')){
  for(const name of ['First budget','Continuing full budgets']){
   const window=form.getByRole('region',{name,exact:true})
   for(const group of ['1 · Income & bills','2 · Everyday spending','3 · Savings & goals'])await expect(window.getByRole('group',{name:group,exact:true})).toHaveCount(1)
   await expect(window.getByRole('textbox')).toHaveCount(6)
   await expect(window.getByRole('group',{name:'1 · Income & bills',exact:true}).getByRole('textbox')).toHaveCount(3)
   await expect(window.getByRole('group',{name:'2 · Everyday spending',exact:true}).getByRole('textbox')).toHaveCount(1)
   await expect(window.getByRole('group',{name:'3 · Savings & goals',exact:true}).getByRole('textbox')).toHaveCount(2)
  }
  await captureForms(page,panel,'frequency-edit',out,check)
  await form.getByRole('button',{name:'Review frequency change',exact:true}).click()
  await expect(form.getByRole('button',{name:'Save future frequency change',exact:true})).toBeDisabled()
  await captureForms(page,panel,'frequency-review',out,check)
 }

 await form.getByLabel('First budget: expected income (AUD)',{exact:true}).fill('1000')
 await stayInBudgetSettings(page);await expect(form.getByLabel('First budget: expected income (AUD)',{exact:true})).toHaveValue('1000')
 const url=page.url();await page.evaluate(()=>history.back())
 await expect(panel.getByRole('button',{name:'Stay and keep editing',exact:true})).toBeVisible();await expect.poll(()=>page.url()).toBe(url)
 await panel.getByRole('button',{name:'Stay and keep editing',exact:true}).click();await expect(form.getByLabel('First budget: expected income (AUD)',{exact:true})).toHaveValue('1000')
 check('settings dirty close and browser back preserve the exact form and saved period',writes.length,0)
 page.once('dialog',d=>d.accept());await form.getByRole('button',{name:'Leave frequency preview',exact:true}).click();await closeBudgetSettings(page)
 await expect(page.getByRole('region',{name:'Budget header',exact:true}).getByRole('button',{name:'Accounts & settings',exact:true})).toBeFocused()
 check('explicit form cancellation returns to a clean summary and restores the header opener',true)
 await openBudgetSettings(page);await panel.getByRole('button',{name:'Change budget accounts',exact:true}).click()
 const accounts=panel.getByRole('form',{name:'Change budget accounts preview',exact:true})
 if(process.argv.includes('--settings-forms')){
  await expect(accounts.getByRole('group',{name:'1 · When should these choices apply?',exact:true})).toBeVisible()
  await expect(accounts.getByRole('group',{name:'Activity accounts',exact:true})).toBeVisible()
  await expect(accounts.getByRole('group',{name:'Savings destinations',exact:true})).toBeVisible()
  await captureForms(page,panel,'account-edit',out,check)
 }

 await accounts.getByRole('radio',{name:/Only this budget/}).check();await accounts.getByRole('checkbox',{name:'Activity: Settings fictional account',exact:true}).check()
 sql(`UPDATE public.accounts SET name='Settings account renamed' WHERE id=${quote(account)};`)
 await panel.getByRole('button',{name:'Refresh settings data',exact:true}).click();await expect(accounts.getByRole('checkbox',{name:'Activity: Settings account renamed',exact:true})).toBeChecked()
 check('settings refresh retains local account intent with new source facts',true)
 await accounts.getByRole('button',{name:'Review account effects',exact:true}).click();await expect(accounts).toContainText('Preview ready')
 if(process.argv.includes('--settings-forms'))await captureForms(page,panel,'account-review',out,check)
 await accounts.getByRole('checkbox',{name:/I reviewed the account dates/}).check();await accounts.getByRole('checkbox',{name:/I understand the incomplete or unavailable history/}).check()
 let dropped=false
 await page.route('**/functions/v1/manage-budget',async route=>{if(route.request().postDataJSON()?.action==='set_account_scope'&&!dropped){dropped=true;await route.fetch();await route.abort('failed')}else await route.continue()})
 const before=writes.length
 await accounts.getByRole('button',{name:'Save dated account choices',exact:true}).click();await expect(panel).toContainText('save result needs checking')
 await panel.getByRole('button',{name:'Check saved result',exact:true}).click();await expect(panel).toBeHidden()
 check('settings lost-response recovery saves once and exits through the shared panel',writes.slice(before).filter(w=>w.action==='set_account_scope').length,1)
 const saved=(await edge(u,'query-budget',{action:'workspace'})).body
 check('recovered settings preserve exact account scope and allowances',[saved.account_scope.filter(m=>m.role==='activity'&&m.start_date<=date&&(!m.end_date||m.end_date>date)).map(m=>m.account_id),saved.lines.find(l=>l.id===line).allocation_cents],[[account],180000])
 await page.unroute('**/functions/v1/manage-budget')
 await openBudgetSettings(page)
 for(const [name,leave]of [['Change rollover rules','Leave rollover preview'],['Manage budget and allowances','Leave lifecycle preview']]){
  await panel.getByRole('button',{name,exact:true}).click();await expect(panel.locator('form')).toBeVisible()
  if(name==='Change rollover rules'){
   await panel.getByRole('button',{name:'Keep all active positive balances aside',exact:true}).click();await stayInBudgetSettings(page)
   await expect(panel.getByRole('combobox',{name:'Balance rule for Other',exact:true})).toHaveValue('retain')
   check('button-only rollover edits participate in the shared dirty-exit guard',writes.filter(w=>w.action==='set_rollover').length,0)
  }
  await page.setViewportSize({width:320,height:1100})
  check(`${name} original form fits the native phone host`,await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  const scan=await new AxeBuilder({page}).include('dialog[open]').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();check(`${name} host accessibility`,scan.violations.map(v=>v.id),[])
  await page.screenshot({path:resolve(out,`320-${name.includes('rollover')?'rollover':'lifecycle'}.png`)})
  page.once('dialog',d=>d.accept());await panel.getByRole('button',{name:leave,exact:true}).click()
 }
 await panel.getByRole('button',{name:'Manage budget and allowances',exact:true}).click()
 const control=panel.getByRole('form',{name:'Budget lifecycle preview',exact:true})
 await control.getByRole('button',{name:'Review lifecycle effects',exact:true}).click();await expect(control).toContainText('Preview ready')
 await control.getByRole('checkbox',{name:/I reviewed the saved and future budget effects/}).check();await control.getByRole('checkbox',{name:/I understand that incomplete or unavailable history/}).check()
 await control.getByRole('button',{name:'Pause budget',exact:true}).click();await expect(panel.locator('[data-settings-task]')).toHaveAttribute('data-settings-task','summary');await expect(panel).toContainText('Budget paused')
 check('confirmed settings save returns to a clean summary without closing the host',true)
 await closeBudgetSettings(page);await page.close()
 await budgetTaskPanelChecks({...args,captureRoot:process.argv.includes('--settings-lifecycle')?'docs/budget-ui/bui-07c/task-captures':process.argv.includes('--settings-forms')?'docs/budget-ui/bui-07b/task-captures':'docs/budget-ui/bui-07a/task-captures'})
 if(process.argv.includes('--settings-lifecycle')){
  const captureSettings=(page,_form,state)=>captureForms(page,settingsPanel(page),state,out,check)
  const {budgetRolloverInteractions}=await import('./test-budget-rollover-interactions.mjs')
  await budgetRolloverInteractions({...args,captureSettings})
  const {budgetControlInteractions}=await import('./test-budget-control-interactions.mjs')
  await budgetControlInteractions({...args,captureSettings})
 }

}

async function captureForms(page,panel,state,out,check){
 const viewport=page.viewportSize(),darkMode=await page.evaluate(()=>document.documentElement.classList.contains('dark'))
 for(const width of [320,390,768,1024,1440])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1100});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark)
  check(`${width} ${dark?'dark':'light'} ${state} fits`,await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&[...el.querySelectorAll('form,fieldset,input')].every(child=>child.scrollWidth<=child.clientWidth+1)))
  const scan=await new AxeBuilder({page}).include('dialog[open]').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  check(`${width} ${dark?'dark':'light'} ${state} accessibility`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
  if(state.endsWith('preparing'))await panel.getByRole('progressbar',{name:'Complete checks saved',exact:true}).scrollIntoViewIfNeeded()
  else await panel.evaluate(el=>el.querySelector('h4')?.scrollIntoView({block:'start'}))
  await page.screenshot({path:resolve(out,`${width}-${dark?'dark':'light'}-${state}.png`)})
  if(process.argv.includes('--settings-lifecycle')){
   const table=panel.locator('.data-table-wrap:visible').first()
   if(await table.count()&&await table.evaluate(el=>el.scrollWidth>el.clientWidth+2)){
    await table.evaluate(el=>{el.scrollLeft=0});await table.focus();const before=await table.evaluate(el=>el.scrollLeft);await table.press('ArrowRight')
    await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(before)
    check(`${width} ${state} comparison table scrolls with the keyboard`,true)
   }
  }

 }
 if(viewport)await page.setViewportSize(viewport)
 await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),darkMode)
}
