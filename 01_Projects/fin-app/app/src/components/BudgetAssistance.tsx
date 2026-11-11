import BudgetAssistanceInputs,{type RecentChanges} from './BudgetAssistanceInputs'
import {confirmReview,manualReviewSetup,reserveCostFunding,reviewProblem,reviewSignature,reviewedResult,type AssistanceReview} from '../lib/budgetAssistanceReview'
import {useEffect,useRef,useState} from 'react'
import {Button,DateInput,Select} from './Controls'
import {useBudget} from '../contexts/BudgetContext'
import {fmtCents} from '../data'
import {addDays,today} from '../lib/budget'
import {BUDGET_ASSIST_METHOD,applyAssistance,assistanceReasons,assistanceEligible,calendarMonthCount,assistanceCapacity,goalOutcomeReason,goalWhatIfOutcome,previewWhatIf,type AssistanceResult,type WhatIf} from '../lib/budgetAssistance'
import {blankSetup,moneyEntry,parseBudgetMoney,type Setup} from '../lib/budgetWorkspace'
import BudgetHistoryCoverage from './budget/BudgetHistoryCoverage'
import BudgetStartCalendar from './budget/BudgetStartCalendar'
import {assistanceSteps,AssistanceStepIcon} from './budget/BudgetAssistanceSteps'
import BudgetCoverageReadiness from './budget/BudgetCoverageReadiness'
import BudgetDetectedBills from './budget/BudgetDetectedBills'
import {activityLabel,suggestedAccountIds,type AccountActivity} from '../lib/budgetAccountActivity'

const dayFmt=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
const monthFmt=new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'})
const at=(date:string)=>{try{return dayFmt.format(new Date(`${date}T00:00:00Z`))}catch{return date}}
const monthOf=(date:string)=>{try{return monthFmt.format(new Date(`${date}T00:00:00Z`))}catch{return date}}

// The assisted_setup API accepts at most 100 accounts per history check.
const assistanceAccountLimit=100

