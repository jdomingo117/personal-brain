import {openBudgetSettings,closeBudgetSettings} from './lib/budgetSettingsUI.mjs'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {confirmBudgetAssistance} from './lib/budgetAssistanceUI.mjs'
import AxeBuilder from '@axe-core/playwright'
import {expect} from '@playwright/test'

/** Real authenticated pages; called only by the guarded disposable Budget runner. */
export async function budgetAccessibilityChecks({repo,signedPage,newUser,assistanceFixture,check,settled,sql,quote,edge}) {
 const scans=[],out=repo?resolve(repo,'docs/budget-ui/bui-10/accessibility'):null
 if(out)mkdirSync(out,{recursive:true})
 async function audit(page,state){
  await settled(page)
  const dialog=page.locator('dialog[open]'),selector=await dialog.count()?'dialog[open]':'.budget-workspace'
  const result=await new AxeBuilder({page}).include(selector).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  check(`${state}: WCAG automated scan`,result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[])
  const overflow=await page.locator(selector).evaluate(el=>({local:el.scrollWidth>el.clientWidth+1,page:document.documentElement.scrollWidth>innerWidth+1}))
  check(`${state}: no page or region overflow`,overflow,{local:false,page:false})
  const small=await page.locator(selector).evaluate(root=>[...root.querySelectorAll('button,select,input,summary')].filter(el=>{
   if(el.matches(':disabled')||!el.getClientRects().length)return false
   const target=el.matches('input[type="checkbox"],input[type="radio"]')?el.closest('label')??el:el
   return target.getBoundingClientRect().height<43.5
  }).map(el=>el.getAttribute('aria-label')??el.textContent?.trim().slice(0,60)??el.tagName))
  check(`${state}: controls have 44px target height`,small,[])
  scans.push({state,viewport:page.viewportSize(),surface:selector,violations:result.violations.length})
  if(out)await page.screenshot({path:resolve(out,`${state.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.png`)})
 }
 for(const config of [{width:320,dark:false,motion:'reduce'},{width:320,dark:true,motion:'reduce'},{width:1440,dark:false,motion:'no-preference'},{width:720,dark:true,motion:'reduce'}]){
  const page=await signedPage(await newUser(),config.width)
  await page.emulateMedia({reducedMotion:config.motion})
  await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),config.dark)
  const name=`${config.width}px ${config.dark?'dark':'light'} ${config.motion}`
  await audit(page,`${name} empty`)
  const manual=page.getByRole('button',{name:'Enter my own amounts',exact:true})
  await manual.focus();await page.keyboard.press('Enter')
  if(config.dark)await page.getByRole('dialog',{name:'Build your budget',exact:true}).getByLabel('Budget rhythm',{exact:true}).selectOption('fortnightly')
  await audit(page,`${name} manual setup`)
  await page.getByLabel('Expected income this period (AUD)',{exact:true}).fill('1000')
  await page.getByLabel('Planned for Everyday spending (AUD)',{exact:true}).fill('500')
  await page.getByRole('button',{name:'Review my plan',exact:true}).click()
  await audit(page,`${name} setup review`)
  await page.getByRole('button',{name:'Save setup draft',exact:true}).click()
  await page.getByRole('button',{name:'Review saved draft',exact:true}).click()
  await page.getByRole('button',{name:'Start this budget',exact:true}).click()
  await expect(page.getByRole('button',{name:'My plan',exact:true})).toBeVisible()
  await audit(page,`${name} active overview`)
  await openBudgetSettings(page)
  for(const [open,close,review] of [
   ['Change budget frequency','Leave frequency preview','Review frequency change'],
   ['Change budget accounts','Leave account preview','Review account effects'],
   ['Change rollover rules','Leave rollover preview','Review rollover effects'],
   ['Manage budget and allowances','Leave lifecycle preview','Review lifecycle effects'],
  ]){
   const trigger=page.getByRole('button',{name:open,exact:true})
   await trigger.focus();await page.keyboard.press('Enter')
   if(open==='Change budget frequency'||open==='Change budget accounts'){
    await expect.poll(()=>page.locator('form').evaluateAll(forms=>forms.some(el=>el.contains(document.activeElement)))).toBe(true)
    check(`${name} ${open}: focus enters inline preview`,true)
   }
   await audit(page,`${name} ${open}`)
   await page.getByRole('button',{name:review,exact:true}).click()
   if(open==='Change budget frequency')await expect(page.getByRole('button',{name:'Save future frequency change',exact:true})).toBeVisible()
   else await expect(page.locator('form [role="status"]').filter({hasText:/^Preview ready/}).first()).toBeVisible()
   await audit(page,`${name} ${open} reviewed effects`)
   for(const table of await page.locator('.budget-panel .data-table-wrap:visible').all()){
    if(await table.evaluate(el=>el.scrollWidth>el.clientWidth+1)){
     await table.focus();await page.keyboard.press('ArrowRight')
     await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0)
     check(`${name}: comparison table scrolls with keyboard`,true)
    }
   }
   page.once('dialog',d=>d.accept())
   await page.getByRole('button',{name:close,exact:true}).click()
   await expect(trigger).toBeFocused()
   check(`${name} ${open}: focus returns to trigger`,true)
  }
  await closeBudgetSettings(page)
  const trigger=page.getByRole('button',{name:'Save for something',exact:true})
  await trigger.focus();await page.keyboard.press('Enter')
  const task=page.getByRole('dialog',{name:'Save for something',exact:true})
  await expect(task).toBeFocused()
  await audit(page,`${name} goal dialog`)
  await page.keyboard.press('Shift+Tab')
  await expect.poll(()=>task.evaluate(el=>el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Tab')
  await expect.poll(()=>task.evaluate(el=>el.contains(document.activeElement))).toBe(true)
  check(`${name}: goal keyboard focus stays inside dialog`,true)
  await page.keyboard.press('Escape');await expect(task).toHaveCount(0);await expect(trigger).toBeFocused()
  check(`${name}: Escape restores goal opener`,true)
  await page.route('**/functions/v1/query-budget',route=>route.request().postDataJSON()?.action==='workspace'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fictional accessibility read failure'})}):route.continue())
  await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await audit(page,`${name} read failure retains workspace`)
  await page.unroute('**/functions/v1/query-budget')
  if(config.motion==='reduce'){
   const transforms=await page.locator('.budget-workspace .glass').evaluateAll(els=>els.map(el=>getComputedStyle(el).transform))
   check(`${name}: reduced-motion tiles have no transform`,transforms.every(t=>t==='none'))
  }
  await page.screenshot({path:`/tmp/halcyon-budget-a11y-${config.width}-${config.dark?'dark':'light'}.png`,fullPage:true})
  await page.close()
 }
 const page=await signedPage(assistanceFixture.user,320)
 await page.getByRole('button',{name:'Help me build a budget',exact:true}).click()
 await audit(page,'320px assisted scope')
 await page.getByRole('button',{name:'Check my history',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('Choose at least one')
 await audit(page,'320px assisted scope error')
 await page.getByRole('checkbox',{name:/Assistance fictional account/}).check()
 await page.getByRole('button',{name:'Check my history',exact:true}).click()
 await expect(page.getByText('Your history is ready',{exact:true})).toBeVisible()
 await audit(page,'320px assisted evidence')
 void 0
 await page.getByLabel(/Have your income/).selectOption('no')
 await page.getByRole('checkbox',{name:/I’ve checked these amounts/}).check()
 await confirmBudgetAssistance(page,sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;"))
 await page.getByRole('checkbox',{name:/Try moving some everyday money elsewhere/}).check()
 await audit(page,'320px assisted what-if')
 await page.evaluate(()=>document.documentElement.classList.add('dark'))
 await audit(page,'320px dark assisted evidence')
 await page.close()
 const u=await newUser()
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'A11y no history','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const limited=await signedPage(u,320)
 await limited.getByRole('button',{name:'Help me build a budget',exact:true}).click()
 await limited.getByRole('checkbox',{name:/A11y no history/}).check()
 await limited.getByRole('button',{name:'Check my history',exact:true}).click()
 await expect(limited.getByText('History needs more information',{exact:true})).toBeVisible()
 await audit(limited,'320px limited history')
 await limited.close()
 const old=await newUser(),start=sql("SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '1 month')::date;")
 const source=(await edge(old,'query-budget',{action:'workspace'})).body.source_revision
 const saved=await edge(old,'manage-budget',{action:'save_draft',request_id:crypto.randomUUID(),expected_source:source,expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[],destination_account_ids:[],income_cents:100000,opening_drawdown_cents:0,lines:[{id:crypto.randomUUID(),kind:'everyday',name:'Everyday',allocation_cents:50000,opening_cents:0}]}})
 await edge(old,'manage-budget',{action:'activate',request_id:crypto.randomUUID(),expected_source:source,expected_draft:saved.body.result.draft_version,accept_gap:false})
 const history=await signedPage(old,320,true)
 await history.getByRole('button',{name:'Look back',exact:true}).click()
 await history.getByRole('button',{name:'Review and choose what carries',exact:true}).click()
 await audit(history,'320px historical review')
 await history.getByText('Compare allowances and recorded activity',{exact:true}).click()
 await history.evaluate(()=>document.documentElement.classList.add('dark'))
 await audit(history,'320px dark historical comparison table')
 await history.close()
 if(out)writeFileSync(resolve(out,'manifest.json'),JSON.stringify({scope:'Fictional production Budget candidate; automated Chromium, not human certification',scans},null,2)+'\n')
 check('accessibility matrix audited expected states',scans.length,64)
}
