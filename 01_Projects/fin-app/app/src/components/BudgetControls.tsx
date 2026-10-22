import {useEffect,useRef,useState} from 'react'
import {useBudget} from '../contexts/BudgetContext'
import {Button,Select} from './Controls'
import {fmtCents} from '../data'
import {addDays} from '../lib/budget'
import {controlMatches,controlNeedsQualification,type ControlIntent,type ControlPreview} from '../lib/budgetControls'

export default function BudgetControls({open,setOpen}:{open:boolean;setOpen:(v:boolean)=>void}){
 const b=useBudget(),s=b.snapshot!,l=s.details?.lifecycle,paused=s.details?.controls?.paused??false,trigger=useRef<HTMLElement>(null)
 if(!s.plan||!s.period||!l)return null
 const close=()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.querySelector('button')?.focus())}
 const event=s.details?.control_event
 return <section ref={trigger} aria-label="Budget and line lifecycle" className="space-y-3 border-t border-[var(--hair)] pt-4">
  <h3 className="font-semibold">Keep your budget working for you</h3>
  <p className="body-copy">{paused?'Budget paused · new budget periods cannot be opened.':'Budget active · your saved plan is available.'} Pausing does not stop bills, bank payments or recorded spending. Your history and saved allowances stay available.</p>
  {!open?<Button variant="ghost" disabled={!b.canWrite||!l.is_latest||s.details?.frequency_change?.state==='pending'} onClick={()=>setOpen(true)}>Manage budget and allowances</Button>:<ControlForm key={s.period.id} close={close}/>}
  {!l.is_latest&&<p className="detail-copy">Return to the latest saved budget to manage these controls.</p>}
  {s.details?.frequency_change?.state==='pending'&&<p className="detail-copy text-warn">Cancel the pending frequency change before pausing, resuming or archiving an allowance.</p>}
  {event?.version===s.plan.version&&event.action!=='undo'&&s.details?.undo_operation_id&&<Button variant="ghost" disabled={!b.canWrite||open} onClick={()=>{if(window.confirm('Undo the latest lifecycle change? Its signed budget movement and future allowances will be restored through a new history entry. Bank transactions stay unchanged.'))void b.run({action:'undo',operation_id:s.details!.undo_operation_id})}}>Undo last lifecycle change</Button>}
 </section>
}