export default function BudgetAssistance({baseSetup,onUse,onManual,onClose}:{baseSetup?:Setup;onUse:(setup:Setup)=>void;onManual:(setup:Setup)=>void;onClose:()=>void}){
  const b=useBudget(),s=b.snapshot!
  const root=useRef<HTMLElement>(null)
  const [activePart,setActivePart]=useState(1)
  const [base]=useState(()=>structuredClone(baseSetup??blankSetup())),[frequency,setFrequency]=useState<Setup['frequency']>(base.frequency),[start,setStart]=useState(base.start_date),[anchor,setAnchor]=useState(base.anchor??base.start_date)
  const [accounts,setAccounts]=useState<string[]>(base.account_ids),[recent,setRecent]=useState(''),[changed,setChanged]=useState<RecentChanges>({pay:false,bills:false,spending:false}),[scopeConfirmed,setScopeConfirmed]=useState(false)
  const eligibleAccounts=s.accounts.filter(account=>account.currency==='AUD')
  const selectedAccounts=eligibleAccounts.filter(account=>accounts.includes(account.id)).map(account=>account.id)
  const allSelected=selectedAccounts.length>0&&selectedAccounts.length===eligibleAccounts.length
  // Activity labels and spending-account defaults. Optional: without them the picker works as before.
  const [activity,setActivity]=useState<AccountActivity[]>([]),[suggested,setSuggested]=useState<number|null>(null)
  const readActivity=b.accountActivity,accountsNow=useRef(accounts)
  accountsNow.current=accounts
  useEffect(()=>{let current=true;void readActivity().then(a=>{if(!current)return;setActivity(a.accounts)
    // Only pre-select for a fresh setup whose selection the owner hasn't started.
    if(base.account_ids.length===0&&accountsNow.current.length===0){setAccounts(suggestedAccountIds(a.accounts,eligibleAccounts.map(x=>x.id)));setSuggested(suggestedAccountIds(a.accounts,eligibleAccounts.map(x=>x.id)).length)}
  },()=>{});return()=>{current=false}},[readActivity])
  const activityFor=(id:string)=>activity.find(a=>a.account_id===id)
  const [result,setResult]=useState<AssistanceResult|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false)
  const [tryChange,setTryChange]=useState(false),[amount,setAmount]=useState('0.00'),[destination,setDestination]=useState<WhatIf['destination']>('unassigned'),[goalName,setGoalName]=useState(''),[goalTarget,setGoalTarget]=useState(''),[goalDate,setGoalDate]=useState('')
  const [inputs,setInputs]=useState<AssistanceReview>(),[reviewBasis,setReviewBasis]=useState<AssistanceResult|null>(null)
  const [goalOpening,setGoalOpening]=useState(''),[assumptions,setAssumptions]=useState(false),[futureIntent,setFutureIntent]=useState(false)
  useEffect(()=>setAssumptions(false),[result,amount,destination,goalName,goalTarget,goalDate,goalOpening,reviewed,scopeConfirmed,recent,futureIntent,inputs])
  const request={timezone:base.timezone,frequency,start_date:start,...(frequency==='fortnightly'?{anchor}:{}),account_ids:accounts}
  function reset(){setActivePart(1);setResult(null);setReviewed(false);setScopeConfirmed(false);setFutureIntent(false);setAssumptions(false);setError('')}
  async function check(){
    if(!start){setError('Choose a valid date for the budget period.');return}
    if(!accounts.length){setError('Choose at least one AUD activity account, or continue with your own amounts.');return}
    setChecking(true);setError('')
    try{const next=await b.assistedSetup(request);setResult(next);setReviewBasis(next);setScopeConfirmed(false);setReviewed(false);setFutureIntent(false);setAssumptions(false)}catch(e){setError(e instanceof Error?e.message:'History assistance is unavailable.')}
    finally{setChecking(false)}
  }
  // Re-check once the refreshed workspace (new source revision or account list) has rendered.
  const [recheck,setRecheck]=useState(false),[addedBills,setAddedBills]=useState<string[]>([])
  useEffect(()=>{if(recheck&&b.readState==='ready'&&!b.loading&&!b.busy&&!checking){setRecheck(false);void check()}},[recheck,b.readState,b.loading,b.busy,checking,s.source_revision,accounts])
  // 'Yes' needs at least one thing named; 'Not sure' may leave all unticked. Either way history still fills the rest.
  const answered=recent==='no'||recent==='unsure'||recent==='yes'&&(changed.pay||changed.bills||changed.spending)
  const changedKey=recent==='no'?'none':`${+changed.pay}${+changed.bills}${+changed.spending}`
  const stale=!!result&&(result.source_revision!==s.source_revision||b.readState!=='ready')
  useEffect(()=>{if(stale){setScopeConfirmed(false);setReviewed(false);setAssumptions(false)}},[stale])
  // Inputs arrive unconfirmed; the one final review confirms them. Problems are
  // checked as if confirmed so only real data issues show before that.
  const draft=inputs&&confirmReview(inputs),signature=reviewSignature(inputs)
  useEffect(()=>{setReviewed(false);setScopeConfirmed(false)},[signature])
  const inputProblem=result?reviewProblem(base,result,draft):null
  let effective=result
  if(result&&!inputProblem&&draft)effective=reviewedResult(base,result,draft)
  const parsedAmount=parseBudgetMoney(amount),parsedTarget=goalTarget?parseBudgetMoney(goalTarget):null
  const parsedOpening=parseBudgetMoney(goalOpening)
  const change:WhatIf={as_of:result?.target?today({now:()=>new Date()},result.target.timezone):undefined,amount_cents:parsedAmount??-1,destination,goal_name:goalName,goal_target_cents:parsedTarget??undefined,goal_needed_by:goalDate||undefined,goal_opening_cents:parsedOpening??undefined,reviewed:scopeConfirmed&&reviewed&&answered,assumptions_confirmed:assumptions,future_period_confirmed:futureIntent}
  let preview:ReturnType<typeof previewWhatIf>|null=null,previewError=''
  if(result&&!inputProblem&&tryChange&&parsedAmount!==null)try{preview=previewWhatIf(effective!,change)}catch(e){previewError=(e as Error).message}
  let goalOutcome:ReturnType<typeof goalWhatIfOutcome>=null
  if(result&&preview&&destination==='goal'&&parsedAmount!==null&&parsedTarget)try{goalOutcome=goalWhatIfOutcome(effective!,change)}catch(e){previewError=(e as Error).message}
  const outcomeReason=result&&tryChange&&destination==='goal'?goalOutcomeReason(effective!,change):null
  function useDraft(){
    if(stale){setError('Activity changed or could not be refreshed. Check history again before using this draft.');return}
    if(inputProblem){setError(inputProblem);return}
    if(!result?.eligible||!scopeConfirmed||!reviewed||!answered){setError('Answer the recent-changes question and tick the final check before using this draft.');return}
    if(tryChange&&(parsedAmount===null||!preview||destination==='goal'&&(!goalName.trim()||parsedOpening===null)||invalidTarget)){setError(previewError||'Check the optional change and confirm any opening goal reserve, including 0 if none.');return}
    try{onUse(applyAssistance(base,result,tryChange?change:undefined,draft))}
    catch(e){setError(e instanceof Error?e.message:'These suggestions could not be used.')}
  }
  const manual=()=>{if(!start){setError('Choose a valid date for the budget period.');return}try{onManual({...manualReviewSetup(base,result??reviewBasis,inputs,tryChange?change:undefined),frequency,start_date:start,anchor,account_ids:accounts})}catch(e){setError((e as Error).message)}}
  let fundingGap:number|null=null,capacity:number|null=null
  if(result)try{capacity=assistanceCapacity(effective!);fundingGap=Math.max(0,-capacity)}catch{}
  const invalidTarget=destination==='goal'&&!!goalTarget.trim()&&(!parsedTarget||parsedTarget<=0)
  const observedMedian=result?.observations?.everyday.median_cents??result?.suggestions.everyday_cents??null
  const eligible=!!result&&assistanceEligible(result),coverageShown=!!result&&!eligible&&result.missing_coverage.length>0
  const reasons=result?assistanceReasons(result,{coverageShown}):[]
  function visit(part:number){const section=root.current?.querySelector<HTMLDetailsElement>(`[data-assistance-part="${part}"]`);if(section){setActivePart(part);section.open=true;const title=section.querySelector('summary');title?.focus();title?.scrollIntoView({block:'start',behavior:'auto'})}}
  const accountName=(id:string)=>s.accounts.find(a=>a.id===id)?.name??'Unavailable account'
  return <section ref={root} className="budget-assistance" aria-label="Budget assistance" aria-busy={checking}>
    <p className="budget-assistance-lead">We’ll suggest a budget from your past spending.</p>
    <p className="body-copy text-muted">You check and change everything before anything is saved.</p>
    <nav className="budget-assistance-nav" aria-label="Assistance sections">
      <ol className="budget-assistance-rail">
        {assistanceSteps.map(({part,label,icon})=><li key={part}>
          <button type="button" className="budget-assistance-milestone" aria-label={`${part} · ${label}`}
            aria-current={(eligible?activePart:1)===part?'step':undefined} disabled={part!==1&&!eligible} onClick={()=>visit(part)}>
            <span className="budget-assistance-node">
              <AssistanceStepIcon path={icon}/>
            </span>
            <span>{label}</span>
          </button>
        </li>)}
      </ol>
    </nav>
    {stale&&<p role="status" className="outcome-panel text-warn">Activity changed or the latest read is unavailable. Your choices are kept. Check history again before using this draft.</p>}
    <details open data-assistance-part="1" className="budget-assistance-section" onFocusCapture={()=>setActivePart(1)}>
      <summary>1. Check your history</summary><div className="space-y-5">
    {!result&&<><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2"><span className="field-label">Budget rhythm</span><Select value={frequency} onChange={v=>{setFrequency(v as Setup['frequency']);reset()}}><option value="monthly">Monthly</option><option value="fortnightly">Every two weeks</option></Select></label>
      {frequency==='fortnightly'&&<label className="grid gap-2"><span className="field-label">Two-week cycle start date</span><DateInput value={anchor} onChange={v=>{setAnchor(v);reset()}}/></label>}</div>
      <BudgetStartCalendar value={start} config={frequency==='monthly'?{frequency,timezone:base.timezone}:{frequency,timezone:base.timezone,anchor}}
        onChange={date=>{setStart(date);reset()}}/>
      <fieldset className="budget-assistance-accounts">
        <legend className="field-label">Accounts whose activity should be included</legend>
        {eligibleAccounts.length===0?<p className="detail-copy text-muted">No AUD accounts are available.</p>:<>
          <div className="budget-assistance-account-bar">
            <label>
              <input type="checkbox" checked={allSelected} disabled={eligibleAccounts.length>assistanceAccountLimit}
                ref={input=>{if(input)input.indeterminate=!allSelected&&selectedAccounts.length>0}}
                onChange={event=>{setAccounts(event.target.checked?eligibleAccounts.map(account=>account.id):[]);reset()}}/>
              Select all
            </label>
            <span className="detail-copy text-muted" role="status">{selectedAccounts.length} of {eligibleAccounts.length} selected</span>
          </div>
          {suggested!==null&&<p className="detail-copy text-muted">We selected {suggested} {suggested===1?'account':'accounts'} you spend from. Investment, loan and unused accounts are left out; tick any you want included.</p>}
          {eligibleAccounts.length>assistanceAccountLimit&&<p className="detail-copy text-muted">Choose up to {assistanceAccountLimit} AUD accounts individually.</p>}
          {eligibleAccounts.map(account=><label className="budget-assistance-account-row" key={account.id}>
            <input type="checkbox" aria-label={`${account.name} · ${account.currency}`} checked={accounts.includes(account.id)}
              disabled={selectedAccounts.length>=assistanceAccountLimit&&!accounts.includes(account.id)}
              onChange={event=>{setAccounts(event.target.checked?[...selectedAccounts,account.id]:selectedAccounts.filter(id=>id!==account.id));reset()}}/>
            <span className="budget-assistance-account-name"><span>{account.name}</span>{activityLabel(activityFor(account.id))&&<span className="detail-copy text-muted">{activityLabel(activityFor(account.id))}</span>}</span><span className="detail-copy text-muted">{account.currency}</span>
          </label>)}
        </>}
      </fieldset>
      <div className="budget-assistance-actions"><Button onClick={()=>void check()} disabled={checking||!b.canWrite||b.loading}>{checking?'Checking complete history…':'Check my history'}</Button><Button variant="ghost" onClick={manual}>Enter my own amounts</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div></>}
    {result&&<>
      <p className="detail-copy">{result.target&&<>Budget for {at(result.target.start_date)} – {at(addDays(result.target.end_date,-1))}, </>}using {result.account_ids.length} {result.account_ids.length===1?'account':'accounts'}.</p>
<div className={`outcome-panel ${eligible?'':'text-warn'}`}><h3 className="font-semibold">{eligible?'Your history is ready':coverageShown?'Confirm your account history':'History needs more information'}</h3>{!coverageShown&&<p className="body-copy mt-2">{result.frequency==='monthly'
        ?<>Based on {result.period_count} complete {result.period_count===1?'month':'months'}{result.periods.length>0&&<> ({monthOf(result.periods[0].start_date)} to {monthOf(result.periods[result.periods.length-1].start_date)})</>}.</>
        :<>Based on {result.period_count} complete two-week periods across {calendarMonthCount(result)??0} full months.</>}{!eligible&&<> Suggestions need at least {result.frequency==='monthly'?'3 complete months':'6 two-week periods and 3 full months'}.</>}</p>}{reasons.map(r=><p key={r} className="detail-copy mt-2">{r}</p>)}{checking&&<p role="status" className="detail-copy mt-2">Checking your history again…</p>}{coverageShown&&<div className="mt-3"><BudgetCoverageReadiness result={result} today={today({now:()=>new Date()},base.timezone)} accountName={accountName} activity={activity}
        onConfirmed={()=>setRecheck(true)} onLeaveOut={ids=>{setAccounts(selectedAccounts.filter(x=>!ids.includes(x)));setRecheck(true)}}/></div>}</div>
      {result.suggestions.everyday_cents===null&&eligible&&<p className="outcome-panel text-warn">In a typical month your refunds were bigger than your everyday spending, so we can’t suggest an everyday amount. Choose your own in the next step. Refunds aren’t counted as extra money to spend.</p>}
      {result.target?.unassigned_credit_cents!==undefined&&result.target.unassigned_credit_cents!==null&&result.target.unassigned_credit_cents<0&&<p className="detail-copy">This budget already has {fmtCents(-result.target.unassigned_credit_cents)} in refunds. They lower your spending total but aren’t counted as extra money to spend.</p>}
      <details className="budget-assistance-evidence"><summary>How we worked this out</summary><div className="space-y-3 pt-2">
        <p>We looked at the complete {result.frequency==='monthly'?'months':'two-week periods'} before your budget starts, using {result.account_ids.map(accountName).join(', ')||'no accounts'}.</p>
        {result.periods.length>0&&<ul>{result.periods.map(p=><li key={p.start_date} className="flex flex-wrap justify-between gap-3">
          <span>{result.frequency==='monthly'?monthOf(p.start_date):`${at(p.start_date)} – ${at(addDays(p.end_date,-1))}`}</span>
          <span>everyday {fmtCents(p.everyday_cents??p.expense_cents)}{p.recurring_expense_cents?` · bills ${fmtCents(p.recurring_expense_cents)}`:''} · pay {fmtCents(p.income_cents)}</span></li>)}</ul>}
        <p>Your typical amount is the middle value of these, so one unusual {result.frequency==='monthly'?'month':'fortnight'} doesn’t skew it.{result.observations?.everyday&&result.observations.everyday.min_cents!==null&&result.observations.everyday.max_cents!==null&&<> Everyday spending ranged from {fmtCents(result.observations.everyday.min_cents)} to {fmtCents(result.observations.everyday.max_cents)}.</>} Refunds reduce spending. Transfers between your own accounts and pending transactions aren’t counted.</p>
        <p>{result.recurring.length?<>Bills you’ve confirmed are taken out of everyday spending: {result.recurring.map(r=>r.merchant_key).join(', ')}.</>:'No confirmed bills yet, so regular bills are still inside everyday spending. Add them above to separate them.'}</p>
        {result.missing_coverage.length>0&&<><p>These dates weren’t confirmed as complete, so they were left out rather than counted as $0:</p><ul>{result.missing_coverage.map((gap,i)=><li key={i}>{accountName(gap.account_id)}: {at(gap.start_date)} – {at(addDays(gap.end_date,-1))}</li>)}</ul></>}
        {result.method!==BUDGET_ASSIST_METHOD&&<p className="text-warn">This check used an older method. Check history again before using its amounts.</p>}
      </div></details>
      {eligible&&<><p className="body-copy">In a typical {result.frequency==='monthly'?'month':'two weeks'} you take home <strong>{fmtCents(result.suggestions.income_cents)}</strong>{observedMedian!==null&&<> and spend about <strong>{fmtCents(observedMedian)}</strong> on everyday things</>}{result.suggestions.bills_cents>0&&<>, plus <strong>{fmtCents(result.suggestions.bills_cents)}</strong> in bills you’ve confirmed</>}.</p>
        <BudgetDetectedBills result={result} accountName={accountName} activity={activity} today={today({now:()=>new Date()},base.timezone)} onAdded={keys=>{setAddedBills(prev=>[...prev,...keys]);setRecheck(true)}}/>
        {result.variable&&<p className="outcome-panel text-warn">Your everyday spending changes a lot from {result.frequency==='monthly'?'month to month':'fortnight to fortnight'}{result.observations?.everyday&&result.observations.everyday.min_cents!==null&&result.observations.everyday.max_cents!==null&&<> ({fmtCents(result.observations.everyday.min_cents)} to {fmtCents(result.observations.everyday.max_cents)})</>}. Take a closer look at the everyday amount in the next step.</p>}
        <label className="grid gap-2"><span className="field-label">Have your income, bills or regular spending changed recently?</span><Select value={recent} onChange={v=>{setRecent(v);setInputs(undefined);setReviewed(false)}}><option value="">Choose an answer</option><option value="no">No, things are about the same</option><option value="yes">Yes, something changed</option><option value="unsure">Not sure</option></Select></label>
        {recent&&recent!=='no'&&<fieldset className="outcome-panel space-y-2">
          <legend className="body-copy">{recent==='yes'?'What changed? We’ll leave those amounts for you to fill in and use your history for the rest.':'Tick anything that might have changed. We’ll leave those for you to fill in and use your history for the rest.'}</legend>
          {([['pay','My take-home pay'],['bills','A regular bill, like rent or insurance'],['spending','My everyday spending']] as const).map(([k,label])=><label key={k} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={changed[k]} onChange={e=>{setChanged(c=>({...c,[k]:e.target.checked}));setInputs(undefined);setReviewed(false)}}/><span>{label}</span></label>)}
          {recent==='yes'&&!answered&&<p className="detail-copy text-warn">Tick at least one, or choose “No” if nothing changed.</p>}
        </fieldset>}
</>}
      {!eligible&&<>{coverageShown&&<details className="budget-assistance-evidence"><summary>Confirm dates I know are complete</summary><div className="space-y-3 pt-3"><BudgetHistoryCoverage/><Button variant="ghost" disabled={checking||!b.canWrite} onClick={()=>void check()}>Check history again</Button></div></details>}<Button variant={coverageShown?'ghost':'primary'} onClick={manual}>Enter my own amounts</Button></>}
    </>}
      </div>
    </details>
    {result&&eligible&&<>
      <details open data-assistance-part="2" className="budget-assistance-section" onFocusCapture={()=>setActivePart(2)}>
        <summary>2. Check your amounts</summary><div className="space-y-5">
          <p className="body-copy">Everything is filled in from your history. Change anything that doesn’t look right.</p>
        {answered&&<><BudgetAssistanceInputs key={`${result.fingerprint}|${changedKey}`} changed={recent==='no'?undefined:changed} base={base} result={result} initialReview={inputs} preselect={addedBills} onReview={setInputs}/>{inputProblem&&<p role="status" className="detail-copy text-warn">{inputProblem}</p>}{!inputProblem&&effective?.projection_blocker&&<p role="status" className="detail-copy text-warn">{effective.projection_blocker}</p>}{!inputProblem&&inputs?.costs.filter(c=>c.selected&&c.type==='reserve').map(c=>{const f=reserveCostFunding(c,{...base,frequency:result.frequency,start_date:result.start_date,anchor:result.anchor},result.target?.as_of);return f?<p key={c.line_id} className={`detail-copy ${f.shortfall?'text-warn':''}`}>{c.name}: {f.dates.length} more set-asides before it’s due on {at(c.due_date!)}. {f.shortfall?`At this amount you’ll be ${fmtCents(f.shortfall)} short — set aside more each budget.`:'You’ll have enough in time.'}</p>:null})}
          <label className="flex min-h-11 items-start gap-3"><input className="mt-1" type="checkbox" checked={tryChange} onChange={e=>setTryChange(e.target.checked)}/><span>Try moving some everyday money elsewhere (optional)</span></label>
          {tryChange&&<div className="glass-subtle space-y-4">{result.target&&<p className="body-copy">{at(result.target.start_date)} – {at(addDays(result.target.end_date,-1))}. {result.target.start_date>result.target.as_of?'This budget hasn’t started yet.':result.target.settled_everyday_cents===null?'We can’t see all of this budget’s spending yet.':`You’ve spent ${fmtCents(result.target.settled_everyday_cents)} on everyday things so far, so you can only move what’s left.`}</p>}{result.target&&result.target.start_date>result.target.as_of&&<label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={futureIntent} onChange={e=>setFutureIntent(e.target.checked)}/><span>Yes, this is for the budget starting {result.target?at(result.target.start_date):'later'}, not the current one.</span></label>}<label className="grid gap-2"><span className="field-label">Amount to move out of everyday spending</span><input className="budget-input" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="grid gap-2"><span className="field-label">Use it for</span><Select value={destination} onChange={v=>setDestination(v as WhatIf['destination'])}><option value="unassigned">Something I’ll decide later</option><option value="goal" disabled={!!base.assistance?.goal_intent}>A savings goal</option></Select></label>{destination==='goal'&&<div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2"><span className="field-label">Goal name</span><input className="budget-input" maxLength={60} value={goalName} onChange={e=>setGoalName(e.target.value)}/></label><label className="grid gap-2"><span className="field-label">Estimated target (optional)</span><input className="budget-input" inputMode="decimal" value={goalTarget} onChange={e=>setGoalTarget(e.target.value)}/></label><label className="grid gap-2"><span className="field-label">Needed by (optional)</span><DateInput value={goalDate} onChange={setGoalDate}/></label><label className="grid gap-2"><span className="field-label">Already set aside for this goal (AUD; enter 0 if none)</span><input className="budget-input" inputMode="decimal" value={goalOpening} onChange={e=>setGoalOpening(e.target.value)}/></label><label className="flex min-h-11 items-start gap-3 md:col-span-2"><input type="checkbox" checked={assumptions} onChange={e=>setAssumptions(e.target.checked)}/><span>I’ve checked my pay, bills and what’s already saved for this goal. These are plans, not money already saved.</span></label></div>}{preview&&<p className="body-copy">Everyday spending goes from {fmtCents(preview.everyday_before)} to {fmtCents(preview.everyday_after)}, and {destination==='goal'?`${fmtCents(preview.goal_cents)} goes towards ${goalName.trim()||'your goal'}`:`${fmtCents(preview.unallocated_cents)} is left for you to decide`}. No money moves.</p>}{outcomeReason&&<p role="status" className="detail-copy text-warn">{outcomeReason}</p>}{goalOutcome&&<div className="outcome-panel"><strong>If you keep this contribution</strong><p className="body-copy mt-1">{goalOutcome.estimate.state==='covered'?'The target is covered by the opening reserve and current planned contribution.':goalOutcome.estimate.state==='estimated'?`About ${goalOutcome.estimate.contributionsNeeded} more contributions, reaching it around ${at(goalOutcome.estimate.estimatedDate)}.`:'It would take more than a year at this amount.'}</p>{goalOutcome.deadline&&<p className="detail-copy mt-1">{goalOutcome.deadline.shortfall===0?`You’d reach it by ${at(goalOutcome.needed_by!)}.`:`You’d be ${fmtCents(goalOutcome.deadline.shortfall!)} short by ${at(goalOutcome.needed_by!)}, with ${goalOutcome.deadline.dates.length} contributions left.`}</p>}{goalOutcome.needed_by&&!goalOutcome.deadline&&<p className="detail-copy">That date is more than a year away, so we haven’t estimated it.</p>}<p className="detail-copy text-muted">An estimate, not a promise or money already saved.</p></div>}{previewError&&<p role="alert" className="text-neg">{previewError}</p>}</div>}</>}
        {!answered&&<p className="detail-copy">Answer “Have your income, bills or regular spending changed recently?” in step 1 to see your amounts.</p>}
        </div>
      </details>
      <details open data-assistance-part="3" className="budget-assistance-section" onFocusCapture={()=>setActivePart(3)}>
        <summary>3. Review your draft{!!fundingGap&&<span className="block detail-copy text-warn">Funding gap: {fmtCents(fundingGap)}</span>}</summary><div className="space-y-5">
          {!inputProblem&&effective&&<>
            <dl className="budget-assistance-receipt" aria-label="Reviewed planning amounts">
              <div><dt>Take-home pay</dt><dd>{fmtCents(effective.suggestions.income_cents)}</dd></div>
              <div><dt>Everyday spending{tryChange&&preview?' after the change':''}</dt><dd>{fmtCents(tryChange&&preview?preview.everyday_after:effective.suggestions.everyday_cents!)}</dd></div>
              <div><dt>Bills and set-asides</dt><dd>{fmtCents(effective.suggestions.bills_cents)}</dd></div>
              {capacity!==null&&<div><dt>{capacity+(tryChange&&preview?preview.unallocated_cents:0)<0?'Over your pay by':'Left to plan'}</dt><dd>{fmtCents(Math.abs(capacity+(tryChange&&preview?preview.unallocated_cents:0)))}</dd></div>}
            </dl>
            <p className="detail-copy">Savings goals you already have are kept as they are.{tryChange&&preview&&destination==='goal'&&<> {goalName.trim()||'Your new goal'} gets {fmtCents(preview.goal_cents)} each budget.</>}</p>
          </>}
          {!!fundingGap&&<p role="status" className="outcome-panel text-warn">This plan has a funding gap: it uses {fmtCents(fundingGap)} more than your take-home pay. Lower an amount or check your pay. You can still use the draft and fix it in the editor.</p>}
          {inputProblem&&<p className="detail-copy text-warn">{inputProblem}</p>}
          {answered&&<label className="flex min-h-11 items-start gap-3"><input className="mt-1" type="checkbox" checked={reviewed} onChange={e=>{setReviewed(e.target.checked);setScopeConfirmed(e.target.checked)}}/><span>I’ve checked these amounts, pay dates, bills and the accounts used. Changing anything above clears this tick.</span></label>}
          <div className="budget-assistance-actions"><Button onClick={useDraft} disabled={stale||!b.canWrite||!!inputProblem||!scopeConfirmed||!reviewed||!answered||tryChange&&(!preview||destination==='goal'&&(!goalName.trim()||parsedOpening===null)||invalidTarget)}>Use this draft</Button><Button variant="ghost" onClick={manual}>Enter my own amounts</Button><Button variant="ghost" onClick={()=>{setResult(null);setReviewed(false)}}>Check different history</Button></div>
          <p className="detail-copy text-muted">Using this draft opens it in the editor. Nothing is saved or started until you choose to, and no money moves.</p>
        </div>
      </details>
    </>}
    {result&&<div className="budget-assistance-actions">{!eligible&&<Button variant="ghost" onClick={()=>setResult(null)}>Check different history</Button>}<Button variant="ghost" onClick={onClose}>Back to my draft</Button></div>}
    {error&&<p role="alert" className="text-neg">{error}</p>}
  </section>
}
