import {useBudget} from '../../contexts/BudgetContext'
import {fmtCents} from '../../data'
import {addDays} from '../../lib/budget'
import {forecastComparison} from '../../lib/budgetForecastComparison'
import {forecastReadProblem,forecastReason,type ForecastStatus} from '../../lib/budgetForecast'
const labels:Record<ForecastStatus,string>={within_plan:'On track',likely_to_exceed:'Likely to go over',exceeded:'Over',check_data:'Needs checking',unavailable:'Not available'}
const monthFmt=new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'}),dayFmt=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',timeZone:'UTC'})
const monthOf=(d:string)=>{try{return monthFmt.format(new Date(`${d}T00:00:00Z`))}catch{return d}},at=(d:string)=>{try{return dayFmt.format(new Date(`${d}T00:00:00Z`))}catch{return d}}
export default function BudgetForecast(){
 const b=useBudget(),s=b.snapshot!,f=s.details?.forecast,problem=forecastReadProblem(s,b.readState,!!b.pending)
 if(problem)return <section aria-label="Spending estimate" className="budget-forecast"><h4>Estimated everyday spending</h4><p className="detail-copy text-warn">{problem}</p></section>
 if(!f)return null
 const checked=new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeStyle:'short',timeZone:s.plan!.timezone}).format(new Date(f.checked_at))
 const comparison=forecastComparison(f)
 const flex=f.flexible,money=(n:number|null)=>n===null?'Unavailable':fmtCents(n)
 return <section aria-label="Spending estimate" className="budget-forecast space-y-3">
  <div className="budget-forecast-heading"><h4>{f.phase==='future'?'Likely everyday spending (provisional)':'Likely everyday spending by the end'}</h4><strong className={`budget-forecast-amount ${flex.available?'':'budget-forecast-amount--none'}`} data-budget-forecast-value>{flex.available?money(flex.projected_cents):'Not available yet'}</strong></div>
  {flex.available&&flex.projected_cents!==null&&flex.allocation_cents!==null?<p className={`detail-copy budget-forecast-difference ${flex.status==='likely_to_exceed'||flex.status==='exceeded'?'text-warn':''}`}>
   By {at(addDays(s.period!.end_date,-1))} · {flex.projected_cents===flex.allocation_cents?'Right on your plan':`${money(Math.abs(flex.projected_cents-flex.allocation_cents))} ${flex.projected_cents>flex.allocation_cents?'over':'under'} your plan`}
  </p>:<p className="detail-copy">{forecastReason(flex.reason)}</p>}
  {flex.status==='exceeded'&&<p className="detail-copy text-warn">You’ve already spent more than this plan.</p>}
  {f.phase==='future'&&<p className="detail-copy">Future plan · provisional, with no observed activity for these dates.</p>}
  {comparison&&<div className="budget-forecast-comparison" role="img" aria-label={`${comparison.provisional?'Future plan; no recorded activity. Provisional estimate':`Recorded spending ${money(flex.settled_net_cents)}; estimated finish`} ${money(flex.projected_cents)}; allowance ${money(flex.allocation_cents)}. Pending charges are excluded.`}>
   <div className="budget-forecast-track"><span className="budget-forecast-recorded" style={{width:`${comparison.recordedPercent}%`}}/><span className="budget-forecast-estimated" style={{width:`${comparison.estimatedPercent}%`}}/><span className="budget-forecast-marker" style={{left:`${comparison.allowancePercent}%`}}/></div>
   <div className="budget-forecast-scale"><span>{money(0)}</span><span><i aria-hidden="true"/>Allowance {money(flex.allocation_cents)}</span></div>
   <div className="budget-forecast-legend">{!comparison.provisional&&<span><i aria-hidden="true"/>Recorded</span>}<span><i className="budget-forecast-estimate-key" aria-hidden="true"/>{comparison.provisional?'Provisional estimate':'Estimated additional spending'}</span></div>
  </div>}
  {flex.available&&!comparison&&<p className="detail-copy text-muted">These amounts are shown without a comparison bar.</p>}
  {flex.pending_expense_cents!==null&&flex.pending_expense_cents>0&&<p className="detail-copy">{money(flex.pending_expense_cents)} pending · separate from recorded spending and this estimate.{flex.pending_overage&&<> Charges may exceed the allowance if they settle.</>}</p>}
  <details><summary>How this estimate works</summary><div className="space-y-3">
   <p className="detail-copy">It’s a guess at your everyday spending by the end of this budget, not a bank balance.</p>
   {flex.available&&<p className="detail-copy">We take a typical day’s everyday spending from your last three complete months (the middle of the three, so one unusual month doesn’t skew it), multiply it by the {flex.remaining_days} {flex.remaining_days===1?'day':'days'} left, and add the {money(flex.settled_net_cents)} you’ve already spent.</p>}
   {flex.history.length>0&&<ul className="detail-copy">{flex.history.map(m=><li key={m.start_date}>{monthOf(m.start_date)}: {money(m.gross_cents)} over {m.days} days{flex.median?.start_date===m.start_date?' · the middle month':''}</li>)}</ul>}
   <p className="detail-copy">Refunds don’t lower the daily rate. Bills and set-asides are checked by their due dates instead.{flex.policy_names.length>0&&<> Left out of the daily rate: {flex.policy_names.join(', ')}.</>}</p>
   {flex.available&&<p className="detail-copy">We only say “likely to go over” if the estimate is more than {money(flex.threshold_cents)} over your plan (5% of it, and at least $25).</p>}
   <p className="detail-copy text-muted">Checked {checked}.{f.through_date?` Includes spending up to ${at(f.through_date)}.`:''}</p>
   {f.fixed.length>0&&<><h5 className="font-semibold">Bills, by their due dates</h5>{f.fixed.map(x=><div key={x.line_id} className="budget-forecast-fixed"><strong>{x.name}</strong>{x.available&&<p className="detail-copy">{labels[x.status]}</p>}{x.available?<p className="detail-copy">{f.phase==='future'?'Provisional expected total':'Matched net charges plus remaining expected occurrences'}: {money(x.projected_cents)} · allowance {money(x.allocation_cents)}.</p>:<p className="detail-copy">{forecastReason(x.reason)}</p>}<p className="detail-copy">Matched net {money(x.settled_net_cents)}; still expected {money(x.expected_remaining_cents)}.{!!x.overdue_expected_cents&&<> {money(x.overdue_expected_cents)} is dated today or earlier and remains expected until resolved.</>} Unmatched does not prove unpaid.</p><ul className="detail-copy">{x.occurrences.map(o=><li key={o.date}>{o.date}: {money(o.expected_cents)} expected, {money(o.matched_cents)} matched, {money(o.remaining_cents)} still expected.</li>)}</ul></div>)}</>}
   <p className="detail-copy">Savings goals and set-asides are tracked against their targets and due dates, not as spending.</p>
  </div></details>
 </section>
}