function ControlForm({close}:{close:()=>void}){
 const b=useBudget(),s=b.snapshot!,items=s.details!.items,paused=s.details?.controls?.paused??false
 const [intent,setIntent]=useState<ControlIntent>({control:paused?'resume_budget':'pause_budget',line_id:null,disposition:null,target_line_id:null})
 const [preview,setPreview]=useState<ControlPreview|null>(null),[working,setWorking]=useState(false),[error,setError]=useState(''),[accepted,setAccepted]=useState(false),[incomplete,setIncomplete]=useState(false),[carry,setCarry]=useState(false)
 const generation=useRef(0),heading=useRef<HTMLHeadingElement>(null)
 useEffect(()=>{heading.current?.focus()},[])
 useEffect(()=>{generation.current++;setPreview(null);setAccepted(false);setIncomplete(false);setCarry(false);setWorking(false)},[s.source_revision,s.plan?.version])
 useEffect(()=>()=>{generation.current++},[])
 const change=(next:ControlIntent)=>{generation.current++;setIntent(next);setPreview(null);setAccepted(false);setIncomplete(false);setCarry(false);setError('')}
 const line=items.find(i=>i.line_id===intent.line_id),archive=intent.control==='archive_line',resume=intent.control==='resume_budget'
 const eligible=items.filter(i=>i.kind!=='everyday'&&!i.archived&&!i.config?.voided),targets=eligible.filter(i=>i.kind==='reserve'&&i.line_id!==intent.line_id)
 const amount=(n:number|null|undefined)=>n==null?'Unavailable':fmtCents(n)
 const valid=!archive||!!line&&!!intent.disposition&&(intent.disposition!=='transfer'||!!intent.target_line_id)
 return <form aria-label="Budget lifecycle preview" className="outcome-panel space-y-4" aria-busy={working} onSubmit={async e=>{e.preventDefault();if(!preview||!controlMatches(preview,intent,s.source_revision,s.plan!.version))return;const result=await b.run({action:'set_control',...intent,plan_id:s.plan!.id,period_id:s.period!.id,expected_plan:s.plan!.version,preview_hash:preview.preview_hash,accept_impact:accepted,accept_incomplete:incomplete,accept_carry:carry});if(result)close()}}>
  <h4 ref={heading} tabIndex={-1} className="font-display text-xl font-bold">Make a change, then check its effects</h4>
  <fieldset disabled={!b.canWrite||working} className="space-y-4">
   <label className="grid gap-2"><span className="field-label">What would you like to do?</span><Select ariaLabel="Lifecycle action" value={intent.control} onChange={value=>change({control:value as ControlIntent['control'],line_id:null,disposition:null,target_line_id:null})}><option value={paused?'resume_budget':'pause_budget'}>{paused?'Resume my budget':'Pause my budget'}</option>{s.details?.lifecycle?.state!=='past'&&<option value="archive_line">Stop using an allowance</option>}</Select></label>
   {archive?<>
    <p className="body-copy">Archiving keeps this budget’s allowance and history, but sets its future allocations to zero. It does not cancel a bill or move money at your bank. Later refunds or corrections can still change its remaining balance.</p>
    <label className="grid gap-2"><span className="field-label">Allowance to archive</span><Select ariaLabel="Allowance to archive" value={intent.line_id??''} onChange={value=>change({...intent,line_id:value||null,disposition:'retain',target_line_id:null})}><option value="">Choose an allowance</option>{eligible.map(i=><option key={i.line_id} value={i.line_id}>{i.name}</option>)}</Select></label>
    {line?.kind==='reserve'?<fieldset className="space-y-2"><legend className="field-label">What should happen to its remaining balance?</legend>{([{value:'retain',label:'Keep it here · the balance stays separate, including any shortfall'},{value:'release',label:'Move it to everyday Other · a shortfall reduces everyday room'},{value:'transfer',label:'Move it to another reserve or savings goal · including any shortfall'}] as const).map(o=><label key={o.value} className="flex min-h-11 items-start gap-3"><input type="radio" name="archive-disposition" checked={intent.disposition===o.value} onChange={()=>change({...intent,disposition:o.value,target_line_id:null})}/><span>{o.label}</span></label>)}</fieldset>:line&&<p className="body-copy">This allowance has no carried reserve. Its current allowance, recorded activity and unused amount stay in this budget; no unused amount is turned into savings.</p>}
    {intent.disposition==='transfer'&&<label className="grid gap-2"><span className="field-label">Move the balance to</span><Select ariaLabel="Archive balance destination" value={intent.target_line_id??''} onChange={value=>change({...intent,target_line_id:value||null})}><option value="">Choose a reserve or goal</option>{targets.map(i=><option key={i.line_id} value={i.line_id}>{i.name}</option>)}</Select></label>}
   </>:<p className="body-copy">{resume?'We will show any dates without a saved budget and the known spending during that time. Resuming creates no missing periods, income or new allocations. Review carry and reserve balances before planning the next period.':'Your current plan, reviews and activity remain available. New periods and frequency changes are blocked until you resume; existing allowances are not removed.'}</p>}
   <Button variant="ghost" disabled={!valid} onClick={async()=>{const g=++generation.current;setWorking(true);setPreview(null);setError('');setAccepted(false);setIncomplete(false);setCarry(false);try{const p=await b.previewControl(intent);if(g===generation.current)setPreview(p)}catch(e){if(g===generation.current)setError(e instanceof Error?e.message:'The lifecycle preview could not be prepared.')}finally{if(g===generation.current)setWorking(false)}}}>Review lifecycle effects</Button>
   {working&&<p role="status">Checking saved budgets, future allocations and carried balances… Nothing has been saved.</p>}
   {error&&<p role="alert" className="text-neg">{error} Your choices are retained.</p>}
   {preview&&<div className="space-y-4">
    <p role="status">Preview ready. No lifecycle change has been saved.</p>
    {archive&&<p className="body-copy">{intent.disposition==='retain'?'No balance will be moved. Its remaining amount stays at the original purpose.':<>Signed balance to move now: <strong>{amount(preview.move_cents)}</strong>. This is a budget allocation change, not a bank transfer or proof of saving.</>}</p>}
    {resume&&<div className="space-y-3"><h5 className="font-semibold">Check the time without a saved budget</h5>{preview.gap.windows.length?<><ul className="list-disc pl-5">{preview.gap.windows.map(w=><li key={w.start_date}>{w.start_date} – {addDays(w.end_date,-1)} · no saved budget</li>)}</ul><p className="body-copy">Known settled spending {amount(preview.gap.gross_expense_cents)} · recorded credits {amount(preview.gap.expense_credits_cents)}. These are activity, not extra money to spend. Missing history is not assumed to be zero.</p><dl className="budget-totals">{preview.gap.reserve_effects.map(r=><div key={r.line_id} className="contents"><dt>{items.find(i=>i.line_id===r.line_id)?.name??'Reserve'} after matched gap activity</dt><dd>{amount(r.remaining_cents)}</dd></div>)}</dl></>:<p className="body-copy">There are no uncovered dates after the latest saved budget.</p>}<p className="detail-copy">No period will be created automatically. Any next budget is opened one window at a time with amounts you review.</p></div>}
    <details open><summary className="min-h-11 py-3 cursor-pointer">Saved and next-budget balance effects</summary>{preview.after.map(after=>{const before=preview.before.find(x=>x.key===after.key);return <div key={after.key} className="space-y-2 py-3"><p className="body-copy">{after.key==='next'?'Next window preview':'Saved budget'} · {after.start_date} – {addDays(after.end_date,-1)} · everyday remainder {amount(before?.closing_everyday_cents)} → {amount(after.closing_everyday_cents)}</p><div className="data-table-wrap"><table className="data-table budget-control-table"><caption className="text-left detail-copy py-2">Reserve or allowance remainder before and after. Funding evidence is not increased by this change. Scroll sideways on a small screen to compare amounts.</caption><thead><tr><th scope="col">Allowance</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>{after.items.map(i=><tr key={i.line_id}><th scope="row">{i.name}</th><td>{amount(before?.items.find(old=>old.line_id===i.line_id)?.remaining_cents)}</td><td>{amount(i.remaining_cents)}</td></tr>)}</tbody></table></div></div>})}</details>
    {archive&&<details><summary className="min-h-11 py-3 cursor-pointer">Continuing allocations after this change</summary><dl className="budget-totals">{preview.future_allocations.map(a=><div key={a.line_id} className="contents"><dt>{items.find(i=>i.line_id===a.line_id)?.name??'Allowance'}</dt><dd>{fmtCents(a.amount_cents)}</dd></div>)}</dl></details>}
    <label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I reviewed the saved and future budget effects. Bank transactions and earlier history will not be deleted.</span></label>
    {controlNeedsQualification(preview)&&<label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={incomplete} onChange={e=>setIncomplete(e.target.checked)}/><span>I understand that incomplete or unavailable history may change these results. Unknown amounts are not zero or verified savings.</span></label>}
    {resume&&<label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={carry} onChange={e=>setCarry(e.target.checked)}/><span>I reviewed the uncovered dates and carried balances. I will check these before opening the next budget; no gap allocations have been invented.</span></label>}
    <Button type="submit" disabled={!accepted||controlNeedsQualification(preview)&&!incomplete||resume&&!carry||!controlMatches(preview,intent,s.source_revision,s.plan!.version)}>{archive?'Archive allowance':resume?'Resume budget':'Pause budget'}</Button>
   </div>}
  </fieldset>
  <Button variant="ghost" disabled={b.busy||!!b.pending} onClick={()=>{if(window.confirm('Leave this unsaved lifecycle preview? Your saved budget will stay unchanged.'))close()}}>Leave lifecycle preview</Button>
 </form>
}
