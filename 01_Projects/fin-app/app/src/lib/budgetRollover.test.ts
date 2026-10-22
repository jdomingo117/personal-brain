import {expect,it} from 'vitest'
import {bulkRollover,rolloverDraft,rolloverMatches,type RolloverPolicy,type RolloverPreview} from './budgetRollover'
const limit={id:'child',category_id:'shopping',subcategory_id:null,custom_subcategory_id:null,amount_cents:100}
it('defaults reset explicitly and strips derived facts from outgoing limits',()=>{
 expect(rolloverDraft([{...limit,remaining_cents:-20}],null,'2026-11-01')).toEqual({limits:[limit],rules:[{id:'other',mode:'release',target:null},{id:'child',mode:'release',target:null}]})
})
it('parent rollover controls change active partitions without discarding removed protected rights',()=>{
 const draft=rolloverDraft([limit],null,'2026-11-01')
 draft.rules.push({id:'removed',mode:'transfer',target:'other'})
 expect(bulkRollover(draft,'carry').rules).toEqual([{id:'other',mode:'carry',target:null},{id:'child',mode:'carry',target:null},{id:'removed',mode:'transfer',target:'other'}])
 expect(bulkRollover(draft,'retain').rules.at(-1)).toEqual(draft.rules.at(-1))
 expect(draft.rules[0].mode).toBe('release')
})
it('resolves exact future boundary while retaining removed identities for disposition',()=>{
 const policy:RolloverPolicy={id:'policy',version:'2',action:'saved',timeline:[{from:'2026-11-01',limits:[],rules:[{id:'other',mode:'carry',target:null},{id:'child',mode:'retain',target:null}]}]}
 expect(rolloverDraft([limit],policy,'2026-10-31').limits).toEqual([limit])
 expect(rolloverDraft([limit],policy,'2026-11-01')).toEqual({limits:[],rules:policy.timeline[0].rules})
})
it('binds confirmation to exact disposition, amount and opaque versions',()=>{
 const intent=rolloverDraft([limit],null,'2026-11-01'),p={...intent,source_revision:'9007199254740993',plan_version:'9'} as RolloverPreview
 expect(rolloverMatches(p,intent,'9007199254740993','9')).toBe(true)
 expect(rolloverMatches(p,intent,'9007199254740992','9')).toBe(false)
 expect(rolloverMatches(p,{...intent,limits:[{...limit,amount_cents:101}]},p.source_revision,'9')).toBe(false)
 expect(rolloverMatches(p,{...intent,rules:[{id:'other',mode:'transfer',target:'child'}]},p.source_revision,'9')).toBe(false)
 const server={...p,limits:[{amount_cents:100,custom_subcategory_id:null,subcategory_id:null,category_id:'shopping',id:'child'}],rules:p.rules.map(r=>({target:r.target,mode:r.mode,id:r.id}))}
 expect(rolloverMatches(server,intent,p.source_revision,'9')).toBe(true)
})
