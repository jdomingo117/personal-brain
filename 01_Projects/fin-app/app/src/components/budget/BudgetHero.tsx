import BudgetAttention from '../BudgetAttention'
import BudgetForecast from './BudgetForecast'
import BudgetValue from '../BudgetValue'
import { remainingDays } from '../../lib/budget'
import { fmtCents } from '../../data'
import type { BudgetPresentation } from '../../lib/budgetPresentation'
import { Link } from 'react-router-dom'
import { useBehindAccounts } from './useBehindAccounts'
import { nameList, type BehindAccount } from '../../lib/budgetFreshness'

const dayFmt=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',timeZone:'UTC'})
const at=(date:string)=>{try{return dayFmt.format(new Date(`${date}T00:00:00Z`))}catch{return date}}

/** Names the accounts that are behind and where to fix them. Shown above the balance it affects. */
function MissingActivityNotice({behind}:{behind:BehindAccount[]}){
  const imports=behind.filter(a=>a.source==='import'),syncs=behind.filter(a=>a.source==='sync')
  const oldest=behind.find(a=>a.last_date)?.last_date
  return <div className="budget-missing-activity" role="status">
    <h3 className="font-semibold">{oldest?`Spending since ${at(oldest)} may be missing`:'Some spending may be missing'}</h3>
    <ul>{behind.map(a=><li key={a.account_id}><strong>{a.name}</strong> · {a.source==='import'?`last transaction ${at(a.last_date)}`:a.last_date?`last synced ${at(a.last_date)}`:'not synced yet'}</li>)}</ul>
    <p>{imports.length>0&&<>If you’ve used {imports.length===1?'this account':'these accounts'} since then, import a newer statement. </>}{syncs.length>0&&<>{nameList(syncs.map(a=>a.name))} {syncs.length===1?'hasn’t':'haven’t'} synced recently. </>}Until then, this budget shows less spending, and more left over, than is really the case.</p>
    <div className="budget-missing-activity-actions">{imports.length>0&&<Link className="budget-text-action" to="/ingestion">Import statements <span aria-hidden="true">→</span></Link>}{syncs.length>0&&<Link className="budget-text-action" to="/accounts">Check bank sync <span aria-hidden="true">→</span></Link>}</div>
  </div>
}

