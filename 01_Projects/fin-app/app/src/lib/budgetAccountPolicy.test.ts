import {expect,it} from 'vitest'
import {accountScopeAt,scopeNeedsQualification,scopePreviewMatches,type AccountScopePreview} from './budgetAccountPolicy'
import type {Snapshot} from './budgetWorkspace'
const s={source_revision:'9007199254740993',plan:{version:'5'},account_scope:[{original_account_id:'a',role:'activity',start_date:'2026-10-01',end_date:'2026-11-01'},{original_account_id:'b',role:'activity',start_date:'2026-11-01',end_date:null},{original_account_id:'a',role:'destination',start_date:'2026-10-01',end_date:null}]} as Snapshot
it('resolves half-open account scope at exact effective dates independently per role',()=>{
 expect(accountScopeAt(s,'2026-10-31')).toEqual({activity_account_ids:['a'],destination_account_ids:['a']})
 expect(accountScopeAt(s,'2026-11-01')).toEqual({activity_account_ids:['b'],destination_account_ids:['a']})
})
it('keeps unavailable original IDs for explicit removal instead of silently dropping them',()=>{
 expect(accountScopeAt({...s,account_scope:[{original_account_id:'missing',account_id:null,role:'activity',start_date:'2026-10-01',end_date:null}]},'2026-10-21').activity_account_ids).toEqual(['missing'])
})
it('preview matching binds role, scope and opaque versions without numeric conversion',()=>{
 const intent={scope:'future' as const,activity_account_ids:['a','b'],destination_account_ids:[]}
 const p:AccountScopePreview={...intent,activity_account_ids:['b','a'],plan_version:'5',source_revision:s.source_revision,effective_from:'2026-11-01',effective_until:null,preview_hash:'hash',before:[],after:[]}
 expect(scopePreviewMatches(p,intent,s)).toBe(true)
 expect(scopePreviewMatches(p,{...intent,scope:'period'},s)).toBe(false)
 expect(scopePreviewMatches(p,{...intent,destination_account_ids:['a']},s)).toBe(false)
 expect(scopePreviewMatches({...p,source_revision:'9007199254740992'},intent,s)).toBe(false)
})
it('any unknown or incomplete affected window requires qualification',()=>{
 expect(scopeNeedsQualification({after:[{scope_valid:true,coverage_complete:false}]} as AccountScopePreview)).toBe(true)
 expect(scopeNeedsQualification({after:[{scope_valid:false,coverage_complete:true}]} as AccountScopePreview)).toBe(true)
 expect(scopeNeedsQualification({after:[{scope_valid:true,coverage_complete:true}]} as AccountScopePreview)).toBe(false)
})
