import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import { Button, DateInput, Select } from '../components/Controls'
import { OperationStatusPanel,OperationProgress } from '../components/OperationStatus'
import { useBudget } from '../contexts/BudgetContext'
import { useAuth } from '../contexts/AuthContext'
import { fmtCents } from '../data'
import { addDays, today } from '../lib/budget'
import { BUDGET_ENABLED, blankSetup, fromSnapshot, moneyEntry, parseBudgetMoney, readSavedSetup, setupPeriod, setupSummary, validateSetup, type Setup } from '../lib/budgetWorkspace'
import './budget.css'
import BudgetItems from '../components/BudgetItems'
import BudgetLifecycle from '../components/BudgetLifecycle'
import BudgetAttention from '../components/BudgetAttention'
import BudgetAssistance from '../components/BudgetAssistance'
import {convertAssistanceToManual} from '../lib/budgetAssistance'

const purposeNames={everyday:'Everyday spending',fixed:'Regular bills',reserve:'Set money aside',contribution:'Planned transfer'}
function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {
  return <label className="grid min-w-0 gap-2"><span className="field-label">{label}</span>{children}{hint&&<span className="detail-copy text-muted">{hint}</span>}</label>
}
function MoneyField({label,value,onChange,hint}:{label:string;value:number;onChange:(v:number)=>void;hint?:string}) {
  const [entry,setEntry]=useState(moneyEntry(value))
  return <Field label={label} hint={hint}><input className="budget-input tabular-nums" aria-label={label} inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?" value={entry}
    onChange={e=>{setEntry(e.target.value);const amount=parseBudgetMoney(e.target.value);e.target.setCustomValidity(amount===null?'Enter a positive amount or zero, using no more than two decimal places.':'');if(amount!==null)onChange(amount)}} /></Field>
}
function Balance({setup,both}:{setup:Setup;both:boolean}) {
  const b=useBudget()
  try {
    const summary=setupSummary(setup,b.snapshot?.details?.controls?.archives.map(a=>a.line_id))
    return <div className="outcome-panel space-y-2" aria-live="polite"><p>Expected income: <strong>{fmtCents(setup.income_cents)}</strong></p><p>Existing cash to use once: <strong>{fmtCents(setup.opening_drawdown_cents)}</strong></p><p>Total to plan with this period: <strong>{fmtCents(summary.current.resources)}</strong></p>
      <p>Planned across your allowances: <strong>{fmtCents(summary.current.allocated)}</strong></p>
      <p className={summary.current.fundingGap?'text-warn':'text-ink'}>{summary.current.fundingGap?'More planned than available':'Not yet given a job'}: <strong>{fmtCents(summary.current.fundingGap||summary.current.unallocated)}</strong></p>
      {both&&<p className={summary.future.fundingGap?'text-warn':'text-muted'}>Future periods use income only; archived allowances stay at zero. {summary.future.fundingGap?`Funding gap: ${fmtCents(summary.future.fundingGap)}`:`Not yet allocated: ${fmtCents(summary.future.unallocated)}`}</p>}
      <p className="detail-copy text-muted">These are planning amounts, not your bank balance or a promise of money you can spend.</p></div>
  }catch{return <p role="alert">These amounts are too large to total safely. Please reduce them.</p>}
}

