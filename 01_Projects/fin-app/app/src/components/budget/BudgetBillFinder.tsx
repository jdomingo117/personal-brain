import {useMemo} from 'react'
import {Button} from '../Controls'
import {fmtCents} from '../../data'
import {useData} from '../../contexts/DataContext'
import {shortMerchant} from '../../lib/recurring'
import {IMPORT_GAP_NOTE,cadenceLabel,classifySuggestions,merchantLabel,rollForward,type Suggestion} from '../../lib/budgetBillSuggestions'
import type {BudgetItem,BudgetItemConfig,BudgetRecurringEvidence} from '../../lib/budgetItems'
import {useAccountActivity} from './useAccountActivity'

const cadenceMap:Record<string,BudgetItemConfig['cadence']>={Weekly:'weekly',Biweekly:'fortnightly',Monthly:'monthly',Quarterly:'quarterly',Annual:'annual'}
const dayFmt=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
const at=(date:string)=>{try{return dayFmt.format(new Date(`${date}T00:00:00Z`))}catch{return date}}
type Override={id:string;account_id:string;merchant_key:string;state:string;amount_cents:number|null;cadence:string|null;next_date:string|null}

/**
 * The workspace bill finder, using the same rules and wording as assisted setup
 * (lib/budgetBillSuggestions). Suggestions only: "Review" opens the existing bill
 * form with the values filled in; nothing is added until the owner saves it.
 */
export default function BudgetBillFinder({evidence,items,recurring,accountName,canWrite,onReview}:{
  evidence:BudgetRecurringEvidence;items:BudgetItem[];recurring:Override[];accountName:(id:string)=>string;canWrite:boolean
  onReview:(item:BudgetItem|undefined,proposal:Partial<BudgetItemConfig>)=>void
}){
  const {reportingTransactions}=useData(),activity=useAccountActivity()
  // One pass over the ledger for display names; never used for money.
  const names=useMemo(()=>{const m=new Map<string,string>();for(const t of reportingTransactions)if(t.merchantKey&&!m.has(t.merchantKey))m.set(t.merchantKey,shortMerchant(t.merchant));return m},[reportingTransactions])
  const last=useMemo(()=>new Map((activity??[]).map(a=>[a.account_id,a.last_activity_date])),[activity])
  const today=evidence.as_of
  const all=classifySuggestions(evidence,last)
  const offer=all.filter(s=>s.kind==='current'||s.kind==='import-gap').sort((a,b)=>(b.signal?.expected??0)-(a.signal?.expected??0))
  const quiet=all.filter(s=>s.kind!=='current'&&s.kind!=='import-gap')

  function row(s:Suggestion){
    const saved=items.find(i=>i.config?.source_account_id===s.account_id&&i.config?.source_merchant_key===s.merchant_key)
    const override=recurring.find(r=>r.account_id===s.account_id&&r.merchant_key===s.merchant_key)
    const name=merchantLabel(s.merchant_key,names)
    if(override&&override.state!=='active')return <li key={`${s.account_id}:${s.merchant_key}`} className="budget-detected-bill"><div className="min-w-0"><strong>{name}</strong><span className="block detail-copy text-muted">{accountName(s.account_id)} · you stopped tracking this, so it isn’t suggested.</span></div></li>
    const sig=s.signal!
    const cadence=override?.cadence??sig.cadence,expected=Math.round(override?.amount_cents??sig.expected)
    const next=rollForward(override?.next_date??sig.nextExpected,cadence,today)
    const fixed=sig.kind==='fixed'
    const changed=!!saved&&(saved.config!.amount_cents!==expected||saved.config!.cadence!==cadenceMap[cadence])
    return <li key={`${s.account_id}:${s.merchant_key}`} className="budget-detected-bill">
      <div className="min-w-0">
        <strong>{name}</strong>
        <span className="block detail-copy text-muted">{accountName(s.account_id)} · {cadenceLabel[cadence]??cadence} · next due {at(next)}{fixed?'':' · amount varies'}</span>
        {s.kind==='import-gap'&&<span className="block detail-copy text-muted">{IMPORT_GAP_NOTE}</span>}
        {saved&&<span className="block detail-copy text-muted">{changed?`In your plan at ${fmtCents(saved.config!.amount_cents)}. The latest charges suggest a new amount or timing.`:'Already in your plan.'}</span>}
      </div>
      <span className="budget-detected-bill-amount">{fixed?'':'about '}{fmtCents(expected)}</span>
      {(!saved||changed)&&!saved?.archived&&<Button variant="ghost" disabled={!canWrite} ariaLabel={`${saved?'Review the update to':'Review'} ${name}`}
        onClick={()=>onReview(saved,{name:saved?.name??name.slice(0,60),amount_cents:expected,cadence:cadenceMap[cadence],anchor:saved?.config?.anchor??next,
          source_account_id:s.account_id,source_merchant_key:s.merchant_key,recurring_id:override?.id??null,state:saved?.config?.state??'saving'})}>{saved?'Review update':'Review and add'}</Button>}
    </li>
  }
  const quietText=(s:Suggestion)=>s.kind==='stopped'?`No payment since around ${at(s.signal!.nextExpected)}, so it looks like this stopped.`:s.kind==='possible-annual'?'Seen twice, about a year apart. Add it yourself if it’s a yearly bill.':'Too many payments to check automatically. Add it yourself if it’s a bill.'

  return <details id="budget-find-bills" className="glass p-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Find bills from recorded spending</summary>
    <p className="body-copy text-muted">Regular payments we found in this budget’s accounts. Check each one before adding it. Nothing is added until you save it.</p>
    {offer.length?<ul className="budget-coverage-list mt-3">{offer.map(row)}</ul>:<p className="body-copy mt-3">No regular payments found yet. You can always add a bill yourself.</p>}
    {quiet.length>0&&<details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 detail-copy">Other patterns we noticed ({quiet.length})</summary>
      <ul className="detail-copy space-y-2 pt-2">{quiet.map(s=>{const saved=s.kind==='stopped'?items.find(i=>i.config?.source_account_id===s.account_id&&i.config?.source_merchant_key===s.merchant_key&&!i.archived):undefined,name=merchantLabel(s.merchant_key,names)
        return <li key={`${s.account_id}:${s.merchant_key}`}><strong>{name}</strong> · {accountName(s.account_id)} · {quietText(s)}{saved&&saved.config?.state!=='paused'&&<> It’s still in your plan. <Button variant="ghost" disabled={!canWrite} ariaLabel={`Review pausing ${name}`} onClick={()=>onReview(saved,{...saved.config,state:'paused'})}>Review pausing it</Button></>}</li>})}</ul></details>}
    {evidence.limited&&<p className="detail-copy text-muted mt-3">We checked the {evidence.group_limit} merchants that look most like regular bills, out of {evidence.group_count} you’ve paid. Add any others yourself.</p>}
  </details>
}
