import {randomUUID} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Fixture writes are scoped to the provisioner's positively identified disposable target. */
export async function budgetCommitmentChecks({repo,newUser,sql,quote,check,edge,signedPage,snapshotSQL,settled}){
 const out=resolve(repo,process.argv.includes('--overview-pass3')?'docs/budget-ui/overview-pass3/commitments':'docs/budget-ui/bui-05b/captures');mkdirSync(out,{recursive:true})
 const date=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;"),u=await newUser()
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Commitment fixture','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const everyday=randomUUID(),plain=randomUUID(),bill=randomUUID(),reserve=randomUUID(),transfer=randomUUID(),paused=randomUUID()
 const command=input=>{const s=snapshotSQL(u);return JSON.parse(sql(`SELECT public.budget_command(${quote(u.tenant)},${quote(u.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_source:s.source_revision,expected_method:'budget-foundation-v1',plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}))}::jsonb,true);`))}
 command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:date,account_ids:[account],destination_account_ids:[],income_cents:600000,opening_drawdown_cents:0,lines:[{id:everyday,kind:'everyday',name:'Everyday',allocation_cents:180000,opening_cents:0},{id:plain,kind:'fixed',name:'Unconfigured bill',allocation_cents:10000,opening_cents:0}]}})
 command({action:'activate',expected_draft:'1',accept_gap:false})
 const config=(type,name,amount)=>({type,name,target_cents:type==='reserve'?60000:null,estimated:true,due_date:null,cadence:'monthly',anchor:date,amount_cents:amount,state:'saving',recurring_id:null,planning_goal_id:null})
 for(const [id,c,opening]of[[bill,config('bill','Internet',10000),0],[reserve,config('reserve','Car registration',20000),10000],[transfer,config('contribution','Long-term investment transfer',10000),0],[paused,{...config('bill','Paused subscription',1000),state:'paused'},0]])command({action:'save_item',line_id:id,item:c,opening_cents:opening,opening_date:date,accept_gap:false})
 const tx=sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(account)},${quote(date)},'Commitment fixture','Internet','internet','Shopping',-4000,'expense','user',false) RETURNING id;`).split('\n')[0]
 const end=snapshotSQL(u).period.end_date
 sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(u.tenant)},${quote(account)},${quote(account)},${quote(date)},${quote(end)},'user_confirmed','{}',0,${quote(u.id)});`)
 const ws=(await edge(u,'query-budget',{action:'workspace'})).body,rawBill=ws.details.items.find(i=>i.line_id===bill)
 command({action:'claim_source',line_id:bill,purpose:'expense',source_key:`t:${tx}`,amount_cents:4000,occurrence_date:date,occurrence_revision_id:rawBill.config.schedule_id,related_claim_id:null,complete:false})
 const page=await signedPage(u,1440,true),region=page.getByRole('region',{name:'Your commitments',exact:true})
 const row=id=>region.locator(`[data-budget-commitment="${id}"]`)
 let writes=[];page.on('request',req=>{if(req.url().includes('/functions/v1/manage-budget'))writes.push(req.postDataJSON())})
 await expect(region.locator('[data-budget-commitment]')).toHaveCount(5)
 await expect(row(paused).locator('summary')).toContainText('Paused')
 await expect(row(bill).locator('summary')).toContainText('$100.00')
 await row(bill).locator('summary').focus();await page.keyboard.press('Enter')
 await expect(row(bill)).toContainText(`${date} · $40.00 matched of $100.00 · $60.00 still expected`)
 await row(reserve).locator('summary').click();await expect(row(reserve)).toContainText('$300.00')
 await row(transfer).locator('summary').click();await expect(row(transfer)).toContainText('Transfers matched')
 await row(plain).locator('summary').click();await expect(row(plain).getByRole('button',{name:'Set up Unconfigured bill',exact:true})).toBeVisible()
 check('all saved commitments, partial bill occurrence, opening reserve and setup entry remain inspectable',true)
 check('opening commitment disclosures issues no command',writes.length,0)
 await row(reserve).getByRole('button',{name:'Adjust Car registration',exact:true}).click()
 const task=page.getByRole('dialog');await expect(task).toBeVisible();await task.getByRole('button',{name:'Close',exact:true}).click()
 await row(bill).getByRole('button',{name:'Match activity',exact:true}).click();await expect(task).toContainText('Match recorded activity');await task.getByRole('button',{name:'Close',exact:true}).click()
 check('existing adjust and match forms remain reachable through commitment details',true)
 for(const width of [320,390,768,1024,1440])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1100});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);await settled(page)
  const overflow=await region.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,offenders:[...el.querySelectorAll('*')].filter(c=>c.getBoundingClientRect().right>el.getBoundingClientRect().right+1||c.scrollWidth>c.clientWidth+1).slice(0,12).map(c=>({tag:c.tagName,cls:c.className,text:c.textContent.slice(0,90),width:c.getBoundingClientRect().width,client:c.clientWidth,scroll:c.scrollWidth}))}))
  if(overflow.scroll>overflow.width+1){console.log('COMMITMENT_OVERFLOW',JSON.stringify(overflow));await row(bill).scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,'overflow-diagnostic.png')})}
  check(`${width} ${dark?'dark':'light'} commitment rows fit`,await region.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  const scan=await new AxeBuilder({page}).include('.budget-workspace').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  check(`${width} ${dark?'dark':'light'} commitment accessibility`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
  await row(bill).scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`${width}-${dark?'dark':'light'}-details.png`)})
 }
 // Source correction must remain visible without opening a line, and not retain false matched totals.
 sql(`UPDATE public.transactions SET amount=-3000 WHERE id=${quote(tx)};`)
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(row(bill).locator('summary')).toContainText('match(es) need review')
 await expect(row(bill)).toContainText('$0.00 matched of $100.00')
 check('changed payment claim is visible in summary and no longer counts as matched',true)
 sql(`UPDATE public.account_activity_coverage SET revoked_at=now() WHERE tenant_id=${quote(u.tenant)};`)
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(region).toContainText('Known activity only')
 check('partial coverage stays visible outside disclosures',true)
 sql(`UPDATE public.accounts SET currency='USD' WHERE id=${quote(account)};`)
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(row(bill)).toContainText('Unavailable matched of $100.00 · Unavailable still expected')
 check('invalid account scope preserves bill plan and suppresses observed matches',true)
 await page.screenshot({path:resolve(out,'1440-dark-unavailable.png')})
 await page.close()
}
