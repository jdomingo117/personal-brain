import {addDays,daysBetween} from './budget'
import type {AccountActivity} from './budgetAccountActivity'

export type BehindAccount={account_id:string;name:string;source:'import'|'sync';last_date:string}
type AccountInfo={id:string;name:string;connectionId?:string;lastSyncedAt?:string}

/** A bank-synced account is behind when it hasn't synced for this many days. */
const SYNC_GRACE_DAYS=3
/** Never flag an imported account sooner than this, however busy it usually is. */
const MIN_IMPORT_GAP_DAYS=10

/**
 * Accounts in the budget that are probably missing recent activity, so totals
 * built from them read too low. A heuristic used only to warn, never to change
 * a figure:
 * - bank-synced: no successful sync in the last few days;
 * - imported: no transaction for much longer than this account's usual gap
 *   (three typical gaps, at least ten days), and only if it was in regular use.
 * Rarely used and dormant accounts are never flagged: a quiet account is normal.
 */
export function behindAccounts({scope,accounts,activity,today}:{scope:string[];accounts:AccountInfo[];activity:AccountActivity[];today:string}):BehindAccount[]{
  const byId=new Map(accounts.map(a=>[a.id,a])),act=new Map(activity.map(a=>[a.account_id,a]))
  const out:BehindAccount[]=[]
  for(const id of scope){
    const acct=byId.get(id);if(!acct)continue
    if(acct.connectionId){
      const synced=acct.lastSyncedAt?.slice(0,10)
      if(!synced||synced<addDays(today,-SYNC_GRACE_DAYS))out.push({account_id:id,name:acct.name,source:'sync',last_date:synced??''})
      continue
    }
    const a=act.get(id)
    if(!a?.last_activity_date||a.recent_activity_count<3)continue
    const windowDays=Math.max(1,daysBetween(a.window_start,today))
    const threshold=Math.max(MIN_IMPORT_GAP_DAYS,Math.ceil(3*windowDays/a.recent_activity_count))
    if(daysBetween(a.last_activity_date,today)>threshold)out.push({account_id:id,name:acct.name,source:'import',last_date:a.last_activity_date})
  }
  return out.sort((x,y)=>x.last_date.localeCompare(y.last_date)||x.name.localeCompare(y.name))
}

/** "AMEX", "AMEX and Amplify", "AMEX, Amplify and 2 more" */
export function nameList(names:string[]):string{
  if(names.length<=2)return names.join(' and ')
  if(names.length===3)return `${names[0]}, ${names[1]} and ${names[2]}`
  return `${names[0]}, ${names[1]} and ${names.length-2} more`
}
