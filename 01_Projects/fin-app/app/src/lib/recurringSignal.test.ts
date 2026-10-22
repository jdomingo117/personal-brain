import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {detectRecurringSignal,nextSignalDate} from './recurringSignal'
import {detectRecurringSignal as server} from '../../../supabase/functions/_shared/recurringSignal'
import {budgetRecurring,type RecurringEvidence} from '../../../supabase/functions/_shared/budgetRecurring'

const charges=(dates:string[],amounts:number[]=[])=>dates.map((date,i)=>({date,amount:amounts[i]??1000}))
const monthly=charges(['2026-06-01','2026-07-01','2026-08-01','2026-09-01','2026-10-01'])
describe('production recurring kernel',()=>{
 it.each(['recurringSignal','cadence','stats'])('%s has exact server parity',name=>{
  expect(readFileSync(resolve('src/lib',name+'.ts'),'utf8')).toBe(readFileSync(resolve('../supabase/functions/_shared',name+'.ts'),'utf8'))
 })
 it.each([
  monthly,
  charges(['2024-10-01','2025-10-01','2026-10-01']),
  charges(['2026-01-01','2026-02-01','2026-03-01']),
  charges(['2026-05-01','2026-06-01','2026-07-01','2026-08-01','2026-09-01','2026-10-01'],[1000,1000,1000,1500,1500,1500]),
  charges(['2026-08-01','2026-09-01']),
 ].map(input=>[input] as const))('client and server classify the same evidence',input=>expect(server(input,'2026-10-21')).toEqual(detectRecurringSignal(input,'2026-10-21')))
 it('preserves annual, dormancy and price changes',()=>{
  expect(server(charges(['2024-10-01','2025-10-01','2026-10-01']),'2026-10-21')).toMatchObject({cadence:'Annual',confidence:'medium'})
  expect(server(monthly,'2027-01-01')?.status).toBe('dormant')
  expect(server(charges(monthly.map(c=>c.date),[1000,1000,1500,1500,1500]),'2026-10-21')).toMatchObject({kind:'fixed',expected:1500,priceChange:{from:1000,to:1500}})
 })
 it('uses calendar dates and is independent of server timezone',()=>expect(nextSignalDate('2026-01-31','Monthly')).toBe('2026-02-28'))
 it('makes capped and two-charge annual groups explicit nonfinancial signals',()=>{
  const e:RecurringEvidence={as_of:'2026-10-21',normal_from:'2025-10-22',annual_from:'2023-10-19',group_count:101,group_limit:100,observation_limit:256,groups:[
   {account_id:'a',merchant_key:'busy',count:257,charges:[]},
   {account_id:'b',merchant_key:'annual',count:2,charges:charges(['2025-10-01','2026-10-01'])},
   {account_id:'a',merchant_key:'monthly',count:5,charges:monthly},
  ]}
  expect(budgetRecurring(e)).toMatchObject({limited:true,proposals:[{state:'manual-required',signal:null},{state:'early-annual',signal:null},{state:'detected',signal:{cadence:'Monthly'}}]})
 })
})
