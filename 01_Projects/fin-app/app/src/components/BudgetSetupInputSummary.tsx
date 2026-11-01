import {fmtCents} from '../data'
import type {Setup} from '../lib/budgetWorkspace'
/** Saved setup evidence; editing any linked amount clears its confirmation. */
export default function BudgetSetupInputSummary({setup}:{setup:Setup}){
 const r=setup.assistance?.reviewed_inputs
 if(!r)return setup.assistance?<p className="detail-copy text-warn">This older assisted draft has no individual income/cost review. Check history for this draft, or explicitly keep it as manual estimates.</p>:null
 return <section aria-label="Individual setup input review" className="outcome-panel space-y-2"><h4 className="font-semibold">Individual setup input review</h4>
  <p className="body-copy">Expected income: {fmtCents(r.income.amount_cents)} · {r.income.confirmed?'Confirmed':'Needs review'}. Pay dates: {r.income.pay_dates.join(', ')||'None entered'}.</p>
  {r.costs.map(c=><p key={c.line_id} className="detail-copy">{c.name}: {c.confirmed?'Reviewed':'Needs review'} · {c.selected?'Included':'Kept out of this change'} · {c.paid?'Already paid; manual matching required':`${fmtCents(c.amount_cents)} · ${c.cadence} from ${c.anchor}`} · Opening reserve {fmtCents(c.opening_cents)}{c.target_cents?` · Target ${fmtCents(c.target_cents)}`:''}{c.due_date?` · Deadline ${c.due_date}`:''}.</p>)}
  {setup.assistance?.provenance.goal==='manual-allowance-without-a-history-cut'&&<p className="detail-copy">Your goal inputs are retained as a manual allowance. Everyday spending was not automatically reduced; review the complete totals before saving.</p>}
  <p className="detail-copy">{r.irregular_confirmed?'Annual, quarterly and essential costs reviewed.':'Essential and irregular costs need review; an unconfirmed 0 is unresolved, not proof of no cost.'} These are setup inputs and user estimates, not bank funding evidence. Reopen history assistance to review individual dates and costs.</p>
 </section>
}
