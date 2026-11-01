import {useBudget} from '../../contexts/BudgetContext'
import {fmtCents} from '../../data'
import {addDays} from '../../lib/budget'
import {forecastComparison} from '../../lib/budgetForecastComparison'
import {forecastReadProblem,forecastReason,type ForecastStatus} from '../../lib/budgetForecast'
const labels:Record<ForecastStatus,string>={within_plan:'Within plan — estimate',likely_to_exceed:'Likely to exceed',exceeded:'Exceeded',check_data:'Check data',unavailable:'Estimate unavailable'}
export default function BudgetForecast(){
 const b=useBudget(),s=b.snapshot!,f=s.details?.forecast,problem=forecastReadProblem(s,b.readState,!!b.pending)
 if(problem)return <section aria-label="Spending estimate" className="budget-forecast"><h4>Estimated everyday spending</h4><p className="detail-copy text-warn">{problem}</p></section>
 if(!f)return null
 const checked=new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeStyle:'short',timeZone:s.plan!.timezone}).format(new Date(f.checked_at))
 const comparison=forecastComparison(f)
 const flex=f.flexible,money=(n:number|null)=>n===null?'Unavailable':fmtCents(n)
 return <section aria-label="Spending estimate" className="budget-forecast space-y-3">
  <div className="budget-forecast-heading"><h4>{f.phase==='future'?'Provisional estimated everyday spending':'Estimated everyday spending'}</h4><strong className="budget-forecast-amount" data-budget-forecast-value>{flex.available?money(flex.projected_cents):'Unavailable'}</strong></div>
  {flex.available&&flex.projected_cents!==null&&flex.allocation_cents!==null?<p className={`detail-copy budget-forecast-difference ${flex.status==='likely_to_exceed'||flex.status==='exceeded'?'text-warn':''}`}>
   By {addDays(s.period!.end_date,-1)} · {flex.projected_cents===flex.allocation_cents?'Matches the allowance':`${money(Math.abs(flex.projected_cents-flex.allocation_cents))} ${flex.projected_cents>flex.allocation_cents?'over':'below'} allowance`}
  </p>:<p className="detail-copy">{forecastReason(flex.reason)}</p>}
  {flex.status==='exceeded'&&<p className="detail-copy text-warn">Recorded spending already exceeds this allowance.</p>}
  {f.phase==='future'&&<p className="detail-copy">Future plan · provisional, with no observed activity for these dates.</p>}
  {comparison&&<div className="budget-forecast-comparison" role="img" aria-label={`${comparison.provisional?'Future plan; no recorded activity. Provisional estimate':`Recorded spending ${money(flex.settled_net_cents)}; estimated finish`} ${money(flex.projected_cents)}; allowance ${money(flex.allocation_cents)}. Pending charges are excluded.`}>
   <div className="budget-forecast-track"><span className="budget-forecast-recorded" style={{width:`${comparison.recordedPercent}%`}}/><span className="budget-forecast-estimated" style={{width:`${comparison.estimatedPercent}%`}}/><span className="budget-forecast-marker" style={{left:`${comparison.allowancePercent}%`}}/></div>
   <div className="budget-forecast-scale"><span>{money(0)}</span><span style={{left:`clamp(60px, ${comparison.allowancePercent}%, calc(100% - 60px))`}}>Allowance {money(flex.allocation_cents)}</span></div>
   <div className="budget-forecast-legend">{!comparison.provisional&&<span><i aria-hidden="true"/>Recorded</span>}<span><i className="budget-forecast-estimate-key" aria-hidden="true"/>{comparison.provisional?'Provisional estimate':'Estimated additional spending'}</span></div>
  </div>}
  {flex.available&&!comparison&&<p className="detail-copy text-muted">These amounts are shown without a comparison bar.</p>}
  {flex.pending_expense_cents!==null&&flex.pending_expense_cents>0&&<p className="detail-copy">{money(flex.pending_expense_cents)} pending · separate from recorded spending and this estimate.{flex.pending_overage&&<> Charges may exceed the allowance if they settle.</>}</p>}
  <details><summary>How this estimate works</summary><div className="space-y-3">
   <p className="detail-copy">A spending estimate is not a bank balance or proof this budget is affordable. Funding gaps and reserve/deadline checks stay separate.</p>
   {flex.available&&<p className="detail-copy">Flexible spending: projected {money(flex.projected_cents)} by {addDays(s.period!.end_date,-1)}, against {money(flex.allocation_cents)} available in this allowance.</p>}
   <p className="detail-copy">Selected allowance {money(flex.allocation_cents)}.{flex.remaining_allocation_cents!==null&&<> Remaining after recorded net spending: {money(flex.remaining_allocation_cents)}.</>}</p>
   <p className="detail-copy">Checked {checked} ({s.plan!.timezone}). {f.through_date?`Settled activity through ${f.through_date} in ${s.plan!.timezone}; the remaining-day estimate starts tomorrow.`:'Future-period activity is not treated as observed.'} {flex.remaining_days} remaining local calendar days.</p>
   <p className="detail-copy">Flexible method: each covered month’s gross flexible spending divided by its calendar days; use the median of those three daily averages. Add that exact rate × remaining days to recorded net flexible spending. Only the final cents are rounded; historical credits do not lower the gross rate. Missing periods are excluded, not filled with zero.</p>
   {flex.history.length>0&&<ul className="detail-copy">{flex.history.map(m=><li key={m.start_date}>{m.start_date} – {addDays(m.end_date,-1)}: {money(m.gross_cents)} gross over {m.days} days{flex.median?.start_date===m.start_date?' · median daily-rate month':''}.</li>)}</ul>}
   <p className="detail-copy">History uses this selected period’s activity-account set. Dated membership still governs current actuals. Explicit non-flexible claims and saved source mappings are excluded from the historical flexible rate; other exceptional expenses stay included. Unassigned credits do not free spending room.</p>
   {flex.policy_names.length>0&&<p className="detail-copy">Saved source mappings: {flex.policy_names.join(', ')}.</p>}
   <p className="detail-copy">Likely to exceed requires a projected excess greater than {money(flex.threshold_cents)} (the larger of $25 and 5% of the available allowance). Settled excess of one cent is already Exceeded. No confidence interval is shown.</p>
   {f.fixed.length>0&&<><h5 className="font-semibold">Fixed bills use dates, not daily pacing</h5>{f.fixed.map(x=><div key={x.line_id} className="budget-forecast-fixed"><strong>{x.name}</strong>{x.available&&<p className="detail-copy">{labels[x.status]}</p>}{x.available?<p className="detail-copy">{f.phase==='future'?'Provisional expected total':'Matched net charges plus remaining expected occurrences'}: {money(x.projected_cents)} · allowance {money(x.allocation_cents)}.</p>:<p className="detail-copy">{forecastReason(x.reason)}</p>}<p className="detail-copy">Matched net {money(x.settled_net_cents)}; still expected {money(x.expected_remaining_cents)}.{!!x.overdue_expected_cents&&<> {money(x.overdue_expected_cents)} is dated today or earlier and remains expected until resolved.</>} Unmatched does not prove unpaid.</p><ul className="detail-copy">{x.occurrences.map(o=><li key={o.date}>{o.date}: {money(o.expected_cents)} expected, {money(o.matched_cents)} matched, {money(o.remaining_cents)} still expected.</li>)}</ul></div>)}</>}
   <p className="detail-copy">Reserves use their target, reserve and actual contribution/deadline checks, never an expense pace. Contributions compare recorded funding with planned contributions; they are not spending. These views are not added into a fabricated cash forecast.</p>
  </div></details>
 </section>
}