export default function Budget() {
  const budget=useBudget(),{role,tenantId,refreshMembership}=useAuth()
  const {snapshot:s,draft,editing,setEditing,loading,busy,error,notice,pending,canWrite}=budget
  const [view,setView]=useState<'overview'|'plan'>('overview')
  const [assisting,setAssisting]=useState(false)
  const root=useRef<HTMLDivElement>(null),wasBusy=useRef(false)
  const savedSetup=readSavedSetup(draft?.draft)
  useEffect(()=>{void budget.refresh()},[budget.refresh])
  useEffect(()=>{if(wasBusy.current&&!busy){const heading=root.current?.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus()}}wasBusy.current=busy},[busy])
  const [now]=useState(()=>new Date())
  const outdated=s?.details?.lifecycle?s.details.lifecycle.state!=='current':s?.plan&&s.period?today({now:()=>now},s.plan.timezone)>=s.period.end_date:false
  return <Screen><div ref={root} className="budget-workspace">
    <ViewHeader index="05 — Budget" title="Budget" sub="Give your money a plan, one step at a time." />
    <p className="detail-copy mt-2 text-muted">Private preview · Manual or history-assisted planning, dated bills and savings goals.</p>
    {!tenantId&&<OperationStatusPanel state="failed" title="Your workspace isn’t available yet" description="We haven’t loaded a workspace membership, so no Budget information has been read or changed." action={<Button variant="ghost" onClick={()=>void refreshMembership()}>Retry workspace connection</Button>} className="mt-4"/>}
    <div className="mt-4 flex flex-wrap gap-2"><Button variant="ghost" onClick={()=>void budget.refresh()} disabled={loading||busy}>Refresh saved data</Button></div>
    {!BUDGET_ENABLED&&<p className="outcome-panel mt-4">The Budget preview is not enabled on this build. Saved data and interrupted-save recovery remain available here.</p>}
    {loading&&!budget.preparation&&<OperationStatusPanel state="working" title="Loading your saved budget" description="Reading your saved plan and account scope." className="mt-4"/>}
    {budget.preparation&&<section aria-label="Preparing budget history" className="outcome-panel mt-4 space-y-3" aria-busy={loading}>
      <h3 className="font-semibold">Checking your budget history</h3><p className="body-copy" role="status">{budget.preparation.completed} of {budget.preparation.total} saved budgets checked. We’ll show updated balances when the full history is ready. Your plan and transactions are unchanged.</p>
      <OperationProgress label="Saved budgets checked" progress={{kind:'determinate',current:budget.preparation.completed,total:budget.preparation.total}}/>
      {!loading&&<Button onClick={()=>void budget.refresh()}>Continue loading history</Button>}
      {s&&<p className="body-copy text-warn">Previously loaded figures below may be out of date. Changes are paused until this check finishes.</p>}
    </section>}
    {error&&<div role="alert" className="outcome-panel mt-4 text-neg">{error}<p className="detail-copy mt-1">{s?'Previously loaded figures remain below; they may be out of date.':'No Budget figures could be loaded. Missing information is not zero.'}</p></div>}
    {budget.impactPreparation&&<section aria-label="Preparing budget effects" aria-busy="true" className="outcome-panel mt-4 space-y-3">
      <h2 className="font-display text-xl font-bold">Checking the budget effects</h2>
      <p role="status" className="body-copy">We’re checking the complete budget before and after your choices. No budget change has been saved.</p>
      <OperationProgress label="Complete checks saved" progress={{kind:'determinate',current:budget.impactPreparation.completed,total:budget.impactPreparation.total}}/>
      <p className="detail-copy text-muted">If interrupted, reopen your choices and review the effects again. Completed checks will resume while your budget and activity are unchanged.</p>
    </section>}
    {notice&&<OperationStatusPanel state={busy?'working':'idle'} title={busy?'Saving your budget':'Budget update'} description={notice} className="mt-4"/>}
    {pending&&<div className="outcome-panel mt-4"><h3 className="font-semibold">Let’s check that save first</h3><p className="body-copy my-2">The connection ended before we could confirm the result. Your original request is kept in this tab, including after a reload. We’ll check the saved result, then retry that same request only if needed.</p><Button disabled={busy} onClick={()=>void budget.recover()}>Check saved result</Button></div>}
    {s&&!s.write_enabled&&<p className="outcome-panel mt-4">Budget changes are currently paused. Saved information and result checks are still available.</p>}
    {role&&role!=='owner'&&<p className="outcome-panel mt-4">You can view this budget. Only its owner can change the plan or view setup drafts.</p>}
    {editing&&s?<BudgetEditor key={s.plan?.id??'setup'} setup={editing} active={!!s.plan} />:assisting&&s&&!s.plan?<BudgetAssistance onUse={setup=>{setAssisting(false);setEditing(setup)}} onManual={setup=>{setAssisting(false);setEditing(setup)}} onClose={()=>setAssisting(false)}/>:s?.plan?<>
      <p className="body-copy mt-5">{s.period!.start_date} – {addDays(s.period!.end_date,-1)} · {s.period!.timezone} · {s.period!.frequency==='monthly'?'Monthly':'Every two weeks'}</p>
      {outdated&&<p className="outcome-panel mt-3 text-warn">These dates have ended. Review the saved results or plan the next budget below. History is retained; more schedule and policy controls are still being built.</p>}
      <BudgetLifecycle/>
      <BudgetAttention/>
      <div role="group" aria-label="Budget views" className="budget-view-switch mt-4">{(['overview','plan'] as const).map(id=><button key={id} className="budget-tab" aria-pressed={view===id} onClick={()=>setView(id)}>{id==='overview'?'Overview':'My plan'}</button>)}</div>
      {view==='overview'?<Grid>
        <Tile title="Your plan for this period" span={2}><Balance setup={fromSnapshot(s)} both={false}/><p className="body-copy mt-3">Expected income is your estimate. Income received below is what has been recorded so far.</p></Tile>
        <Tile title="What’s recorded so far"><p className="micro text-muted">{s.coverage_complete&&s.scope_valid&&s.account_scope.some(m=>m.role==='activity')?'Complete selected-account history':'Partial or no account history'}</p>
          {s.actuals&&s.scope_valid&&s.account_scope.some(m=>m.role==='activity')?<dl className="budget-totals mt-4"><dt>Income received</dt><dd>{fmtCents(s.actuals.earned_income_cents)}</dd><dt>Spending before credits</dt><dd>{fmtCents(s.actuals.gross_expense_cents)}</dd><dt>Refunds & reimbursements</dt><dd>{fmtCents(s.actuals.expense_credits_cents)}</dd><dt>Net spending</dt><dd>{fmtCents(s.actuals.net_expense_cents)}</dd><dt>Pending net movement</dt><dd>{fmtCents(s.actuals.pending_signed_cents)}</dd></dl>:<p className="body-copy mt-3">{s.scope_valid?'You’re planning manually, without account activity.':'A selected account is no longer available or supported. Recorded totals are unavailable.'}</p>}
          {!s.coverage_complete&&<p className="detail-copy mt-3 text-warn">This may not include all activity. A zero here does not prove there was no spending.</p>}
          <p className="detail-copy mt-3 text-muted">Pending activity is separate. Transfers, investments and balance adjustments are not counted as spending.</p></Tile>
        <Tile title="Accounts included" span={2}><AccountScope/><p className="detail-copy mt-3 text-muted">Only activity from these accounts and saved dates is counted. Account-scope changes will be available in a later phase.</p></Tile>
        <Tile title="How your budget works"><ol className="list-decimal space-y-2 pl-5 body-copy"><li>Estimate income for this period.</li><li>Give it jobs: everyday spending, bills or setting money aside.</li><li>Match activity below to keep bills, goals and everyday spending separate.</li></ol><p className="detail-copy mt-3 text-muted">Allowances do not move money. Recorded spending, planned reserves and confirmed funding are different parts of the picture.</p></Tile>
      </Grid>:<Grid><Tile title="Your allowances" span={3}><dl className="space-y-4">{s.lines!.map(line=><div key={line.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--hair-soft)] pb-3"><dt><strong>{line.name}</strong><p className="detail-copy text-muted">{purposeNames[line.kind]} · Planned, not a recorded payment</p>{line.opening_cents>0&&<p className="detail-copy">Existing reserve at setup: {fmtCents(line.opening_cents)}</p>}</dt><dd className="tabular-nums">{fmtCents(line.allocation_cents)}</dd></div>)}</dl>
        <p className="body-copy mt-4">Future periods: expected income {fmtCents(s.future_template!.income_cents)}. Existing-cash top-ups are not repeated.</p>
        <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3">See saved future allowances</summary><ul>{s.future_template!.allocations.map(a=><li className="flex justify-between gap-3 py-2" key={a.line_id}><span>{s.lines!.find(l=>l.id===a.line_id)?.name??'Allowance'}</span><span>{fmtCents(a.amount_cents)}</span></li>)}</ul></details>
        <Button disabled={!canWrite||outdated} onClick={()=>setEditing(fromSnapshot(s))}>Adjust plan</Button></Tile></Grid>}
      {s.details?.lifecycle?.state!=='current'&&<p className="outcome-panel mt-4">Saved history is read-only here. Review and carry controls remain available; correct recorded activity in Ledger. Changing past plans and account settings is not available in this preview.</p>}
      <fieldset disabled={!!s.details?.lifecycle&&s.details.lifecycle.state!=='current'} className="min-w-0"><BudgetItems/></fieldset>
    </>:s&&!loading?<><Grid><Tile title="A plan that starts with you" span={2}><p className="body-copy">Start with what you expect to receive, choose a monthly or two-week budget, and decide what you want your money to do. No bank connection is needed.</p>
      <div className="mt-4 flex flex-wrap gap-3"><Button disabled={!canWrite} onClick={()=>setAssisting(true)}>Help me build a budget</Button><Button disabled={!canWrite} variant="ghost" onClick={()=>{if(!draft?.draft||window.confirm('Start a new setup? Your saved draft stays unchanged until you explicitly save a replacement.'))setEditing(blankSetup())}}>Enter my own amounts</Button>{savedSetup&&<Button disabled={!canWrite} variant="ghost" onClick={()=>setEditing(savedSetup)}>Continue saved draft</Button>}</div>
      {!!draft?.draft&&!savedSetup&&<p className="detail-copy mt-3 text-warn">A partial or older setup is saved safely, but this preview cannot open its format yet. It has not been replaced or activated. You can start a new setup explicitly.</p>}
      {draft?.stale&&<p className="detail-copy mt-3 text-warn">Your account information changed since this draft was saved. Review it before starting your budget.</p>}</Tile></Grid><SavedDraftReview/></>:null}
  </div></Screen>
}
function AccountScope() {
  const {snapshot:s}=useBudget();if(!s?.period)return null
  const scope=s.account_scope.filter(m=>m.start_date<s.period!.end_date&&(!m.end_date||m.end_date>s.period!.start_date))
  return scope.length?<ul className="space-y-2 body-copy">{scope.map(m=><li key={`${m.original_account_id}:${m.role}:${m.start_date}`}>{s.accounts.find(a=>a.id===m.account_id)?.name??'Account no longer available'} · {m.role==='activity'?'Activity included':'Savings destination only'} · from {m.start_date}{m.end_date?` until ${addDays(m.end_date,-1)}`:''}</li>)}</ul>:<p className="body-copy">No accounts selected. Your plan works without linked activity.</p>
}

