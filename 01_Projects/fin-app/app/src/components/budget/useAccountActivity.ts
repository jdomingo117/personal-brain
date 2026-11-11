import {useEffect,useState} from 'react'
import {useBudget} from '../../contexts/BudgetContext'
import type {AccountActivity} from '../../lib/budgetAccountActivity'

/** Per-account last activity for the Budget workspace. Null while loading or if the read fails. */
export function useAccountActivity():AccountActivity[]|null{
  const b=useBudget(),read=b.accountActivity,source=b.snapshot?.source_revision
  const [activity,setActivity]=useState<AccountActivity[]|null>(null)
  useEffect(()=>{let live=true;void read().then(a=>{if(live)setActivity(a.accounts)},()=>{});return()=>{live=false}},[read,source])
  return activity
}
