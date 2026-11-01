import { Button } from '../Controls'
import BudgetValue from '../BudgetValue'
import { goalEstimate, type BudgetItem } from '../../lib/budgetItems'
import type { BudgetPresentation } from '../../lib/budgetPresentation'
import type { Snapshot } from '../../lib/budgetWorkspace'
import { fmtCents } from '../../data'

type Props={items:BudgetItem[];presentation:BudgetPresentation;snapshot:Snapshot;canWrite:boolean;onAdjust:(item:BudgetItem)=>void;onMatch:(item:BudgetItem)=>void;onAdd:()=>void}
function GoalArt(){return <svg className="budget-goal-art" aria-hidden="true" viewBox="0 0 240 125" fill="none"><circle cx="166" cy="42" r="23" fill="currentColor" opacity=".1"/><path d="M10 110 78 26l45 58 28-35 77 61" stroke="currentColor" strokeWidth="1.5"/><path d="m55 55 23 12 16-19M132 73l19 11 12-18M0 117h240" stroke="currentColor" opacity=".5"/><path d="m150 10 61 7-25 11 2 19-10-13-17 8 8-17-19-15Z" stroke="currentColor" strokeWidth="1.5"/></svg>}
export default function BudgetGoals({items,presentation:p,snapshot:s,canWrite,onAdjust,onMatch,onAdd}:Props){
 const goals=items.filter(i=>i.config?.type==='goal')
 const featured=goals.find(i=>i.config?.featured)??goals.find(i=>!i.archived)??goals[0]
 function card(item:BudgetItem,primary:boolean){
  const c=item.config!,m=p.goals.find(g=>g.id===item.line_id)
  if(!m)return <article key={item.line_id} data-budget-line={item.line_id}><h4>{item.name}</h4><p className="budget-goal-notice">Goal figures need a fresh, compatible Budget read.</p><Button variant="ghost" disabled={!canWrite||item.archived} onClick={()=>onAdjust(item)}>Adjust {item.name}</Button><Button variant="ghost" disabled={!canWrite} onClick={()=>onMatch(item)}>Match activity</Button></article>
  let estimate:ReturnType<typeof goalEstimate>=null
  // Estimate only from qualified current facts, using the server's local as-of date.
  if(!item.archived&&!s.details?.controls?.paused&&p.phase==='current'&&p.period?.asOf&&m.reserve.availability==='known'&&m.purchases.availability==='known'&&m.reserve.freshness==='current'&&m.purchases.freshness==='current'){
   try{estimate=goalEstimate(item,s,p.period.asOf)}catch{/* Missing inputs have no invented finish date. */}
  }
  const state=item.archived?'Archived · history preserved':c.state==='purchase-recorded'?'Purchase recorded':c.state==='draft'?'A thought for later':c.state==='paused'||s.details?.controls?.paused?'Taking a pause':'Something to look forward to'
  return <article key={item.line_id} data-budget-line={item.line_id} data-budget-featured={primary} className={`budget-goal-card${primary?' budget-goal-featured':''}`}>
   <p className="micro text-muted">{c.featured?'Featured goal · ':''}{state}</p><h4>{item.name}</h4>{primary&&<GoalArt/>}
   {c.target_cents===null?<p className="body-copy">No price yet. This goal is a draft, with no invented finish date.</p>:<p className="body-copy">{c.estimated?'Estimated target':'Target'} <BudgetValue name={`goal-target:${item.line_id}`} value={m.target}/>{c.due_date?` · Money needed by ${c.due_date}`:''}</p>}
   <dl className="budget-totals"><dt>Planned this period</dt><dd><BudgetValue name={`goal-planned:${item.line_id}`} value={m.planned}/></dd><dt>Set aside in your budget</dt><dd><BudgetValue name={`goal-reserve:${item.line_id}`} value={m.reserve}/></dd><dt>Transfers matched</dt><dd><BudgetValue name={`goal-bank:${item.line_id}`} value={m.bankConfirmed}/></dd><dt>You’ve confirmed</dt><dd><BudgetValue name={`goal-user:${item.line_id}`} value={m.userConfirmed}/></dd></dl>
   <p className="detail-copy text-muted">The budget reserve, matched transfers and your confirmations are separate measures. They are not added together.</p>
   {c.state!=='purchase-recorded'&&c.target_cents!==null&&c.target_cents>0&&m.reserve.availability==='known'&&<div className="budget-goal-reserve-track"><p className="detail-copy">Budget reserve toward the target</p><progress className="budget-goal-progress" aria-label={`${item.name} budget reserve toward target`} max={c.target_cents} value={Math.max(0,Math.min(c.target_cents,m.reserve.cents))}/><p className="detail-copy text-muted">This track shows the budget reserve only; it does not verify money in a bank account.</p></div>}
   {(item.net_purchases_cents!==0||c.state==='purchase-recorded')&&<p className="body-copy">Purchases after matched refunds: <BudgetValue name={`goal-purchases:${item.line_id}`} value={m.purchases}/>. This achievement history stays with your goal.</p>}
   {c.state==='paused'||s.details?.controls?.paused?<p className="detail-copy">No finish date while contributions are paused. Your saved reserve remains visible.</p>:c.state==='purchase-recorded'?<p className="detail-copy">Your purchase stays in the history. No automatic refill is planned.</p>:estimate&&<p className="detail-copy text-muted">{estimate.timing.state==='estimated'?`At this pace: ${estimate.timing.contributionsNeeded} further contributions, around ${estimate.timing.estimatedDate}.`:estimate.timing.state==='beyond-horizon'?'The plan needs more than the next 12 months of contributions.':estimate.timing.state==='covered'?'Your target is covered in the plan; check actual savings before buying.':estimate.timing.state==='inactive'?'No finish date while contributions are paused or zero.':'Add a target to estimate timing.'}{estimate.due?.shortfall?` Deadline gap at this amount: ${fmtCents(estimate.due.shortfall)}.`:''}</p>}
   {item.archived&&<p className="detail-copy">Archived · future allocations are zero. History and any remaining balance stay visible; later activity can still need review.</p>}
   {item.changed_claims>0&&<p className="budget-goal-notice">{item.changed_claims} match(es) need review because the source changed. They no longer count as verified evidence.</p>}
   <p className="detail-copy text-muted">Planned amounts are not bank transfers or proof of cash available. Matched funding does not add the same money to your reserve again.</p>
   {c.planning_goal_id&&<a className="budget-text-action" href="/income">View linked Planning goal in Income · no scenario was changed</a>}
   <div className="budget-goal-actions"><Button variant="ghost" disabled={!canWrite||item.archived} onClick={()=>onAdjust(item)}>Adjust {item.name}</Button><Button variant="ghost" disabled={!canWrite} onClick={()=>onMatch(item)}>Match activity</Button></div>
  </article>
 }
 return <section className="budget-goals" aria-label="Your savings goals"><div className="budget-goals-heading"><p className="micro text-muted">A LITTLE POSSIBILITY</p><h3>Things you’re saving for</h3></div>
  {p.coverage!=='complete'&&<p className="budget-goal-notice">{p.coverage==='none'?'Manual plan · recorded purchases are unavailable.':p.coverage==='unknown'?'Selected-account activity is unavailable.':'Known activity only · missing history can change reserves and evidence.'}</p>}
  {p.phase==='future'&&<p className="budget-goal-notice">Future plan · balances are provisional and recorded purchases are unavailable.</p>}
  {p.everyday.remaining.freshness==='stale'&&<p className="budget-goal-notice">Previously loaded figures · refresh or check the saved result before relying on them.</p>}
  {goals.length?goals.map(item=>{const m=p.goals.find(g=>g.id===item.line_id),c=item.config!,progress=c.state!=='purchase-recorded'&&c.target_cents!==null&&c.target_cents>0&&m?.reserve.availability==='known'&&m.reserve.freshness==='current'&&m.target.availability==='known'&&m.target.cents>0&&m.target.freshness==='current';return <details className="budget-goal-compact" key={item.line_id} data-budget-goal-detail={item.line_id}>
   <summary><span className="budget-goal-summary-heading"><h4>{item.name}</h4><small>{item.archived?'Archived':c.state==='draft'?'Draft · target not confirmed':c.state==='paused'?'Paused':c.state==='purchase-recorded'?'Purchase recorded':'Plan reserve'}{item.changed_claims>0?' · Matches need review':''}</small></span><span className="budget-goal-summary-amount">{m?<BudgetValue name={`goal-summary-reserve:${item.line_id}`} value={m.reserve}/>: 'Unavailable'}{c.target_cents!==null&&<> / {m?<BudgetValue name={`goal-summary-target:${item.line_id}`} value={m.target}/>: 'Unavailable'} target</>}</span><span aria-hidden="true">+</span>
   {progress&&<progress className="budget-goal-compact-progress" aria-label={`${item.name} planned reserve, not confirmed bank funding`} max={m.target.availability==='known'?m.target.cents:1} value={Math.max(0,Math.min(m.target.availability==='known'?m.target.cents:0,m.reserve.availability==='known'?m.reserve.cents:0))}/>}
   <span className="budget-goal-summary-note">{c.estimated&&c.target_cents!==null?'Estimated target · ':''}Plan amounts, not confirmed cash · open for funding and controls</span></summary>
   {card(item,item===featured)}
  </details>}):<div className="budget-goal-empty"><h4>Make room for something</h4><Button variant="ghost" disabled={!canWrite} onClick={onAdd}>Start a savings goal</Button></div>}

 </section>
}