function BudgetEditor({setup,active}:{setup:Setup;active:boolean}) {
  const b=useBudget(),s=b.snapshot!,form=useRef<HTMLFormElement>(null)
  const [review,setReview]=useState(false),[accepted,setAccepted]=useState(false),[scope,setScope]=useState<'period'|'period-and-future'>('period')
  const [localError,setLocalError]=useState('')
  useEffect(()=>{setReview(false);setAccepted(false)},[s,b.draft?.draft_version])
  function change(next:Setup){b.setEditing(next.assistance?convertAssistanceToManual(next):next);setAccepted(false);setReview(false)}
  function lineChange(id:string,patch:Partial<Setup['lines'][number]>) {change({...setup,lines:setup.lines.map(l=>l.id===id?{...l,...patch}:l)})}
  let period:ReturnType<typeof setupPeriod>|null=null,gap=false
  try{period=setupPeriod(setup);const sums=setupSummary(setup,s.details?.controls?.archives.map(a=>a.line_id));gap=sums.current.fundingGap>0||((!active||scope==='period-and-future')&&sums.future.fundingGap>0)}catch{}
  const unavailable=setup.account_ids.some(id=>!s.accounts.some(a=>a.id===id&&a.currency==='AUD'))
  const staleAssistance=!!setup.assistance&&!setup.assistance.manual&&setup.assistance.source_revision!==s.source_revision
  const disabled=!b.canWrite||unavailable||staleAssistance
  function preview(){
    if(!form.current?.reportValidity())return
    try{validateSetup(setup);setReview(true);setLocalError('')}catch(e){setLocalError(e instanceof Error?e.message:'Check your plan.')}
  }
  async function save(){
    if(!form.current?.reportValidity()||!review||disabled)return
    if(active)await b.run({action:'revise',plan_id:s.plan!.id,period_id:s.period!.id,expected_plan:s.plan!.version,scope,income_cents:setup.income_cents,opening_drawdown_cents:setup.opening_drawdown_cents,accept_gap:accepted,lines:setup.lines.map(l=>({line_id:l.id,amount_cents:l.allocation_cents}))})
    else await b.run({action:'save_draft',expected_draft:b.draft?.draft_version??'0',payload:setup})
  }
  // Activation is a separate explicit action on a saved, reviewed draft; never auto-activate after save.
  return <form ref={form} onSubmit={e=>e.preventDefault()} className="mt-5 space-y-4" aria-busy={b.busy}>
    <fieldset disabled={!b.canWrite} className="space-y-4 min-w-0">
    {staleAssistance&&<div className="outcome-panel text-warn space-y-2"><p>The history behind these suggestions changed. Your edited amounts and goal are still here, but the old evidence cannot authorize a new draft.</p><Button variant="ghost" onClick={()=>change(convertAssistanceToManual(setup))}>Keep as manual estimates</Button></div>}
    <div className="glass p-5"><h3 className="font-display text-xl font-bold">{active?'Adjust your plan':'Let’s build your budget'}</h3><p className="body-copy mt-2">{active?'Change the amounts, then review exactly which periods they apply to.':'Choose your rhythm, estimate what’s coming in, then give that money a job. You stay in control.'}</p></div>
    {!active&&<div className="glass p-5 space-y-4"><h3 className="font-semibold">1. Choose your rhythm and accounts</h3><div className="grid gap-4 md:grid-cols-2">
      <Field label="Budget rhythm"><Select value={setup.frequency} onChange={frequency=>change({...setup,frequency:frequency as Setup['frequency']})}><option value="monthly">Monthly · calendar months</option><option value="fortnightly">Every two weeks · 14 days</option></Select></Field>
      <Field label="Start with the period containing" hint="Monthly budgets include the whole calendar month, including earlier recorded activity."><DateInput value={setup.start_date} onChange={start_date=>change({...setup,start_date})}/></Field>
      {setup.frequency==='fortnightly'&&<Field label="A two-week cycle start date" hint="Choose a date such as payday. It anchors the repeating 14-day periods."><DateInput value={setup.anchor??''} onChange={anchor=>change({...setup,anchor})}/></Field>}
      <Field label="Budget timezone" hint="Dates and period boundaries follow this timezone."><input className="budget-input" required value={setup.timezone} onChange={e=>change({...setup,timezone:e.target.value})}/></Field>
    </div><p className="body-copy">Currency: AUD. This initial version does not combine currencies.</p>
    <fieldset><legend className="field-label mb-2">Include account activity (optional)</legend><p className="detail-copy text-muted mb-2">Choose the accounts that pay for this budget. Savings-only accounts can stay out. Selecting an account does not prove its history is complete.</p>
      {s.accounts.length?s.accounts.map(a=><label key={a.id} className="flex min-h-11 items-center gap-3 py-2"><input type="checkbox" disabled={a.currency!=='AUD'} checked={setup.account_ids.includes(a.id)} onChange={e=>change({...setup,account_ids:e.target.checked?[...setup.account_ids,a.id]:setup.account_ids.filter(id=>id!==a.id)})}/><span>{a.name} · {a.currency}{a.currency!=='AUD'?' · Not supported yet':''}</span></label>):<p>No accounts yet? You can still make a manual plan.</p>}
    </fieldset>{unavailable&&<p role="alert" className="text-warn">A draft account is unavailable. Start a new draft or restore the account before activating.</p>}</div>}
    <div className="glass p-5 space-y-4"><h3 className="font-semibold">{active?'Amounts to plan with':'2. What will you plan with?'}</h3><div className="grid gap-4 md:grid-cols-2">
      <MoneyField label="Expected income this period (AUD)" value={setup.income_cents} onChange={income_cents=>change({...setup,income_cents})} hint="Your estimate, not income already received. Zero is okay."/>
      <MoneyField label="Existing cash to use this period (AUD)" value={setup.opening_drawdown_cents} onChange={opening_drawdown_cents=>change({...setup,opening_drawdown_cents})} hint="An optional, one-off top-up. Do not include money already set aside in a reserve. This will not repeat in future periods."/>
    </div></div>
    <div className="glass p-5 space-y-4"><h3 className="font-semibold">{active?'Your allowances':'3. Give the money a job'}</h3><p className="body-copy">Everyday spending is for flexible costs. Add a separate allowance if you want to plan for bills or put money aside. These amounts do not move money.</p>
      {setup.lines.map(line=><div key={line.id} className="budget-line"><div className="grid gap-4 md:grid-cols-2">{active?<div><strong>{line.name}</strong><p className="detail-copy text-muted">{purposeNames[line.kind]}</p></div>:<Field label={`Allowance name · ${purposeNames[line.kind]}`}><input required maxLength={60} className="budget-input" value={line.name} onChange={e=>lineChange(line.id,{name:e.target.value})}/></Field>}
      <MoneyField label={`Planned for ${line.name||'this allowance'} (AUD)`} value={line.allocation_cents} onChange={allocation_cents=>lineChange(line.id,{allocation_cents})}/>
      {!active&&line.kind==='reserve'&&<MoneyField label={`Already set aside for ${line.name||'this reserve'} (AUD)`} value={line.opening_cents} onChange={opening_cents=>lineChange(line.id,{opening_cents})} hint="Existing money at the start date, not new income or verified savings progress."/>}</div>
      {!active&&line.kind!=='everyday'&&<Button variant="ghost" onClick={()=>change({...setup,lines:setup.lines.filter(l=>l.id!==line.id)})}>Remove {line.name||'allowance'}</Button>}</div>)}
      {!active&&setup.lines.length<100&&<div className="flex flex-wrap gap-2">{(['fixed','reserve','contribution'] as const).map(kind=><Button key={kind} variant="ghost" onClick={()=>change({...setup,lines:[...setup.lines,{id:crypto.randomUUID(),kind,name:purposeNames[kind],allocation_cents:0,opening_cents:0}]})}>Add {purposeNames[kind].toLowerCase()}</Button>)}</div>}
      {!active&&<p className="detail-copy text-muted">Start with simple allowances here. After activation, add goal targets and dates—or finish setting up an allowance in Bills and things you’re saving for. No funding is confirmed automatically.</p>}
    </div>
    {active&&<fieldset className="glass p-5 space-y-2"><legend className="field-label">Apply this change to</legend>{(['period','period-and-future'] as const).map(option=><label key={option} className="flex min-h-11 items-center gap-3"><input type="radio" name="budget-scope" checked={scope===option} onChange={()=>{setScope(option);setAccepted(false);setReview(false)}}/>{option==='period'?'This saved period only':'This period and future periods'}</label>)}<p className="detail-copy text-muted">Future periods never repeat your existing-cash top-up. Past periods are not changed.</p></fieldset>}
    <Balance setup={setup} both={!active||scope==='period-and-future'}/>
    {localError&&<p role="alert" className="text-neg">{localError}</p>}
    {!review?<Button disabled={disabled} onClick={preview}>Review my plan</Button>:<div className="glass p-5 space-y-4"><h3 className="font-semibold">Check before saving</h3>
      <p className="body-copy">{period?`${period.start} – ${addDays(period.end,-1)} · ${period.timezone}`:'Choose valid dates and timezone.'} · {setup.account_ids.length} activity accounts · {active?(scope==='period'?'This period only':'This period and future periods'):'This period and future plan'}</p>
      {gap&&<label className="flex items-start gap-3 py-3"><input type="checkbox" className="mt-1" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I understand I have planned more than the expected resources shown above. I’ll need to adjust the plan or find extra money. This is not an affordability check.</span></label>}
      <p className="body-copy">{active?'Saving changes your allocation plan, not your bank accounts.':'Save this draft first. Then use “Review saved draft” to check it and start the budget. Saving a draft does not activate anything.'}</p>
      <Button disabled={disabled||(gap&&!accepted)} onClick={()=>void save()}>{active?'Save plan changes':'Save setup draft'}</Button>
    </div>}
    </fieldset>
    <Button variant="ghost" disabled={b.busy||!!b.pending} onClick={()=>{if(window.confirm('Leave these unsaved edits? Your last saved budget or draft will stay unchanged.'))b.setEditing(null)}}>Leave editor</Button>
  </form>
}

