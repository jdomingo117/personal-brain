import {describe,it,expect} from 'vitest'
import {activityLabel,suggestAccount,suggestedAccountIds,unusedSelected,type AccountActivity} from './budgetAccountActivity'

const acct=(account_id:string,type:string,last:string|null,recent:number):AccountActivity=>({account_id,type,last_activity_date:last,recent_activity_count:recent,window_start:'2026-05-01'})
const all=[acct('spend','Liquid','2026-11-09',120),acct('card','Credit Card','2026-10-30',40),acct('save','Savings','2026-09-30',3),
  acct('fund','Invest',null,0),acct('empty','Liquid',null,0),acct('old','Savings','2024-08-05',0),acct('loan','Loan','2026-11-01',2)]

describe('assisted setup account suggestions',()=>{
  it('pre-selects only spending accounts with recent settled activity',()=>{
    expect(suggestedAccountIds(all,all.map(a=>a.account_id))).toEqual(['spend','card','save'])
  })
  it('explains each excluded account',()=>{
    expect(all.map(a=>suggestAccount(a).reason)).toEqual(['spending','spending','spending','investment','no-activity','no-recent-activity','debt'])
    expect(activityLabel(all[5])).toBe('No activity since 5 Aug 2024')
    expect(activityLabel(all[0])).toBe('Last activity 9 Nov 2026')
    expect(activityLabel(all[3])).toBe('Investment account')
    expect(activityLabel(undefined)).toBeNull()
  })
  it('only suggests accounts that are eligible for the check',()=>{
    expect(suggestedAccountIds(all,['card','fund'])).toEqual(['card'])
    expect(suggestedAccountIds(all,['unknown'])).toEqual([])
  })
  it('lists selected accounts that look unused',()=>{
    expect(unusedSelected(all,['spend','fund','old','unknown'])).toEqual(['fund','old'])
  })
})
