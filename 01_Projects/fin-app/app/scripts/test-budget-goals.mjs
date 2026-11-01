import {randomUUID} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {budgetTaskPanelChecks} from './test-budget-task-panel.mjs'

export async function budgetGoalChecks(args){
 const {repo,newUser,sql,quote,check,edge,signedPage,snapshotSQL,settled}=args
 const out=resolve(repo,process.argv.includes('--overview-pass3')?'docs/budget-ui/overview-pass3/goals':'docs/budget-ui/bui-06a/captures');mkdirSync(out,{recursive:true})
 const date=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;"),u=await newUser(),everyday=randomUUID(),featured=randomUUID(),paused=randomUUID(),draft=randomUUID(),bought=randomUUID()
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Goal fixture','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const command=input=>{const s=snapshotSQL(u);return JSON.parse(sql(`SELECT public.budget_command(${quote(u.tenant)},${quote(u.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_source:s.source_revision,expected_method:'budget-foundation-v1',plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...input}))}::jsonb,true);`))}
 command({action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:date,account_ids:[account],destination_account_ids:[],income_cents:600000,opening_drawdown_cents:0,lines:[{id:everyday,kind:'everyday',name:'Everyday',allocation_cents:180000,opening_cents:0}]}})
 command({action:'activate',expected_draft:'1',accept_gap:false})
 const config=(name,target,amount,state='saving',feature=false)=>({type:'goal',name,target_cents:target,amount_cents:amount,state,featured:feature,estimated:true,due_date:null,cadence:'monthly',anchor:date,recurring_id:null,planning_goal_id:null})
 for(const [id,c,opening]of[[featured,config('Flight ticket',90000,10000,'saving',true),30000],[paused,config('Mountain retreat',50000,0,'paused'),5000],[draft,config('Something for later',null,0,'draft'),0],[bought,config('New camera',20000,0),20000]])command({action:'save_item',line_id:id,item:c,opening_cents:opening,opening_date:date,accept_gap:false})
 const tx=sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(account)},${quote(date)},'Goal fixture','Camera','camera','Shopping',-20000,'expense','user',false) RETURNING id;`).split('\n')[0]
 sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(u.tenant)},${quote(account)},${quote(account)},${quote(date)},${quote(snapshotSQL(u).period.end_date)},'user_confirmed','{}',0,${quote(u.id)});`)
 command({action:'claim_source',line_id:bought,purpose:'purchase',source_key:`t:${tx}`,amount_cents:20000,occurrence_date:null,occurrence_revision_id:null,related_claim_id:null,complete:true})
 command({action:'confirm_funding',line_id:featured,purpose:'funding',manual_id:randomUUID(),capacity_cents:10000,amount_cents:10000,confirmed_date:date,note:'Fictional earmark'})
 const page=await signedPage(u,1440,true),region=page.getByRole('region',{name:'Your savings goals',exact:true})
 const card=id=>region.locator(`article[data-budget-line="${id}"]`),amount=name=>page.locator(`[data-budget-value="${name}"] [data-budget-amount]`)
 await region.locator(`[data-budget-goal-detail="${featured}"] > summary`).click();await expect(card(featured)).toBeVisible();await expect(amount(`goal-reserve:${featured}`)).toHaveText('$400.00');await expect(amount(`goal-user:${featured}`)).toHaveText('$100.00');await expect(amount(`goal-bank:${featured}`)).toHaveText('$0.00')
 await expect(card(featured).getByRole('progressbar')).toHaveAttribute('value','40000')
 check('featured goal preserves distinct reserve and confirmation without duplicate progress credit',true)
 let writes=[];page.on('request',r=>{if(r.url().includes('/functions/v1/manage-budget'))writes.push(r.postDataJSON())})
 for(const id of [paused,draft,bought]){await region.locator(`[data-budget-goal-detail="${id}"] > summary`).focus();await page.keyboard.press('Enter');await expect(card(id)).toBeVisible()}
 await expect(card(paused)).toContainText('No finish date while contributions are paused')
 await expect(card(draft)).toContainText('No price yet');await expect(card(draft).getByRole('progressbar')).toHaveCount(0)
 await expect(card(bought)).toContainText('Purchases after matched refunds: $200.00');await expect(card(bought)).toContainText('No automatic refill');await expect(card(bought).getByRole('progressbar')).toHaveCount(0)
 check('paused, unknown target and purchased goals retain truthful state and actions',true)
 check('keyboard inspection of compact goals issues no command',writes.length,0)
 await card(paused).getByRole('button',{name:'Adjust Mountain retreat',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
 await card(bought).getByRole('button',{name:'Match activity',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Match recorded activity');await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
 check('secondary goal edit and purchased-goal activity tasks remain reachable',true)
 for(const width of [320,390,768,1024,1440])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1100});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await settled(page)
  check(`${width} ${dark?'dark':'light'} goal cards fit`,await region.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  const scan=await new AxeBuilder({page}).include('.budget-workspace').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
  check(`${width} ${dark?'dark':'light'} goal accessibility`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
  await card(featured).scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`${width}-${dark?'dark':'light'}-featured.png`)})
 }
 await page.route('**/functions/v1/query-budget',route=>route.request().postDataJSON()?.action==='workspace'?route.fulfill({status:503,contentType:'application/json',body:'{"code":"temporarily_unavailable","message":"Fictional failed refresh"}'}):route.continue())
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(region).toContainText('Previously loaded figures');await expect(card(featured)).not.toContainText('At this pace')
 check('stale goal facts stay qualified and do not invent an updated finish date',true)
 await page.unroute('**/functions/v1/query-budget')
 sql(`UPDATE public.accounts SET currency='USD' WHERE id=${quote(account)};`)
 await page.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(amount(`goal-reserve:${featured}`)).toHaveText('Unavailable');await expect(card(featured).getByRole('progressbar')).toHaveCount(0)
 check('unknown reserve stays unavailable and suppresses progress',true)
 await page.screenshot({path:resolve(out,'1440-dark-unavailable.png')});await page.close()
 await budgetTaskPanelChecks({...args,captureRoot:process.argv.includes('--overview-pass3')?'docs/budget-ui/overview-pass3/goal-tasks':'docs/budget-ui/bui-06a/task-captures'})
}
