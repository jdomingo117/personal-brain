import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Uses a guarded disposable candidate. No fixture writes to the coverage table. */
export async function budgetCoverageChecks({newUser,sql,quote:q,check,edge,signedPage}){
 const owner=await newUser(),other=await newUser(),viewer=await newUser(),member=await newUser()
 const range=JSON.parse(sql(`SELECT json_build_object('first',(date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')-interval '3 months')::date,'start',date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date,'last',(now() AT TIME ZONE 'Australia/Sydney')::date,'tomorrow',(now() AT TIME ZONE 'Australia/Sydney')::date+1);`))
 const invoke=async(u,fn,payload)=>{const r=await edge(u,fn,payload);assert.equal(r.status,200,`${fn}: ${JSON.stringify(r.body)}`);return r.body}
 const create=(u,name)=>invoke(u,'upsert-account',{name,type:'Liquid',currency:'AUD',balance:0})
 const account=await create(owner,'Coverage fixture account'),foreign=await create(other,'Separate fixture account')
 const batch=randomUUID()
 await invoke(owner,'upsert-transactions',{transactions:[{account_id:account.id,date:range.first,original_description:'Fictional coverage purchase',merchant:'Fixture shop',category:'Shopping',subcategory:'General retail',amount:-1000,upload_batch_id:batch}],target_balance:9000,file_name:'fictional-coverage.csv',source_row_count:1})
 const balanceAdjustment=()=>JSON.parse(sql(`SELECT json_build_object('id',id,'date',date,'amount',amount) FROM public.transactions
  WHERE tenant_id=${q(owner.tenant)} AND account_id=${q(account.id)} AND kind='adjustment' AND kind_source='system';`))
 const initialAdjustment=balanceAdjustment()
 for(const [user,role] of [[viewer,'viewer'],[member,'member']]){
  // withAuth chooses the first membership by joined_at; exercise the shared tenant's roles.
  sql(`INSERT INTO public.tenant_members(tenant_id,user_id,role,joined_at) VALUES(${q(owner.tenant)},${q(user.id)},${q(role)},'2000-01-01');`)
 }
 const financial=()=>JSON.parse(sql(`SELECT json_build_array((SELECT count(*) FROM auth.users),(SELECT count(*) FROM public.tenants),(SELECT count(*) FROM public.accounts),(SELECT count(*) FROM public.transactions),(SELECT sum(amount) FROM public.transactions WHERE tenant_id=${q(owner.tenant)} AND account_id=${q(account.id)}),(SELECT balance FROM public.accounts WHERE id=${q(account.id)}));`))
 const baseline=financial()
 const workspace=()=>invoke(owner,'query-budget',{action:'workspace'})
 const assistance=(ids=[account.id])=>invoke(owner,'query-budget',{action:'assisted_setup',frequency:'monthly',timezone:'Australia/Sydney',start_date:range.start,account_ids:ids})
 const list={action:'coverage',account_id:account.id}
 const basis=async()=>({request_id:randomUUID(),expected_source:(await workspace()).source_revision})
 // Include the adjustment date so replacement would revoke this range without the fix.
 const confirm={action:'confirm_coverage',account_id:account.id,first_date:initialAdjustment.date,last_date:range.last,confirmed:true}
 const command=async body=>invoke(owner,'manage-budget',{...await basis(),...body})
 const capture=(page,action)=>page.waitForResponse(response=>response.url().includes('/functions/v1/manage-budget')&&response.request().method()==='POST'&&response.request().postDataJSON()?.action===action)
 const initial=await assistance()
 check('R09 a normal import does not silently prove coverage',[initial.eligible,initial.period_count,initial.suggestions.everyday_cents],[false,0,null])
 check('R09 no confirmation rows exist before owner action',(await invoke(owner,'query-budget',list)).confirmations,[])
 check('R09 foreign account coverage read is unavailable',(await edge(other,'query-budget',list)).status,404)
 check('R09 viewer cannot read private owner coverage task',(await edge(viewer,'query-budget',list)).status,403)
 check('R09 member cannot confirm coverage',(await edge(member,'manage-budget',{...await basis(),...confirm})).status,403)
 const foreignBasis=(await invoke(other,'query-budget',{action:'workspace'})).source_revision
 check('R09 foreign account coverage write is unavailable',(await edge(other,'manage-budget',{...confirm,request_id:randomUUID(),expected_source:foreignBasis})).status,404)
 check('R09 strict schema forbids inventing verified provenance',(await edge(other,'manage-budget',{...confirm,account_id:foreign.id,request_id:randomUUID(),expected_source:foreignBasis,provenance:'verified_statement'})).status,422)
 check('R09 actual future dates are rejected',(await edge(other,'manage-budget',{...confirm,account_id:foreign.id,last_date:range.tomorrow,request_id:randomUUID(),expected_source:foreignBasis})).body.code,'budget_invalid_coverage_dates')
 check('R09 omitted attestation is rejected',(await edge(other,'manage-budget',{...confirm,account_id:foreign.id,confirmed:false,request_id:randomUUID(),expected_source:foreignBasis})).status,422)
 check('R09 browser roles cannot call coverage SQL directly or mutate evidence',sql(`SELECT NOT has_function_privilege('authenticated','public.budget_coverage(uuid,uuid,uuid)','EXECUTE') AND NOT has_table_privilege('authenticated','public.account_activity_coverage','INSERT,UPDATE,DELETE');`),'t')
 const page=await signedPage(owner,390)
 await page.getByRole('button',{name:'Help me build a budget'}).click()
 const assistanceDialog=page.getByRole('dialog',{name:'Help me build a budget'})
 await assistanceDialog.getByRole('checkbox',{name:'Coverage fixture account · AUD'}).check()
 await assistanceDialog.getByRole('button',{name:'Check my history'}).click()
 await expect(assistanceDialog.getByRole('heading',{name:'Confirm your account history',exact:true})).toBeVisible()
 await expect(assistanceDialog.getByRole('button',{name:'Enter my own amounts'})).toBeEnabled()
 check('R09 rendered missing-history flow retains immediate manual setup',true)
 await assistanceDialog.getByText('Confirm dates I know are complete',{exact:true}).click()
 const coverage=assistanceDialog.getByRole('region',{name:'Account history dates'})
 await coverage.getByLabel('Account to confirm').selectOption(account.id)
 await expect(coverage.getByText('You haven’t confirmed any dates for this account.')).toBeVisible()
 await coverage.getByLabel('First complete date').fill(confirm.first_date)
 await coverage.getByLabel('Last complete date').fill(range.last)
 await expect(coverage.getByRole('button',{name:'Confirm history dates'})).toBeDisabled()
 await coverage.getByRole('checkbox',{name:/I checked that all activity/}).check()
 check('R09 phone coverage form passes automated accessibility scan',(await new AxeBuilder({page}).include('dialog[open]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id),[])
 const savedResponse=capture(page,'confirm_coverage')
 await coverage.getByRole('button',{name:'Confirm history dates'}).click()
 const saved=await savedResponse, sent=saved.request().postDataJSON(), receipt=await saved.json()
 check('R09 confirmation through UI commits a user-confirmed receipt',[saved.status(),receipt.result?.provenance,receipt.result?.first_date,receipt.result?.last_date],[200,'user_confirmed',confirm.first_date,range.last])
 await expect(coverage.getByText('Confirmed by you',{exact:false})).toBeVisible()
 const {request_id,...input}=sent
 check('R09 receipt replay returns original result even when writes are disabled',JSON.parse(sql(`SELECT public.budget_command(${q(owner.tenant)},${q(owner.id)},${q(request_id)},${q(JSON.stringify(input))}::jsonb,false);`)),receipt)
 check('R09 operation lookup returns the original receipt',(await invoke(owner,'query-budget',{action:'operation',request_id:sent.request_id})).outcome,receipt)
 check('R09 altered repeat payload conflicts',(await edge(owner,'manage-budget',{...sent,first_date:range.start})).status,409)
 check('R09 source version advances on coverage confirmation',BigInt(receipt.source_revision)>BigInt(sent.expected_source))
 await assistanceDialog.getByRole('button',{name:'Check history again'}).click()
 await expect(assistanceDialog.getByText('Your history is ready')).toBeVisible()
 const eligible=await assistance()
 check('R09 verified range yields 3 periods and covered zero-spend observations',[eligible.eligible,eligible.period_count,eligible.observations.everyday],[true,3,{median_cents:0,min_cents:0,max_cents:1000}])
 check('R09 confirmation leaves financial facts and identity counts intact',financial(),baseline)
 await page.context().close()

 const payload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:range.start,account_ids:[account.id],destination_account_ids:[],income_cents:50000,opening_drawdown_cents:0,lines:[{id:randomUUID(),name:'Everyday',kind:'everyday',allocation_cents:20000,opening_cents:0}]}
 await command({action:'save_draft',expected_draft:'0',payload})
 await command({action:'activate',expected_draft:'1',accept_gap:false})
 const ready=await workspace()
 check('R09 forecast becomes available using the attested dates',[ready.details.forecast.flexible.available,ready.details.forecast.flexible.history.map(m=>m.gross_cents)],[true,[1000,0,0]])
 const active=await signedPage(owner,1440,true)
 await active.getByRole('button',{name:'Accounts & settings'}).click()
 await active.getByRole('button',{name:'Review account history coverage'}).click()
 const settings=active.getByRole('dialog',{name:'Account history coverage'})
 await settings.getByLabel('Account to confirm').selectOption(account.id)
 await settings.getByRole('button',{name:/Remove confirmation for/}).click()
 const removedResponse=capture(active,'revoke_coverage')
 await settings.getByRole('button',{name:'Remove these dates'}).click()
 const removed=await removedResponse
 check('R09 owner can remove the confirmation in active Budget settings',removed.status(),200)
 await expect(settings.getByText('You haven’t confirmed any dates for this account.')).toBeVisible()
 const after=await workspace()
 check('R09 removing confirmation suppresses forecast without changing plan version',[after.details.forecast.flexible.available,after.details.forecast.flexible.reason,after.plan.version],[false,'not_enough_history',ready.plan.version])
 check('R09 removal returns assistance to the missing-history fallback',(await assistance()).eligible,false)
 check('R09 stale pre-removal source cannot commit a fresh confirmation',(await edge(owner,'manage-budget',{...confirm,request_id:randomUUID(),expected_source:ready.source_revision})).body.code,'budget_stale_source')
 check('R09 owner withdrawal preserves the original row and audit receipt',sql(`SELECT (SELECT revoked_reason FROM public.account_activity_coverage WHERE id=${q(receipt.result.coverage_id)})||':'||(SELECT count(*) FROM public.budget_operations WHERE tenant_id=${q(owner.tenant)} AND action='revoke_coverage');`),'owner_withdrew_confirmation:1')
 check('R09 owner withdrawal leaves financial facts and identity counts intact',financial(),baseline)
 await active.context().close()
 const again=await command(confirm)
 check('R09 foreign owner cannot revoke an evidence row by identifier',(await edge(other,'manage-budget',{action:'revoke_coverage',coverage_id:again.result.coverage_id,request_id:randomUUID(),expected_source:foreignBasis})).status,409)
 await invoke(owner,'upsert-transactions',{
  transactions:[{account_id:account.id,date:range.last,original_description:'Fictional follow-up purchase',merchant:'Fixture shop',category:'Shopping',subcategory:'General retail',amount:-500,upload_batch_id:randomUUID()}],
  target_balance:8700,file_name:'fictional-coverage-follow-up.csv',source_row_count:1,
 })
 const replacement=balanceAdjustment()
 check('R09 follow-up import replaced the system adjustment inside the confirmed range',
  [replacement.id!==initialAdjustment.id,replacement.date,replacement.amount],[true,confirm.first_date,10200])
 check('R09 replacement keeps the original coverage active',sql(`SELECT revoked_at IS NULL FROM public.account_activity_coverage WHERE id=${q(again.result.coverage_id)};`),'t')
 const afterReplacement=await workspace()
 check('R09 replacement preserves forecast eligibility and still advances the source revision',
  [afterReplacement.details.forecast.flexible.available,BigInt(afterReplacement.source_revision)>BigInt(again.source_revision)],[true,true])
 check('R09 replacement preserves the two purchases and reconciles to the new balance',JSON.parse(sql(`SELECT json_build_array(
  count(*) FILTER (WHERE kind='expense'),sum(amount),(SELECT balance FROM public.accounts WHERE id=${q(account.id)}))
  FROM public.transactions WHERE tenant_id=${q(owner.tenant)} AND account_id=${q(account.id)};`)),[2,8700,8700])
 const deleted=await invoke(owner,'delete-upload-batch',{upload_batch_id:batch,account_id:account.id})
 check('R09 normal import undo removes the fixture purchase',deleted.removed,1)
 check('R09 source deletion revokes evidence without erasing it',sql(`SELECT revoked_reason FROM public.account_activity_coverage WHERE id=${q(again.result.coverage_id)};`),'source_activity_deleted')
 check('R09 source deletion restores missing-history fallback for forecast and assistance',[(await workspace()).details.forecast.flexible.available,(await assistance()).eligible],[false,false])
}