export default function BudgetHero({presentation:p,onEdit,canEdit,onFigures,onGuide,onUnplanned}:{
  presentation:BudgetPresentation;onEdit:()=>void;canEdit:boolean;onFigures:()=>void;onGuide:()=>void;onUnplanned?:()=>void
}){
  const {planned,spent,remaining,carry,rightsMoved}=p.everyday
  const behind=useBehindAccounts(p.phase==='current',p.period?.asOf)
  const over=remaining.availability==='known'&&remaining.cents<0
  const gap=p.income.unallocated.availability==='known'&&p.income.unallocated.cents<0
  const meter=planned.availability==='known'&&planned.cents>0&&spent.availability==='known'
    ? Math.min(100,Math.max(0,spent.cents/planned.cents*100)):null
  let days:number|null=null
  if(p.phase==='current'&&p.period?.asOf&&(p.period.frequency==='monthly'||p.period.frequency==='fortnightly')){
    try{days=remainingDays({start:p.period.start,end:p.period.endExclusive,timezone:p.period.timezone,frequency:p.period.frequency,transition:p.period.transition},p.period.asOf)}catch{}
  }
  const qualification=behind.length?'Missing recent activity · import the accounts listed above to update this.':remaining.freshness==='stale'?'Previously loaded figures · finish the data check or check the saved result.':
    remaining.availability==='unavailable'?'The information needed for this balance is unavailable. Review the figures or refresh saved data.':
    p.phase==='future'?'Future plan · this allowance is provisional, with no completed activity yet.':
    p.coverage==='none'?'Planning room only · no account activity is included. Recorded spending is unavailable.':
    p.coverage==='partial'?'Known activity only · some account history is missing, so this may change.':
    remaining.provisional?'Provisional budget balance · earlier activity and carry can still change.':'Based on your selected-account history.'
  return <>
    <section className="budget-hero" aria-label="Budget overview">
      <div className="budget-hero-main">{behind.length>0&&<MissingActivityNotice behind={behind}/>}{gap&&<p className="budget-phone-funding-notice">{p.income.unallocated.freshness==='stale'?'Previously loaded funding gap':p.phase==='future'?'Future plan funding gap':'Plan funding gap'}: <BudgetValue name="phone-funding-gap" value={p.income.unallocated}/></p>}<h3 className="budget-eyebrow">{over?'Over the everyday plan':behind.length?'Left for everyday spending, before missing activity':'Left for everyday spending'}</h3>
        <div className={`budget-hero-amount ${over?'text-neg':''} ${behind.length?'budget-hero-amount--uncertain':''}`}><BudgetValue name="hero-remaining" value={remaining}/></div>
        <p className="budget-spent-line">{spent.availability==='known'&&behind.length?<>Recorded so far: <strong><BudgetValue name="hero-spent" value={spent}/></strong> of your <strong><BudgetValue name="hero-planned" value={planned}/></strong> plan. You’ve probably spent more, because recent activity from the accounts above isn’t in Halcyon yet.</>:spent.availability==='known'?<>You’ve spent <strong><BudgetValue name="hero-spent" value={spent}/></strong> of your <strong><BudgetValue name="hero-planned" value={planned}/></strong> plan.</>:<>Your everyday plan is <strong><BudgetValue name="hero-planned" value={planned}/></strong>. Recorded spending is unavailable.</>}</p>
        {onUnplanned&&p.phase!=='past'&&p.income.unallocated.availability==='known'&&p.income.unallocated.cents>0&&<p className="budget-hero-unplanned"><button type="button" className="budget-text-action" onClick={onUnplanned}>{fmtCents(p.income.unallocated.cents)} of your pay isn’t planned yet <span aria-hidden="true">↓</span></button></p>}
        <p className="budget-hero-meaning">{over?'Everyday spending is over its plan. Review your allowances to address the shortfall.':'Room in your plan for day-to-day costs.'} <strong>This is not your bank balance.</strong></p>
        {meter!==null&&<progress className="budget-everyday-meter" aria-label="Everyday spending against the saved plan" aria-valuetext={planned.availability==='known'&&spent.availability==='known'?`${fmtCents(spent.cents)} spent of ${fmtCents(planned.cents)} planned`:undefined} max={100} value={meter}/>}
        <div className="budget-hero-foot"><span>{days===null?(p.phase==='past'?'Completed period':p.phase==='future'?'A provisional plan for future dates':'Saved planning amounts'):`${days} ${days===1?'day':'days'} left after today`}</span>
          <details className="budget-calculation"><summary aria-label="How it works: your everyday balance">How it works</summary><div className="budget-calculation-body"><p>Your everyday amount, plus anything carried over or moved in, minus what you’ve spent on everyday things. Bills and savings goals are counted separately, and refunds reduce spending.</p><dl className="budget-totals"><dt>Planned for everyday</dt><dd><BudgetValue value={planned}/></dd>{(carry.availability!=='known'||carry.cents!==0)&&<><dt>Carried over from last budget</dt><dd><BudgetValue value={carry}/></dd></>}{(rightsMoved.availability!=='known'||rightsMoved.cents!==0)&&<><dt>Moved in from a set-aside</dt><dd><BudgetValue name="everyday-rights" value={rightsMoved}/></dd></>}<dt>Spent so far</dt><dd><BudgetValue value={spent}/></dd><dt>Left</dt><dd><BudgetValue value={remaining}/></dd></dl></div></details>
        </div>
        <BudgetForecast/>
      </div>
      <BudgetAttention/>
    </section>
    <details className="budget-income-disclosure"><summary>Income & allocations{gap&&<> · <span className="text-warn">Funding gap <BudgetValue name="overview-funding-gap" value={p.income.unallocated}/></span></>}{p.income.futureUnallocated.availability==='known'&&p.income.futureUnallocated.cents<0&&<> · Continuing plan needs funding</>}</summary>
      <div className="budget-income"><h3 className="budget-eyebrow">Your income plan</h3><dl className="budget-income-totals"><div><dt>Expected this budget</dt><dd><BudgetValue name="hero-expected" value={p.income.expected}/></dd></div><div><dt>Received so far</dt><dd><BudgetValue name="hero-received" value={p.income.received}/></dd></div>{p.income.cashOnce.availability==='known'&&p.income.cashOnce.cents!==0&&<div><dt>Existing cash planned once</dt><dd><BudgetValue name="hero-cash" value={p.income.cashOnce}/></dd></div>}</dl>
        <div className={`budget-unallocated ${gap?'budget-funding-gap':''}`}><span>{gap?'Funding gap':'Still to plan'}</span><strong><BudgetValue name="hero-unallocated" value={p.income.unallocated}/></strong></div>
        <p className="budget-income-meaning">{gap?'Your allocations exceed expected resources by this amount. Review your plan to address the gap.':'Expected resources without an allocation yet. This is separate from everyday remaining; some income may not have arrived.'}</p>
        {p.income.futureUnallocated.availability==='known'&&p.income.futureUnallocated.cents<0&&<p className="budget-future-gap">Continuing plan gap: <strong><BudgetValue name="hero-future-gap" value={p.income.futureUnallocated}/></strong>. This is separate from this period’s plan.</p>}
        <button type="button" className="budget-text-action" disabled={!canEdit} onClick={onEdit}>Change my plan <span aria-hidden="true">→</span></button>
      </div>
    </details>
    <div className={`budget-hero-evidence ${remaining.freshness==='stale'||remaining.availability==='unavailable'||p.coverage==='partial'||p.coverage==='unknown'?'budget-qualified':''}`}><p>{qualification}</p><button type="button" className="budget-text-action" onClick={onFigures}>About these figures <span aria-hidden="true">↗</span></button></div>
    <div className="budget-learning-link"><span>New to budgeting, or need a refresher?</span><button type="button" className="budget-text-action" onClick={onGuide}>How your budget works <span aria-hidden="true">→</span></button></div>
  </>
}
