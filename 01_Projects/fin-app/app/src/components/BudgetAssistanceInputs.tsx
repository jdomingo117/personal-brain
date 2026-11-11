import {useEffect,useState} from 'react'
import {Button,DateInput,Select} from './Controls'
import {fmtCents} from '../data'
import {moneyEntry,parseBudgetMoney,setupPeriod,type Setup} from '../lib/budgetWorkspace'
import type {AssistanceResult} from '../lib/budgetAssistance'
import type {AssistanceReview,ReviewedCost} from '../lib/budgetAssistanceReview'
import {billKey} from '../lib/budgetDetectedBills'
import {suggestPayDates} from '../lib/budgetPayDates'

/** What the owner said changed recently: those amounts start empty instead of from history. */
export type RecentChanges={pay:boolean;bills:boolean;spending:boolean}
type Row=Omit<ReviewedCost,'amount_cents'|'opening_cents'|'target_cents'>&{amount:string;opening:string;target:string}
type EverydayChoice='typical'|'own'|'keep'
const day=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
const at=(date:string)=>{try{return day.format(new Date(`${date}T00:00:00Z`))}catch{return date}}
const rhythm={weekly:'every week',fortnightly:'every two weeks',monthly:'every month'} as const
const cadenceNames:Record<string,string>={once:'once',weekly:'weekly',fortnightly:'every two weeks',monthly:'monthly',quarterly:'quarterly',annual:'yearly'}
const money=(value:string)=>{const c=parseBudgetMoney(value);return c===null?'—':fmtCents(c)}

/**
 * One review screen for assisted setup amounts. Every field is pre-filled from
 * history or the existing draft and stays editable. It reports an AssistanceReview
 * with every confirmation flag false: the owner's single final confirmation in
 * BudgetAssistance is what confirms them, so a default never counts as reviewed.
 */
