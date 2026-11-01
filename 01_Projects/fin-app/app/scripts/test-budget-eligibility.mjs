import assert from 'node:assert/strict'
import {expect} from '@playwright/test'

/** G03 boundary vectors. Invoked only by the positively guarded disposable runner. */
export async function runBudgetEligibilityChecks({newUser,sql,quote,check,edge,signedPage}){
 const u=await newUser()
 const account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Eligibility fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const accounts=[account]
 function cover(id,from,to,revoked=false){sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by,revoked_at) VALUES(${quote(u.tenant)},${quote(id)},${quote(id)},${quote(from)},${quote(to)},'verified_statement','{"fixture":"r02"}',0,${quote(u.id)},${revoked?'now()':'NULL'});`)}
 function clear(){sql(`DELETE FROM public.account_activity_coverage WHERE tenant_id=${quote(u.tenant)};`)}
 function request(start='2026-08-07',anchor='2026-05-15',ids=accounts,frequency='fortnightly'){return {action:'assisted_setup',frequency,start_date:start,anchor,account_ids:ids}}
 const query=input=>JSON.parse(sql(`SELECT public.budget_assisted_setup(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(input))}::jsonb);`))
 cover(account,'2026-05-15','2026-08-07')
 sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate)
 SELECT ${quote(u.id)},${quote(u.tenant)},${quote(account)},'2026-05-16'::date+14*n,'Eligibility fixture','Eligibility fixture','eligibility-fixture','Shopping',-1000,'expense','user',false,false FROM generate_series(0,5) n;`)
 const response=await edge(u,'query-budget',request());assert.equal(response.status,200,JSON.stringify(response.body))
 const counter=response.body
 check('counterexample contains exactly six covered aligned fortnights',counter.period_count,6)
 if(process.argv.includes('--eligibility-red')){
  check('legacy counterexample incorrectly grants eligibility without three complete months',counter.eligible,true)
  return
 }
 check('six fortnights with only two complete calendar months cannot unlock a full draft',[counter.eligible,counter.calendar_month_count,counter.calendar_months.map(m=>m.start_date)],[false,2,['2026-06-01','2026-07-01']])
 check('limited evidence keeps its observed windows and amounts',[counter.periods.length,counter.suggestions.everyday_cents],[6,1000])
 clear();cover(account,'2025-10-01','2026-01-01');cover(account,'2026-05-15','2026-08-07')
 check('complete months outside the latest six cannot satisfy the calendar gate',[query(request()).calendar_month_count,query(request()).eligible],[2,false])
 clear();cover(account,'2026-01-01','2026-04-01')
 const eligible=query(request('2026-04-01','2026-01-07'))
 check('exactly three complete months and six aligned fortnights pass both gates',[eligible.calendar_month_count,eligible.period_count,eligible.eligible],[3,6,true])
 const five=query(request('2026-04-01','2026-01-08'))
 check('three complete months do not bypass the independent six-fortnight gate',[five.calendar_month_count,five.period_count,five.eligible],[3,5,false])
 clear();cover(account,'2026-01-02','2026-04-01')
 const dayGap=query(request('2026-04-01','2026-01-07'))
 check('one missing day outside the six windows still blocks the third complete month',[dayGap.calendar_month_count,dayGap.period_count,dayGap.eligible],[2,6,false])
 cover(account,'2026-01-01','2026-01-02',true)
 check('revoked coverage cannot fill the calendar boundary gap',query(request('2026-04-01','2026-01-07')).eligible,false)
 sql(`UPDATE public.account_activity_coverage SET revoked_at=NULL WHERE tenant_id=${quote(u.tenant)} AND start_date='2026-01-01';`)
 check('adjacent coverage segments jointly satisfy exact calendar and anchor boundaries',query(request('2026-04-01','2026-01-07')).eligible,true)
 const other=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Second eligibility account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 cover(other,'2026-01-02','2026-04-01')
 const multiple=query(request('2026-04-01','2026-01-07',[account,other]))
 check('every selected account must cover each complete calendar month',[multiple.calendar_month_count,multiple.period_count,multiple.eligible],[2,6,false])
 cover(other,'2026-01-01','2026-01-02')
 check('completing the second account restores joint eligibility',query(request('2026-04-01','2026-01-07',[account,other])).eligible,true)
 const monthly=query(request('2026-04-01','2026-01-07',[account],'monthly'))
 check('monthly minimum remains three complete months',[monthly.calendar_month_count,monthly.period_count,monthly.eligible],[3,3,true])
 const empty=query(request('2026-04-01','2026-01-07',[]))
 check('no accounts cannot produce complete calendar evidence',[empty.calendar_month_count,empty.eligible],[0,false])
 check('eligibility checks create no budget plans or drafts',JSON.parse(sql(`SELECT jsonb_build_array((SELECT count(*) FROM public.budget_plans WHERE tenant_id=${quote(u.tenant)}),(SELECT count(*) FROM public.budget_drafts WHERE tenant_id=${quote(u.tenant)}));`)),[0,0])
 if(signedPage){
  // Restore the six-window/two-month counterexample for the real limited UI.
  clear();cover(account,'2026-05-15','2026-08-07')
  const page=await signedPage(u,390,false)
  await page.getByRole('button',{name:'Help me build a budget',exact:true}).click()
  await page.getByLabel('Budget rhythm').selectOption('fortnightly')
  await page.getByLabel('Start with the period containing',{exact:true}).fill('2026-08-07')
  await page.getByLabel('Two-week cycle start date').fill('2026-05-15')
  await page.getByRole('checkbox',{name:/Eligibility fictional account/}).check()
  await page.getByRole('button',{name:'Check my history',exact:true}).click()
  await expect(page.getByRole('heading',{name:'History needs more information',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Use this draft',exact:true})).toHaveCount(0)
  await expect(page.getByRole('checkbox',{name:/Try one optional change/})).toHaveCount(0)
  await expect(page.getByText(/At least 3 complete comparable calendar months/)).toBeVisible()
  await expect(page.getByRole('button',{name:'Enter my own amounts',exact:true})).toBeEnabled()
  check('limited fortnightly UI explains both gates and keeps the manual route without draft/outcome actions',true)
 }
}
