import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {budgetTaskPanelChecks} from './test-budget-task-panel.mjs'

export async function budgetSetupChecks(args){
 const {repo,newUser,sql,quote,check,signedPage,snapshotSQL}=args
 const out=resolve(repo,'docs/budget-ui/bui-09a/captures');mkdirSync(out,{recursive:true})
 async function capture(page,panel,state){
  const viewport=page.viewportSize(),dark=await page.evaluate(()=>document.documentElement.classList.contains('dark'))
  for(const width of [320,390,768,1024,1440])for(const theme of [false,true]){
   await page.setViewportSize({width,height:1100});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),theme)
   check(`${width} ${theme?'dark':'light'} ${state} fits`,await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&[...el.querySelectorAll('input,fieldset')].every(child=>child.scrollWidth<=child.clientWidth+1)))
   const scan=await new AxeBuilder({page}).include('dialog[open]').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
   check(`${width} ${theme?'dark':'light'} ${state} accessibility`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
   if(state.endsWith('review')){
    const heading=panel.getByRole('heading',{name:'Check before saving',exact:true});if(await heading.count())await heading.scrollIntoViewIfNeeded()
   }else await panel.locator('.budget-task-body').evaluate(el=>{el.scrollTop=0})
   await page.screenshot({path:resolve(out,`${width}-${theme?'dark':'light'}-${state}.png`)})
  }
  if(viewport)await page.setViewportSize(viewport);await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark)
 }
 for(const frequency of ['monthly','fortnightly']){
  const u=await newUser(),page=await signedPage(u,390),writes=[]
  page.on('request',r=>{if(r.url().includes('/functions/v1/manage-budget'))writes.push(r.postDataJSON())})
  const initialIndex=await page.evaluate(()=>history.state.idx)
  await page.getByRole('navigation').getByRole('button',{name:'Budget',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>history.state.idx)).toBe(initialIndex+1)
  await page.getByRole('button',{name:'Enter my own amounts',exact:true}).click()
  const panel=page.getByRole('dialog',{name:'Build your budget',exact:true}),form=panel.getByRole('form',{name:'Manual budget setup',exact:true})
  await expect(panel).toBeFocused();check(`${frequency} has one native setup modal`,await panel.evaluate(()=>document.querySelectorAll('dialog:modal').length),1)
  await form.getByLabel('Budget rhythm',{exact:true}).selectOption(frequency)
  const date=sql("SELECT (now() AT TIME ZONE 'Australia/Sydney')::date;")
  await form.getByLabel('Start with the period containing',{exact:true}).fill(date)
  await form.getByLabel('Budget timezone',{exact:true}).fill('Australia/Sydney')
  if(frequency==='fortnightly')await form.getByLabel('A two-week cycle start date',{exact:true}).fill(date)
  const income=frequency==='monthly'?'1000':'0',allowance=frequency==='monthly'?'500':'0'
  await form.getByLabel('Expected income this period (AUD)',{exact:true}).fill(income)
  await form.getByLabel('Planned for Everyday spending (AUD)',{exact:true}).fill(allowance)
  await form.getByRole('button',{name:'1 · Rhythm & accounts',exact:true}).click();await expect(form.getByRole('heading',{name:'1. Choose your rhythm and accounts',exact:true})).toBeFocused()
  await form.getByRole('button',{name:'2 · Money to plan with',exact:true}).click();await expect(form.getByLabel('Expected income this period (AUD)',{exact:true})).toHaveValue(income)
  await form.getByLabel('Expected income this period (AUD)',{exact:true}).fill('1.')
  await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(page.getByRole('button',{name:'Continue setup',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Continue setup',exact:true}).click();await expect(form.getByLabel('Expected income this period (AUD)',{exact:true})).toHaveValue('1.')
  await form.getByLabel('Expected income this period (AUD)',{exact:true}).fill(income)
  await page.evaluate(()=>history.back());await expect.poll(()=>page.evaluate(()=>history.state.idx)).toBe(initialIndex);await expect(panel).toBeHidden()
  await page.evaluate(()=>history.forward());await expect.poll(()=>page.evaluate(()=>history.state.idx)).toBe(initialIndex+1)
  await page.getByRole('button',{name:'Continue setup',exact:true}).click()
  await expect(panel).toBeVisible();await expect(form.getByLabel('Expected income this period (AUD)',{exact:true})).toHaveValue(income)
  await expect(form.getByLabel('Planned for Everyday spending (AUD)',{exact:true})).toHaveValue(allowance)
  check(`${frequency} section navigation, close/resume and browser Back retain setup without writing`,writes.length,0)
  await capture(page,panel,`${frequency}-edit`)
  await form.getByRole('button',{name:'Review my plan',exact:true}).click();await capture(page,panel,`${frequency}-review`)
  let dropped=false
  if(frequency==='monthly')await page.route('**/functions/v1/manage-budget',async route=>{if(route.request().postDataJSON()?.action==='save_draft'&&!dropped){dropped=true;await route.fetch();await route.abort('failed')}else await route.continue()})
  await form.getByRole('button',{name:'Save setup draft',exact:true}).click()
  if(frequency==='monthly'){
   await expect(panel.getByRole('button',{name:'Check saved result',exact:true})).toBeVisible()
   await panel.getByRole('button',{name:'Close',exact:true}).click();await expect(panel).toBeHidden()
   await page.getByRole('button',{name:'Continue setup',exact:true}).click()
   await panel.getByRole('button',{name:'Check saved result',exact:true}).click();await expect(panel).toBeHidden()
   await page.unroute('**/functions/v1/manage-budget')
  }
  await expect(page.getByRole('button',{name:'Review saved draft',exact:true})).toBeEnabled()
  const draft=JSON.parse(sql(`SELECT public.budget_query(${quote(u.tenant)},${quote(u.id)},'{"action":"draft"}');`))
  check(`${frequency} confirmed draft save never activates a plan`,[snapshotSQL(u).plan,writes.map(w=>w.action),draft.draft.income_cents,draft.draft.lines[0].allocation_cents],[null,['save_draft'],Number(income)*100,Number(allowance)*100])
  await page.reload();await page.getByRole('button',{name:'Review saved draft',exact:true}).click()
  const saved=page.getByRole('dialog',{name:'Review saved setup draft',exact:true});await expect(saved).toBeVisible()
  await capture(page,saved,`${frequency}-saved`)
  check(`${frequency} reviewing a persisted draft still does not activate`,snapshotSQL(u).plan,null)
  if(frequency==='fortnightly'){
   await page.route('**/functions/v1/manage-budget',async route=>{if(route.request().postDataJSON()?.action==='activate'&&!dropped){dropped=true;await route.fetch();await route.abort('failed')}else await route.continue()})
  }
  await saved.getByRole('button',{name:'Start this budget',exact:true}).click()
  if(frequency==='fortnightly'){await expect(saved.getByRole('button',{name:'Check saved result',exact:true})).toBeVisible();await saved.getByRole('button',{name:'Check saved result',exact:true}).click();await page.unroute('**/functions/v1/manage-budget')}
  await expect(page.getByRole('button',{name:'My plan',exact:true})).toBeVisible()
  check(`${frequency} explicit activation preserves its reviewed cadence and amounts once`,[snapshotSQL(u).period.frequency,snapshotSQL(u).revision.income_cents,writes.filter(w=>w.action==='activate').length],[frequency,Number(income)*100,1])
  await page.close()
 }
 const gapUser=await newUser(),gap=await signedPage(gapUser,390)
 await gap.getByRole('button',{name:'Enter my own amounts',exact:true}).click()
 const editor=gap.getByRole('dialog',{name:'Build your budget',exact:true})
 await editor.getByLabel('Existing cash to use this period (AUD)',{exact:true}).fill('100');await editor.getByLabel('Planned for Everyday spending (AUD)',{exact:true}).fill('100')
 await editor.getByRole('button',{name:'Review my plan',exact:true}).click();await expect(editor.getByRole('button',{name:'Save setup draft',exact:true})).toBeDisabled()
 await editor.getByRole('checkbox',{name:/I understand I have planned more/}).check();await editor.getByRole('button',{name:'Save setup draft',exact:true}).click()
 await gap.getByRole('button',{name:'Review saved draft',exact:true}).click();const saved=gap.getByRole('dialog',{name:'Review saved setup draft',exact:true})
 await expect(saved.getByRole('button',{name:'Start this budget',exact:true})).toBeDisabled()
 await saved.getByRole('checkbox',{name:/I understand the current and future funding gaps/}).check();await saved.getByRole('button',{name:'Start this budget',exact:true}).click()
 await expect(gap.getByRole('button',{name:'My plan',exact:true})).toBeVisible()
 check('one-off cash is not repeated and both draft review and activation require the future-gap acknowledgement',snapshotSQL(gapUser).future_template.unallocated_cents,-10000)
 await gap.close()
 await budgetTaskPanelChecks({...args,captureRoot:'docs/budget-ui/bui-09a/task-captures'})
}
