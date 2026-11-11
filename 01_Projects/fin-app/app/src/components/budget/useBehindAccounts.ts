import {useBudget} from '../../contexts/BudgetContext'
import {useData} from '../../contexts/DataContext'
import {accountScopeAt} from '../../lib/budgetAccountPolicy'
import {today as localToday} from '../../lib/budget'
import {behindAccounts,type BehindAccount} from '../../lib/budgetFreshness'
import {useAccountActivity} from './useAccountActivity'

/** Budget accounts that look behind for the current period. Empty while loading or if the read fails. */
export function useBehindAccounts(current:boolean,asOf:string|null|undefined):BehindAccount[]{
  const b=useBudget(),{accounts}=useData(),activity=useAccountActivity()
  const s=b.snapshot
  if(!current||!activity||!s?.plan)return []
  let day=asOf??''
  if(!day)try{day=localToday({now:()=>new Date()},s.plan.timezone)}catch{return []}
  return behindAccounts({scope:accountScopeAt(s,day).activity_account_ids,accounts,activity,today:day})
}
