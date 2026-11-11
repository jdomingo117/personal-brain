import BudgetValue from '../BudgetValue'
import { Button } from '../Controls'
import type { BudgetPresentation } from '../../lib/budgetPresentation'

type Props={presentation:BudgetPresentation;canWrite:boolean;rollover:boolean;policyManaged:boolean;credits:string;excluded:string;onMove:()=>void;onLimits:()=>void;onActivity:()=>void;onReserve:()=>void;onTransfer:()=>void}
/** Read-only rows use canonical balances; opening a detail never changes the plan. */
export default function BudgetEveryday({presentation:p,canWrite,rollover,policyManaged,credits,excluded,onMove,onLimits,onActivity,onReserve,onTransfer}:Props){
 const rows=p.categoryMode==='limits'?[...p.categories.map(c=>({...c,usedName:`category-used:${c.id}`,remainingName:`category-remaining:${c.id}`,plannedName:`category-planned:${c.id}`,carryName:`category-carry:${c.id}`})),
  {...p.other,id:'other',name:'Other everyday spending',usedName:'other-used',remainingName:'other-remaining',plannedName:'other-planned',carryName:'other-carry'}]:[
  {...p.everyday,id:p.everyday.id??'everyday',name:'Everyday spending',usedName:'everyday-spent',remainingName:'everyday-remaining',plannedName:'everyday-planned',carryName:'everyday-carry'}]
 return <section className="budget-everyday" aria-label="Your everyday spending">
  <div className="budget-everyday-heading"><div><p className="micro text-muted">DAY-TO-DAY COSTS</p><h3>Your everyday spending</h3></div><span className="budget-everyday-tag">{p.categoryMode==='unavailable'?'Category details unavailable':p.categoryMode==='limits'?'Category limits on':'One shared allowance'}</span></div>
  <p className="budget-everyday-intro">{p.categoryMode==='limits'?'Keep an eye on a few categories. The rest stays together.':'One allowance covers everyday costs. Category limits are optional.'}</p>
  {p.coverage==='none'&&<p className="budget-everyday-notice">Manual plan · recorded spending is unavailable; remaining amounts are provisional.</p>}
  {p.phase==='future'&&<p className="budget-everyday-notice">Future allowance · balances are provisional and spending is not recorded activity.</p>}
  {p.everyday.remaining.freshness==='stale'&&<p className="budget-everyday-notice">Previously loaded amounts · finish the data check or check the saved result before relying on these figures.</p>}
  {p.everyday.remaining.availability==='unavailable'&&<p className="budget-everyday-notice">Balances are unavailable. Refresh saved data before relying on them.</p>}
  {p.categoryMode!=='pool'&&<dl className="budget-everyday-total" aria-label="Shared everyday total"><div><dt>Planned</dt><dd><BudgetValue name="everyday-planned" value={p.everyday.planned}/></dd></div><div><dt>Spent</dt><dd><BudgetValue name="everyday-spent" value={p.everyday.spent}/></dd></div><div><dt>Left in total</dt><dd><BudgetValue name="everyday-remaining" value={p.everyday.remaining}/></dd></div></dl>}
  {p.categoryMode==='unavailable'?<p className="budget-everyday-notice">Category figures need a fresh, compatible Budget read.</p>:<>
   <div className="budget-everyday-columns" aria-hidden="true"><span>Allowance</span><span>Planned</span><span>Spent</span><span>Left</span></div>
   <ul className="budget-everyday-rows">{rows.map(row=>{
    const over=row.remaining.availability==='known'&&row.remaining.cents<0
    return <li key={row.id} data-budget-category={row.id}><details className="budget-everyday-row">
     <summary><span className="budget-everyday-name"><strong>{row.name}</strong><small>Details</small></span>
      <span className="budget-everyday-number"><small>Planned</small><BudgetValue name={row.plannedName} value={row.planned}/></span>
      <span className="budget-everyday-number"><small>Spent</small><BudgetValue name={row.usedName} value={row.spent}/></span>
      <span className={`budget-everyday-number${over?' text-neg':''}`}><small>{over?'Over plan':'Left'}</small><strong><BudgetValue name={row.remainingName} value={row.remaining}/></strong>{over&&<span className="budget-everyday-over">Over plan</span>}</span>
     </summary>
     <div className="budget-everyday-detail"><dl className="budget-totals"><dt>{rollover?'Carried across categories':'Carried over'}</dt><dd><BudgetValue name={row.carryName} value={row.carry}/></dd></dl>
      <p className="detail-copy text-muted">{p.categoryMode==='limits'?'This is part of the shared everyday allowance. Its remaining balance includes applicable carry and allowance movements.':'One amount for all everyday spending. Category limits are optional.'}</p>
      <div className="budget-everyday-actions"><Button variant="ghost" disabled={!canWrite} onClick={onMove}>Move an allowance</Button><Button variant="ghost" disabled={!canWrite} onClick={onActivity}>Review activity & credits</Button></div>
     </div>
    </details></li>
   })}</ul>
  </>}
  <div className="budget-everyday-footer"><Button variant="ghost" disabled={!canWrite||policyManaged} onClick={onLimits}>Category limits</Button><span className="detail-copy text-muted">One shared total. Nothing counted twice.</span></div>
  {policyManaged&&<p className="budget-everyday-notice">Use Rollover and category settings to change next-budget categories and decide where their balances go.</p>}
  <p className="detail-copy text-muted">Bills and set-asides you match aren’t counted as everyday spending too. Unmatched refunds ({credits}) and spending you’ve excluded ({excluded}) stay separate.</p>
  <div className="budget-everyday-actions budget-everyday-tools"><Button variant="ghost" disabled={!canWrite} onClick={onMove}>Move an allowance</Button><Button variant="ghost" disabled={!canWrite} onClick={onActivity}>Review activity & credits</Button><Button variant="ghost" disabled={!canWrite} onClick={onReserve}>Add a set-aside fund</Button><Button variant="ghost" disabled={!canWrite} onClick={onTransfer}>Plan a transfer</Button></div>
 </section>
}
