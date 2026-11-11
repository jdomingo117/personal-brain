import {describe,it,expect} from 'vitest'
import {buildRecurring} from './recurring'
import {billSavePayload,detectedBills,nextDueFrom} from './budgetDetectedBills'
import type {Txn} from '../data'
import type {AssistanceResult} from './budgetAssistance'

let seq=0
const txn=(p:Partial<Txn>&Pick<Txn,'date'|'amount'>):Txn=>({id:`txn-${++seq}`,merchant:'Netflix',kind:'expense',cat:'Lifestyle',subcat:'Streaming',account:'Everyday',account_id:'acct-1',...p})
const monthly=(merchant:string,amount:number,account_id='acct-1')=>['2026-05-03','2026-06-03','2026-07-03','2026-08-03'].map(date=>txn({date,amount,merchant,account_id}))
const TODAY='2026-08-10'
const result=(over:Partial<AssistanceResult>={})=>({account_ids:['acct-1'],recurring:[],...over}) as AssistanceResult

describe('detected bills for assisted setup',()=>{
  const r=buildRecurring([...monthly('Netflix',-1599),...monthly('Rent Co',-200000),...monthly('Gym',-4500,'acct-2')],[],TODAY)
  it('offers active series on checked accounts, biggest first',()=>{
    const bills=detectedBills(r,result())
    expect(bills.map(b=>b.series.label)).toEqual(['Rent Co','Netflix'])
    expect(bills.every(b=>b.fixed&&b.addable)).toBe(true)
  })
  it('skips series assistance already uses',()=>{
    const rent=r.active.find(s=>s.label==='Rent Co')!
    const bills=detectedBills(r,result({recurring:[{id:'o',account_id:rent.accountId,merchant_key:rent.merchantKey,cadence:'Monthly',amount_cents:200000,next_date:'2026-09-03',period_cents:200000}]}))
    expect(bills.map(b=>b.series.label)).toEqual(['Netflix'])
  })
  it('pins cadence, amount and next date so assistance can use the saved series',()=>{
    const netflix=r.active.find(s=>s.label==='Netflix')!
    const p=billSavePayload(netflix,TODAY)
    expect(p).toMatchObject({action:'save',state:'active',account_id:'acct-1',cadence_override:'Monthly',expected_amount_override:1599,next_expected_override:'2026-09-03'})
    expect(p.evidence_transaction_ids).toHaveLength(4)
  })
  it('treats a bill as current when imports stop before its next charge, not when it really stopped',()=>{
    const later=buildRecurring([...monthly('Netflix',-1599),...['2026-01-10','2026-02-10','2026-03-10'].map(date=>txn({date,amount:-3599,merchant:'Old Sub'}))],[],'2026-11-11')
    expect(later.active).toHaveLength(0)
    const bills=detectedBills(later,result(),new Map([['acct-1','2026-08-20']]))
    expect(bills.map(b=>[b.series.label,b.importGap])).toEqual([['Netflix',true]])
    expect(detectedBills(later,result())).toHaveLength(0)
  })
  it('rolls a past next date forward to the next charge due',()=>{
    const later=buildRecurring(monthly('Netflix',-1599),[],'2026-11-11')
    expect(nextDueFrom(later.dormant[0],'2026-11-11')).toBe('2026-12-03')
    expect(billSavePayload(later.dormant[0],'2026-11-11').next_expected_override).toBe('2026-12-03')
  })
})
