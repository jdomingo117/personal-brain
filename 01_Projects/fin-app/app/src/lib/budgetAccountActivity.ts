import type {BudgetAccountActivity} from './budgetWorkspace'

export type AccountActivity=BudgetAccountActivity['accounts'][number]
export type AccountSuggestion={include:boolean;reason:'spending'|'investment'|'debt'|'no-activity'|'no-recent-activity'}

const NOT_SPENDING:Record<string,AccountSuggestion['reason']>={Invest:'investment',Loan:'debt',Debt:'debt'}

/**
 * Whether assisted setup should pre-select an account. Only a default: the
 * owner can tick any account, and the server still decides eligibility.
 * Investment and loan accounts are not everyday spending; accounts with no
 * settled activity in the last six complete months add a confirmation burden
 * without adding history.
 */
export function suggestAccount(a:AccountActivity):AccountSuggestion{
  const notSpending=NOT_SPENDING[a.type]
  if(notSpending)return {include:false,reason:notSpending}
  if(!a.last_activity_date)return {include:false,reason:'no-activity'}
  if(a.recent_activity_count===0)return {include:false,reason:'no-recent-activity'}
  return {include:true,reason:'spending'}
}

export function suggestedAccountIds(activity:AccountActivity[],eligible:string[]):string[]{
  const byId=new Map(activity.map(a=>[a.account_id,a]))
  return eligible.filter(id=>{const a=byId.get(id);return !!a&&suggestAccount(a).include})
}

const day=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
const at=(date:string)=>day.format(new Date(`${date}T00:00:00Z`))

/** Short plain-language status for an account row. */
export function activityLabel(a:AccountActivity|undefined):string|null{
  if(!a)return null
  const s=suggestAccount(a)
  if(s.reason==='investment')return 'Investment account'
  if(s.reason==='debt')return 'Loan account'
  if(s.reason==='no-activity')return 'No transactions'
  if(s.reason==='no-recent-activity')return `No activity since ${at(a.last_activity_date!)}`
  return `Last activity ${at(a.last_activity_date!)}`
}

/** Accounts selected for a check that look unused: candidates to leave out in one step. */
export function unusedSelected(activity:AccountActivity[],selected:string[]):string[]{
  const byId=new Map(activity.map(a=>[a.account_id,a]))
  return selected.filter(id=>{const a=byId.get(id);return !!a&&!suggestAccount(a).include})
}
