import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Canonical estimator reference vectors; only the guarded disposable runner calls this. */
export async function runBudgetEstimatorChecks({newUser,sql,quote,check,edge,signedPage}){
 const start=sql("SELECT date_trunc('month',now() AT TIME ZONE 'Australia/Sydney')::date;")
 const months=JSON.parse(sql(`SELECT jsonb_agg(d::date ORDER BY d) FROM generate_series(${quote(start)}::date-interval '6 months',${quote(start)}::date-1,interval '1 month') d;`))
 const u=await newUser(),account=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Estimator fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 function row(date,amount,kind='expense',merchant='estimator-shop',pending=false){return sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(account)},${quote(date)},'Estimator fixture',${quote(merchant)},${quote(merchant)},'Shopping',${amount},${quote(kind)},'user',${pending},false,decode(md5(${quote(randomUUID())}),'hex')) RETURNING id;`).split('\n')[0]}
 function cover(){sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(u.tenant)},${quote(account)},${quote(account)},${quote(months[0])},${quote(start)},'verified_statement','{"fixture":"r05"}',0,${quote(u.id)});`)}
 function seed(values){sql(`DELETE FROM public.transactions WHERE tenant_id=${quote(u.tenant)};`);values.forEach((value,i)=>{if(value!==0)row(months[i],-value,value<0?'refund':'expense');row(months[i],50000,'income','estimator-pay')});cover()}
 const request={action:'assisted_setup',frequency:'monthly',start_date:start,account_ids:[account],timezone:'Australia/Sydney'}
 const query=(body=request)=>JSON.parse(sql(`SELECT public.budget_assisted_setup(${quote(u.tenant)},${quote(u.id)},${quote(JSON.stringify(body))}::jsonb);`))
 seed([-300,-200,-100,200,300,10000])
 const initial=await edge(u,'query-budget',request);assert.equal(initial.status,200,JSON.stringify(initial.body))
 check('R05 reference scope contains six complete calendar periods',initial.body.period_count,6)
 if(process.argv.includes('--estimator-red')){
  check('R05 legacy clamping changes the signed 50-cent median into 100 cents',initial.body.suggestions.everyday_cents,100)
  check('R05 legacy counterexample contains real negative net observations',initial.body.periods.map(p=>p.expense_cents),[-300,-200,-100,200,300,10000])
  return
 }
 check('R05 corrected query uses the signed estimator method',initial.body.method,'budget-assist-v2')
 check('R05 signed samples are not floored before the median',initial.body.periods.map(p=>p.everyday_cents),[-300,-200,-100,200,300,10000])
 check('R05 exact signed median and full observed range retain the exceptional purchase',[initial.body.suggestions.everyday_cents,initial.body.observations.everyday],[50,{median_cents:50,min_cents:-300,max_cents:10000}])
 const observed=initial.body
 check('R05 every reported period reconciles gross, credits, recurring and signed everyday effects',observed.periods.every(p=>p.gross_expense_cents-p.expense_credit_cents===p.expense_cents&&p.recurring_expense_cents+p.everyday_cents===p.expense_cents&&p.everyday_gross_cents-p.everyday_credit_cents===p.everyday_cents),true)
 for(const [values,want]of [[[1,2],2],[[-2,-1],-2],[[-1,0],-1],[[-3,-2,-1],-2],[[0,0],0],[[9007199254740991,9007199254740991],9007199254740991],[[-9007199254740991,9007199254740991],0]]){
  check(`R05 exact cent median ${JSON.stringify(values)}`,Number(sql(`SELECT public.budget_median_cents(ARRAY[${values.join(',')}]::bigint[]);`)),want)
 }
 check('R05 an empty median stays unknown',sql('SELECT public.budget_median_cents(ARRAY[]::bigint[]) IS NULL;'),'t')
 for(const values of ['9007199254740992','-9007199254740992','NULL']){assert.throws(()=>sql(`SELECT public.budget_median_cents(ARRAY[${values}]::bigint[]);`),/budget_overflow/);check(`R05 rejects unsafe median input ${values}`,true)}
 seed([-300,-200,-100,-1,0,20])
 const negative=query()
 check('R05 negative half-cent median stays signed and has no automatic negative allocation',[negative.eligible,negative.observations.everyday,negative.suggestions.everyday_cents],[true,{median_cents:-51,min_cents:-300,max_cents:20},null])
 sql(`DELETE FROM public.account_activity_coverage WHERE tenant_id=${quote(u.tenant)};INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(u.tenant)},${quote(account)},${quote(account)},${quote(months[0])},${quote(months[5])},'verified_statement','{"fixture":"r05-missing"}',0,${quote(u.id)});`)
 check('R05 missing history is excluded rather than filled with zero',[query().period_count,query().observations.everyday],[5,{median_cents:-100,min_cents:-300,max_cents:0}])
 seed([0,0,0,0,0,0])
 check('R05 covered zero activity is a real zero sample, not missing history',[query().period_count,query().observations.everyday],[6,{median_cents:0,min_cents:0,max_cents:0}])
 // Reference against the established balance kernel, never another copy of the estimator.
 const line=randomUUID(),planPayload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:months[0],account_ids:[account],destination_account_ids:[],income_cents:50000,opening_drawdown_cents:0,lines:[{id:line,name:'Reference everyday',kind:'everyday',allocation_cents:10000,opening_cents:0}]}
 const source=()=>sql(`SELECT public.budget_lock_source(${quote(u.tenant)});`)
 function command(body,requestId=randomUUID()){return JSON.parse(sql(`SELECT public.budget_command(${quote(u.tenant)},${quote(u.id)},${quote(requestId)},${quote(JSON.stringify({expected_method:'budget-foundation-v1',expected_source:source(),...body}))}::jsonb,true);`))}
 command({action:'save_draft',expected_draft:'0',payload:planPayload})
 const activated=command({action:'activate',expected_draft:'1',accept_gap:false}),plan=activated.result.plan_id
 const reference=(from,to)=>JSON.parse(sql(`SELECT json_build_object('gross',coalesce(sum(capacity) FILTER(WHERE source_type='expense'),0),'credits',coalesce(sum(capacity) FILTER(WHERE source_type='refund'),0),'net',coalesce(sum(CASE WHEN source_type='expense' THEN capacity ELSE -capacity END),0)) FROM public.budget_activity_amounts(${quote(u.tenant)},${quote(plan)},${quote(from)},${quote(to)});`))
 function parity(label){const result=query();for(const p of result.periods){const ref=reference(p.start_date,p.end_date);assert.deepEqual([p.gross_expense_cents,p.expense_credit_cents,p.expense_cents],[ref.gross,ref.credits,ref.net],label)}check(label,true);return result}
 seed([100,200,300,400,500,600])
 const principal=row(months[1],-10000,'expense','unreviewed-loan')
 check('R05 an unreviewed combined loan payment stays an expense',query().periods[1].everyday_cents,10200)
 sql(`INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,category_id) VALUES(${quote(u.tenant)},${quote(principal)},0,-9000,'transfer','Transfer','transfer'),(${quote(u.tenant)},${quote(principal)},1,-1000,'expense','Shopping','shopping');`)
 cover();check('R05 reviewed principal/interest split replaces the parent once',query().periods[1].everyday_cents,1200)
 row(months[2],-7000,'expense','card-purchase');row(months[2],-7000,'transfer','card-repayment');row(months[2],-99999,'expense','pending-hold',true)
 check('R05 card purchase counts, repayment and pending hold do not double spending',query().periods[2].everyday_cents,7300)
 const toAccount=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(u.id)},${quote(u.tenant)},'Repayment peer','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 const from=row(months[3],-5000,'expense','matched-repayment')
 const to=sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash) VALUES(${quote(u.id)},${quote(u.tenant)},${quote(toAccount)},${quote(months[3])},'Repayment peer','Peer','peer','Income',5000,'income','user',false,false,decode(md5(${quote(randomUUID())}),'hex')) RETURNING id;`).split('\n')[0]
 sql(`INSERT INTO public.transfer_links(tenant_id,from_txn_id,to_txn_id,state,score,reasons,ambiguous,matcher_version,from_account_id,from_hash,from_occurrence,to_account_id,to_hash,to_occurrence) SELECT ${quote(u.tenant)},f.id,t.id,'confirmed',1,'[]',false,1,f.account_id,f.dedupe_hash,f.occurrence,t.account_id,t.dedupe_hash,t.occurrence FROM public.transactions f,public.transactions t WHERE f.id=${quote(from)} AND t.id=${quote(to)};`)
 cover();check('R05 a canonical matched repayment excludes an expense-labelled leg',query().periods[3].everyday_cents,400)
 const rejected=row(months[4],-800,'transfer','rejected-transfer')
 sql(`UPDATE public.transactions SET kind='transfer',category='Transfer',kind_source='derived',transfer_candidate=true WHERE id=${quote(rejected)};SELECT public.decide_transfer_leg(${quote(u.tenant)},${quote(rejected)},'rejected');`)
 cover();check('R05 durable rejection restores a derived transfer as ordinary expense',query().periods[4].everyday_cents,1300)
 row(months[5],700,'reimbursement','reimbursement-received')
 cover();check('R05 reimbursement affects its receipt period and never becomes earned income',[query().periods[5].everyday_cents,query().periods[5].income_cents],[-100,50000])
 const splitRefund=row(months[4],900,'refund','split-refund')
 sql(`INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,category_id) VALUES(${quote(u.tenant)},${quote(splitRefund)},0,600,'refund','Shopping','shopping'),(${quote(u.tenant)},${quote(splitRefund)},1,300,'income','Income','income');`)
 cover();check('R05 split refund replaces its parent without inflating expense credits',[query().periods[4].everyday_cents,query().periods[4].income_cents],[700,50300])
 parity('R05 splits, repayments, pending rows, rejected transfers and reimbursements match the balance kernel')
 const duplicate=row(months[0],-1000,'expense','repeat-import')
 sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash,occurrence) SELECT user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash,occurrence FROM public.transactions WHERE id=${quote(duplicate)} ON CONFLICT(account_id,dedupe_hash,occurrence) DO NOTHING;`)
 cover();check('R05 repeated canonical import counts once',query().periods[0].everyday_cents,1100)
 const fingerprint=query().fingerprint
 sql(`DELETE FROM public.transactions WHERE id=${quote(duplicate)};`);row(months[0],-2000,'expense','replacement-import');cover()
 check('R05 replacement removes the old effect and changes the evidence fingerprint',[query().periods[0].everyday_cents,query().fingerprint!==fingerprint],[2100,true])
 const fee=row(months[0],-999,'expense','Uncategorized ordinary expense')
 sql(`UPDATE public.transactions SET category='Uncategorized' WHERE id=${quote(fee)};`);cover()
 check('R05 uncategorized settled debits stay in the single everyday pool',query().periods[0].everyday_cents,3099)
 parity('R05 replacement imports and uncategorized debits retain canonical parity')
 // Attribution of regular-cost credits stays signed; it does not spill into everyday.
 sql(`INSERT INTO public.recurring_series_overrides(tenant_id,account_id,merchant_key,state,cadence_override,expected_amount_override,next_expected_override) VALUES(${quote(u.tenant)},${quote(account)},'confirmed-bill','active','Monthly',2000,${quote(start)});`)
 row(months[0],-2000,'expense','confirmed-bill');row(months[1],3000,'refund','confirmed-bill');cover()
 const bills=query()
 check('R05 a later regular-cost refund remains in that receipt period and reconciles separately',[bills.periods[0].recurring_expense_cents,bills.periods[1].recurring_expense_cents,bills.periods[0].everyday_cents,bills.periods[1].everyday_cents],[2000,-3000,3099,1200])
 parity('R05 regular-cost attribution preserves whole-ledger signed reconciliation')
 // The row store has an int32 ceiling; aggregates must still exceed int32 exactly.
 assert.throws(()=>row(months[0],-9007199254740991n,'expense','unsupported-row'),/integer out of range/)
 check('R05 ledger storage rejects an unsupported row before it can affect evidence',true)
 const largeA=row(months[0],-2147483647,'expense','large-cent-a'),largeB=row(months[0],-2147483647,'expense','large-cent-b');cover()
 check('R05 complete period sums exceed int32 without rounding or overflow',query().periods[0].everyday_cents,4294970393)
 parity('R05 large exact-cent period sums retain ledger parity')
 sql(`DELETE FROM public.transactions WHERE id IN(${quote(largeA)},${quote(largeB)});`);cover()
 const currentExpense=row(start,-10000,'expense','current-spend');row(start,8000,'refund','unassigned-current-credit');row(start,-2000,'expense','confirmed-bill')
 sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(u.tenant)},${quote(account)},${quote(account)},${quote(start)},(${quote(start)}::date+interval '1 month')::date,'verified_statement','{"fixture":"r05-current"}',0,${quote(u.id)});`)
 const current=query()
 check('R05 unassigned refunds and an unmatched bill cannot manufacture unused current room',[current.target.settled_everyday_cents,current.target.unassigned_credit_cents],[12000,-8000])
 check('R05 estimator queries never change the reference plan or its allocations',sql(`SELECT count(*) FROM public.budget_plans WHERE tenant_id=${quote(u.tenant)};`),'1')
 // Independent fortnight windows, including leap day; never monthly divided by two.
 const f=await newUser(),fa=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(f.id)},${quote(f.tenant)},'Fortnight estimator fixture','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
 sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(f.tenant)},${quote(fa)},${quote(fa)},'2024-01-01','2024-04-03','verified_statement','{"fixture":"r05-leap"}',0,${quote(f.id)});
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) SELECT ${quote(f.id)},${quote(f.tenant)},${quote(fa)},'2024-01-10'::date+14*n,'Fortnight fixture','Shop','fortnight-shop','Shopping',-(n+1),'expense','user',false,false FROM generate_series(0,5) n;
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES(${quote(f.id)},${quote(f.tenant)},${quote(fa)},'2024-02-29','Leap-day expense','Shop','leap-shop','Shopping',-1000,'expense','user',false,false);`)
 const fq=JSON.parse(sql(`SELECT public.budget_assisted_setup(${quote(f.tenant)},${quote(f.id)},${quote(JSON.stringify({frequency:'fortnightly',start_date:'2024-04-03',anchor:'2024-01-10',account_ids:[fa]}))}::jsonb);`))
 check('R05 six anchor-aligned fortnights retain exact cents across leap February',[fq.calendar_month_count,fq.period_count,fq.periods.map(p=>p.everyday_cents),fq.suggestions.everyday_cents],[3,6,[1,2,3,1004,5,6],4])
 const legacyUser=await newUser(),legacyLine=randomUUID(),legacyGoal=randomUUID(),legacySource=sql(`SELECT public.budget_lock_source(${quote(legacyUser.tenant)});`)
 const legacyPayload={currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',start_date:start,account_ids:[],destination_account_ids:[],income_cents:10000,opening_drawdown_cents:3000,lines:[{id:legacyLine,name:'Legacy everyday',kind:'everyday',allocation_cents:5000,opening_cents:0},{id:legacyGoal,name:'Legacy trip',kind:'reserve',allocation_cents:1000,opening_cents:2000}],assistance:{method:'budget-assist-v1',fingerprint:'a'.repeat(64),source_revision:legacySource,manual:false,periods:[{start_date:months[0],end_date:months[1]}],provenance:{everyday:'median-canonical-net-expense'},goal_intent:{line_id:legacyGoal,name:'Legacy trip',target_cents:9000,needed_by:'2027-06-01'},reviewed_inputs:{apply_income:true,apply_everyday:true,income:{amount_cents:10000,pay_dates:[start],confirmed:true},costs:[],irregular_confirmed:true}}}
 const saveLegacy=await edge(legacyUser,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:legacySource,expected_draft:'0',payload:legacyPayload});check('R05 legacy draft remains resumable without rewritten values',saveLegacy.status,200)
 const blockedLegacy=await edge(legacyUser,'manage-budget',{action:'activate',request_id:randomUUID(),expected_source:legacySource,expected_draft:'1',accept_gap:false})
 check('R05 an old automatic estimator draft requires fresh review before activation',[blockedLegacy.status,blockedLegacy.body.code],[409,'budget_stale_assistance'])
 if(signedPage){
  const oldPage=await signedPage(legacyUser,390,false)
  await oldPage.getByRole('button',{name:'Review saved draft',exact:true}).click()
  await expect(oldPage.getByRole('button',{name:'Start this budget',exact:true})).toHaveCount(0)
  await oldPage.getByRole('button',{name:'Keep as manual estimates',exact:true}).click()
  await expect(oldPage.getByLabel('Planned for Legacy everyday (AUD)',{exact:true})).toHaveValue('50.00')
  await expect(oldPage.getByLabel('Already set aside for Legacy trip (AUD)',{exact:true})).toHaveValue('20.00')
  check('R05 legacy browser conversion preserves protected amounts and reserve intent',true)
 }
 const manualLegacy=structuredClone(legacyPayload);manualLegacy.assistance.manual=true;manualLegacy.assistance.provenance.everyday='user-estimate-preserved-from-assisted-draft'
 const manualSaved=await edge(legacyUser,'manage-budget',{action:'save_draft',request_id:randomUUID(),expected_source:legacySource,expected_draft:'1',payload:manualLegacy});check('R05 explicit legacy manual conversion can be saved',manualSaved.status,200)
 const manualActivated=await edge(legacyUser,'manage-budget',{action:'activate',request_id:randomUUID(),expected_source:legacySource,expected_draft:'2',accept_gap:false});check('R05 explicit manual intent can activate without pretending to be a v2 estimate',manualActivated.status,200)
 check('R05 legacy conversion keeps its goal target and planned contribution',JSON.parse(sql(`SELECT jsonb_build_array(payload->>'target_cents',payload->>'amount_cents') FROM public.budget_item_revisions WHERE tenant_id=${quote(legacyUser.tenant)} AND line_id=${quote(legacyGoal)};`)),['9000','1000'])
 if(signedPage){
  const browserUser=await newUser(),ba=sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${quote(browserUser.id)},${quote(browserUser.tenant)},'Signed history fictional account','Liquid',0,'AUD') RETURNING id;`).split('\n')[0]
  sql(`INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by) VALUES(${quote(browserUser.tenant)},${quote(ba)},${quote(ba)},${quote(months[0])},${quote(start)},'verified_statement','{"fixture":"r05-browser"}',0,${quote(browserUser.id)});`)
  for(let i=0;i<6;i++)sql(`INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate) VALUES(${quote(browserUser.id)},${quote(browserUser.tenant)},${quote(ba)},${quote(months[i])},'Credit-heavy fixture','Shop','credit-shop','Shopping',${[300,200,100,1,0,-20][i]},${quote(i<4?'refund':'expense')},'user',false,false),(${quote(browserUser.id)},${quote(browserUser.tenant)},${quote(ba)},${quote(months[i])},'Earned income','Employer','browser-pay','Income',50000,'income','user',false,false);`)
  const page=await signedPage(browserUser,390,false)
  await page.getByRole('button',{name:'Help me build a budget',exact:true}).click();await page.getByRole('checkbox',{name:/Signed history fictional account/}).check();await page.getByRole('button',{name:'Check my history',exact:true}).click()
  await expect(page.getByText('your refunds were bigger than your everyday spending',{exact:false})).toBeVisible()
  await expect(page.getByText('-$0.51',{exact:true})).toBeVisible()
  void 0;await page.getByLabel(/Have your income/).selectOption('no')
  void 0;await page.getByLabel('Take-home pay in this budget (AUD)').fill('0');void 0
  await expect(page.getByRole('radio',{name:/Use my typical month/})).toHaveCount(0)
  await page.getByRole('radio',{name:'Choose my own amount'}).check();await page.getByLabel('Everyday amount (AUD)').fill('25')
  void 0;await page.getByRole('checkbox',{name:/I’ve checked these amounts/}).check()
  for(const width of [390,1440])for(const dark of [false,true]){await page.setViewportSize({width,height:1050});await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);const scan=await new AxeBuilder({page}).include('dialog[open]').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();check(`R05 ${width} ${dark?'dark':'light'} signed-history accessibility`,scan.violations.map(v=>v.id),[]);check(`R05 ${width} ${dark?'dark':'light'} signed history fits`,await page.locator('dialog[open]').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`/tmp/halcyon-r05-${width}-${dark?'dark':'light'}.png`,fullPage:true})}
  await page.getByRole('button',{name:'Use this draft',exact:true}).click()
  await expect(page.getByLabel('Expected income this period (AUD)',{exact:true})).toHaveValue('0.00');await expect(page.getByLabel('Planned for Everyday spending (AUD)',{exact:true})).toHaveValue('25.00')
  check('R05 negative observations become only an explicit user-chosen allocation, never extra income',true)
 }

}
