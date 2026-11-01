import {useEffect,useRef,useState} from 'react'
import {useBudget} from '../contexts/BudgetContext'
import {Button} from './Controls'
import {fmtCents} from '../data'
import {addDays} from '../lib/budget'
import {moneyEntry,parseBudgetMoney} from '../lib/budgetWorkspace'
import {nextBudgetDraft,nextBudgetSummary} from '../lib/budgetLifecycle'
import BudgetHistory from './budget/BudgetHistory'

export default function BudgetLifecycle({active=true,onOpen}:{active?:boolean;onOpen?:()=>void}){
 const b=useBudget(),s=b.snapshot!,l=s.details?.lifecycle
 const [reviewing,setReviewing]=useState(false),[carry,setCarry]=useState<'fresh'|'carry'>('fresh'),[accepted,setAccepted]=useState(false),[advance,setAdvance]=useState(false)
 useEffect(()=>{setReviewing(false);setAdvance(false);setAccepted(false);setCarry(l?.carry_mode??'fresh')},[s.period?.id])
 useEffect(()=>{setReviewing(false);setAccepted(false)},[s.source_revision,s.plan?.version])
 useEffect(()=>{if(!advance&&!reviewing)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[advance,reviewing])
 useEffect(()=>{
  if(!advance&&!reviewing)return
  const leave=(event:Event)=>{if(event.defaultPrevented)return;if(!window.confirm('Leave this unsaved review or budget preview? Your saved plan and review will stay unchanged.'))event.preventDefault()}
  window.addEventListener('budget-before-period-navigation',leave)
  return()=>window.removeEventListener('budget-before-period-navigation',leave)
 },[advance,reviewing])
 if(!l||!s.period||!s.plan)return null
 const facts=l.facts,remaining=facts.closing_everyday_cents,policyNext=s.details?.rollover_policy?.timeline.some(e=>e.from<=s.period!.end_date)
 const write=async(input:Record<string,unknown>)=>b.run(input.action==='undo'?input:{...input,plan_id:s.plan!.id,period_id:s.period!.id,expected_plan:s.plan!.version})
 const manual=!s.account_scope.some(m=>m.role==='activity'&&m.start_date<s.period!.end_date&&(!m.end_date||m.end_date>s.period!.start_date)),partial=manual||!s.coverage_complete
 return <>
  {!active&&<section className="budget-history-entry"><p>{l.state==='past'?(l.changed_since_review?'Changed since review · recorded results need another look.':'A saved budget is available to look back on.'):'Review saved periods, carry choices and the next budget in Look back.'}</p><Button variant="ghost" onClick={onOpen}>Look back at this budget</Button></section>}
  <section hidden={!active} className="budget-history space-y-5" aria-label="Budget periods and review">
  <header><p className="budget-eyebrow">{s.period.start_date} – {addDays(s.period.end_date,-1)} · {s.period.timezone}</p><h3 className="font-display text-2xl font-bold">{l.state==='past'?'Review this budget':l.state==='future'?'A future plan, not completed results':'Your budget is still unfolding'}</h3></header>
  {b.error&&<p className="body-copy text-neg">{b.error} Your local preview is retained; no replacement request is submitted automatically.</p>}
  <p className="body-copy">{l.state==='past'?'Completed budget · recorded activity can still change.':l.state==='future'?'Future plan · provisional, not completed actuals.':'In progress · this budget cannot be marked reviewed before its end date.'}</p>
  <p className="body-copy">{s.details?.rollover?.enabled?'Everyday amount carried across categories':'Everyday amount carried into Other'}: <strong>{facts.opening_carry_cents===null?'Unavailable':fmtCents(facts.opening_carry_cents)}</strong>. {l.provisional_carry?'This includes unreviewed or incomplete history and is provisional.':'Based on the reviewed choices shown in history.'} Carry is not new income, a bank balance or verified savings.</p>
  {s.unallocated_cents!=null&&s.unallocated_cents<0&&<p className="outcome-panel text-warn">Saved plan funding gap: {fmtCents(s.unallocated_cents)}. Review allocations in My plan; this is separate from the everyday remainder.</p>}
  {l.state==='past'&&<>
   {l.review&&<p className={`outcome-panel ${l.changed_since_review?'text-warn':''}`}>{l.review.state==='reopened'?'Review reopened. Your earlier record is preserved. ':''}{l.changed_since_review?'Changed since review — source evidence or results changed. Review again before relying on these figures.':l.review.state==='reviewed'?'Reviewed. Your recorded snapshot is preserved.':''}</p>}
   <BudgetHistory snapshot={s} stale={b.readState!=='ready'||!!b.pending}/>
   <a href="/ledger" className="inline-flex min-h-11 items-center text-accent-ink underline">Review transactions in Ledger</a>
   {!reviewing?<div className="flex flex-wrap gap-3"><Button disabled={!b.canWrite||!l.chain_valid} onClick={()=>setReviewing(true)}>{l.review?'Review updated results':'Review and choose what carries'}</Button>{l.review?.state==='reviewed'&&<Button disabled={!b.canWrite} variant="ghost" onClick={()=>void write({action:'reopen_review'})}>Reopen review</Button>}{s.details?.undo_operation_id&&l.review?.version===s.plan.version&&<Button disabled={!b.canWrite} variant="ghost" onClick={()=>{if(window.confirm('Undo the latest review choice? The earlier review record and ledger remain intact.'))void write({action:'undo',operation_id:s.details!.undo_operation_id})}}>Undo last review change</Button>}</div>:<div className="budget-history-choice space-y-3">
    <fieldset disabled={!b.canWrite} className="space-y-3"><legend className="field-label">{policyNext?'Review your results; saved rollover rules determine the next boundary':'What should happen to the everyday remainder?'}</legend>
    {!policyNext&&<>
    <label className="budget-settings-choice"><input type="radio" name="carry-choice" checked={carry==='fresh'} onChange={()=>setCarry('fresh')}/><span>Start fresh next budget · carry zero. Any positive or negative variance remains visible in this review; it is not erased or converted to savings.</span></label>
    <label className="budget-settings-choice"><input type="radio" name="carry-choice" checked={carry==='carry'} onChange={()=>setCarry('carry')}/><span>Carry the everyday remainder into Other · {remaining===null?'unavailable':fmtCents(remaining)}. A shortfall reduces the next allowance; a positive remainder adds budget room, not cash.</span></label>
    <p className="body-copy">Next opening carry: <strong>{carry==='fresh'?fmtCents(0):remaining===null?'Unavailable':fmtCents(remaining)}</strong>. Bill and goal reserves stay separate. This choice is for this boundary, not an ongoing category policy.</p>
    </>}
    {partial&&<label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I understand this review includes known activity only. Missing account history may change carry and the results later.</span></label>}
    <Button disabled={!l.chain_valid||(partial&&!accepted)} onClick={()=>void write({action:'save_review',carry_mode:policyNext?'fresh':carry,accept_incomplete:accepted})}>{policyNext?'Save budget review':'Save review and carry choice'}</Button>
    </fieldset><Button variant="ghost" disabled={b.busy} onClick={()=>{setReviewing(false);setAccepted(false);setCarry(l.carry_mode)}}>Keep saved choice</Button></div>}
   {l.is_latest&&!advance&&s.details?.frequency_change?.state!=='pending'&&<div className="space-y-3"><p className="body-copy">Reviewing is optional. You can open the next contiguous budget without completing a review. No dates or opening reserves will be invented before this plan started.</p><Button disabled={!b.canWrite||!l.chain_valid||s.details?.controls?.paused} variant="ghost" onClick={()=>setAdvance(true)}>Plan the next budget</Button></div>}
   {advance&&<NextBudget close={()=>setAdvance(false)}/>}
  </>}
 </section></>
}

function NextBudget({close}:{close:()=>void}){
 const b=useBudget(),s=b.snapshot!,form=useRef<HTMLFormElement>(null)
 const [draft]=useState(()=>{try{return nextBudgetDraft(s)}catch{return null}})
 const [income,setIncome]=useState(moneyEntry(draft?.income_cents??0)),[lines,setLines]=useState(draft?.lines??[]),[review,setReview]=useState(false),[accepted,setAccepted]=useState(false)
 useEffect(()=>{setReview(false);setAccepted(false)},[s.source_revision,s.plan?.version])
 const validIncome=parseBudgetMoney(income)
 let summary:ReturnType<typeof nextBudgetSummary>|null=null,error=''
 try{if(validIncome!==null)summary=nextBudgetSummary(validIncome,lines)}catch{error='These amounts are too large to total safely. Reduce an amount before reviewing.'}
 if(!draft)return <div className="outcome-panel"><p className="text-neg">The saved dates or scheduled amounts cannot be previewed safely. Your plan has not changed.</p><Button variant="ghost" onClick={close}>Close next-budget preview</Button></div>
 return <form ref={form} className="outcome-panel space-y-4" onSubmit={async e=>{e.preventDefault();if(!review||validIncome===null)return;const result=await b.run({action:'open_next_period',plan_id:s.plan!.id,period_id:s.period!.id,expected_plan:s.plan!.version,income_cents:validIncome,accept_gap:accepted,lines:lines.map(({line_id,amount_cents})=>({line_id,amount_cents}))});if(result)b.selectPeriod(result.result.period_id as string)}}>
  <h4 className="font-semibold">Check the next budget before opening it</h4><p className="body-copy">{draft.start} – {addDays(draft.end,-1)} · {s.period!.timezone}. Start from your saved future allowances; review actual bill dates before confirming. Existing-cash top-ups do not repeat. Goal reserves and source matches retain their identity.</p>
  <fieldset disabled={!b.canWrite||s.details?.controls?.paused} className="space-y-4"><label className="grid gap-2"><span className="field-label">Expected income next budget (AUD)</span><input aria-label="Expected income next budget (AUD)" className="budget-input" inputMode="decimal" required value={income} pattern="[0-9]+(\.[0-9]{1,2})?" onChange={e=>{setIncome(e.target.value);setReview(false);setAccepted(false)}}/></label>
   {lines.map(line=><div key={line.line_id} className="space-y-2"><label className="grid gap-2"><span className="field-label">{line.name}</span><input disabled={s.details?.controls?.archives.some(a=>a.line_id===line.line_id)} aria-label={`Next budget for ${line.name} (AUD)`} className="budget-input" inputMode="decimal" required defaultValue={moneyEntry(line.amount_cents)} pattern="[0-9]+(\.[0-9]{1,2})?" onChange={e=>{const amount=parseBudgetMoney(e.target.value);e.target.setCustomValidity(amount===null?'Enter a non-negative amount with up to two decimal places.':'');if(amount!==null)setLines(lines.map(l=>l.line_id===line.line_id?{...l,amount_cents:amount}:l));setReview(false);setAccepted(false)}}/></label>{line.dated_cents!==null&&<p className="detail-copy text-muted">The saved schedule has {fmtCents(line.dated_cents)} of dated payments/contributions in this exact window. This does not silently replace your allowance.</p>}</div>)}
   {summary&&<p className="body-copy">New allocations {fmtCents(summary.allocated)} · {summary.fundingGap?'Funding gap':'Still to plan'} {fmtCents(summary.fundingGap||summary.unallocated)}. Carry remains separate from these new resources.</p>}
   {error&&<p role="alert" className="text-neg">{error}</p>}
   {review?<><p className="body-copy">Opening creates one saved period. It preserves the old plan/reviews and does not move bank money. There is no delete-period undo; you can adjust its plan once it is current. Your continuing template stays unchanged.</p>{!!summary?.fundingGap&&<label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I understand this next budget has a funding gap.</span></label>}<Button type="submit" disabled={!summary||!!summary.fundingGap&&!accepted}>Open next budget</Button></>:<Button disabled={!summary} onClick={()=>{if(form.current?.reportValidity())setReview(true)}}>Review next budget</Button>}
  </fieldset><Button variant="ghost" disabled={b.busy||!!b.pending} onClick={()=>{if(window.confirm('Leave this next-budget preview? No new period has been opened unless its save was confirmed.'))close()}}>Leave next-budget preview</Button>
 </form>
}
