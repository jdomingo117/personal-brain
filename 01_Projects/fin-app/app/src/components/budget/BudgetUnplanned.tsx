import {Button} from '../Controls'
import {fmtCents} from '../../data'
import type {BudgetPresentation} from '../../lib/budgetPresentation'

const storageKey=(periodId:string)=>`halcyon-budget-unplanned-ok:${periodId}`
export function readUnplannedOk(periodId:string){try{return localStorage.getItem(storageKey(periodId))==='1'}catch{return false}}
export function writeUnplannedOk(periodId:string,ok:boolean){try{if(ok)localStorage.setItem(storageKey(periodId),'1');else localStorage.removeItem(storageKey(periodId))}catch{/* convenience only */}}

/** Whether the prompt below would show: known, positive unplanned pay in a current or future budget. */
export function hasUnplanned(p:BudgetPresentation){return p.phase!=='past'&&p.income.unallocated.availability==='known'&&p.income.unallocated.cents>0}

/**
 * Expected pay without a job is the most common "what now?" moment after setup.
 * Shown as a next step, not a warning: leaving some unplanned as a buffer is
 * fine, and the owner can say so (remembered per period on this device only).
 */
export default function BudgetUnplanned({presentation:p,ok,setOk,hasBills,canWrite,onAddBill,onSave,onFindBills}:{
  presentation:BudgetPresentation;ok:boolean;setOk:(ok:boolean)=>void;hasBills:boolean;canWrite:boolean;onAddBill:()=>void;onSave:()=>void;onFindBills?:()=>void
}){
  const unplanned=p.income.unallocated,expected=p.income.expected
  if(!hasUnplanned(p)||unplanned.availability!=='known')return null
  const share=expected.availability==='known'&&expected.cents>0?Math.round(unplanned.cents/expected.cents*100):null
  if(ok)return <p id="budget-unplanned" tabIndex={-1} className="budget-unplanned-quiet detail-copy">{fmtCents(unplanned.cents)} kept unplanned as a buffer. <button type="button" className="underline" onClick={()=>setOk(false)}>Plan it</button></p>
  return <section id="budget-unplanned" tabIndex={-1} className="budget-unplanned" aria-labelledby="budget-unplanned-title">
    <h3 id="budget-unplanned-title">{fmtCents(unplanned.cents)} of your pay isn’t planned yet</h3>
    <p className="body-copy">{share!==null&&<>That’s {share}% of the {expected.availability==='known'?fmtCents(expected.cents):''} you expect this budget. </>}Giving it a job means you know what it’s for before it gets spent.</p>
    <ul className="budget-unplanned-options">
      <li><div><strong>{hasBills?'Any other bills':'Your bills first'}</strong><span className="detail-copy text-muted">{hasBills?'Anything regular that isn’t in your plan yet.':'Rent, insurance, phone and subscriptions. None are in this plan yet.'}</span></div>
        <div className="budget-unplanned-actions"><Button variant={hasBills?'ghost':'primary'} disabled={!canWrite} onClick={onAddBill}>Add a bill</Button>{onFindBills&&<button type="button" className="budget-text-action" onClick={onFindBills}>Find bills in my spending</button>}</div></li>
      <li><div><strong>Something you’re saving for</strong><span className="detail-copy text-muted">A trip, a car, an emergency fund.</span></div>
        <div className="budget-unplanned-actions"><Button variant="ghost" disabled={!canWrite} onClick={onSave}>Save for something</Button></div></li>
      <li><div><strong>Keep it as a buffer</strong><span className="detail-copy text-muted">Fine if your pay or spending varies. It just stays unplanned.</span></div>
        <div className="budget-unplanned-actions"><button type="button" className="budget-text-action" onClick={()=>setOk(true)}>That’s fine for now</button></div></li>
    </ul>
  </section>
}
