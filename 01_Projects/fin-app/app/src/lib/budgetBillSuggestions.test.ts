import {describe,it,expect} from 'vitest'
import {classifySuggestions,merchantLabel,rollForward,stoppedOrGap} from './budgetBillSuggestions'
import type {BudgetRecurringEvidence} from './budgetItems'

const sig=(status:'active'|'dormant',nextExpected:string,cadence='Monthly')=>({cadence,expected:4599,nextExpected,status,kind:'fixed' as const})
const evidence=(proposals:BudgetRecurringEvidence['proposals']):BudgetRecurringEvidence=>({as_of:'2026-11-12',normal_from:'2025-11-12',annual_from:'2023-11-12',limited:false,group_count:proposals.length,group_limit:100,observation_limit:64,proposals})
const p=(merchant_key:string,state:BudgetRecurringEvidence['proposals'][number]['state'],signal:ReturnType<typeof sig>|null,account_id='amex')=>({account_id,merchant_key,count:5,state,signal})

describe('shared bill suggestion rules',()=>{
  it('treats a missed charge as missing data when imports end before it was due',()=>{
    expect(stoppedOrGap('2026-10-18','2026-09-29')).toBe('import-gap')
    expect(stoppedOrGap('2026-03-17','2026-09-29')).toBe('stopped')
    expect(stoppedOrGap('2026-10-18',null)).toBe('stopped')
  })
  it('sorts workspace evidence into offers and quiet mentions',()=>{
    const out=classifySuggestions(evidence([p('kayo','detected',sig('dormant','2026-10-18')),p('hubbl','detected',sig('dormant','2026-03-17')),p('netflix','detected',sig('active','2026-11-20')),
      p('peko peko','early-annual',null),p('tolls','manual-required',null),p('coffee','no-pattern',null)]),new Map([['amex','2026-09-29']]))
    expect(out.map(s=>[s.merchant_key,s.kind])).toEqual([['kayo','import-gap'],['hubbl','stopped'],['netflix','current'],['peko peko','possible-annual'],['tolls','manual']])
  })
  it('rolls a past due date forward to the next one', ()=>{
    expect(rollForward('2026-10-18','Monthly','2026-11-12')).toBe('2026-11-18')
    expect(rollForward('2026-10-11','Biweekly','2026-11-12')).toBe('2026-11-22')
    expect(rollForward('2026-12-14','Annual','2026-11-12')).toBe('2026-12-14')
  })
  it('shows a readable merchant name',()=>{
    expect(merchantLabel('ahm health insurance',new Map())).toBe('Ahm Health Insurance')
    expect(merchantLabel('kayo',new Map([['kayo','Kayosports, Binge']]))).toBe('Kayosports, Binge')
  })
})
