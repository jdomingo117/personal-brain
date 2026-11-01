import {randomUUID} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Real reads/UI on the positively identified disposable project only. SQL is
 * fixture creation and independent proof, never production source aggregation. */
export async function budgetPresentationChecks({repo,newUser,sql,quote,check,edge,signedPage,snapshotSQL,settled,everyday=false}){
 const out=resolve(repo,everyday?'docs/budget-ui/bui-05a/captures':'docs/budget-ui/bui-03/captures');mkdirSync(out,{recursive:true})
 const date=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;")
 async function fixture({start=date,activity=true}={}){
  const user=await newUser(),everyday=randomUUID(),reserve=randomUUID()
  const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(user.id)},${quote(user.tenant)},'Presentation fixture','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  const command=input=>{const s=snapshotSQL(user);return JSON.parse(sql(`SELECT public.budget_command(${quote(user.tenant)},${quote(user.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_source:s.source_revision,expected_method:'budget-foundation-v1',plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}))}::jsonb,true);`))}
  command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:activity?[account]:[],destination_account_ids:[],income_cents:600000,opening_drawdown_cents:0,
   lines:[{id:everyday,kind:'everyday',name:'Everyday',allocation_cents:180000,opening_cents:0},{id:randomUUID(),kind:'fixed',name:'Bills',allocation_cents:250000,opening_cents:0},{id:reserve,kind:'reserve',name:'Upcoming costs',allocation_cents:40000,opening_cents:10000},{id:randomUUID(),kind:'contribution',name:'Long-term savings',allocation_cents:100000,opening_cents:0},{id:randomUUID(),kind:'reserve',name:'Goal allowance',allocation_cents:10000,opening_cents:0}]}})
  command({action:'activate',expected_draft:'1',accept_gap:false})
  return {user,everyday,reserve,account,command}
 }
 const f=await fixture(),limit=randomUUID(),s=snapshotSQL(f.user)
 sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES
 (${quote(f.user.id)},${quote(f.user.tenant)},${quote(f.account)},${quote(date)},'Presentation fixture','Shopping fixture','shopping fixture','Shopping',-76000,'expense','user',false),
 (${quote(f.user.id)},${quote(f.user.tenant)},${quote(f.account)},${quote(date)},'Presentation fixture','Other fixture','other fixture','Uncategorized',-75000,'expense','user',false),
 (${quote(f.user.id)},${quote(f.user.tenant)},${quote(f.account)},${quote(date)},'Presentation fixture','Income fixture','income fixture','Income',300000,'income','user',false);`)
 sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(f.user.tenant)},${quote(f.account)},${quote(f.account)},${quote(s.period.start_date)},${quote(s.period.end_date)},'user_confirmed','{}',0,${quote(f.user.id)});`)
 f.command({action:'set_limits',limits:[{id:limit,category_id:'shopping',subcategory_id:null,custom_subcategory_id:null,amount_cents:70000}]})
 const raw=(await edge(f.user,'query-budget',{action:'workspace'})).body
 check('real workspace exposes canonical Other and parent facts',[raw.details.other_flexible_remaining_cents,raw.details.items.find(i=>i.kind==='everyday').remaining_cents,raw.unallocated_cents],[35000,29000,20000])
 const page=await signedPage(f.user,1440,true)
 const value=(name,p=page)=>p.locator(`[data-budget-value="${name}"]`)
 const amount=(name,p=page)=>value(name,p).locator('[data-budget-amount]')
 await expect(amount('received')).toHaveText('$3,000.00')
 await expect(amount('everyday-spent')).toHaveText('$1,510.00')
 await expect(amount('everyday-remaining')).toHaveText('$290.00')
 await expect(amount('other-remaining')).toHaveText('$350.00')
 await expect(amount(`category-remaining:${limit}`)).toHaveText('-$60.00')
 check('production amounts use canonical SQL facts and retain child overage',true)
 for(const width of (everyday?[320,390,768,1024,1440]:[390,1440]))for(const dark of [false,true]){
  await page.setViewportSize({width,height:1050});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark)
  await settled(page)
  const scan=await new AxeBuilder({page}).include('.budget-workspace').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  check(`${width} ${dark?'dark':'light'} presentation accessibility`,scan.violations.map(v=>v.id),[])
  await page.getByRole('region',{name:'Your everyday spending',exact:true}).scrollIntoViewIfNeeded()
  if(everyday)check(`${width} ${dark?'dark':'light'} everyday rows fit`,await page.locator('.budget-everyday').evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  await page.screenshot({path:resolve(out,`${width}-${dark?'dark':'light'}-everyday.png`)})
 }
 if(everyday){
  await page.setViewportSize({width:1440,height:1050});await page.evaluate(()=>document.documentElement.classList.remove('dark'))
  const region=page.getByRole('region',{name:'Your everyday spending',exact:true}),row=region.locator(`[data-budget-category="${limit}"]`)
  let writes=[];page.on('request',req=>{if(req.url().includes('/functions/v1/manage-budget'))writes.push(req.postDataJSON())})
  const before=snapshotSQL(f.user).plan.version
  await row.locator('summary').focus();await page.keyboard.press('Enter')
  await expect(row.locator('details')).toHaveAttribute('open','')
  await expect(row).toContainText('part of the shared everyday allowance')
  check('keyboard row inspection preserves stable ID and issues no write',[writes.length,snapshotSQL(f.user).plan.version],[0,before])
  await row.getByRole('button',{name:'Move an allowance',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).toContainText('Move an allowance')
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
  await row.locator('summary').click()
  await region.getByRole('button',{name:'Category limits',exact:true}).click()
  const dialog=page.getByRole('dialog')
  await expect(dialog).toContainText('Choose category limits')
  await dialog.getByRole('button',{name:'Remove Shopping',exact:true}).click()
  await dialog.getByRole('button',{name:'Review limits',exact:true}).click()
  await dialog.getByRole('button',{name:'Save category limits',exact:true}).click()
  await expect(dialog).toBeHidden();await expect(region).toContainText('One shared allowance')
  await expect(region.locator('[data-budget-category]')).toHaveCount(1)
  await expect(amount('everyday-remaining')).toHaveText('$290.00')
  await expect(amount('everyday-spent')).toHaveText('$1,510.00')
  const after=(await edge(f.user,'query-budget',{action:'workspace'})).body
  check('removing last category through UI keeps spending and pool authority',[after.details.limits.length,after.details.items.find(i=>i.kind==='everyday').remaining_cents,after.details.other_flexible_remaining_cents],[0,29000,29000])
  await region.getByRole('button',{name:'Review activity & credits',exact:true}).click()
  await expect(dialog).toContainText('Match recorded activity');await dialog.getByRole('button',{name:'Close',exact:true}).click()
  check('everyday activity and allowance tasks remain reachable',true)
  await page.screenshot({path:resolve(out,'1440-light-limits-off.png')})
  // Restore a category with the same persisted ID to exercise refreshed row keys.
  f.command({action:'set_limits',limits:[{id:limit,category_id:'shopping',subcategory_id:null,custom_subcategory_id:null,amount_cents:70000}]})
  await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
  await expect(amount(`category-remaining:${limit}`)).toHaveText('-$60.00')
 }
 // A balance including released reserve rights must differ from planned-used.
 f.command({action:'release_reserve',from_line_id:f.reserve,to_line_id:f.everyday,amount_cents:5000})
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(amount('everyday-remaining')).toHaveText('$340.00')
 await expect(amount('everyday-planned')).toHaveText('$1,800.00')
 await expect(amount('everyday-spent')).toHaveText('$1,510.00')
 await expect(amount('everyday-rights')).toHaveText('$50.00')
 await expect(amount('other-remaining')).toHaveText('$400.00')
 check('released rights use canonical parent and Other remainder, without naive recomputation',true)
 await page.route('**/functions/v1/query-budget',route=>route.request().postDataJSON()?.action==='workspace'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'temporarily_unavailable',message:'Fixture refresh unavailable'})}):route.continue())
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(value('everyday-remaining')).toHaveAttribute('data-freshness','stale')
 await expect(amount('everyday-remaining')).toHaveText('$340.00')
 await page.screenshot({path:resolve(out,everyday?'1440-light-stale.png':'1440-dark-stale.png')})
 await page.unroute('**/functions/v1/query-budget')
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(value('everyday-remaining')).toHaveAttribute('data-freshness','current')
 check('failed refresh retains qualified money and a successful retry clears only freshness',true)
 sql(`UPDATE public.account_activity_coverage SET revoked_at=now() WHERE tenant_id=${quote(f.user.tenant)};`)
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(value('received')).toHaveAttribute('data-coverage','partial')
 await expect(amount('received')).toHaveText('$3,000.00')
 await expect(value('everyday-remaining')).toHaveAttribute('data-provisional','true')
 check('revoked coverage preserves known activity while qualifying balances',true)
 sql(`UPDATE public.accounts SET currency='USD' WHERE id=${quote(f.account)};`)
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(amount('received')).toHaveText('Unavailable')
 await expect(amount('everyday-remaining')).toHaveText('Unavailable')
 await expect(amount('everyday-planned')).toHaveText('$1,800.00')
 check('invalid source scope preserves plan input and suppresses actual/balance values',true)
 await page.close()

 const manual=await fixture({activity:false}),phone=await signedPage(manual.user,390,true)
 await expect(amount('received',phone)).toHaveText('Unavailable')
 await expect(amount('everyday-spent',phone)).toHaveText('Unavailable')
 await expect(amount('everyday-planned',phone)).toHaveText('$1,800.00')
 await expect(value('everyday-remaining',phone)).toHaveAttribute('data-provisional','true')
 check('manual plan has known allowances without verified zero activity',true)
 for(const dark of [false,true]){
  await phone.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark)
  await value('everyday-planned',phone).scrollIntoViewIfNeeded();await settled(phone)
  await phone.screenshot({path:resolve(out,`390-${dark?'dark':'light'}-manual.png`)})
 }
 await phone.setViewportSize({width:320,height:1050})
 check('320px unavailable values do not overflow',await phone.locator('.budget-workspace').evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
 await phone.close()
 const futureStart=sql("SELECT (date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')+interval '1 month')::date;")
 const future=await fixture({start:futureStart}),futurePage=await signedPage(future.user,1440,true)
 await expect(amount('received',futurePage)).toHaveText('Unavailable')
 await expect(amount('everyday-spent',futurePage)).toHaveText('Unavailable')
 await expect(value('everyday-remaining',futurePage)).toHaveAttribute('data-provisional','true')
 check('future plan never presents a verified zero of received income or spending',true)
 await futurePage.close()
}
