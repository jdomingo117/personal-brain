/** Called only inside test-budget-durable's freshly provisioned, guarded disposable stack. */
import {spawn} from 'node:child_process'
import {chromium,expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {budgetM4Interactions} from './test-budget-m4-interactions.mjs'
import {budgetM5Interactions} from './test-budget-m5-interactions.mjs'

export async function runBudgetWorkspaceChecks({repo,api,anon,newUser,sql,quote,check,edge,attentionOnly=false,temporalOnly=false,temporalFixtures=[],historyFixture}) {
 const url='http://127.0.0.1:57300'
 // Never reuse a dev server whose environment/identity could belong to the personal stack.
 try{await fetch(url);throw Error('Private Budget browser port is already occupied')}catch(e){if(!String(e).includes('fetch failed'))throw e}
 const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','57300','--strictPort'],{cwd:`${repo}/app`,env:{...process.env,HALCYON_GOLDEN_SUPABASE_TARGET:api,VITE_SUPABASE_URL:`${url}/supabase`,VITE_SUPABASE_ANON_KEY:anon,VITE_BUDGET_V1_ENABLED:'true'},stdio:['ignore','pipe','pipe']})
 vite.stdout.on('data',()=>{});vite.stderr.on('data',()=>{})
 let browser
 const errors=[]
 try {
  for(let n=0;n<100;n++){try{if((await fetch(url)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch()
  async function signedPage(user,width=1440,hasPlan=false) {
   const context=await browser.newContext({viewport:{width,height:1050},reducedMotion:'reduce'})
   await context.addInitScript(({session,key})=>localStorage.setItem(key,JSON.stringify(session)),{session:user.session,key:'sb-127-auth-token'})
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
   await page.goto(`${url}/budget`)
   await expect(page.getByRole('heading',{name:'Budget',exact:true})).toBeVisible({timeout:30000})
   try{await expect(page.getByRole('button',{name:hasPlan?'My plan':'Build my budget',exact:true})).toBeVisible({timeout:15000})}catch(e){
    await page.screenshot({path:'/tmp/halcyon-budget-m3-failure.png',fullPage:true})
    console.log('Fictional UI failure:',await page.locator('.budget-workspace').innerText(),errors)
    throw e
   }
   return page
  }
  const user=await newUser(),phoneUser=await newUser()
  const snapshotSQL=u=>JSON.parse(sql(`SELECT public.budget_query(${quote(u.tenant)},${quote(u.id)},'{"action":"snapshot"}');`))
  if(historyFixture){
   const {budgetHistoryInteractions}=await import('./test-budget-history-interactions.mjs')
   await budgetHistoryInteractions({fixture:historyFixture,browser,url,sql,quote,check,newUser})
   check('history browser journeys have no runtime errors',errors,[])
   return
  }
  async function settled(page){await expect.poll(()=>page.locator('.budget-workspace .glass').evaluateAll(els=>els.every(el=>Number(getComputedStyle(el).opacity)>.99&&!/blur\((?!0px)/.test(getComputedStyle(el).filter))),{timeout:10000}).toBe(true)}
  if(temporalFixtures.length){
   const {budgetTemporalInteractions}=await import('./test-budget-temporal-interactions.mjs')
   await budgetTemporalInteractions({fixtures:temporalFixtures,check,signedPage,settled})
  }
  if(temporalOnly){check('combined temporal journeys have no browser runtime errors',errors,[]);return}
  if(attentionOnly){
   const {budgetAttentionInteractions}=await import('./test-budget-attention-interactions.mjs')
   await budgetAttentionInteractions({newUser,sql,quote,check,signedPage,snapshotSQL,settled})
   check('focused attention journeys have no browser runtime errors',errors,[])
   return
  }
  const aud=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(user.id)},${quote(user.tenant)},'Budget UI daily account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(user.id)},${quote(user.tenant)},'Budget UI overseas','Liquid',0,'USD');`)
  const workspace=await edge(user,'query-budget',{action:'workspace'})
  check('workspace returns tenant-bound account names and real currencies',workspace.body.accounts.map(a=>a.currency).sort(),['AUD','USD'])
  check('workspace exposes no balances or raw transactions',workspace.body.accounts.every(a=>Object.keys(a).sort().join(',')==='currency,id,name'))
  const page=await signedPage(user)
  await page.getByRole('button',{name:'Build my budget'}).click()
  await expect(page.getByRole('checkbox',{name:/overseas/})).toBeDisabled()
  await page.getByRole('checkbox',{name:/daily account/}).check()
  await page.getByLabel('Expected income this period (AUD)',{exact:true}).fill('2000')
  await page.getByLabel('Planned for Everyday spending (AUD)',{exact:true}).fill('1000')
  await page.getByRole('button',{name:'Review my plan'}).click()
  await page.getByRole('button',{name:'Save setup draft'}).click()
  await expect(page.getByText('Draft saved. Your budget is not active yet.',{exact:true})).toBeVisible()
  check('saving setup has not activated a plan',snapshotSQL(user).plan,null)
  await page.reload()
  await page.getByRole('button',{name:'Review saved draft'}).click()
  await expect(page.getByRole('button',{name:'Start this budget'})).toBeEnabled()
  await page.getByRole('button',{name:'Start this budget'}).click()
  await expect(page.getByRole('button',{name:'My plan',exact:true})).toBeVisible()
  const active=(await edge(user,'query-budget',{action:'snapshot'})).body
  check('authenticated desktop flow activates a saved monthly plan',active.period.frequency,'monthly')
  // Beyond PostgREST's page cap: UI must read the canonical complete SQL aggregate.
  sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending) SELECT ${quote(user.id)},${quote(user.tenant)},${quote(aud)},${quote(active.period.start_date)}::date,'Budget browser fixture','Fixture','fixture','Shopping',-1,'expense','user',false FROM generate_series(1,1005);`)
  await page.getByRole('button',{name:'Refresh saved data'}).click()
  await expect(page.getByText('Partial or no account history',{exact:true})).toBeVisible()
  await expect(page.locator('.glass').filter({has:page.getByRole('heading',{name:'What’s recorded so far',exact:true})}).locator('dd').filter({hasText:'$10.05'})).toHaveCount(2)
  check('desktop displays complete 1005-row SQL totals without coverage overclaim',true)
  sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(user.tenant)},${quote(aud)},${quote(aud)},${quote(active.period.start_date)},${quote(active.period.end_date)},'user_confirmed','{}',0,${quote(user.id)});`)
  await page.getByRole('button',{name:'Refresh saved data'}).click()
  await expect(page.getByText('Complete selected-account history',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'My plan',exact:true}).click()
  await page.getByRole('button',{name:'Adjust plan',exact:true}).click()
  await page.getByLabel('Expected income this period (AUD)',{exact:true}).fill('2100')
  await page.getByRole('button',{name:'Review my plan'}).click()
  await page.getByRole('button',{name:'Save plan changes'}).click()
  await expect(page.getByRole('button',{name:'My plan',exact:true})).toBeVisible()
  let changed=snapshotSQL(user)
  check('period-only edit preserves future income',[changed.revision.income_cents,changed.future_template.income_cents],[210000,200000])
  await page.getByRole('button',{name:'My plan',exact:true}).click()
  await page.getByRole('button',{name:'Adjust plan',exact:true}).click()
  await page.getByLabel('Expected income this period (AUD)',{exact:true}).fill('2200')
  await page.getByRole('radio',{name:'This period and future periods',exact:true}).check()
  await page.getByRole('button',{name:'Review my plan'}).click()
  let dropped=false
  await page.route('**/functions/v1/manage-budget',async route=>{
   if(!dropped){dropped=true;await route.fetch();await route.abort('failed')}else await route.continue()
  })
  await page.getByRole('button',{name:'Save plan changes'}).click()
  await expect(page.getByRole('heading',{name:'Let’s check that save first'})).toBeVisible()
  await page.reload()
  await page.getByRole('button',{name:'Check saved result'}).click()
  await expect(page.getByRole('heading',{name:'Let’s check that save first'})).toHaveCount(0)
  changed=snapshotSQL(user)
  check('lost-response recovery survives reload with exactly one new revision',[changed.plan.version,changed.revision.income_cents,changed.future_template.income_cents],['3',220000,220000])
  await settled(page);await page.screenshot({path:'/tmp/halcyon-budget-m3-desktop.png',fullPage:true})
  // A real source mutation after review must not erase the owner's edited amount.
  await page.getByRole('button',{name:'My plan',exact:true}).click()
  await page.getByRole('button',{name:'Adjust plan',exact:true}).click()
  await page.getByLabel('Expected income this period (AUD)',{exact:true}).fill('2350')
  await page.getByRole('button',{name:'Review my plan'}).click()
  sql(`UPDATE public.accounts SET name='Budget UI renamed account' WHERE id=${quote(aud)};`)
  await page.getByRole('button',{name:'Save plan changes'}).click()
  await expect(page.getByRole('alert')).toContainText('This budget changed')
  await expect(page.getByLabel('Expected income this period (AUD)',{exact:true})).toHaveValue('2350')
  await page.getByRole('button',{name:'Refresh saved data'}).click()
  await expect(page.getByRole('button',{name:'Review my plan'})).toBeVisible()
  await page.getByRole('button',{name:'Review my plan'}).click()
  await page.getByRole('button',{name:'Save plan changes'}).click()
  await expect(page.getByRole('button',{name:'My plan',exact:true})).toBeVisible()
  check('stale-source rejection preserves edits and requires fresh review',snapshotSQL(user).revision.income_cents,235000)
  // The viewer is a real second identity with a real read-only membership in this tenant.
  const viewer=await newUser()
  sql(`INSERT INTO public.tenant_members(tenant_id,user_id,role,joined_at) VALUES(${quote(user.tenant)},${quote(viewer.id)},'viewer','2000-01-01');`)
  const readOnly=await signedPage(viewer,768,true)
  await expect(readOnly.getByText('You can view this budget. Only its owner can change the plan or view setup drafts.',{exact:true})).toBeVisible()
  await readOnly.getByRole('button',{name:'My plan',exact:true}).click()
  await expect(readOnly.getByRole('button',{name:'Adjust plan',exact:true})).toBeDisabled()
  check('authenticated viewer has a read-only tablet workspace',true)
  // Small-screen manual setup with no accounts and no income is a first-class path.
  const phone=await signedPage(phoneUser,390)
  await phone.getByRole('button',{name:'Build my budget'}).click()
  await phone.getByLabel('Budget rhythm').selectOption('fortnightly')
  await phone.getByRole('button',{name:'Review my plan'}).click()
  await phone.getByRole('button',{name:'Save setup draft'}).click()
  await phone.getByRole('button',{name:'Review saved draft'}).click()
  await phone.getByRole('button',{name:'Start this budget'}).click()
  await expect(phone.getByText('You’re planning manually, without account activity.',{exact:true})).toBeVisible()
  const small=snapshotSQL(phoneUser)
  check('phone no-bank zero-income fortnightly setup activates',[small.period.frequency,small.revision.income_cents],['fortnightly',0])
  const overflow=await phone.locator('.budget-workspace').evaluate(el=>el.scrollWidth>el.clientWidth)
  check('390px Budget workspace has no horizontal overflow',overflow,false)
  await phone.evaluate(()=>document.documentElement.classList.add('dark'))
  await settled(phone);await phone.screenshot({path:'/tmp/halcyon-budget-m3-phone.png',fullPage:true})
  await phone.getByRole('button',{name:'My plan',exact:true}).click()
  await phone.getByRole('button',{name:'Adjust plan',exact:true}).click()
  await phone.getByLabel('Existing cash to use this period (AUD)',{exact:true}).fill('100')
  await phone.getByLabel('Planned for Everyday spending (AUD)',{exact:true}).fill('100')
  await phone.getByRole('radio',{name:'This period and future periods',exact:true}).check()
  await phone.getByRole('button',{name:'Review my plan'}).click()
  await expect(phone.getByRole('button',{name:'Save plan changes'})).toBeDisabled()
  await phone.getByRole('checkbox',{name:/I understand I have planned more/}).check()
  await phone.getByRole('button',{name:'Save plan changes'}).click()
  await expect(phone.getByRole('button',{name:'My plan',exact:true})).toBeVisible()
  check('phone future funding gap needs explicit acceptance',snapshotSQL(phoneUser).future_template.unallocated_cents,-10000)
  // Source failure must preserve last verified data, never substitute zeros.
  await phone.route('**/functions/v1/query-budget',route=>route.abort('failed'))
  await phone.getByRole('button',{name:'Refresh saved data'}).click()
  await expect(phone.getByRole('alert')).toContainText('Previously loaded figures remain')
  await expect(phone.getByRole('button',{name:'My plan',exact:true})).toBeVisible()
  check('read failure preserves last verified workspace with explicit warning',true)
  await phone.unroute('**/functions/v1/query-budget')
  await phone.getByRole('button',{name:'Refresh saved data'}).click()
  await phone.getByRole('button',{name:'Save for something',exact:true}).click()
  let task=phone.getByRole('dialog',{name:'Save for something',exact:true})
  await expect(task).toBeFocused()
  await task.getByLabel('Name',{exact:true}).fill('Snowboard browser goal')
  await task.getByLabel('Target cost (AUD)',{exact:true}).fill('900')
  await task.getByLabel('Amount per planned contribution (AUD)',{exact:true}).fill('100')
  await task.getByLabel('Already set aside (AUD)',{exact:true}).fill('300')
  await task.getByRole('button',{name:'Review impact'}).click()
  await task.getByRole('checkbox',{name:'I understand this leaves a funding gap in the current or future plan.'}).check()
  await task.getByRole('button',{name:'Save savings goal',exact:true}).click()
  await expect(task).toHaveCount(0)
  const goalArticle=phone.locator('article').filter({has:phone.getByRole('heading',{name:'Snowboard browser goal',exact:true})})
  await expect(goalArticle).toContainText('$400.00')
  check('phone goal creation saves one allocation and a separate opening reserve',true)
  await goalArticle.getByRole('button',{name:'Match activity',exact:true}).click()
  task=phone.getByRole('dialog',{name:'Match recorded activity'})
  await task.getByRole('checkbox',{name:'I’m confirming a savings earmark, not matching a bank transfer'}).check()
  await task.getByLabel('What did you set aside?',{exact:true}).fill('Fictional savings envelope')
  await task.getByLabel('Amount to match (AUD)',{exact:true}).fill('100')
  await task.getByRole('button',{name:'Review match'}).click()
  await task.getByRole('button',{name:'Save match',exact:true}).click()
  await expect(task).toHaveCount(0)
  await expect(goalArticle).toContainText('$400.00')
  await expect(goalArticle).toContainText('$100.00')
  check('phone manual evidence does not add reserve credit again',true)
  await phone.reload()
  await expect(phone.getByRole('button',{name:'Undo last budget change',exact:true})).toBeVisible()
  check('compatible latest undo remains discoverable after reload',true)
  await phone.evaluate(()=>document.documentElement.classList.add('dark'))
  await goalArticle.scrollIntoViewIfNeeded();await phone.screenshot({path:'/tmp/halcyon-budget-m4-phone.png',fullPage:true})
  await budgetM4Interactions({newUser,sql,quote,check,signedPage,snapshotSQL,settled})
  if(process.argv.includes('--lifecycle'))await budgetM5Interactions({newUser,sql,quote,check,signedPage,snapshotSQL,settled})
  check('production Budget journeys have no browser runtime errors',errors,[])
 }catch(error){
  // All pages in this runner contain captured disposable fictional fixtures.
  const last=browser?.contexts().at(-1)?.pages().at(-1)
  if(last){console.log('M4 failing dialog:',await last.getByRole('dialog').allTextContents());await last.screenshot({path:'/tmp/halcyon-budget-m4-failure.png',fullPage:true}).catch(()=>{})}
  throw error
 }finally {
  if(browser)await browser.close()
  vite.kill('SIGTERM')
  await new Promise(r=>{if(vite.exitCode!==null)r();else vite.once('exit',r)})
 }
}
