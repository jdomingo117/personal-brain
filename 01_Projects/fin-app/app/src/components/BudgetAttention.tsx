import {useEffect,useRef,useState} from 'react'
import {useBudget} from '../contexts/BudgetContext'
import {Button,DateInput} from './Controls'
import {fmtCents} from '../data'
import {fromSnapshot} from '../lib/budgetWorkspace'
import {attentionMessage,attentionToken,defaultAttentionDate,validAttentionDate,type AttentionIssue} from '../lib/budgetAttention'

export default function BudgetAttention(){
 const b=useBudget(),s=b.snapshot!,a=s.details?.attention,root=useRef<HTMLElement>(null)
 const [selected,setSelected]=useState<string|null>(null),[choice,setChoice]=useState<'acknowledged'|'snoozed'>('acknowledged'),[date,setDate]=useState(''),[accepted,setAccepted]=useState(false),[token,setToken]=useState('')
 const [all,setAll]=useState(false),heading=useRef<HTMLHeadingElement>(null),lastKey=useRef<string|null>(null)
 useEffect(()=>{setSelected(null);setAccepted(false);setAll(false)},[s.period?.id])
 useEffect(()=>{setAccepted(false)},[s.source_revision,s.plan?.version,a?.version])
 useEffect(()=>{if(!selected)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[selected])
 useEffect(()=>{if(!selected)return;const leave=(e:Event)=>{if(!window.confirm('Leave this unsaved review choice? Your budget and saved reminders stay unchanged.'))e.preventDefault();else{setSelected(null);setAccepted(false)}};window.addEventListener('budget-before-period-navigation',leave);return()=>window.removeEventListener('budget-before-period-navigation',leave)},[selected])
 useEffect(()=>{if(selected)heading.current?.focus()},[selected])
 if(!a||!s.plan||!s.period)return null
 const issue=a.items.find(i=>i.key===selected),currentToken=issue?attentionToken(issue,s.source_revision,s.plan.version,a.version):'',stale=!!selected&&(!issue||token!==currentToken),editable=b.canWrite&&a.editable
 const active=a.items.filter(i=>i.state==='active'),shown=all?a.items:active.slice(0,3),money=a.items.filter(i=>i.state!=='active'&&i.gap_cents!==null)
 function focusBack(){requestAnimationFrame(()=>{const buttons=root.current?.querySelectorAll<HTMLButtonElement>('button[data-issue]');const target=Array.from(buttons??[]).find(el=>el.dataset.issue===lastKey.current);(target??root.current?.querySelector<HTMLElement>('h3'))?.focus()})}
 function open(i:AttentionIssue){if(selected&&!window.confirm('Leave the unsaved review choice? Your saved budget and earlier review preferences will stay unchanged.'))return;lastKey.current=i.key;setSelected(i.key);setToken(attentionToken(i,s.source_revision,s.plan!.version,a!.version));setAccepted(false);setChoice('acknowledged');setDate(defaultAttentionDate(a!.as_of,s.period!.end_date))}
 function close(){setSelected(null);setAccepted(false);focusBack()}
 function inspect(i:AttentionIssue){const el=document.querySelector<HTMLElement>(i.line_id?`[data-budget-line="${i.line_id}"]`:'[aria-label="Bills and savings goals"]');if(el){el.tabIndex=-1;el.focus();el.scrollIntoView({block:'start',behavior:'auto'})}}
 return <section ref={root} aria-label="Budget checks" className="glass mt-4 p-5 space-y-4">
  <h3 tabIndex={-1} className="font-display text-xl font-bold">A few things to check</h3>
  <p className="body-copy">{a.active_count} to check · {a.total-active.length} reviewed or snoozed. Reviewing changes reminders, not your allowances, spending or bank balance.</p>
  {s.details?.controls?.paused&&<p className="detail-copy">Your budget is paused, but real bills and recorded spending can still need attention.</p>}
  {active.length===0&&<p className="outcome-panel">{a.total?'Nothing new to review right now. Earlier checks remain available below.':'No issues detected in the available information. This is not a guarantee that every payment is recorded or that money is available to spend.'}</p>}
  {money.length>0&&<div className="space-y-2"><h4 className="font-semibold">These gaps still remain</h4><p className="detail-copy">Reviewed or snoozed does not mean resolved. Parent and category amounts can overlap—do not add these together.</p><ul className="space-y-2 body-copy">{money.map(i=><li key={i.key} className="flex flex-wrap justify-between gap-2"><span>{i.label} · {i.state==='snoozed'?`show again ${i.until}`:'reviewed'}</span><strong className="tabular-nums">{fmtCents(-i.gap_cents!)}</strong></li>)}</ul></div>}
  <ul className="space-y-4">{shown.map(i=><li key={i.key} className="outcome-panel space-y-3" aria-label={`Budget check: ${i.label}`}>
   <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{i.label}</h4><span className="detail-copy">{i.state==='active'?'Needs a look':i.state==='snoozed'?`Snoozed until ${i.until}`:'Reviewed'}{i.due_date?` · ${i.kind==='bill_unmatched'?'Payment date':'Target date'} ${i.due_date}`:''}</span></div>
   <p className="body-copy">{attentionMessage(i)}</p>
   {i.gap_cents!==null&&<p className="body-copy">{i.kind==='bill_unmatched'?'Still to match':'Plan shortfall'}: <strong className="tabular-nums">{fmtCents(-i.gap_cents)}</strong></p>}
   {i.reopened&&<p className="detail-copy text-warn">{i.reopen_reason==='expired'?'Time to check again.':i.reopen_reason==='gap_worsened'?'This shortfall has grown enough to need another look.':i.reopen_reason==='due_date_changed'?'The date changed, so this needs another look.':'The relevant evidence changed, so this needs another look.'}</p>}
   <div className="flex flex-wrap gap-3">
    {i.line_id||i.kind==='overspend'?<Button variant="ghost" onClick={()=>inspect(i)}>Inspect allowance</Button>:['changed_matches','unassigned_credits','uncategorized'].includes(i.kind)?<a href="/ledger" className="inline-flex min-h-11 items-center text-accent-ink underline">Review in Ledger</a>:i.kind==='check_data'?<a href="/accounts" className="inline-flex min-h-11 items-center text-accent-ink underline">Check accounts and imports</a>:<Button variant="ghost" disabled={!editable||!s.details?.lifecycle?.is_latest} onClick={()=>{if(!selected||window.confirm('Leave this unsaved review choice and adjust the plan? No review preference has been saved.'))b.setEditing(fromSnapshot(s))}}>Adjust plan</Button>}
    {i.state!=='active'&&<Button variant="ghost" disabled={!editable} onClick={()=>{if(window.confirm('Show this check again now? Your budget amounts stay unchanged.'))void b.run({action:'set_attention',plan_id:s.plan!.id,period_id:s.period!.id,expected_plan:s.plan!.version,expected_attention:a.version,issue_key:i.key,issue_hash:i.issue_hash,state:'active',until:null})}}>Show this again now</Button>}
    <button type="button" data-issue={i.key} disabled={!editable} className="min-h-11 rounded-lg border border-[var(--hair)] px-4 py-3 disabled:opacity-50" onClick={()=>open(i)}>Review this check</button>
   </div>
  </li>)}</ul>
  {a.total>0&&<Button variant="ghost" onClick={()=>setAll(!all)}>{all?'Show priority checks':`See all ${a.total} budget checks`}</Button>}
  {!a.editable&&<p className="detail-copy">Earlier and future checks are read-only. Reminder preferences are available for the budget currently in progress.</p>}
  {selected&&<form aria-busy={b.busy} aria-label="Review budget check" className="outcome-panel space-y-4" onSubmit={async e=>{e.preventDefault();if(!issue||stale||!accepted)return;const result=await b.run({action:'set_attention',plan_id:s.plan!.id,period_id:s.period!.id,expected_plan:s.plan!.version,expected_attention:a.version,issue_key:issue.key,issue_hash:issue.issue_hash,state:choice,until:choice==='snoozed'?date:null});if(result)close()}}>
   <h4 ref={heading} tabIndex={-1} className="font-semibold">Choose when to look at this again · {issue?.label??'Check changed'}</h4>
   {stale&&<p role="alert" className="body-copy text-warn">The saved facts changed. Your choice is retained, but you need to review the latest check before saving.</p>}
   <fieldset disabled={!editable||stale} className="space-y-3">
    <label className="flex min-h-11 items-start gap-3"><input type="radio" name="attention-choice" checked={choice==='acknowledged'} onChange={()=>{setChoice('acknowledged');setAccepted(false)}}/><span>I’ve reviewed this · keep the reminder quiet until this budget ends, unless something important changes.</span></label>
    <label className="flex min-h-11 items-start gap-3"><input type="radio" name="attention-choice" checked={choice==='snoozed'} onChange={()=>{setChoice('snoozed');setAccepted(false)}}/><span>Remind me on a date I choose.</span></label>
    {choice==='snoozed'&&<label className="grid gap-2"><span className="field-label">Show this again on</span><DateInput ariaLabel="Show this again on" value={date} onChange={value=>{setDate(value);setAccepted(false)}}/><span className="detail-copy">Choose a date after {a.as_of}, no later than {s.period.end_date}.</span></label>}
    <p className="body-copy">This does not fix the issue or change money. {issue?.gap_cents!=null?<>A shortfall that grows by at least {fmtCents(issue.threshold_cents)}, a changed due date or a meaningful change in evidence brings the check back sooner. Small ordinary spending changes do not repeatedly reset it.</>:'A meaningful change in the relevant evidence brings this check back sooner.'}</p>
    <label className="flex min-h-11 items-start gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I understand the budget amounts and any shortfall stay unchanged.</span></label>
    <Button type="submit" disabled={!accepted||choice==='snoozed'&&!validAttentionDate(date,a.as_of,s.period.end_date)}>Save review preference</Button>
   </fieldset>
   {stale&&issue&&<Button variant="ghost" disabled={!editable} onClick={()=>{setToken(currentToken);setAccepted(false)}}>Review latest check</Button>}
   <Button variant="ghost" disabled={b.busy||!!b.pending} onClick={()=>{if(window.confirm('Leave this unsaved review choice? Budget amounts and saved reminder preferences will stay unchanged.'))close()}}>Leave review choice</Button>
  </form>}
  {a.undo_operation_id&&<Button variant="ghost" disabled={!editable||!!selected} onClick={()=>{if(window.confirm('Undo the latest review preference? The earlier reminder choice will be restored; budget amounts stay unchanged.'))void b.run({action:'undo',operation_id:a.undo_operation_id})}}>Undo last review preference</Button>}
 </section>
}
