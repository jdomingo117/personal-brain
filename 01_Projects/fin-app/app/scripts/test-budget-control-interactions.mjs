import {randomUUID} from 'node:crypto'
import {expect} from '@playwright/test'

export async function budgetControlInteractions({newUser,sql,quote,check,signedPage,snapshotSQL,settled}){
 const u=await newUser(),e=randomUUID(),r=randomUUID()
 const start=sql(`SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;`)
 const a=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Lifecycle browser fictional','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 for(const i of [{action:'save_draft',expected_draft:'0',payload:{currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[],destination_account_ids:[],income_cents:20000,opening_drawdown_cents:0,lines:[{id:e,kind:'everyday',name:'Everyday',allocation_cents:10000,opening_cents:0},{id:r,kind:'reserve',name:'Snowboard',allocation_cents:3000,opening_cents:5000}]}},{action:'activate',expected_draft:'1',accept_gap:false}]){
  const s=snapshotSQL(u);sql(`SELECT public.budget_command(${quote(u.tenant)},${quote(u.id)},${quote(randomUUID())},${quote(JSON.stringify({expected_method:'budget-foundation-v1',expected_source:s.source_revision,plan_id:s.plan?.id,period_id:s.period?.id,expected_plan:s.plan?.version,...i}))}::jsonb,true);`)
 }
 const phone=await signedPage(u,390,true),region=phone.getByRole('region',{name:'Budget and line lifecycle',exact:true})
 const open=()=>region.getByRole('button',{name:'Manage budget and allowances',exact:true}).click()
 const form=region.getByRole('form',{name:'Budget lifecycle preview',exact:true})
 const review=()=>form.getByRole('button',{name:'Review lifecycle effects',exact:true}).click()
 const acknowledge=async()=>{await form.getByRole('checkbox',{name:/I reviewed the saved and future budget effects/}).check();await form.getByRole('checkbox',{name:/I understand that incomplete or unavailable history/}).check()}
 await open();await expect(form.getByRole('heading',{name:'Make a change, then check its effects'})).toBeFocused()
 await review();await expect(form.getByRole('button',{name:'Pause budget',exact:true})).toBeDisabled();await acknowledge();await form.getByRole('button',{name:'Pause budget',exact:true}).click()
 await expect(region).toContainText('Budget paused');await phone.reload();await expect(region).toContainText('Budget paused')
 await expect(phone.getByRole('button',{name:'Change budget frequency',exact:true})).toBeDisabled()
 check('phone pause survives reload and blocks frequency without hiding the saved plan',true)
 await open();await review();await acknowledge();await expect(form.getByRole('button',{name:'Resume budget',exact:true})).toBeDisabled()
 await form.getByRole('checkbox',{name:/I reviewed the uncovered dates and carried balances/}).check();await form.getByRole('button',{name:'Resume budget',exact:true}).click();await expect(region).toContainText('Budget active')
 check('resume requires a separate carry acknowledgement and keeps one saved period',sql(`SELECT count(*) FROM public.budget_periods WHERE tenant_id=${quote(u.tenant)};`),'1')
 await open();await form.getByRole('combobox',{name:'Lifecycle action',exact:true}).selectOption('archive_line');await form.getByRole('combobox',{name:'Allowance to archive',exact:true}).selectOption(r)
 await form.getByRole('radio',{name:/Move it to everyday Other/}).check();await review();await expect(form).toContainText('$80.00');await acknowledge()
 sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(a)},${quote(start)},'Lifecycle browser fixture','Lifecycle fixture','lifecycle fixture','Shopping',-100,'expense','user',false);`)
 await phone.getByRole('button',{name:'Refresh saved data',exact:true}).click()
 await expect(form.getByRole('combobox',{name:'Allowance to archive',exact:true})).toHaveValue(r)
 await expect(form.getByRole('button',{name:'Archive allowance',exact:true})).toHaveCount(0)
 await review();await acknowledge()
 await region.scrollIntoViewIfNeeded();await settled(phone);await phone.screenshot({path:'/tmp/halcyon-budget-controls-phone.png',fullPage:true})
 check('lifecycle preview retains choices but drops confirmation on refreshed facts and fits phone',await phone.locator('.budget-workspace').evaluate(el=>el.scrollWidth>el.clientWidth),false)
 await form.getByRole('button',{name:'Archive allowance',exact:true}).click();await expect(region.getByRole('button',{name:'Manage budget and allowances',exact:true})).toBeFocused()
 await expect(phone.getByRole('button',{name:'Set up Snowboard',exact:true})).toBeDisabled()
 await phone.reload();await expect(phone.getByRole('button',{name:'Set up Snowboard',exact:true})).toBeDisabled()
 check('real Edge archive persists zero future refill and preserves current and unrelated future allowances',[snapshotSQL(u).lines.find(l=>l.id===r).allocation_cents,snapshotSQL(u).future_template.allocations.find(l=>l.line_id===r).amount_cents,snapshotSQL(u).future_template.allocations.find(l=>l.line_id===e).amount_cents],[3000,0,10000])
 phone.once('dialog',d=>d.accept());await region.getByRole('button',{name:'Undo last lifecycle change',exact:true}).click();await expect(phone.getByRole('button',{name:'Set up Snowboard',exact:true})).toBeEnabled()
 check('phone compatible archive undo restores line controls and future allocation',snapshotSQL(u).future_template.allocations.find(l=>l.line_id===r).amount_cents,3000)
 await phone.setViewportSize({width:1440,height:1050});await phone.evaluate(()=>document.documentElement.classList.remove('dark'));await open();await form.getByRole('combobox',{name:'Lifecycle action',exact:true}).selectOption('archive_line');await form.getByRole('combobox',{name:'Allowance to archive',exact:true}).selectOption(r);await review();await region.scrollIntoViewIfNeeded();await settled(phone);await phone.screenshot({path:'/tmp/halcyon-budget-controls-desktop.png',fullPage:true})
 check('desktop lifecycle preview uses native choices and has no page overflow',await phone.locator('.budget-workspace').evaluate(el=>el.scrollWidth>el.clientWidth),false)
 phone.once('dialog',d=>d.dismiss());await form.getByRole('button',{name:'Leave lifecycle preview',exact:true}).click();await expect(form).toBeVisible()
 phone.once('dialog',d=>d.accept());await form.getByRole('button',{name:'Leave lifecycle preview',exact:true}).click();await expect(region.getByRole('button',{name:'Manage budget and allowances',exact:true})).toBeFocused()
 check('unsaved lifecycle exit supports cancelling and restores opener focus',true)
}
