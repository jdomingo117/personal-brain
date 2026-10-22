import {expect,it} from 'vitest'
import {attentionMessage,attentionToken,defaultAttentionDate,validAttentionDate,type AttentionIssue} from './budgetAttention'
const i={key:'balance:r',issue_hash:'hash',kind:'overspend'} as AttentionIssue
it('binds review drafts to exact source/plan/attention tokens without numeric conversion',()=>{
 const token=attentionToken(i,'9007199254740993','9007199254740995','2')
 expect(token).not.toBe(attentionToken(i,'9007199254740992','9007199254740995','2'))
 expect(token).not.toBe(attentionToken({...i,issue_hash:'new'},'9007199254740993','9007199254740995','2'))
 expect(token).not.toBe(attentionToken(i,'9007199254740993','9007199254740995','3'))
})
it('bounds the suggested snooze by the exact exclusive period end',()=>{
 expect(defaultAttentionDate('2026-10-28','2026-11-01')).toBe('2026-11-01')
 expect(defaultAttentionDate('2028-02-27','2028-03-12')).toBe('2028-03-05')
 expect(validAttentionDate('2026-10-22','2026-10-21','2026-11-01')).toBe(true)
 for(const date of ['2026-10-21','2026-11-02','2026-02-30','garbage'])expect(validAttentionDate(date,'2026-10-21','2026-11-01')).toBe(false)
})
it('does not call an unmatched bill unpaid or imply acknowledging fixes money',()=>{
 expect(attentionMessage({...i,kind:'bill_unmatched'})).toContain('does not prove the bill is unpaid')
 expect(attentionMessage(i)).toContain('shortfall stays')
 expect(attentionMessage({...i,kind:'goal_due_shortfall'})).toContain('not proof of cash')
})
