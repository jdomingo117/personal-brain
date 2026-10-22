import {expect} from '@playwright/test'

export async function budgetHistoryInteractions({fixture:f,browser,url,sql,quote,check,newUser}){
 const errors=[]
 for(const width of [390,1440]){
  const viewer=await newUser()
  sql(`INSERT INTO public.tenant_members(tenant_id,user_id,role,joined_at) VALUES(${quote(f.user.tenant)},${quote(viewer.id)},'viewer','2000-01-01');`)
  // Force a rebuild of fictional derived checkpoints, never financial intent.
  sql(`DELETE FROM public.budget_history_facts WHERE actor_id=${quote(viewer.id)} AND plan_id=${quote(f.plan)};`)
  const context=await browser.newContext({viewport:{width,height:1050},reducedMotion:'reduce'})
  await context.addInitScript(({session})=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),{session:viewer.session})
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  let fail=true
  await page.route('**/functions/v1/query-budget',async route=>{
   const body=route.request().postDataJSON()
   if(body.action==='prepare_history'&&fail){fail=false;await route.abort('failed');return}
   await route.continue()
  })
  await page.goto(`${url}/budget`)
  const preparing=page.getByRole('region',{name:'Preparing budget history'})
  await expect(preparing).toBeVisible({timeout:30000})
  await expect(preparing.getByRole('button',{name:'Continue loading history'})).toBeEnabled({timeout:30000})
  await expect(page.getByRole('button',{name:'Build my budget',exact:true})).toHaveCount(0)
  await expect(preparing).toContainText('Your plan and transactions are unchanged')
  check(`${width}px interrupted history shows progress without an invented budget`,true)
  await preparing.scrollIntoViewIfNeeded()
  check(`${width}px interrupted preparation has no horizontal overflow`,await page.locator('.budget-workspace').evaluate(el=>el.scrollWidth>el.clientWidth),false)
  await page.screenshot({path:`/tmp/halcyon-budget-history-preparing-${width}.png`,fullPage:true})
  // Reload discards any client cursor. The server resumes its exact generation.
  await page.reload()
  for(let attempt=0;attempt<6;attempt++){
   const done=page.getByRole('button',{name:'My plan',exact:true})
   await expect.poll(async()=>await done.count()>0||await preparing.getByRole('button',{name:'Continue loading history'}).isVisible(),{timeout:30000}).toBe(true)
   if(await done.count())break
   await preparing.getByRole('button',{name:'Continue loading history'}).click()
  }
  await expect(page.getByRole('button',{name:'My plan',exact:true})).toBeVisible({timeout:30000})
  await expect(preparing).toHaveCount(0)
  check(`${width}px history reload and continuation finish the complete workspace`,true)
  check(`${width}px history preparation does not overflow`,await page.locator('.budget-workspace').evaluate(el=>el.scrollWidth>el.clientWidth),false)
  await page.screenshot({path:`/tmp/halcyon-budget-history-${width}.png`,fullPage:true})
  await context.close()
 }
 // Owner impact reviews use the same bounded two-projection preparation at
 // both sizes. Abort after the first server commit; reload has no client cursor.
 const owner=f.user,version=()=>sql(`SELECT version FROM public.budget_plans WHERE id=${quote(f.plan)};`)
 const source=()=>sql(`SELECT revision FROM public.budget_source_versions WHERE tenant_id=${quote(owner.tenant)};`)
 const args=()=>`${quote(owner.tenant)},${quote(owner.id)},${quote(f.plan)},${quote(f.period)},${source()},${version()}`
 while(!JSON.parse(sql(`SELECT public.budget_history_status(${args()});`)).ready)sql(`SELECT public.budget_prepare_history(${args()});`)
 for(const width of [390,1440]){
  sql(`DELETE FROM public.budget_impact_preparations WHERE actor_id=${quote(owner.id)} AND plan_id=${quote(f.plan)};`)
  const originalVersion=version(),context=await browser.newContext({viewport:{width,height:1050},reducedMotion:'reduce'})
  await context.addInitScript(({session})=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),{session:owner.session})
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  let calls=0,release
  const interrupted=new Promise(resolve=>{release=resolve})
  await page.route('**/functions/v1/query-budget',async route=>{
   if(route.request().postDataJSON().action==='preview_account_scope'){
    calls++
    if(calls===2){await interrupted;await route.abort('failed');return}
   }
   await route.continue()
  })
  const open=async()=>{
   await page.getByRole('button',{name:'My plan',exact:true}).click()
   await page.getByRole('button',{name:'Change budget accounts',exact:true}).click()
  }
  await page.goto(`${url}/budget`);await expect(page.getByRole('button',{name:'My plan',exact:true})).toBeVisible({timeout:30000});await open()
  const form=page.getByRole('form',{name:'Change budget accounts preview',exact:true})
  await form.getByRole('button',{name:'Review account effects',exact:true}).click()
  const preparing=page.getByRole('region',{name:'Preparing budget effects',exact:true})
  await expect(preparing).toContainText('1 of 2',{timeout:30000})
  await preparing.scrollIntoViewIfNeeded()
  check(`${width}px impact progress does not overflow`,await page.locator('.budget-workspace').evaluate(el=>el.scrollWidth>el.clientWidth),false)
  await page.screenshot({path:`/tmp/halcyon-budget-impact-preparing-${width}.png`})
  release()
  await expect(form.getByRole('alert')).toContainText('Review',{timeout:30000})
  check(`${width}px interrupted impact retains exactly one complete server check`,sql(`SELECT (before_facts IS NOT NULL)::int||':'||(after_facts IS NOT NULL)::int FROM public.budget_impact_preparations WHERE plan_id=${quote(f.plan)} AND actor_id=${quote(owner.id)};`),'1:0')
  await page.reload();await expect(page.getByRole('button',{name:'My plan',exact:true})).toBeVisible({timeout:30000});await open()
  await form.getByRole('button',{name:'Review account effects',exact:true}).click()
  await expect(form).toContainText('Preview ready',{timeout:30000})
  check(`${width}px reselected identical choices resume in two requests after reload`,calls,4)
  await expect(form.getByRole('button',{name:'Save dated account choices',exact:true})).toBeDisabled()
  check(`${width}px preparing and reviewing never auto-save`,version(),originalVersion)
  await expect(preparing).toHaveCount(0)
  await form.scrollIntoViewIfNeeded()
  await page.screenshot({path:`/tmp/halcyon-budget-impact-ready-${width}.png`})
  await context.close()
 }
 check('history preparation has no browser runtime errors',errors,[])
}
