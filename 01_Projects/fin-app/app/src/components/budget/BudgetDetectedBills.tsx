import {useMemo,useState} from 'react'
import {Button} from '../Controls'
import {useData} from '../../contexts/DataContext'
import {useBudget} from '../../contexts/BudgetContext'
import {supabase} from '../../lib/supabaseClient'
import {fmtCents} from '../../data'
import {buildRecurring} from '../../lib/recurring'
import {billSavePayload,detectedBills,type DetectedBill} from '../../lib/budgetDetectedBills'
import type {AssistanceResult} from '../../lib/budgetAssistance'
import {cadenceLabel,IMPORT_GAP_NOTE} from '../../lib/budgetBillSuggestions'
import type {AccountActivity} from '../../lib/budgetAccountActivity'

const day=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
const at=(date:string)=>day.format(new Date(`${date}T00:00:00Z`))

/**
 * Offers the Recurring detector's regular payments as bills. Accepting one saves
 * it as a recurring series (the same route as the Recurring page), then the
 * history check runs again so the server takes it out of everyday spending.
 */
export default function BudgetDetectedBills({result,accountName,activity,today,onAdded}:{result:AssistanceResult;accountName:(id:string)=>string;activity:AccountActivity[];today:string;onAdded:(keys:string[])=>void}){
  const d=useData(),b=useBudget()
  const recurring=useMemo(()=>buildRecurring(d.reportingTransactions,d.accounts,undefined,d.recurrenceHints,d.recurrenceOverrides),
    [d.reportingTransactions,d.accounts,d.recurrenceHints,d.recurrenceOverrides])
  const bills=detectedBills(recurring,result,new Map(activity.map(a=>[a.account_id,a.last_activity_date])))
  const [saving,setSaving]=useState(false),[error,setError]=useState('')
  if(!bills.length)return null
  const fixed=bills.filter(x=>x.fixed&&x.addable)
  async function add(list:DetectedBill[]){
    setSaving(true);setError('')
    const added:string[]=[],failed:string[]=[]
    for(const bill of list){
      const {error:saveError}=await supabase.functions.invoke('manage-recurring-series',{body:billSavePayload(bill.series,today)})
      if(saveError)failed.push(bill.series.label);else added.push(bill.key)
    }
    if(failed.length)setError(`${failed.join(', ')} couldn’t be added. Try again, or manage ${failed.length===1?'it':'them'} on the Recurring page.`)
    if(added.length){await d.refreshData();await b.refresh();onAdded(added)}
    setSaving(false)
  }
  return <section className="budget-detected-bills space-y-3" aria-label="Regular payments we found">
    <h4 className="font-semibold">Regular payments we found</h4>
    <p className="detail-copy">These look like bills. Adding one keeps it out of everyday spending so it isn’t counted twice, and plans for its next due date. You can change or stop it later in Recurring.</p>
    {fixed.length>1&&<Button disabled={saving||!b.canWrite} onClick={()=>void add(fixed)}>{saving?'Adding…':`Add all ${fixed.length} fixed-amount bills`}</Button>}
    <ul className="budget-coverage-list">
      {bills.map(bill=>{const s=bill.series;return <li key={bill.key} className="budget-detected-bill">
        <div className="min-w-0">
          <strong>{s.label}</strong>
          <span className="block detail-copy text-muted">{accountName(s.accountId)} · {cadenceLabel[s.cadence]??s.cadence} · last paid {at(s.lastCharged)}{bill.fixed?'':' · amount varies'}</span>
          {bill.importGap&&<span className="block detail-copy text-muted">{IMPORT_GAP_NOTE}</span>}
        </div>
        <span className="budget-detected-bill-amount">{bill.fixed?'':'about '}{fmtCents(s.expected)}</span>
        {bill.addable
          ?<Button variant="ghost" disabled={saving||!b.canWrite} onClick={()=>void add([bill])} ariaLabel={`Add ${s.label} as a bill`}>Add as a bill</Button>
          :<span className="detail-copy text-muted">Add it on the Recurring page</span>}
      </li>})}
    </ul>
    {error&&<p role="alert" className="text-neg">{error}</p>}
  </section>
}
