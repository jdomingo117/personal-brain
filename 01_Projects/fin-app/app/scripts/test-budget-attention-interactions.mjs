import {randomUUID} from 'node:crypto'
import {expect} from '@playwright/test'
import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import AxeBuilder from '@axe-core/playwright'

export async function budgetAttentionInteractions({repo,newUser,sql,quote,check,edge,signedPage,snapshotSQL,settled,matrix=false}){
 const u=await newUser(),line=randomUUID(),start=sql(`SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;`)
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Attention browser fictional','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 for(const i of [{action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[account],destination_account_ids:[],income_cents:10000,opening_drawdown_cents:0,lines:[{id:line,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0}]}},{action:'activate',expected_draft:'1',accept_gap:false}]){
  const s=snapshotSQL(u);sql(`SELECT public.budget_command(${quote(u.tenant)},${quote(u.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_method:'budget-foundation-v1',expected_source:s.source_revision,plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...i}))}::jsonb,true);`)
 }
 const tx=amount=>sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(account)},${quote(start)},'Attention browser fixture','Attention fixture','attention fixture','Shopping',${amount},'expense','user',false);`)
 tx(-11000)
 const phone=await signedPage(u,390,true),region=phone.getByRole('region',{name:'Budget checks',exact:true}),row=region.getByRole('listitem',{name:'Budget check: Everyday',exact:true}),form=region.getByRole('form',{name:'Review budget check',exact:true})
 async function reveal(target,options=false){if(!await target.isVisible()){const more=region.getByRole('button',{name:/See all .* budget checks/});if(await more.isVisible())await more.click()}if(options&&await target.locator('.budget-review-options').getAttribute('open')===null)await target.locator('.budget-review-options > summary').click()}
 const version=snapshotSQL(u).plan.version
 await row.getByRole('button',{name:'Inspect allowance',exact:true}).click();await expect(phone.locator(`[data-budget-line="${line}"]`)).toBeFocused()
 check('inspect jumps to the actual everyday balance without losing period context',true)
 await expect(region).toContainText('2 to check');await reveal(row,true);await row.getByRole('button',{name:'Review this check',exact:true}).click()
 await expect(form.getByRole('button',{name:'Save review preference',exact:true})).toBeDisabled()
 await form.getByRole('checkbox',{name:/I understand the budget amounts/}).check();await form.getByRole('button',{name:'Save review preference',exact:true}).click()
 await expect(region).toContainText('1 to check');await expect(region).toContainText('These gaps still remain');await expect(region).toContainText('-$10.00')
 check('phone review quiets the reminder while keeping the signed gap and financial version',snapshotSQL(u).plan.version,version)
 await phone.reload();await expect(region).toContainText('These gaps still remain')
 await region.getByRole('button',{name:/See all .* budget checks/}).click()
 await reveal(row,true);phone.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Show this again now',exact:true}).click();await expect(region).toContainText('2 to check')
 await reveal(row,true);await row.getByRole('button',{name:'Review this check',exact:true}).click();await form.getByRole('radio',{name:'Remind me on a date I choose.',exact:true}).check()
 const date=form.getByLabel('Show this again on',{exact:true})
 await date.fill(start);await form.getByRole('checkbox',{name:/I understand the budget amounts/}).check();await expect(form.getByRole('button',{name:'Save review preference',exact:true})).toBeDisabled()
 await date.fill(snapshotSQL(u).period.end_date);await form.getByRole('checkbox',{name:/I understand the budget amounts/}).check()
 tx(-1);await phone.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(form).toContainText('saved facts changed');await expect(date).toHaveValue(snapshotSQL(u).period.end_date)
 await form.getByRole('button',{name:'Review latest check',exact:true}).click();await expect(form.getByRole('button',{name:'Save review preference',exact:true})).toBeDisabled();await expect(form.getByRole('checkbox',{name:/I understand the budget amounts/})).toBeEnabled();await form.getByRole('checkbox',{name:/I understand the budget amounts/}).check()
 phone.once('dialog',d=>d.dismiss());await phone.getByRole('button',{name:'Return to current budget',exact:true}).click();await expect(form).toBeVisible()
 await form.getByRole('button',{name:'Save review preference',exact:true}).click();await expect(region).toContainText('Snoozed until')
 check('phone snooze validates dates, retains choices on stale refresh and protects unsaved period navigation',true)
 await phone.reload();await expect(region).toContainText('show again')
 phone.once('dialog',d=>d.accept());await region.getByRole('button',{name:'Undo last review preference',exact:true}).click();await expect(region).toContainText('2 to check')
 tx(-2500);await phone.getByRole('button',{name:'Refresh saved data',exact:true}).click();await expect(region).toContainText('-$35.01')
 await region.scrollIntoViewIfNeeded();await settled(phone);await phone.screenshot({path:'/tmp/halcyon-budget-attention-phone.png',fullPage:true})
 check('attention and persistent gap summary do not overflow the phone workspace',await phone.locator('.budget-workspace').evaluate(el=>el.scrollWidth>el.clientWidth),false)
 await phone.setViewportSize({width:1440,height:1050});await reveal(row,true);await row.getByRole('button',{name:'Review this check',exact:true}).click();await form.scrollIntoViewIfNeeded();await settled(phone);await phone.screenshot({path:'/tmp/halcyon-budget-attention-desktop.png',fullPage:true})
 if(matrix){mkdirSync(resolve(repo,process.argv.includes('--overview-pass3')?'docs/budget-ui/overview-pass3/attention':'docs/budget-ui/bui-06b/captures'),{recursive:true});await phone.screenshot({path:resolve(repo,'docs/budget-ui/bui-06b/captures/1440-review-form.png')});const scan=await new AxeBuilder({page:phone}).include('.budget-workspace').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();check('desktop sidebar review form accessibility',scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])}
 phone.once('dialog',d=>d.dismiss());await form.getByRole('button',{name:'Leave review choice',exact:true}).click();await expect(form).toBeVisible()
 phone.once('dialog',d=>d.accept());await form.getByRole('button',{name:'Leave review choice',exact:true}).click();await expect(row.getByRole('button',{name:'Review this check',exact:true})).toBeFocused()
 check('desktop review supports cancelled exit and restores keyboard focus',true)
 const data=region.getByRole('listitem',{name:'Budget check: Check the history behind this budget',exact:true});await reveal(data,true);await data.getByRole('button',{name:'Review this check',exact:true}).click();await expect(form).toContainText('A meaningful change in the relevant evidence');await expect(form).not.toContainText('A shortfall that grows')
 check('non-monetary review copy does not invent a money gap',true)
 phone.once('dialog',d=>d.accept());await form.getByRole('button',{name:'Leave review choice',exact:true}).click()
 const s=snapshotSQL(u);sql(`SELECT public.budget_command(${quote(u.tenant)},${quote(u.id)},${quote(randomUUID())},${quote(JSON.stringify({action:'set_limits',plan_id:s.plan.id,period_id:s.period.id,expected_plan:s.plan.version,expected_source:s.source_revision,expected_method:'budget-foundation-v1',limits:[{id:randomUUID(),category_id:'shopping',subcategory_id:null,custom_subcategory_id:null,amount_cents:3000}]}))}::jsonb,true);`)
 await phone.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 const shopping=region.getByRole('listitem',{name:'Budget check: Shopping',exact:true});await reveal(shopping);await shopping.getByRole('button',{name:'Inspect allowance',exact:true}).click()
 await expect(phone.locator('[data-budget-category]').filter({has:phone.getByText('Shopping',{exact:true})})).toBeFocused()
 await expect(phone.locator('[data-budget-category]').filter({has:phone.getByText('Shopping',{exact:true})}).locator('details')).toHaveAttribute('open','')
 check('category inspection targets the existing allowance controls instead of a dead link',true)
 if(matrix){
  const out=resolve(repo,process.argv.includes('--overview-pass3')?'docs/budget-ui/overview-pass3/attention':'docs/budget-ui/bui-06b/captures');mkdirSync(out,{recursive:true})
  const state=snapshotSQL(u),bill=randomUUID()
  sql(`SELECT public.budget_command(${quote(u.tenant)},${quote(u.id)},${quote(randomUUID())},${quote(JSON.stringify({action:'save_item',expected_method:'budget-foundation-v1',expected_source:state.source_revision,plan_id:state.plan.id,period_id:state.period.id,expected_plan:state.plan.version,line_id:bill,item:{type:'bill',name:'Internet review fixture',target_cents:null,estimated:false,due_date:null,cadence:'monthly',anchor:start,amount_cents:3000,state:'saving',recurring_id:null,planning_goal_id:null},opening_cents:0,opening_date:start,accept_gap:true}))}::jsonb,true);`)
  await phone.getByRole('button',{name:'Refresh saved data',exact:true}).click()
  if(await region.getByRole('button',{name:'Show priority check',exact:true}).isVisible())await region.getByRole('button',{name:'Show priority check',exact:true}).click()
  const facts=(await edge(u,'query-budget',{action:'workspace'})).body
  const expected=facts.details.attention.items.filter(i=>i.state==='active').slice(0,1).map(i=>i.key)
  check('priority queue preserves the exact canonical issue order',await region.locator('button[data-issue]').evaluateAll(els=>els.map(el=>el.dataset.issue)),expected)
  await region.getByRole('button',{name:/See all .* budget checks/}).click()
  await expect(region.locator('button[data-issue]')).toHaveCount(facts.details.attention.total)
  check('all-checks view reaches every canonical issue without dropping reviewed gaps',true)
  for(const width of [320,390,768,1024,1440])for(const dark of [false,true]){
   await phone.setViewportSize({width,height:1100});await phone.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await settled(phone)
   check(`${width} ${dark?'dark':'light'} assembled overview fits`,await phone.locator('.budget-workspace').evaluate(el=>el.scrollWidth<=el.clientWidth+1))
   const scan=await new AxeBuilder({page:phone}).include('.budget-workspace').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
   check(`${width} ${dark?'dark':'light'} checks and overview accessibility`,scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
   await phone.locator('.scroll-region').evaluate(el=>{el.scrollTop=0});await phone.screenshot({path:resolve(out,`${width}-${dark?'dark':'light'}-overview.png`)})
   await region.scrollIntoViewIfNeeded();await phone.screenshot({path:resolve(out,`${width}-${dark?'dark':'light'}-checks.png`)})
  }
  await phone.getByRole('button',{name:'About these figures',exact:true}).click();await expect(phone.getByRole('region',{name:'Recorded Budget figures',exact:true})).toBeFocused()
  await phone.getByRole('button',{name:'How your budget works',exact:true}).click();await expect(phone.getByRole('region',{name:'How your budget works',exact:true})).toBeFocused()
  check('optional recorded figures and guidance open and receive focus from hero actions',true)
  await expect(phone.getByRole('region',{name:'Spending estimate',exact:true})).toContainText('Not enough history to estimate finish')
  check('insufficient history keeps the spending forecast explicitly unavailable',facts.details.attention.forecast_available,false)
  await phone.route('**/functions/v1/query-budget',route=>route.request().postDataJSON()?.action==='workspace'?route.fulfill({status:503,contentType:'application/json',body:'{"code":"temporarily_unavailable","message":"Fictional read failure"}'}):route.continue())
  await phone.getByRole('button',{name:'Refresh saved data',exact:true}).click()
  await expect(phone.getByRole('alert')).toBeVisible();await expect(phone.getByRole('alert')).toContainText('Previously loaded figures remain')
  check('read failure remains visible outside optional guidance',true)
  await phone.unroute('**/functions/v1/query-budget')
 }

}
