import type {BudgetPresentation} from '../../lib/budgetPresentation'
import BudgetValue from '../BudgetValue'
import {Button} from '../Controls'

const purposes={everyday:'Everyday spending',fixed:'Bills & regular payments',reserve:'Money set aside',contribution:'Planned transfers'}
/** Saved allocation facts only. Editing and financial arithmetic stay in their existing controllers. */
export default function BudgetPlan({presentation:p,canEdit,onEdit,onActivity}:{presentation:BudgetPresentation;canEdit:boolean;onEdit:()=>void;onActivity:()=>void}){
 const gap=p.income.unallocated.availability==='known'&&p.income.unallocated.cents<0
 const futureGap=p.income.futureUnallocated.availability==='known'&&p.income.futureUnallocated.cents<0
 return <section className="budget-plan" aria-label="Saved allocation plan">
  <header className="budget-plan-heading"><div><p className="budget-eyebrow">{p.phase==='past'?'Selected past budget':p.phase==='future'?'Selected future budget':'Your saved plan'}</p><h3>Your allowances</h3><p className="budget-plan-lead">A purpose for your money.</p></div><Button disabled={!canEdit} onClick={onEdit}>Adjust plan</Button></header>
  <p className="body-copy text-muted">Planned amounts for the selected dates. These are allocations, not recorded payments or a bank balance.</p>
  {p.income.expected.freshness==='stale'&&<p role="status" className="outcome-panel">Previously loaded plan · these figures may be out of date.</p>}
  <dl className="budget-plan-resources"><div><dt>Expected income</dt><dd><BudgetValue name="plan-income" value={p.income.expected}/></dd></div><div><dt>Existing cash to use once</dt><dd><BudgetValue name="plan-cash-once" value={p.income.cashOnce}/></dd></div></dl>
  {p.plan.lines.length?<dl className="budget-plan-lines">{p.plan.lines.map(line=><div key={line.id} data-plan-line={line.id} className="budget-plan-line"><dt><strong>{line.name}</strong><span>{purposes[line.kind]}{line.archived?' · Archived; saved allowance retained':''}</span>{line.opening.availability==='known'&&line.opening.cents>0&&<span>Existing reserve at setup: <BudgetValue value={line.opening}/>. Separate from this allocation.</span>}</dt><dd><BudgetValue name={`plan-line-${line.id}`} value={line.planned}/></dd></div>)}</dl>:<p className="body-copy">Saved allocations are unavailable. Refresh before reviewing this plan.</p>}
  <dl className={`budget-plan-unallocated ${gap?'text-warn':''}`}><dt>{gap?'Funding gap':'Still to plan'}</dt><dd><BudgetValue name="plan-unallocated" value={p.income.unallocated}/></dd></dl>
  <p className="detail-copy text-muted">Existing reserves and carried amounts are separate from new allocations. Adjusting this plan does not move bank money.</p>
  <Button variant="ghost" onClick={onActivity}>View allowance activity</Button>
  <details className="budget-plan-future"><summary>See saved future allowances</summary><p className="body-copy">Continuing plan · separate from the selected budget. Existing-cash top-ups are not repeated. A scheduled frequency change keeps its separately reviewed amounts in settings.</p><dl className="budget-plan-resources"><div><dt>Future expected income</dt><dd><BudgetValue name="plan-future-income" value={p.plan.futureIncome}/></dd></div></dl>
   {p.plan.futureAvailable&&p.plan.futureLines.length>0?<dl className="budget-plan-lines">{p.plan.futureLines.map(line=><div key={line.id} data-future-plan-line={line.id} className="budget-plan-line"><dt>{line.name}</dt><dd><BudgetValue name={`plan-future-line-${line.id}`} value={line.planned}/></dd></div>)}</dl>:<p className="body-copy">Saved future allowances are unavailable. Refresh the budget before reviewing them.</p>}
   <dl className={`budget-plan-unallocated ${futureGap?'text-warn':''}`}><dt>{futureGap?'Future funding gap':'Future still to plan'}</dt><dd><BudgetValue name="plan-future-unallocated" value={p.income.futureUnallocated}/></dd></dl>
  </details>
 </section>
}
