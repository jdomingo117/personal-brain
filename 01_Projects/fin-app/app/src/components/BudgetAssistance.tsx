import BudgetAssistanceInputs from './BudgetAssistanceInputs'
import {manualReviewSetup,reserveCostFunding,reviewProblem,reviewedResult,type AssistanceReview} from '../lib/budgetAssistanceReview'
import {useEffect,useRef,useState} from 'react'
import {Button,DateInput,Select} from './Controls'
import {useBudget} from '../contexts/BudgetContext'
import {fmtCents} from '../data'
import {addDays,today} from '../lib/budget'
import {BUDGET_ASSIST_METHOD,applyAssistance,assistanceReasons,assistanceEligible,calendarMonthCount,assistanceCapacity,goalOutcomeReason,goalWhatIfOutcome,previewWhatIf,type AssistanceResult,type WhatIf} from '../lib/budgetAssistance'
import {blankSetup,moneyEntry,parseBudgetMoney,type Setup} from '../lib/budgetWorkspace'

export default function BudgetAssistance({baseSetup,onUse,onManual,onClose}:{baseSetup?:Setup;onUse:(setup:Setup)=>void;onManual:(setup:Setup)=>void;onClose:()=>void}){
  const b=useBudget(),s=b.snapshot!
  const root=useRef<HTMLElement>(null)
  const [base]=useState(()=>structuredClone(baseSetup??blankSetup())),[frequency,setFrequency]=useState<Setup['frequency']>(base.frequency),[start,setStart]=useState(base.start_date),[anchor,setAnchor]=useState(base.anchor??base.start_date)
  const [accounts,setAccounts]=useState<string[]>(base.account_ids),[recent,setRecent]=useState(''),[scopeConfirmed,setScopeConfirmed]=useState(false)
  const [result,setResult]=useState<AssistanceResult|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false)
  const [tryChange,setTryChange]=useState(false),[amount,setAmount]=useState('0.00'),[destination,setDestination]=useState<WhatIf['destination']>('unassigned'),[goalName,setGoalName]=useState(''),[goalTarget,setGoalTarget]=useState(''),[goalDate,setGoalDate]=useState('')
  const [inputs,setInputs]=useState<AssistanceReview>(),[reviewBasis,setReviewBasis]=useState<AssistanceResult|null>(null)
  const [goalOpening,setGoalOpening]=useState(''),[assumptions,setAssumptions]=useState(false),[futureIntent,setFutureIntent]=useState(false)
  useEffect(()=>setAssumptions(false),[result,amount,destination,goalName,goalTarget,goalDate,goalOpening,reviewed,scopeConfirmed,recent,futureIntent,inputs])
  const request={timezone:base.timezone,frequency,start_date:start,...(frequency==='fortnightly'?{anchor}:{}),account_ids:accounts}
  function reset(){setResult(null);setReviewed(false);setScopeConfirmed(false);setFutureIntent(false);setAssumptions(false);setError('')}
  async function check(){
    if(!accounts.length){setError('Choose at least one AUD activity account, or continue with your own amounts.');return}
    setChecking(true);setError('')
    try{const next=await b.assistedSetup(request);setResult(next);setReviewBasis(next);setScopeConfirmed(false);setReviewed(false);setFutureIntent(false);setAssumptions(false)}catch(e){setError(e instanceof Error?e.message:'History assistance is unavailable.')}
    finally{setChecking(false)}
  }
  const stale=!!result&&(result.source_revision!==s.source_revision||b.readState!=='ready')
  useEffect(()=>{if(stale){setScopeConfirmed(false);setReviewed(false);setAssumptions(false)}},[stale])
  const inputProblem=result?reviewProblem(base,result,inputs):null
  let effective=result
  if(result&&!inputProblem&&inputs)effective=reviewedResult(base,result,inputs)
  const parsedAmount=parseBudgetMoney(amount),parsedTarget=goalTarget?parseBudgetMoney(goalTarget):null
  const parsedOpening=parseBudgetMoney(goalOpening)
  const change:WhatIf={as_of:result?.target?today({now:()=>new Date()},result.target.timezone):undefined,amount_cents:parsedAmount??-1,destination,goal_name:goalName,goal_target_cents:parsedTarget??undefined,goal_needed_by:goalDate||undefined,goal_opening_cents:parsedOpening??undefined,reviewed:scopeConfirmed&&reviewed&&recent==='no',assumptions_confirmed:assumptions,future_period_confirmed:futureIntent}
  let preview:ReturnType<typeof previewWhatIf>|null=null,previewError=''
  if(result&&!inputProblem&&tryChange&&parsedAmount!==null)try{preview=previewWhatIf(effective!,change)}catch(e){previewError=(e as Error).message}
  let goalOutcome:ReturnType<typeof goalWhatIfOutcome>=null
  if(result&&preview&&destination==='goal'&&parsedAmount!==null&&parsedTarget)try{goalOutcome=goalWhatIfOutcome(effective!,change)}catch(e){previewError=(e as Error).message}
  const outcomeReason=result&&tryChange&&destination==='goal'?goalOutcomeReason(effective!,change):null
  function useDraft(){
    if(stale){setError('Activity changed or could not be refreshed. Check history again before using this draft.');return}
    if(inputProblem){setError(inputProblem);return}
    if(!result?.eligible||!scopeConfirmed||!reviewed||recent!=='no'){setError('Confirm the accounts, recent changes and suggested amounts before using this draft.');return}
    if(tryChange&&(parsedAmount===null||!preview||destination==='goal'&&(!goalName.trim()||parsedOpening===null)||invalidTarget)){setError(previewError||'Check the optional change and confirm any opening goal reserve, including 0 if none.');return}
    try{onUse(applyAssistance(base,result,tryChange?change:undefined,inputs))}
    catch(e){setError(e instanceof Error?e.message:'These suggestions could not be used.')}
  }
  const manual=()=>{try{onManual({...manualReviewSetup(base,result??reviewBasis,inputs,tryChange?change:undefined),frequency,start_date:start,anchor,account_ids:accounts})}catch(e){setError((e as Error).message)}}
  let fundingGap:number|null=null,capacity:number|null=null
  if(result)try{capacity=assistanceCapacity(effective!);fundingGap=Math.max(0,-capacity)}catch{}
  const invalidTarget=destination==='goal'&&!!goalTarget.trim()&&(!parsedTarget||parsedTarget<=0)
  const observedMedian=result?.observations?.everyday.median_cents??result?.suggestions.everyday_cents??null
  const reasons=result?assistanceReasons(result):[],eligible=!!result&&assistanceEligible(result)
  function visit(part:number){const section=root.current?.querySelector<HTMLDetailsElement>(`[data-assistance-part="${part}"]`);if(section){section.open=true;const title=section.querySelector('summary');title?.focus();title?.scrollIntoView({block:'start',behavior:'auto'})}}
  const accountName=(id:string)=>s.accounts.find(a=>a.id===id)?.name??'Unavailable account'
  return <section ref={root} className="budget-assistance" aria-label="Budget assistance" aria-busy={checking}>
    <p className="budget-assistance-lead">Start with your history. Make the plan your own.</p>
    <p className="body-copy text-muted">Check the evidence, choose your amounts, then review an editable draft.</p>
    <nav className="budget-assistance-nav" aria-label="Assistance sections">
      <Button variant="ghost" onClick={()=>visit(1)}>1 · Check history</Button>
      <Button variant="ghost" disabled={!eligible} onClick={()=>visit(2)}>2 · Amounts & one change</Button>
      <Button variant="ghost" disabled={!eligible} onClick={()=>visit(3)}>3 · Review draft</Button>
    </nav>
    {stale&&<p role="status" className="outcome-panel text-warn">Activity changed or the latest read is unavailable. Your choices are kept. Check history again before using this draft.</p>}
    <details open data-assistance-part="1" className="budget-assistance-section">
      <summary>1. Check your history</summary><div className="space-y-5">
    {!result&&<><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2"><span className="field-label">Budget rhythm</span><Select value={frequency} onChange={v=>{setFrequency(v as Setup['frequency']);reset()}}><option value="monthly">Monthly</option><option value="fortnightly">Every two weeks</option></Select></label>
      <label className="grid gap-2"><span className="field-label">Start with the period containing</span><DateInput value={start} onChange={v=>{setStart(v);reset()}}/></label>
      {frequency==='fortnightly'&&<label className="grid gap-2"><span className="field-label">Two-week cycle start date</span><DateInput value={anchor} onChange={v=>{setAnchor(v);reset()}}/></label>}</div>
      <fieldset><legend className="field-label mb-2">Accounts whose activity should be included</legend>{s.accounts.filter(a=>a.currency==='AUD').map(a=><label key={a.id} className="flex min-h-11 items-center gap-3 py-2"><input type="checkbox" checked={accounts.includes(a.id)} onChange={e=>{setAccounts(e.target.checked?[...accounts,a.id]:accounts.filter(id=>id!==a.id));reset()}}/>{a.name} · AUD</label>)}</fieldset>
      <div className="budget-assistance-actions"><Button onClick={()=>void check()} disabled={checking||!b.canWrite||b.loading}>{checking?'Checking complete history…':'Check my history'}</Button><Button variant="ghost" onClick={manual}>Enter my own amounts</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div></>}
    {result&&<>
      <p className="detail-copy">Selected accounts: {result.account_ids.map(accountName).join(', ')||'None'}. {result.target&&<>Budget dates: {result.target.start_date} – {addDays(result.target.end_date,-1)} · AUD.</>}</p>
<div className={`outcome-panel ${eligible?'':'text-warn'}`}><h3 className="font-semibold">{eligible?'Enough complete history for a starting point':'History needs more information'}</h3><p className="body-copy mt-2">{result.period_count} complete {result.frequency==='monthly'?'months':'two-week periods'} used. Missing periods were excluded, never filled with zero.</p>{result.frequency==='fortnightly'&&<p className="body-copy mt-2">{calendarMonthCount(result)??'Unknown'} complete calendar months in the separate six-month check; at least 3 are required as well as 6 covered two-week periods.</p>}{reasons.map(r=><p key={r} className="detail-copy mt-2">{r}</p>)}</div>
      {result.suggestions.everyday_cents===null&&eligible&&<p className="outcome-panel text-warn">The observed median includes more credits than spending. Choose your own non-negative everyday amount or keep a reviewed existing allowance. These credits are observations, not new income or spending capacity.</p>}
      {result.target?.unassigned_credit_cents!==undefined&&result.target.unassigned_credit_cents!==null&&result.target.unassigned_credit_cents<0&&<p className="detail-copy">Unassigned credits in the selected period: {fmtCents(result.target.unassigned_credit_cents)}. They reconcile net expense but do not free everyday room before matching.</p>}
      <details><summary className="min-h-11 cursor-pointer py-2">See dates, method and regular costs</summary><ul>{result.periods.map(p=><li key={p.start_date} className="flex flex-wrap justify-between gap-3 py-2"><span>{p.label}</span><span>{fmtCents(p.expense_cents)} signed net spending · {p.everyday_cents!==undefined?`${fmtCents(p.everyday_cents)} everyday net · `:''}{fmtCents(p.income_cents)} earned income</span></li>)}</ul>{result.frequency==='fortnightly'&&result.calendar_months&&<p className="detail-copy">Complete calendar-month evidence: {result.calendar_months.map(month=>`${month.start_date} – ${addDays(month.end_date,-1)}`).join('; ')||'None'}.</p>}<p className="detail-copy text-muted">{result.method===BUDGET_ASSIST_METHOD?'Everyday observations use signed net expense after confirmed regular-cost effects. Positive and negative periods stay in the exact-cent median; half-cent ties round away from zero. Income is a separate earned-income observation.':'These observations use an older calculation method. Check history again before using a history-based allowance.'} Confirmed recurring schedules use their actual dates in the new budget period.</p>{result.recurring.length?<ul>{result.recurring.map(r=><li key={r.id} className="py-1">{r.merchant_key} · {r.cadence} · {fmtCents(r.period_cents)} in this period</li>)}</ul>:<p className="detail-copy">No confirmed recurring schedules were used. Review bills and annual costs yourself.</p>}</details>
      {result.observations?.everyday&&<p className="detail-copy">Observed everyday range: {result.observations.everyday.min_cents===null?'Unavailable':fmtCents(result.observations.everyday.min_cents)} to {result.observations.everyday.max_cents===null?'Unavailable':fmtCents(result.observations.everyday.max_cents)}. This is history, not a target range or a forecast.</p>}
      <details className="budget-assistance-evidence"><summary>Accounts and excluded dates</summary><ul>{result.account_ids.map(id=><li key={id}>{accountName(id)} · AUD</li>)}</ul>{result.missing_coverage.length?<ul>{result.missing_coverage.map((gap,i)=><li key={i}>{accountName(gap.account_id)}: {gap.start_date} – {addDays(gap.end_date,-1)} excluded; coverage is incomplete.</li>)}</ul>:<p>No selected history windows were excluded for missing coverage.</p>}</details>
      {eligible&&<><div className="grid gap-3 md:grid-cols-3"><div className="outcome-panel"><span className="micro text-muted">Observed earned income</span><strong className="block mt-1">{fmtCents(result.suggestions.income_cents)}</strong></div><div className="outcome-panel"><span className="micro text-muted">Observed everyday median</span><strong className="block mt-1">{observedMedian===null?'Unavailable':fmtCents(observedMedian)}</strong></div><div className="outcome-panel"><span className="micro text-muted">Confirmed schedule reference</span><strong className="block mt-1">{fmtCents(result.suggestions.bills_cents)}</strong></div></div>
        {result.variable&&<p className="outcome-panel text-warn">Spending varies a lot. No high-spend period was removed; give the everyday amount another look in the editor.</p>}
        <label className="flex min-h-11 items-start gap-3"><input className="mt-1" type="checkbox" checked={scopeConfirmed} onChange={e=>setScopeConfirmed(e.target.checked)}/><span>These are the accounts and dated periods I want to use.</span></label>
        <label className="grid gap-2"><span className="field-label">Have your income, bills or regular spending changed recently?</span><Select value={recent} onChange={v=>{setRecent(v);setReviewed(false)}}><option value="">Choose an answer</option><option value="no">No</option><option value="yes">Yes — I’ll use my own amounts</option><option value="unsure">Not sure — I’ll use my own amounts</option></Select></label>
        {recent&&recent!=='no'&&<p className="outcome-panel text-warn">History may not represent life now. Continue with your own amounts; the checked dates remain visible, but no suggestion will be applied.</p>}
</>}
      {!eligible&&<Button onClick={manual}>Enter my own amounts</Button>}
    </>}
      </div>
    </details>
    {result&&eligible&&<>
      <details open data-assistance-part="2" className="budget-assistance-section">
        <summary>2. Choose amounts and try one change</summary><div className="space-y-5">
          <p className="body-copy">Keep the parts of your draft that fit. Replace only the amounts you choose; an optional change never moves bank money.</p>
        {recent==='no'&&<><BudgetAssistanceInputs key={result.fingerprint} base={base} result={result} initialReview={inputs} onReview={setInputs}/>{inputProblem&&<p role="status" className="detail-copy text-warn">{inputProblem}</p>}{!inputProblem&&effective?.projection_blocker&&<p role="status" className="detail-copy text-warn">{effective.projection_blocker}</p>}{!inputProblem&&inputs?.costs.filter(c=>c.selected&&c.type==='reserve').map(c=>{const f=reserveCostFunding(c,{...base,frequency:result.frequency,start_date:result.start_date,anchor:result.anchor},result.target?.as_of);return f?<p key={c.line_id} className="detail-copy">{c.name}: {f.dates.length} remaining contribution dates before {c.due_date}; planned shortfall {fmtCents(f.shortfall??0)}.</p>:null})}
          <label className="flex min-h-11 items-start gap-3"><input className="mt-1" type="checkbox" checked={tryChange} onChange={e=>setTryChange(e.target.checked)}/><span>Try one optional change to this draft</span></label>
          {tryChange&&<div className="glass-subtle space-y-4">{result.target&&<p className="body-copy">Selected budget: {result.target.start_date} – {addDays(result.target.end_date,-1)}. {result.target.start_date>result.target.as_of?'This is a future period.':result.target.settled_everyday_cents===null?'Current-period spending is not fully known.':`Recorded settled spending before matching: ${fmtCents(result.target.settled_everyday_cents)}. Past spending stays recorded.`}</p>}{result.target&&result.target.start_date>result.target.as_of&&<label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={futureIntent} onChange={e=>setFutureIntent(e.target.checked)}/><span>This change is for the selected future budget. It does not reduce spending already recorded in the current period.</span></label>}<label className="grid gap-2"><span className="field-label">Amount to redirect from everyday spending</span><input className="budget-input" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="grid gap-2"><span className="field-label">Leave room for</span><Select value={destination} onChange={v=>setDestination(v as WhatIf['destination'])}><option value="unassigned">Something I’ll decide later</option><option value="goal" disabled={!!base.assistance?.goal_intent}>A savings goal</option></Select></label>{destination==='goal'&&<div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2"><span className="field-label">Goal name</span><input className="budget-input" maxLength={60} value={goalName} onChange={e=>setGoalName(e.target.value)}/></label><label className="grid gap-2"><span className="field-label">Estimated target (optional)</span><input className="budget-input" inputMode="decimal" value={goalTarget} onChange={e=>setGoalTarget(e.target.value)}/></label><label className="grid gap-2"><span className="field-label">Needed by (optional)</span><DateInput value={goalDate} onChange={setGoalDate}/></label><label className="grid gap-2"><span className="field-label">Already set aside for this goal (AUD; enter 0 if none)</span><input className="budget-input" inputMode="decimal" value={goalOpening} onChange={e=>setGoalOpening(e.target.value)}/></label><label className="flex min-h-11 items-start gap-3 md:col-span-2"><input type="checkbox" checked={assumptions} onChange={e=>setAssumptions(e.target.checked)}/><span>I confirmed expected income and pay dates, essential and irregular costs, and this goal’s opening reserve. Contributions follow the selected budget dates; the current period’s planned contribution is counted once. These are planning amounts, not confirmed savings.</span></label></div>}{preview&&<p className="body-copy">Everyday changes from {fmtCents(preview.everyday_before)} to {fmtCents(preview.everyday_after)}. {destination==='goal'?`${fmtCents(preview.goal_cents)} becomes a planned goal reserve.`:`${fmtCents(preview.unallocated_cents)} stays unallocated.`} No money moves.</p>}{outcomeReason&&<p role="status" className="detail-copy text-warn">{outcomeReason}</p>}{goalOutcome&&<div className="outcome-panel"><strong>If you keep this contribution</strong><p className="body-copy mt-1">{goalOutcome.estimate.state==='covered'?'The target is covered by the opening reserve and current planned contribution.':goalOutcome.estimate.state==='estimated'?`${goalOutcome.estimate.contributionsNeeded} remaining contributions · estimated ${goalOutcome.estimate.estimatedDate}`:'More than a year at this amount.'}</p>{goalOutcome.deadline&&<p className="detail-copy mt-1">{goalOutcome.deadline.shortfall===0?`The planned amount reaches the target by ${goalOutcome.needed_by}.`:`Planned shortfall by ${goalOutcome.needed_by}: ${fmtCents(goalOutcome.deadline.shortfall!)}. ${goalOutcome.deadline.dates.length} remaining contribution dates.`}</p>}{goalOutcome.needed_by&&!goalOutcome.deadline&&<p className="detail-copy">That deadline is beyond the twelve-month illustration; no result is projected to it.</p>}<p className="detail-copy text-muted">This is a schedule calculation, not a guarantee or money already saved.</p></div>}{previewError&&<p role="alert" className="text-neg">{previewError}</p>}</div>}</>}
        {recent!=='no'&&<p className="detail-copy">Confirm recent changes in Check history to review individual inputs, or enter your own amounts.</p>}
        </div>
      </details>
      <details open data-assistance-part="3" className="budget-assistance-section">
        <summary>3. Review your draft{!!fundingGap&&<span className="block detail-copy text-warn">Funding gap: {fmtCents(fundingGap)}</span>}</summary><div className="space-y-5">
          {!inputProblem&&effective&&<>
            <dl className="budget-assistance-receipt" aria-label="Reviewed planning amounts">
              <div><dt>Expected income</dt><dd>{fmtCents(effective.suggestions.income_cents)}</dd></div>
              <div><dt>Everyday allowance{tryChange&&preview?' after change':''}</dt><dd>{fmtCents(tryChange&&preview?preview.everyday_after:effective.suggestions.everyday_cents!)}</dd></div>
              <div><dt>Other planned allowances</dt><dd>{fmtCents(effective.suggestions.bills_cents)}</dd></div>
              {capacity!==null&&<div><dt>Still to plan{tryChange&&preview?' after change':''}</dt><dd>{fmtCents(capacity+(tryChange&&preview?preview.unallocated_cents:0))}</dd></div>}
            </dl>
            <p className="detail-copy">Your reviewed draft keeps existing reserves and the cash top-up separate. {tryChange&&preview&&destination==='goal'&&<>The new goal adds {fmtCents(preview.goal_cents)} as a planned reserve.</>}</p>
          </>}
          {!!fundingGap&&<p role="status" className="outcome-panel text-warn">This draft has a funding gap of {fmtCents(fundingGap)}. Opening reserves are not new income. Review income and allowances before relying on a goal outcome; you can still edit a draft with a known gap.</p>}
          {inputProblem&&<p className="detail-copy text-warn">{inputProblem}</p>}
          {recent==='no'&&<label className="flex min-h-11 items-start gap-3"><input className="mt-1" type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>I checked the income, regular costs and everyday amount. I’ll edit anything that does not fit before saving.</span></label>}
          <div className="budget-assistance-actions"><Button onClick={useDraft} disabled={stale||!b.canWrite||!!inputProblem||!scopeConfirmed||!reviewed||recent!=='no'||tryChange&&(!preview||destination==='goal'&&(!goalName.trim()||parsedOpening===null)||invalidTarget)}>Use this draft</Button><Button variant="ghost" onClick={manual}>Enter my own amounts</Button><Button variant="ghost" onClick={()=>{setResult(null);setReviewed(false)}}>Check different history</Button></div>
          <p className="detail-copy text-muted">Using this draft only fills the setup editor. You will review, save and explicitly activate it separately. It does not change transactions or move money.</p>
        </div>
      </details>
    </>}
    {result&&<div className="budget-assistance-actions">{!eligible&&<Button variant="ghost" onClick={()=>setResult(null)}>Check different history</Button>}<Button variant="ghost" onClick={onClose}>Back to my draft</Button></div>}
    {error&&<p role="alert" className="text-neg">{error}</p>}
  </section>
}
