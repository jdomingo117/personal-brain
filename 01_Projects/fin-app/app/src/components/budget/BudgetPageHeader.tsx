import { useBudget } from '../../contexts/BudgetContext'
import { Select } from '../Controls'
import { addDays } from '../../lib/budget'
import type { BudgetPresentation } from '../../lib/budgetPresentation'

export type BudgetView='overview'|'plan'|'history'
export function budgetDate(date:string,monthOnly=false){
  try{return new Intl.DateTimeFormat('en-AU',{...(monthOnly?{}:{day:'numeric' as const}),month:monthOnly?'long':'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`))}
  catch{return date}
}

export default function BudgetPageHeader({presentation:p,view,onView,onSettings}:{
  presentation:BudgetPresentation;view:BudgetView;onView:(view:BudgetView)=>void;onSettings:()=>void
}){
  const b=useBudget(),s=b.snapshot,l=s?.details?.lifecycle
  const locked=b.loading||b.busy||!!b.pending||!!b.editing
  function go(id:string|null){
    // Existing inline reviews retain their period-exit decision; the provider
    // then applies the goal-task/pending guard and indexed URL transition.
    if(!window.dispatchEvent(new Event('budget-before-period-navigation',{cancelable:true})))return
    b.selectPeriod(id)
  }
  return <header className="budget-page-header" role="region" aria-label="Budget header">
    <div className="budget-page-heading"><div><p className="budget-eyebrow">05 — A little intention</p><h2>Budget</h2><p className="budget-page-subtitle">Make room for what matters.</p></div>
      <div className="budget-period-picker">
        {p.period&&l&&<fieldset disabled={locked} aria-label="Budget period navigation">
          <label><span className="sr-only">Saved budget period</span><Select ariaLabel="Saved budget period" value={p.period.id} onChange={go}>{l.periods.map(period=><option key={period.id} value={period.id}>{period.end_date.slice(8)==='01'&&period.start_date.slice(8)==='01'?budgetDate(period.start_date,true):`${budgetDate(period.start_date)} – ${budgetDate(addDays(period.end_date,-1))}`}</option>)}</Select></label>
          <button type="button" className="budget-period-arrow" aria-label="Previous saved budget" disabled={!l.previous_id} onClick={()=>go(l.previous_id)}><span aria-hidden="true">←</span></button>
          <button type="button" className="budget-period-arrow" aria-label="Next saved budget" disabled={!l.next_id} onClick={()=>go(l.next_id)}><span aria-hidden="true">→</span></button>
          <button type="button" className="budget-text-action budget-current" aria-label="Return to current budget" onClick={()=>go(null)}>Current</button>
        </fieldset>}
        {!s?.plan&&<div className="budget-header-actions"><button type="button" aria-label="Refresh saved data" className="budget-text-action budget-refresh" disabled={b.loading||b.busy} onClick={()=>void b.refresh()}>Refresh</button></div>}
      </div>
    </div>
    {s?.plan&&<>
      <div className="budget-page-nav"><div role="group" aria-label="Budget views" className="budget-view-switch">{(['overview','plan','history'] as const).map(id=><button type="button" key={id} className="budget-tab" aria-pressed={view===id} disabled={!!b.editing} onClick={()=>onView(id)}>{id==='overview'?'Overview':id==='plan'?'My plan':'Look back'}</button>)}</div><div className="budget-header-actions"><button type="button" aria-label="Accounts & settings" className="budget-text-action" disabled={!!b.editing} onClick={onSettings}><span className="budget-settings-full">Accounts & settings</span><span className="budget-settings-short">Settings</span><span aria-hidden="true">↗</span></button><button type="button" aria-label="Refresh saved data" className="budget-text-action" disabled={b.loading||b.busy} onClick={()=>void b.refresh()}>Refresh</button></div></div>
      {p.period&&<p className="budget-date-line"><span>{p.period.frequency==='monthly'?'Monthly':'Every two weeks'}{s.period?.transition?' · Transition budget':''}</span><span>{budgetDate(p.period.start)} – {budgetDate(addDays(p.period.endExclusive,-1))}</span><span>{p.period.timezone}</span><span className="budget-period-state">{p.phase==='past'?'Completed period':p.phase==='future'?'Future plan':p.phase==='current'?'In progress':'Saved budget'}</span></p>}
    </>}
  </header>
}
