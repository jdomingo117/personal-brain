import {describe,it,expect} from 'vitest'
import {behindAccounts,nameList} from './budgetFreshness'

const act=(account_id:string,last:string|null,recent:number)=>({account_id,type:'Credit Card',last_activity_date:last,recent_activity_count:recent,window_start:'2026-05-01'})
const accounts=[{id:'amex',name:'AMEX'},{id:'mqs',name:'Macquarie Savings'},{id:'quiet',name:'Quiet card'},{id:'fresh',name:'Fresh card'},
  {id:'up',name:'Up Spending',connectionId:'c',lastSyncedAt:'2026-11-12T01:00:00Z'},{id:'upold',name:'Up Old',connectionId:'c',lastSyncedAt:'2026-11-01T01:00:00Z'}]
const activity=[act('amex','2026-09-29',200),act('mqs','2026-09-30',42),act('quiet','2026-08-01',2),act('fresh','2026-11-10',150),act('up','2026-05-03',1)]
const today='2026-11-12'

describe('accounts whose activity is probably behind',()=>{
  it('flags busy imported accounts with a long gap and stale bank syncs, oldest first',()=>{
    expect(behindAccounts({scope:accounts.map(a=>a.id),accounts,activity,today})).toEqual([
      {account_id:'amex',name:'AMEX',source:'import',last_date:'2026-09-29'},
      {account_id:'mqs',name:'Macquarie Savings',source:'import',last_date:'2026-09-30'},
      {account_id:'upold',name:'Up Old',source:'sync',last_date:'2026-11-01'}])
  })
  it('never flags a quiet account, a recently imported one, or a synced dormant one',()=>{
    const ids=behindAccounts({scope:['quiet','fresh','up'],accounts,activity,today}).map(a=>a.account_id)
    expect(ids).toEqual([])
  })
  it('only considers accounts in the budget',()=>{
    expect(behindAccounts({scope:['fresh'],accounts,activity,today})).toEqual([])
  })
  it('scales the gap to how often the account is used',()=>{
    // ~4.5 days between transactions → flagged after 14 days, not 10
    expect(behindAccounts({scope:['mqs'],accounts,activity:[act('mqs','2026-10-30',42)],today})).toEqual([])
    expect(behindAccounts({scope:['mqs'],accounts,activity:[act('mqs','2026-10-25',42)],today})).toHaveLength(1)
  })
  it('lists names in plain English',()=>{
    expect(nameList(['A'])).toBe('A')
    expect(nameList(['A','B'])).toBe('A and B')
    expect(nameList(['A','B','C'])).toBe('A, B and C')
    expect(nameList(['A','B','C','D'])).toBe('A, B and 2 more')
  })
})
