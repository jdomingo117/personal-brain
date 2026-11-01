import { fmtCents } from '../data'
import { budgetValueQualification, type BudgetValue as Value } from '../lib/budgetPresentation'

/** One display conversion; availability never falls through to zero. */
export default function BudgetValue({value,name}:{value:Value;name?:string}) {
  const qualification=budgetValueQualification(value)
  return <span data-budget-value={name} data-availability={value.availability}
    data-freshness={value.freshness} data-coverage={value.coverage} data-provisional={value.provisional}
    title={qualification||undefined}><span data-budget-amount>{value.availability==='known'?fmtCents(value.cents):'Unavailable'}</span>
    {qualification&&<span className="sr-only"> · {qualification}</span>}</span>
}
