import {randomUUID} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

export async function budgetPlanChecks({repo,newUser,sql,quote,check,signedPage,snapshotSQL}){
 const out=resolve(repo,'docs/budget-ui/bui-08a/captures');mkdirSync(out,{recursive:true})
 const u=await newUser(),ids=Array.from({length:5},()=>randomUUID())
 const names=['Everyday','Regular bills','Upcoming costs with a long name to check wrapping on a phone','Longer-term savings','Trip goal']
 const amounts=[180000,250000,40000,100000,10000],future=[200000,240000,120000,60000,20000]
 const lines=ids.map((id,i)=>({id,name:names[i],kind:['everyday','fixed','reserve','contribution','reserve'][i],allocation_cents:amounts[i],opening_cents:i===4?50000:0}))
 const previous=sql("SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '1 month')::date;")
 const command=(user,input)=>{const s=snapshotSQL(user);return JSON.parse(sql(`SELECT public.budget_command(${quote(user.tenant)},${quote(user.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_source:s.source_revision,expected_method:'budget-foundation-v1',plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}))}::jsonb,true);`))}
 const payload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:previous,account_ids:[],destination_account_ids:[],income_cents:600000,opening_drawdown_cents:10000,lines}
 command(u,{action:'save_draft',expected_draft:'0',payload});command(u,{action:'activate',expected_draft:'1',accept_gap:false})
 const past=snapshotSQL(u).period.id
 command(u,{action:'open_next_period',income_cents:600000,accept_gap:false,lines:ids.map((line_id,i)=>({line_id,amount_cents:amounts[i]}))})
 command(u,{action:'revise',scope:'period-and-future',income_cents:700000,opening_drawdown_cents:0,accept_gap:false,lines:ids.map((line_id,i)=>({line_id,amount_cents:future[i]}))})
 command(u,{action:'revise',scope:'period',income_cents:600000,opening_drawdown_cents:10000,accept_gap:false,lines:ids.map((line_id,i)=>({line_id,amount_cents:amounts[i]}))})
 const current=snapshotSQL(u).period.id,page=await signedPage(u,1440,true)
 const writes=[];page.on('request',r=>{if(r.url().includes('/functions/v1/manage-budget'))writes.push(r.postDataJSON())})
 const header=page.getByRole('region',{name:'Budget header',exact:true}),plan=page.getByRole('region',{name:'Saved allocation plan',exact:true})
 const amount=name=>plan.locator(`[data-budget-value="${name}"] [data-budget-amount]`)
 await header.getByRole('button',{name:'My plan',exact:true}).click()
 await expect(amount('plan-income')).toHaveText('$6,000.00');await expect(amount('plan-cash-once')).toHaveText('$100.00');await expect(amount('plan-unallocated')).toHaveText('$300.00')
 for(const id of ids)await expect(plan.locator(`[data-plan-line="${id}"]`)).toHaveCount(1)
 check('My plan shows every saved allocation once with separate income, one-off cash and canonical unallocated amount',true)
 await plan.getByText('See saved future allowances',{exact:true}).click()
 await expect(amount('plan-future-income')).toHaveText('$7,000.00');await expect(amount('plan-future-unallocated')).toHaveText('$600.00')
 await expect(amount(`plan-line-${ids[0]}`)).toHaveText('$1,800.00');await expect(amount(`plan-future-line-${ids[0]}`)).toHaveText('$2,000.00')
 await expect(plan.locator(`[data-plan-line="${ids[4]}"]`)).toContainText('Existing reserve at setup: $500.00')
 for(const id of ids)await expect(plan.locator(`[data-future-plan-line="${id}"]`)).toHaveCount(1)
 check('continuing allocations stay distinct from selected allocations and setup reserves',true)
 for(const width of [320,390,768,1024,1440])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark)
  for(const open of [false,true]){
   await plan.locator('details').evaluate((el,value)=>{el.open=value},open)
   check(`${width} ${dark?'dark':'light'} ${open?'future':'current'} plan fits`,await plan.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
   const scan=await new AxeBuilder({page}).include('.budget-plan').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
   check(`${width} ${dark?'dark':'light'} ${open?'future':'current'} plan accessibility`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
   await (open?plan.locator('details'):plan).evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:resolve(out,`${width}-${dark?'dark':'light'}-${open?'future':'current'}.png`),fullPage:true})
  }
 }
 await plan.getByRole('button',{name:'View allowance activity',exact:true}).click();await expect(page.getByRole('region',{name:'Bills and savings goals',exact:true})).toBeVisible()
 const allowance=page.locator('.budget-everyday-row').first();await allowance.locator('summary').click()
 await header.getByRole('button',{name:'My plan',exact:true}).click();await expect(page.getByRole('region',{name:'Bills and savings goals',exact:true})).toBeHidden()
 await plan.getByRole('button',{name:'View allowance activity',exact:true}).click();await expect(allowance).toHaveAttribute('open','')
 await header.getByRole('button',{name:'My plan',exact:true}).click()
 for(const name of ['Overview','Look back','My plan','Overview','My plan'])await header.getByRole('button',{name,exact:true}).click()
 check('view switches and future disclosure never create a financial write',writes.length,0)
 await header.getByRole('combobox',{name:'Saved budget period',exact:true}).selectOption(past)
 await expect(plan.getByRole('button',{name:'Adjust plan',exact:true})).toBeDisabled();await expect(plan).toContainText('Selected past budget')
 await header.getByRole('combobox',{name:'Saved budget period',exact:true}).selectOption(current)
 await plan.getByRole('button',{name:'Adjust plan',exact:true}).click();await expect(page.getByRole('heading',{name:'Adjust your plan',exact:true})).toBeFocused()
 await expect(header.getByRole('button',{name:'My plan',exact:true})).toBeDisabled()
 await page.getByLabel('Expected income this period (AUD)',{exact:true}).fill('6500')
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Leave editor',exact:true}).click();await expect(page.getByLabel('Expected income this period (AUD)',{exact:true})).toHaveValue('6500')
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Leave editor',exact:true}).click();await expect(amount('plan-income')).toHaveText('$6,000.00')
 check('edit entry focuses the existing controller, locks view changes and confirmed discard preserves saved facts',writes.length,0)
 await plan.getByRole('button',{name:'Adjust plan',exact:true}).click();await page.getByLabel('Expected income this period (AUD)',{exact:true}).fill('6500')
 await page.getByRole('button',{name:'Review my plan',exact:true}).click();await page.getByRole('button',{name:'Save plan changes',exact:true}).click();await expect(plan).toBeVisible()
 let saved=snapshotSQL(u)
 check('period-only save leaves the saved continuing plan intact',[saved.revision.income_cents,saved.future_template.income_cents,writes.length],[650000,700000,1])
 check('existing revise body retains exactly one amount for every saved line',[...writes[0].lines].sort((a,b)=>a.line_id.localeCompare(b.line_id)),ids.map((line_id,i)=>({line_id,amount_cents:amounts[i]})).sort((a,b)=>a.line_id.localeCompare(b.line_id)))
 await plan.getByRole('button',{name:'Adjust plan',exact:true}).click();await page.getByLabel('Expected income this period (AUD)',{exact:true}).fill('7200');await page.getByRole('radio',{name:'This period and future periods',exact:true}).check();await page.getByRole('button',{name:'Review my plan',exact:true}).click()
 let dropped=false
 await page.route('**/functions/v1/manage-budget',async route=>{if(route.request().postDataJSON()?.action==='revise'&&!dropped){dropped=true;await route.fetch();await route.abort('failed')}else await route.continue()})
 await page.getByRole('button',{name:'Save plan changes',exact:true}).click();await expect(page.getByRole('button',{name:'Check saved result',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Check saved result',exact:true}).click();await expect(plan).toBeVisible()
 saved=snapshotSQL(u)
 check('recovered period-and-future revision updates both plans once',[saved.revision.income_cents,saved.future_template.income_cents,writes.filter(w=>w.action==='revise').length],[720000,720000,2])
 await page.unroute('**/functions/v1/manage-budget')
 command(u,{action:'revise',scope:'period',income_cents:0,opening_drawdown_cents:0,accept_gap:true,lines:ids.map((line_id,i)=>({line_id,amount_cents:amounts[i]}))})
 await header.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(amount('plan-unallocated')).toHaveText('-$5,800.00');await expect(plan).toContainText('Funding gap')
 check('accepted funding gap retains its canonical negative sign in My plan',true)
 const draft=await newUser();command(draft,{action:'save_draft',expected_draft:'0',payload})
 const draftPage=await signedPage(draft,390,false);await expect(draftPage.getByRole('button',{name:'Continue saved draft',exact:true})).toBeVisible();await expect(draftPage.getByRole('region',{name:'Saved allocation plan',exact:true})).toHaveCount(0)
 check('saved setup draft never masquerades as an active allocation plan',snapshotSQL(draft).plan,null)
}