/** Only saved setup is eligible to activate. The separate review survives neither edits nor refresh. */
export function SavedDraftReview() {
  const b=useBudget(),[review,setReview]=useState(false),[accepted,setAccepted]=useState(false)
  useEffect(()=>{setReview(false);setAccepted(false)},[b.draft,b.snapshot])
  const setup=readSavedSetup(b.draft?.draft)
  if(b.snapshot?.plan||b.editing||!setup)return null
  let valid=true,gap=true
  try{validateSetup(setup);const sums=setupSummary(setup);gap=sums.current.fundingGap>0||sums.future.fundingGap>0}catch{valid=false}
  const stale=b.draft?.stale||b.draft?.source_revision!==b.snapshot?.source_revision
  return <div className="glass mt-4 p-5 space-y-3"><h3 className="font-semibold">Your saved setup draft</h3><p className="body-copy">Nothing is active yet. Review the saved amounts before starting.</p><Button variant="ghost" disabled={!valid||!b.canWrite} onClick={()=>setReview(!review)}>Review saved draft</Button>
    {review&&<><Balance setup={setup} both/><p className="body-copy">{setupPeriod(setup).start} – {addDays(setupPeriod(setup).end,-1)} · {setup.timezone} · {setup.frequency==='monthly'?'Monthly':'Every two weeks'} · {setup.account_ids.length} activity accounts</p>
      <ul>{setup.lines.map(l=><li key={l.id} className="flex justify-between gap-3 py-2"><span>{l.name}</span><span>{fmtCents(l.allocation_cents)}</span></li>)}</ul>
      {stale?<div className="space-y-2"><p className="text-warn">Your source information changed. Recheck the suggestions, or explicitly keep these edited amounts as manual estimates before saving again.</p>{setup.assistance&&!setup.assistance.manual&&<Button variant="ghost" onClick={()=>b.setEditing(convertAssistanceToManual(setup))}>Keep as manual estimates</Button>}</div>:<>{gap&&<label className="flex min-h-11 items-start gap-3 py-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I understand the current and future funding gaps shown above.</span></label>}<Button disabled={!b.canWrite||(gap&&!accepted)} onClick={()=>void b.run({action:'activate',expected_draft:b.draft!.draft_version,accept_gap:accepted})}>Start this budget</Button><p className="detail-copy text-muted">This activates your saved plan. It does not move money.</p></>}
    </>}
  </div>
}