export default function BudgetAssistanceInputs({base,result,initialReview,preselect=[],changed,onReview}:{base:Setup;result:AssistanceResult;initialReview?:AssistanceReview;preselect?:string[];changed?:RecentChanges;onReview:(review:AssistanceReview)=>void}){
 const p=setupPeriod({...base,frequency:result.frequency,start_date:result.start_date,anchor:result.anchor})
 const prior=initialReview??base.assistance?.reviewed_inputs
 const observedIncome=result.suggestions.income_cents
 const suggestion=suggestPayDates(result.income_dates??[],p.start,p.end)
 const baseEveryday=base.lines.find(l=>l.kind==='everyday')?.allocation_cents??0
 const [income,setIncome]=useState(()=>changed?.pay?'':prior?.apply_income&&Number.isSafeInteger(prior.income.amount_cents)?moneyEntry(prior.income.amount_cents)
   :base.income_cents>0?moneyEntry(base.income_cents):moneyEntry(observedIncome))
 const [dates,setDates]=useState(()=>changed?.pay?'':prior?.income.pay_dates.length?prior.income.pay_dates.join(', '):(suggestion?.dates.join(', ')??''))
 const [everydayChoice,setEverydayChoice]=useState<EverydayChoice>(()=>changed?.spending?'own':prior?(prior.everyday_cents!==undefined?'own':prior.apply_everyday?'typical':'keep')
   :baseEveryday>0?'keep':result.suggestions.everyday_cents!==null?'typical':'own')
 const [manualEveryday,setManualEveryday]=useState(changed?.spending?'':prior?.everyday_cents!==undefined&&Number.isSafeInteger(prior.everyday_cents)?moneyEntry(prior.everyday_cents):'')
 const [costs,setCosts]=useState<Row[]>(()=>result.recurring.map<Row>(c=>{
  const old=prior?.costs.find(x=>x.recurring_id===c.id)
  return {line_id:old?.line_id??crypto.randomUUID(),name:old?.name??c.merchant_key.slice(0,60),selected:old?.selected??preselect.includes(billKey(c.account_id,c.merchant_key)),confirmed:false,paid:old?.paid??false,type:old?.type??'bill',amount:Number.isSafeInteger(old?.amount_cents??c.amount_cents)?moneyEntry(old?.amount_cents??c.amount_cents):'',opening:Number.isSafeInteger(old?.opening_cents??0)?moneyEntry(old?.opening_cents??0):'',target:old?.target_cents?moneyEntry(old.target_cents):'',cadence:old?.cadence??({'Weekly':'weekly','Biweekly':'fortnightly','Monthly':'monthly','Quarterly':'quarterly','Annual':'annual','Yearly':'annual'} as const)[c.cadence as 'Monthly']??'once',anchor:old?.anchor??c.next_date,due_date:old?.due_date??null,recurring_id:c.id}
 }).concat((prior?.costs??[]).filter(c=>!result.recurring.some(r=>r.id===c.recurring_id)).map(c=>{const {amount_cents,opening_cents,target_cents,...row}=c;return {...row,confirmed:false,amount:Number.isSafeInteger(amount_cents)?moneyEntry(amount_cents):'',opening:Number.isSafeInteger(opening_cents)?moneyEntry(opening_cents):'',target:target_cents?moneyEntry(target_cents):''}})))
 useEffect(()=>onReview({apply_income:true,apply_everyday:everydayChoice!=='keep',
   ...(everydayChoice==='own'?{everyday_cents:parseBudgetMoney(manualEveryday)??NaN}:{}),
   income:{amount_cents:parseBudgetMoney(income)??NaN,pay_dates:dates.split(/[\s,]+/).filter(Boolean),confirmed:false},
   costs:costs.map(({amount,opening,target,...c})=>({...c,confirmed:false,name:c.name.trim(),target_cents:target?parseBudgetMoney(target):null,amount_cents:parseBudgetMoney(amount)??NaN,opening_cents:parseBudgetMoney(opening)??NaN})),
   irregular_confirmed:false}),[everydayChoice,manualEveryday,income,dates,costs,onReview])
 const update=(id:string,patch:Partial<Row>)=>setCosts(rows=>rows.map(c=>c.line_id===id?{...c,...patch}:c))
 const included=costs.filter(c=>c.selected)
 return <section aria-label="Check your amounts" className="budget-review space-y-6">
  <div className="space-y-3">
   <h3 className="font-semibold">Take-home pay</h3>
   {changed?.pay&&<p className="detail-copy text-warn">You said your pay changed, so enter your new take-home pay and pay dates. Your history is shown only for reference.</p>}
   <label className="grid gap-2"><span className="field-label">Take-home pay in this budget (AUD)</span><input className="budget-input" inputMode="decimal" value={income} onChange={e=>setIncome(e.target.value)}/></label>
   <p className="detail-copy text-muted">Typical from your history: {fmtCents(observedIncome)}.{parseBudgetMoney(income)!==observedIncome&&<> <button type="button" className="underline" onClick={()=>setIncome(moneyEntry(observedIncome))}>Use {fmtCents(observedIncome)}</button></>} Enter 0 if you don’t expect pay in this budget.</p>
   <label className="grid gap-2"><span className="field-label">Pay dates in this budget</span><input className="budget-input" value={dates} placeholder="e.g. 2026-11-13, 2026-11-27" onChange={e=>setDates(e.target.value)}/></label>
   <p className="detail-copy text-muted">{suggestion?<>Suggested from your history: paid {rhythm[suggestion.cadence]}, last on {at(suggestion.last_paid)}.{suggestion.dates.join(', ')!==dates&&<> <button type="button" className="underline" onClick={()=>setDates(suggestion.dates.join(', '))}>Use suggested dates</button></>}</>:'We couldn’t find a steady pay rhythm. Enter the dates you expect, separated by commas.'}</p>
   <details><summary className="min-h-11 py-3 cursor-pointer detail-copy">Past pay and income dates</summary>{result.income_dates?.length?<ul className="detail-copy">{result.income_dates.map(d=><li key={d.date}>{at(d.date)} · {fmtCents(d.income_cents)}</li>)}</ul>:<p className="detail-copy">No dated income in the checked months.</p>}</details>
  </div>

  <fieldset className="space-y-3">
   <legend className="font-semibold">Everyday spending</legend>
   {changed?.spending&&<p className="detail-copy text-warn">You said your everyday spending changed, so enter what you expect now. Your typical month is still shown as a guide.</p>}
   {result.suggestions.everyday_cents!==null&&<label className="flex min-h-11 gap-3 items-center"><input type="radio" name="everyday" checked={everydayChoice==='typical'} onChange={()=>setEverydayChoice('typical')}/><span>Use my typical month: <strong>{fmtCents(result.suggestions.everyday_cents)}</strong></span></label>}
   {baseEveryday>0&&<label className="flex min-h-11 gap-3 items-center"><input type="radio" name="everyday" checked={everydayChoice==='keep'} onChange={()=>setEverydayChoice('keep')}/><span>Keep my current amount: {fmtCents(baseEveryday)}</span></label>}
   <label className="flex min-h-11 gap-3 items-center"><input type="radio" name="everyday" checked={everydayChoice==='own'} onChange={()=>setEverydayChoice('own')}/><span>Choose my own amount</span></label>
   {everydayChoice==='own'&&<label className="grid gap-2"><span className="field-label">Everyday amount (AUD)</span><input className="budget-input" inputMode="decimal" value={manualEveryday} onChange={e=>setManualEveryday(e.target.value)}/></label>}
   <p className="detail-copy text-muted">Bills you include below are already left out of this amount.</p>
  </fieldset>

  <div className="space-y-3">
   <h3 className="font-semibold">Bills and set-asides</h3>
   {changed?.bills&&<p className="detail-copy text-warn">You said a regular bill changed. Open “Edit” on that bill and update its amount or date, or add it if it’s new.</p>}
   <p className="detail-copy text-muted">{included.length} of {costs.length} included. Untick anything you don’t want in this budget.</p>
   <ul className="budget-coverage-list">
    {costs.map((c,i)=><li key={c.line_id} className="budget-review-cost">
     <label className="flex min-h-11 gap-3 items-center min-w-0"><input type="checkbox" checked={c.selected} onChange={e=>update(c.line_id,{selected:e.target.checked})} aria-label={`Include ${c.name||`cost ${i+1}`}`}/>
      <span className="min-w-0"><strong>{c.name||'New cost'}</strong><span className="block detail-copy text-muted">{c.type==='reserve'?`Set aside ${money(c.amount)} each budget${c.due_date?` · due ${at(c.due_date)}`:''}`:`${money(c.amount)} ${cadenceNames[c.cadence]??c.cadence} · next ${at(c.anchor)}`}{c.paid?' · already paid':''}</span></span>
     </label>
     <details><summary className="min-h-11 py-2 cursor-pointer detail-copy">Edit</summary><div className="grid gap-3 pt-2">
      <label className="grid gap-2"><span className="field-label">Name</span><input className="budget-input" maxLength={60} value={c.name} onChange={e=>update(c.line_id,{name:e.target.value})}/></label>
      <label className="grid gap-2"><span className="field-label">Type</span><Select value={c.type} onChange={v=>update(c.line_id,{type:v as Row['type'],opening:v==='bill'?'0.00':c.opening})}><option value="bill">Regular bill</option><option value="reserve">Set aside for an annual, quarterly or one-off cost</option></Select></label>
      <label className="grid gap-2"><span className="field-label">{c.type==='reserve'?'Set aside each budget (AUD)':'Amount each time (AUD)'}</span><input className="budget-input" inputMode="decimal" value={c.amount} onChange={e=>update(c.line_id,{amount:e.target.value})}/></label>
      <label className="grid gap-2"><span className="field-label">How often</span><Select value={c.cadence} onChange={v=>update(c.line_id,{cadence:v as Row['cadence']})}>{['once','weekly','fortnightly','monthly','quarterly','annual'].map(v=><option key={v} value={v}>{cadenceNames[v]}</option>)}</Select></label>
      <label className="grid gap-2"><span className="field-label">Next date</span><DateInput value={c.anchor} onChange={v=>update(c.line_id,{anchor:v})}/></label>
      {c.type==='reserve'&&<><label className="grid gap-2"><span className="field-label">Full bill amount (AUD)</span><input className="budget-input" inputMode="decimal" value={c.target} onChange={e=>update(c.line_id,{target:e.target.value})}/></label><label className="grid gap-2"><span className="field-label">Already set aside (AUD)</span><input className="budget-input" inputMode="decimal" value={c.opening} onChange={e=>update(c.line_id,{opening:e.target.value})}/></label><label className="grid gap-2"><span className="field-label">Due date</span><DateInput value={c.due_date??''} onChange={v=>update(c.line_id,{due_date:v||null})}/></label></>}
      <label className="flex min-h-11 gap-3 items-center"><input type="checkbox" checked={c.paid} onChange={e=>update(c.line_id,{paid:e.target.checked})}/><span>Already paid in this budget</span></label>
      {!c.recurring_id&&<Button variant="ghost" onClick={()=>setCosts(rows=>rows.filter(row=>row.line_id!==c.line_id))}>Remove {c.name||'this cost'}</Button>}
     </div></details>
    </li>)}
   </ul>
   <Button variant="ghost" onClick={()=>setCosts(rows=>[...rows,{line_id:crypto.randomUUID(),name:'',selected:true,confirmed:false,paid:false,type:'reserve',amount:'',opening:'',target:'',cadence:'annual',anchor:p.start,due_date:null,recurring_id:null}])}>Add a yearly or one-off cost</Button>
   <p className="detail-copy text-muted">Costs that don’t show up in your history, like car registration or insurance renewals, aren’t counted as $0. Add any you know about.</p>
  </div>
 </section>
}
