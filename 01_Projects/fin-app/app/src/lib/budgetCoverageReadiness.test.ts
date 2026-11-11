import {describe,it,expect} from 'vitest'
import {coverageReadiness,coverageWindow,importCappedRange} from './budgetCoverageReadiness'
import type {AssistanceResult} from './budgetAssistance'

const months=['2026-04-01','2026-05-01','2026-06-01','2026-07-01','2026-08-01','2026-09-01','2026-10-01']
const gap=(account_id:string,i:number)=>({account_id,start_date:months[i],end_date:months[i+1]})
function result(missing:AssistanceResult['missing_coverage'],extra:Partial<AssistanceResult>={}):AssistanceResult{
  return {method:'budget-assist-v2',source_revision:'1',frequency:'monthly',start_date:'2026-10-15',anchor:'2026-10-15',account_ids:['a','b'],account_count:2,invalid_accounts:[],
    missing_coverage:missing,periods:[],period_count:0,integrity_ok:true,eligible:false,variable:false,fingerprint:'f',suggestions:{income_cents:0,everyday_cents:null,bills_cents:0},recurring:[],...extra}
}

describe('coverage readiness',()=>{
  it('uses the six complete months before the requested start month',()=>{
    expect(coverageWindow('2026-10-15').map(m=>m.start_date)).toEqual(months.slice(0,6))
    expect(coverageWindow('2026-01-31')[0]).toEqual({start_date:'2025-07-01',end_date:'2025-08-01'})
  })
  it('marks every month missing when no account has confirmed dates, and proposes the whole window',()=>{
    const r=coverageReadiness(result([0,1,2,3,4,5].flatMap(i=>[gap('a',i),gap('b',i)])),'2026-11-10')
    expect(r.ready_months).toBe(0)
    expect(r.accounts[0].missing.every(Boolean)).toBe(true)
    expect(r.accounts[0].confirm).toEqual({first_date:'2026-04-01',last_date:'2026-09-30'})
  })
  it('counts a month as ready only when every selected account is confirmed for it',()=>{
    const r=coverageReadiness(result([gap('a',0),gap('a',1),gap('b',5)]),'2026-11-10')
    expect(r.accounts.map(a=>a.missing)).toEqual([[true,true,false,false,false,false],[false,false,false,false,false,true]])
    expect(r.ready_months).toBe(3)
    expect(r.accounts[0].confirm).toEqual({first_date:'2026-04-01',last_date:'2026-05-31'})
    expect(r.accounts[1].confirm).toEqual({first_date:'2026-09-01',last_date:'2026-09-30'})
  })
  it('spans the whole calendar-month window for two-week budgets',()=>{
    const r=coverageReadiness(result([{account_id:'a',start_date:'2026-09-10',end_date:'2026-09-24'}],{frequency:'fortnightly',account_ids:['a']}),'2026-11-10')
    expect(r.accounts[0].confirm).toEqual({first_date:'2026-04-01',last_date:'2026-09-30'})
  })
  it('does not propose a confirmation for an account with no gaps',()=>{
    const r=coverageReadiness(result([gap('a',2)]),'2026-11-10')
    expect(r.accounts[1].confirm).toBeNull()
  })
  it('never proposes confirming dates after today',()=>{
    const r=coverageReadiness(result([{account_id:'a',start_date:'2026-10-01',end_date:'2026-11-01'}],{start_date:'2026-11-20',account_ids:['a']}),'2026-10-20')
    expect(r.accounts[0].confirm).toEqual({first_date:'2026-10-01',last_date:'2026-10-20'})
  })
  it('caps a suggested confirmation at the last import for an account in regular use',()=>{
    const range={first_date:'2026-05-01',last_date:'2026-10-31'}
    const a={account_id:'a',type:'Credit Card',last_activity_date:'2026-09-29',recent_activity_count:200,window_start:'2026-05-01'}
    expect(importCappedRange(range,a)).toEqual({first_date:'2026-05-01',last_date:'2026-09-29'})
    expect(importCappedRange(range,{...a,last_activity_date:'2026-10-20'})).toBeNull()
    expect(importCappedRange(range,{...a,recent_activity_count:0})).toBeNull()
    expect(importCappedRange(range,{...a,last_activity_date:'2026-04-02'})).toBeNull()
    expect(importCappedRange(range,undefined)).toBeNull()
  })
})
