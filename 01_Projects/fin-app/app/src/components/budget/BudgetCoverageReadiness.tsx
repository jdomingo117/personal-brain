import {useState} from 'react'
import {Button} from '../Controls'
import {useBudget} from '../../contexts/BudgetContext'
import type {AssistanceResult} from '../../lib/budgetAssistance'
import {coverageReadiness,importCappedRange} from '../../lib/budgetCoverageReadiness'
import {activityLabel,unusedSelected,type AccountActivity} from '../../lib/budgetAccountActivity'

const shortMonth=new Intl.DateTimeFormat('en-AU',{month:'short',timeZone:'UTC'})
const longMonth=new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'})
const day=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
const at=(date:string)=>new Date(`${date}T00:00:00Z`)

/**
 * The blocked-state checklist for assisted setup: which selected accounts still
 * need confirmed dates, with a pre-filled confirmation per account. Confirming
 * is still an explicit owner statement sent through the existing command.
 */
export default function BudgetCoverageReadiness({result,today,accountName,activity=[],onConfirmed,onLeaveOut}:{
  result:AssistanceResult;today:string;accountName:(id:string)=>string;activity?:AccountActivity[];onConfirmed:()=>void;onLeaveOut:(ids:string[])=>void
}){
  const b=useBudget()
  const r=coverageReadiness(result,today)
  const [asking,setAsking]=useState<string|null>(null),[failed,setFailed]=useState<string|null>(null)
  const waiting=r.accounts.filter(a=>a.confirm)
  const first=r.months[0],last=r.months[r.months.length-1]
  const activityFor=(id:string)=>activity.find(a=>a.account_id===id)
  // Unused accounts that still need confirming: they block months without adding history.
  const unused=unusedSelected(activity,waiting.map(a=>a.account_id))
  const canLeaveOut=(n:number)=>r.accounts.length-n>=1
  async function confirm(accountId:string,range:{first_date:string;last_date:string}){
    setFailed(null)
    const receipt=await b.run({action:'confirm_coverage',account_id:accountId,first_date:range.first_date,last_date:range.last_date,confirmed:true})
    if(receipt){setAsking(null);onConfirmed()}else setFailed(accountId)
  }
  return <section className="budget-coverage-readiness space-y-4" aria-label="Account history to confirm">
    <p className="body-copy">Budget can’t tell a quiet month from one that was never imported, so it only uses dates you’ve confirmed. Confirm each account once; it’s saved for next time.</p>
    <p className="detail-copy" role="status"><strong>{r.ready_months} of {r.months.length}</strong> months ready ({longMonth.format(at(first.start_date))} – {longMonth.format(at(last.start_date))}). Suggestions need {r.needed}. {waiting.length===1?'1 account needs':`${waiting.length} accounts need`} confirming.</p>
    {unused.length>0&&canLeaveOut(unused.length)&&<div className="budget-coverage-unused space-y-2">
      <p className="body-copy">{unused.length===1?`${accountName(unused[0])} looks unused.`:`${unused.length} accounts look unused: ${unused.map(accountName).join(', ')}.`} Leaving {unused.length===1?'it':'them'} out is usually right — {unused.length===1?'it':'they'} would only need confirming for months with no spending.</p>
      <Button disabled={b.busy||!!asking} onClick={()=>onLeaveOut(unused)}>{unused.length===1?'Leave it out':`Leave out ${unused.length} unused accounts`}</Button>
    </div>}
    <ul className="budget-coverage-list">
      {r.accounts.map(account=>{
        const name=accountName(account.account_id),full=account.confirm
        // A likely missing import: suggest only the imported dates; the full range stays available.
        const capped=full?importCappedRange(full,activityFor(account.account_id)):null,range=capped??full
        return <li key={account.account_id} className="budget-coverage-row">
          <div className="budget-coverage-head">
            <span className="grid"><strong>{name}</strong>{activityLabel(activityFor(account.account_id))&&<span className="detail-copy text-muted">{activityLabel(activityFor(account.account_id))}</span>}</span>
            <span className={`detail-copy ${range?'text-warn':'text-pos'}`}>{range?'Needs confirming':'Confirmed'}</span>
          </div>
          <ol className="budget-coverage-months" aria-label={`${name} months`}>
            {r.months.map((m,i)=><li key={m.start_date} data-missing={account.missing[i]||undefined}
              aria-label={`${longMonth.format(at(m.start_date))}: ${account.missing[i]?'not confirmed':'confirmed'}`}>
              <span aria-hidden="true">{shortMonth.format(at(m.start_date))}</span>
              <span aria-hidden="true">{account.missing[i]?'–':'✓'}</span>
            </li>)}
          </ol>
          {range&&(asking===account.account_id
            ?<div className="budget-coverage-ask space-y-3">
              <p className="body-copy">Is every <strong>{name}</strong> transaction from <strong>{day.format(at(range.first_date))}</strong> to <strong>{day.format(at(range.last_date))}</strong> in Halcyon? Months with no activity count — only say yes if nothing is missing.</p>
              <div className="budget-assistance-actions">
                <Button disabled={!b.canWrite} onClick={()=>void confirm(account.account_id,range)}>{b.busy?'Saving…':'Yes, these dates are complete'}</Button>
                <Button variant="ghost" disabled={b.busy} onClick={()=>setAsking(null)}>Not sure</Button>
              </div>
              {capped&&full&&<p className="detail-copy text-muted">If {name} really had no transactions after {day.format(at(capped.last_date))}, you can <button type="button" className="underline" disabled={!b.canWrite} onClick={()=>void confirm(account.account_id,full)}>confirm through {day.format(at(full.last_date))}</button> instead.</p>}
              {failed===account.account_id&&<p role="alert" className="text-neg">{b.error||'These dates weren’t saved. Try again.'}</p>}
            </div>
            :<div className="space-y-2">{capped&&<p className="detail-copy text-warn">Imports for {name} end on {day.format(at(capped.last_date))}. Import the rest first, or confirm only the dates you’ve imported.</p>}<div className="budget-assistance-actions">
              <Button disabled={!b.canWrite||!!asking} onClick={()=>{setFailed(null);setAsking(account.account_id)}} ariaLabel={`Confirm ${day.format(at(range.first_date))} – ${day.format(at(range.last_date))} for ${name}`}>
                Confirm {day.format(at(range.first_date))} – {day.format(at(range.last_date))}
              </Button>
              <Button variant="ghost" disabled={b.busy||!!asking||!canLeaveOut(1)} onClick={()=>onLeaveOut([account.account_id])} ariaLabel={`Leave ${name} out of the history check`}>Leave out</Button>
            </div></div>)}
        </li>
      })}
    </ul>
    <p className="detail-copy text-muted">Leave out accounts you don’t spend from, like investments or closed accounts. Not sure about an account? Check its transactions in Ledger first, or choose your own dates below.</p>
  </section>
}
