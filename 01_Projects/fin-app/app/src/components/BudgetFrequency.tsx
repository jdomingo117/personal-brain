import {useEffect,useRef,useState} from 'react'
import {useBudget} from '../contexts/BudgetContext'
import {Button} from './Controls'
import {fmtCents} from '../data'
import {addDays} from '../lib/budget'
import {frequencyDraft,frequencyWindow,type FrequencyTemplate} from '../lib/budgetFrequency'
import {moneyEntry,parseBudgetMoney} from '../lib/budgetWorkspace'

export default function BudgetFrequency({open,setOpen}:{open:boolean;setOpen:(value:boolean)=>void}){
 const b=useBudget(),s=b.snapshot!,l=s.details?.lifecycle,c=s.details?.frequency_change
 const write=(action:string)=>b.run({action,plan_id:s.plan!.id,period_id:c?.state==='pending'?c.period_id:s.period!.id,expected_plan:s.plan!.version})
 if(!l||!s.plan||!s.period)return null
 return <section aria-label="Budget frequency" className="space-y-3 border-t border-[var(--hair)] pt-4">
  <h3 className="font-semibold">How often you budget</h3>
  <p className="body-copy">This saved budget: {s.period.frequency==='monthly'?'Monthly':'Every two weeks (14 days)'}. Changing frequency keeps its dates and amounts unchanged.</p>
  {c?.state==='pending'?<div className="outcome-panel space-y-3">
   <p className="body-copy">Saved change to {c.frequency==='monthly'?'monthly':'every two weeks'} · starts {c.effective_date}. First budget ends {addDays(c.initial_end,-1)}; the next full budget is {c.initial_end} – {addDays(c.continuing_end,-1)}.</p>
   <p className="body-copy">{c.needs_review?'Your plan or activity changed since this preview. Cancel it and review a fresh change before applying.':'Your current budget has not changed. When this start date arrives, apply the saved change to open its first budget.'}</p>
   <details><summary className="min-h-11 py-3 cursor-pointer">Inspect saved amounts</summary>{(['initial','continuing'] as const).map(key=><div key={key} className="space-y-2 py-3"><h4 className="font-semibold">{key==='initial'?'First budget':'Continuing full budgets'}</h4><dl className="budget-totals"><dt>Expected income</dt><dd>{fmtCents(c.payload[key].income_cents)}</dd>{c.payload[key].lines.map(line=><div key={line.line_id} className="contents"><dt>{s.details?.items.find(i=>i.line_id===line.line_id)?.name??s.lines?.find(i=>i.id===line.line_id)?.name??'Saved allowance'}</dt><dd>{fmtCents(line.amount_cents)}</dd></div>)}</dl></div>)}</details>
   <div className="flex flex-wrap gap-3"><Button disabled={!b.canWrite||s.details?.controls?.paused||c.needs_review||l.as_of<c.effective_date} onClick={async()=>{if(!window.confirm('Apply this saved change and open its first budget? Earlier periods stay intact. The opened period cannot be deleted with Undo.'))return;const result=await write('apply_frequency');if(result)b.selectPeriod(result.result.period_id as string)}}>Apply saved frequency change</Button><Button variant="ghost" disabled={!b.canWrite} onClick={()=>{if(window.confirm('Cancel this saved frequency change? Your current budget and continuing plan will stay unchanged.'))void write('cancel_frequency')}}>Cancel saved frequency change</Button></div>
  </div>:<>{!open&&<Button variant="ghost" disabled={!b.canWrite||s.details?.controls?.paused||!l.is_latest||l.state==='past'||!l.chain_valid} onClick={()=>setOpen(true)}>Change budget frequency</Button>}
   {c&&<p className="detail-copy text-muted">Last frequency change: {c.state}. Earlier dates and saved records remain intact.</p>}
   {open&&<FrequencyForm key={s.period.id} close={()=>setOpen(false)}/>}
  </>}
  {c&&c.state!=='applied'&&c.version===s.plan.version&&s.details?.undo_operation_id&&<Button variant="ghost" disabled={!b.canWrite} onClick={()=>{if(window.confirm('Undo the last compatible frequency choice? This does not delete any saved periods.'))void b.run({action:'undo',operation_id:s.details!.undo_operation_id})}}>Undo last frequency choice</Button>}
 </section>
}

