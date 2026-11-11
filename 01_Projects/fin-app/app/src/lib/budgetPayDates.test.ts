import {describe,it,expect} from 'vitest'
import {suggestPayDates} from './budgetPayDates'

const r=(date:string,income_cents:number)=>({date,income_cents})
describe('pay date suggestions',()=>{
  it('projects a two-weekly pay rhythm into the budget, ignoring small credits',()=>{
    const receipts=[r('2026-08-07',310000),r('2026-08-12',450),r('2026-08-21',310000),r('2026-09-04',312000),r('2026-09-18',310000),r('2026-09-30',1200)]
    expect(suggestPayDates(receipts,'2026-11-01','2026-12-01')).toEqual({cadence:'fortnightly',last_paid:'2026-09-18',dates:['2026-11-13','2026-11-27']})
  })
  it('keeps the day of month for monthly pay, clamped to short months',()=>{
    const receipts=[r('2026-07-31',500000),r('2026-08-31',500000),r('2026-09-30',500000)]
    expect(suggestPayDates(receipts,'2026-11-01','2026-12-01')).toEqual({cadence:'monthly',last_paid:'2026-09-30',dates:['2026-11-30']})
  })
  it('supports weekly pay',()=>{
    const receipts=[r('2026-10-02',90000),r('2026-10-09',90000),r('2026-10-16',90000)]
    expect(suggestPayDates(receipts,'2026-10-19','2026-11-02')?.dates).toEqual(['2026-10-23','2026-10-30'])
  })
  it('makes no suggestion for irregular or thin income history',()=>{
    expect(suggestPayDates([r('2026-07-01',500000),r('2026-07-20',500000),r('2026-09-30',500000)],'2026-11-01','2026-12-01')).toBeNull()
    expect(suggestPayDates([r('2026-08-01',500000),r('2026-09-01',500000)],'2026-11-01','2026-12-01')).toBeNull()
    expect(suggestPayDates([],'2026-11-01','2026-12-01')).toBeNull()
  })
})
