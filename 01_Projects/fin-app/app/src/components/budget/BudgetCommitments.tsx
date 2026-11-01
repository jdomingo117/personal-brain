import type { ReactNode } from 'react'
import type { BudgetItem } from '../../lib/budgetItems'
import type { BudgetPresentation } from '../../lib/budgetPresentation'
import BudgetValue from '../BudgetValue'

/** Each saved line stays inspectable; disclosure state never submits a command. */
export default function BudgetCommitments({items,presentation:p,renderItem}:{items:BudgetItem[];presentation:BudgetPresentation;renderItem:(item:BudgetItem)=>ReactNode}){
 const groups=[{kind:'fixed',title:'Bills & regular payments',hint:'Payment dates and matched activity.'},{kind:'reserve',title:'Upcoming costs',hint:'Money set aside in your plan for later costs.'},{kind:'contribution',title:'Planned transfers',hint:'Planned contributions and separate funding evidence.'}]
 return <section className="budget-commitments" aria-label="Your commitments"><div className="budget-commitments-heading"><p className="micro text-muted">ALREADY IN YOUR PLAN</p><h3>Bills & commitments</h3></div>
  {p.coverage!=='complete'&&<p className="budget-commitment-notice">{p.coverage==='none'?'Manual plan · recorded payments are unavailable.':p.coverage==='unknown'?'Selected-account activity is unavailable.':'Known activity only · missing history can change matched amounts and balances.'}</p>}
  {p.phase==='future'&&<p className="budget-commitment-notice">Future plan · recorded payments are unavailable for these dates.</p>}
  {p.everyday.remaining.freshness==='stale'&&<p className="budget-commitment-notice">Previously loaded figures · refresh or check the saved result before relying on them.</p>}
  {!items.some(i=>['fixed','reserve','contribution'].includes(i.kind)&&i.config?.type!=='goal')&&<p className="detail-copy text-muted">No bills or commitments in this saved plan.</p>}
  {groups.map(group=>{const lines=items.filter(i=>i.kind===group.kind&&i.config?.type!=='goal');if(!lines.length)return null;return <div key={group.kind} className="budget-commitment-group"><h4>{group.title}</h4>
   {lines.length?lines.map(item=>{const model=p.commitments.find(row=>row.id===item.line_id),observed=p.actuals.net.availability==='known'&&p.actuals.net.freshness==='current'&&p.phase!=='future',next=item.occurrences.find(o=>o.matched_cents<o.expected_cents),schedule=group.kind==='fixed'&&item.config?.state==='saving'&&item.occurrences.length>0?(observed?(next?`${next.date} · Still expected`:'Scheduled charges matched'):'Recorded payments unavailable'):null;return <details className="budget-commitment" key={item.line_id} data-budget-commitment={item.line_id}>
    <summary><span className="budget-commitment-name"><strong>{item.name}</strong><small>{item.archived?'Archived · history preserved':!item.config?'Finish setup':item.config.state==='paused'?'Paused':item.config.state==='draft'?'Draft':item.config.state==='purchase-recorded'?'Purchase recorded':schedule??'View dates and details'}{item.changed_claims>0?` · ${item.changed_claims} match(es) need review`:''}</small></span><span className="budget-commitment-amount"><small>Planned this period</small>{model?<BudgetValue name={`commitment-planned:${item.line_id}`} value={model.planned}/>:<span>Unavailable</span>}</span><svg className="budget-commitment-chevron" aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="m7 4 5 5-5 5" stroke="currentColor" strokeWidth="1.5"/></svg></summary>
    <div className="budget-commitment-content">{renderItem(item)}</div>
   </details>}):<p className="budget-commitment-empty">No {group.title.toLowerCase()} in this saved plan.</p>}
  </div>})}
 </section>
}
