import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {budgetM5Interactions} from './test-budget-m5-interactions.mjs'

export async function budgetLookbackChecks(args){
 const {repo,newUser,sql,quote,check,signedPage,snapshotSQL}=args
 const out=resolve(repo,'docs/budget-ui/bui-08b/captures');mkdirSync(out,{recursive:true})
 const captureHistory=async(page,region,state)=>{
  if(state==='carry-choice'||state==='next-preview'){
   await page.getByRole('button',{name:'My plan',exact:true}).click()
   await page.getByRole('button',{name:'Look back',exact:true}).click()
   if(state==='carry-choice')await expect(region.getByRole('radio',{name:/Carry the everyday remainder into Other/})).toBeChecked()
   else await expect(region.getByLabel('Expected income next budget (AUD)',{exact:true})).toHaveValue('210')
   check(`${state} choices survive changing Budget views`,true)
  }
  if(state==='changed-comparison'){
   const row=region.getByRole('table').getByRole('row').filter({has:page.getByRole('rowheader',{name:'Everyday',exact:true})})
   await expect(row.getByRole('cell').nth(2)).toHaveText('$100.00')
   await expect(region.getByRole('region',{name:'Recorded review snapshot',exact:true})).toContainText('net spending $125.00')
   check('changed comparison retains the actual saved review allowance and recorded spending',true)
  }
  const viewport=page.viewportSize(),dark=await page.evaluate(()=>document.documentElement.classList.contains('dark'))
  for(const width of [320,390,768,1024,1440])for(const theme of [false,true]){
   await page.setViewportSize({width,height:1100});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),theme)
   check(`${width} ${theme?'dark':'light'} ${state} fits`,await region.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
   const scan=await new AxeBuilder({page}).include('.budget-history:not([hidden])').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
   check(`${width} ${theme?'dark':'light'} ${state} accessibility`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
   const table=region.getByRole('region',{name:'Historical allowance comparison',exact:true})
   if(await table.count()&&await table.evaluate(el=>el.scrollWidth>el.clientWidth+1)){
    await table.evaluate(el=>{el.scrollLeft=0});await table.focus();await table.press('ArrowRight');await expect.poll(()=>table.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0)
    check(`${width} history comparison scrolls with keyboard`,true)
   }
   if(state==='changed-comparison')await region.getByRole('region',{name:'Historical allowance comparison',exact:true}).scrollIntoViewIfNeeded()
   else await region.evaluate(el=>el.scrollIntoView({block:'start'}))
   await page.screenshot({path:resolve(out,`${width}-${theme?'dark':'light'}-${state}.png`)})
  }
  if(viewport)await page.setViewportSize(viewport);await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark)
 }
 await budgetM5Interactions({...args,captureHistory})
 const u=await newUser(),line=randomUUID(),date=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;")
 const command=(input,actor=u)=>{const s=snapshotSQL(actor);return JSON.parse(sql(`SELECT public.budget_command(${quote(actor.tenant)},${quote(actor.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_source:s.source_revision,expected_method:'budget-foundation-v1',plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}))}::jsonb,true);`))}
 command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:date,account_ids:[],destination_account_ids:[],income_cents:100000,opening_drawdown_cents:0,lines:[{id:line,name:'Everyday',kind:'everyday',allocation_cents:50000,opening_cents:0}]}});command({action:'activate',expected_draft:'1',accept_gap:false})
 const current=snapshotSQL(u).period.id,page=await signedPage(u,390,true),writes=[]
 page.on('request',r=>{if(r.url().includes('/functions/v1/manage-budget'))writes.push(r.postDataJSON())})
 const header=page.getByRole('region',{name:'Budget header',exact:true}),region=page.getByRole('region',{name:'Budget periods and review',exact:true})
 await header.getByRole('button',{name:'Look back',exact:true}).click();await expect(region).toContainText('In progress')
 await expect(region.getByRole('button',{name:'Review and choose what carries',exact:true})).toHaveCount(0)
 await captureHistory(page,region,'current')
 for(const name of ['Overview','My plan','Look back'])await header.getByRole('button',{name,exact:true}).click()
 check('Look back tab changes never save or mark a current budget reviewed',writes.length,0)
 assert.throws(()=>command({action:'open_next_period',income_cents:100000,accept_gap:false,lines:[{line_id:line,amount_cents:50000}]}),/budget_invalid_unfinished_period/)
 check('unfinished current budget cannot open its next period early',true)
 const futureUser=await newUser(),futureLine=randomUUID(),futureDate=sql("SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')+interval '1 month')::date;")
 command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:futureDate,account_ids:[],destination_account_ids:[],income_cents:100000,opening_drawdown_cents:0,lines:[{id:futureLine,name:'Everyday',kind:'everyday',allocation_cents:50000,opening_cents:0}]}},futureUser)
 command({action:'activate',expected_draft:'1',accept_gap:false},futureUser)
 const future=snapshotSQL(futureUser).period.id,futurePage=await signedPage(futureUser,390,true),futureRegion=futurePage.getByRole('region',{name:'Budget periods and review',exact:true})
 await futurePage.getByRole('button',{name:'Look back',exact:true}).click()
 await expect(futureRegion).toContainText('Future plan · provisional');await expect(futureRegion.getByRole('button',{name:'Review and choose what carries',exact:true})).toHaveCount(0)
 await captureHistory(futurePage,futureRegion,'future')
 await expect(header.getByRole('combobox',{name:'Saved budget period',exact:true})).toHaveValue(current)
 await expect(futurePage.getByRole('combobox',{name:'Saved budget period',exact:true})).toHaveValue(future)
 check('current and future saved IDs remain distinct without review commands',writes.length,0)
 // Existing M5 journeys above verify real review/carry, changed immutable records,
 // reopen/Undo, next-period creation and dirty navigation through this exact host.
}