function FrequencyForm({close}:{close:()=>void}){
 const b=useBudget(),s=b.snapshot!,form=useRef<HTMLFormElement>(null)
 const [draft]=useState(()=>{try{return frequencyDraft(s)}catch{return null}})
 const [initial,setInitial]=useState(draft?.initial),[continuing,setContinuing]=useState(draft?.continuing)
 const [review,setReview]=useState(false),[keepLimits,setKeepLimits]=useState(false),[incomplete,setIncomplete]=useState(false)
 const [basis]=useState(()=>({source:s.source_revision,plan:s.plan!.version}))
 const stale=basis.source!==s.source_revision||basis.plan!==s.plan!.version
 useEffect(()=>{setReview(false);setKeepLimits(false);setIncomplete(false)},[s.source_revision,s.plan?.version])
 let first:ReturnType<typeof frequencyWindow>|null=null,full:ReturnType<typeof frequencyWindow>|null=null
 try{if(draft&&initial&&continuing){first=frequencyWindow(s,initial,draft.windows.initial.start,draft.windows.initial.end);full=frequencyWindow(s,continuing,draft.windows.continuing.start,draft.windows.continuing.end)}}catch{}
 if(!draft||!initial||!continuing)return <div className="space-y-3"><p role="alert" className="body-copy text-neg">The saved plan could not be previewed safely. Close this preview and refresh before trying again.</p><Button variant="ghost" onClick={close}>Close frequency preview</Button></div>
 const partial=!s.details?.lifecycle?.facts.coverage_complete
 const change=()=>{setReview(false);setKeepLimits(false);setIncomplete(false)}
 return <form ref={form} className="outcome-panel space-y-4" aria-label="Change frequency preview" onSubmit={async e=>{e.preventDefault();if(stale||!review||!first||!full)return;const r=await b.run({action:'schedule_frequency',plan_id:s.plan!.id,period_id:s.period!.id,expected_plan:s.plan!.version,frequency:draft.frequency,initial,continuing,keep_limits:keepLimits,accept_incomplete:incomplete});if(r)close()}}>
  <h4 className="font-display text-xl font-bold">Change to {draft.frequency==='monthly'?'monthly':'every two weeks'}</h4>
  <p className="body-copy">Starts {s.period!.end_date}, after this budget ends · {s.period!.timezone}. No dates are skipped or counted twice. {draft.windows.initial.transition?'A short first budget brings you to the start of the next calendar month. Review its amounts separately from a full month.':'The first budget and continuing budgets are reviewed separately.'}</p>
  <p className="body-copy">Amounts start from your saved future plan, unchanged—not divided or prorated. Check your expected pay dates, bill dates and goals. Existing bill and goal schedules keep their saved cadence; changing budget frequency does not reschedule payments or automatically change goal contributions.</p>
  {stale&&<p role="alert" className="body-copy text-warn">The plan or activity changed. Your inputs are retained for reference. Close and reopen this preview to use the latest facts; this version cannot be saved.</p>}
  <fieldset disabled={!b.canWrite||s.details?.controls?.paused||stale} className="space-y-5">
   <div className="grid gap-5 lg:grid-cols-2">{([{label:'First budget',template:initial,set:setInitial,window:draft.windows.initial,preview:first},{label:'Continuing full budgets',template:continuing,set:setContinuing,window:draft.windows.continuing,preview:full}]).map(({label,template,set,window,preview})=><section key={label} aria-label={label} className="space-y-3 min-w-0">
    <h5 className="font-semibold">{label}</h5><p className="detail-copy">{window.start} – {addDays(window.end,-1)}{window.transition?' · short transition':''}</p>
    <MoneyField label={`${label}: expected income (AUD)`} value={template.income_cents} onChange={amount=>{set({...template,income_cents:amount,accept_gap:false});change()}}/>
    {template.lines.map(line=>s.details?.controls?.archives.some(a=>a.line_id===line.line_id)?<p key={line.line_id} className="detail-copy">{s.details?.items.find(i=>i.line_id===line.line_id)?.name}: archived · future allocation {fmtCents(0)}</p>:<MoneyField key={line.line_id} label={`${label}: ${s.details?.items.find(i=>i.line_id===line.line_id)?.name??s.lines?.find(i=>i.id===line.line_id)?.name??'Allowance'} (AUD)`} value={line.amount_cents} onChange={amount=>{set({...template,lines:template.lines.map(l=>l.line_id===line.line_id?{...l,amount_cents:amount}:l),accept_gap:false});change()}}/>)}
    {preview?<><p className={`body-copy ${preview.summary.fundingGap?'text-warn':''}`}>New allocations {fmtCents(preview.summary.allocated)} · {preview.summary.fundingGap?'Funding gap':'Still to plan'} {fmtCents(preview.summary.fundingGap||preview.summary.unallocated)}. Carry and existing reserves are not new income.</p>{!preview.limitsFit&&<p role="alert" className="body-copy text-neg">Your saved category allowances exceed this everyday amount. Increase it, or leave this preview and adjust category allowances first.</p>}
     <details><summary className="min-h-11 py-3 cursor-pointer">Check scheduled dates, overrides and goals</summary>{preview.schedules.map(item=><div key={item.line_id} className="py-3 space-y-2 border-t border-hair"><p className="body-copy font-semibold">{item.name}</p><p className="detail-copy">{item.dated_cents===null?'No dated schedule saved. Check your expected dates manually.':`Saved schedule: ${fmtCents(item.dated_cents)} on ${item.dates.join(', ')||'no dates in this window'}.`}</p>{item.dated_cents!==null&&item.dated_cents!==template.lines.find(l=>l.line_id===item.line_id)?.amount_cents&&<p className="detail-copy text-warn">Your allowance differs from the saved schedule. This is a manual override; it does not change payment dates or goal contribution schedules.</p>}{item.reserve_cents!==null&&<p className="detail-copy">Reserve at the end of the displayed budget: {fmtCents(item.reserve_cents)} (not a future bank balance). {item.due_date?`Target date ${item.due_date}; ${item.deadline_dates.length} saved contribution dates from this window's start through that deadline. No new completion date is promised.`:'No target date saved.'}</p>}</div>)}</details>
    </>:<p role="alert" className="body-copy text-neg">These totals or dates cannot be previewed safely. Reduce an amount or review the saved schedule.</p>}
   </section>)}</div>
   <p className="body-copy">Everyday carry remains governed by the previous budget’s saved review choice; no new carry policy is enabled. Reserves, original plans, source matches and reviews retain their identity.</p>
   <details><summary className="min-h-11 py-3 cursor-pointer">Category allowances kept in both budgets</summary>{s.details?.limits.length?s.details.limits.map(limit=><p key={limit.id} className="body-copy">{s.details?.taxonomy.find(c=>c.id===limit.category_id)?.name??limit.category_id}: {fmtCents(limit.amount_cents)}</p>):<p className="body-copy">No separate category allowances. Everyday spending stays in Other.</p>}</details>
   {review?<>
    <label className="flex min-h-11 gap-3 items-start"><input type="checkbox" checked={keepLimits} onChange={e=>setKeepLimits(e.target.checked)}/><span>I checked both date windows, expected pay and bills, goal schedules, manual overrides and the category allowances being kept.</span></label>
    {partial&&<label className="flex min-h-11 gap-3 items-start"><input type="checkbox" checked={incomplete} onChange={e=>setIncomplete(e.target.checked)}/><span>I understand this uses known activity only. Missing history may change carry and reserves.</span></label>}
    {([{label:'first',t:initial,set:setInitial,p:first},{label:'continuing',t:continuing,set:setContinuing,p:full}]).map(({label,t,set,p})=>!!p?.summary.fundingGap&&<label key={label} className="flex min-h-11 gap-3 items-start"><input type="checkbox" checked={t.accept_gap} onChange={e=>set({...t,accept_gap:e.target.checked})}/><span>I accept the {fmtCents(p.summary.fundingGap)} funding gap in the {label} budget.</span></label>)}
    <p className="body-copy">Save keeps one pending change. Nothing switches yet. You can cancel it, or undo the latest compatible choice. Applying it after its start date creates a saved period, which cannot be deleted with Undo.</p>
    <Button type="submit" disabled={!first?.limitsFit||!full?.limitsFit||!keepLimits||(partial&&!incomplete)||!!first.summary.fundingGap&&!initial.accept_gap||!!full.summary.fundingGap&&!continuing.accept_gap}>Save future frequency change</Button>
   </>:<Button disabled={!first?.limitsFit||!full?.limitsFit} onClick={()=>{if(form.current?.reportValidity())setReview(true)}}>Review frequency change</Button>}
  </fieldset>
  <Button variant="ghost" disabled={b.busy||!!b.pending} onClick={()=>{if(window.confirm('Leave this frequency preview? No frequency change has been saved unless its save was confirmed.'))close()}}>Leave frequency preview</Button>
 </form>
}

function MoneyField({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}){
 const [text,setText]=useState(()=>moneyEntry(value))
 return <label className="grid gap-2"><span className="field-label">{label}</span><input aria-label={label} className="budget-input" inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?" value={text} onChange={e=>{setText(e.target.value);const amount=parseBudgetMoney(e.target.value);e.target.setCustomValidity(amount===null?'Enter a non-negative amount with up to two decimal places.':'');if(amount!==null)onChange(amount)}}/></label>
}
