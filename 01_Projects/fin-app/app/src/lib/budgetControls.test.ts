import {expect,it} from 'vitest'
import {controlKey,controlMatches,controlNeedsQualification,type ControlIntent,type ControlPreview} from './budgetControls'
import {blankSetup,setupSummary} from './budgetWorkspace'
const intent:ControlIntent={control:'archive_line',line_id:'r',disposition:'transfer',target_line_id:'t'}
const p={...intent,source_revision:'9007199254740993',plan_version:'9007199254740995',after:[{scope_valid:true,coverage_complete:true}],gap:{scope_valid:true,coverage_complete:true}} as ControlPreview
it('binds lifecycle previews to opaque versions and full signed disposition intent',()=>{
 expect(controlMatches(p,intent,p.source_revision,p.plan_version)).toBe(true)
 expect(controlMatches(p,intent,'9007199254740992',p.plan_version)).toBe(false)
 for(const change of [{control:'pause_budget' as const},{line_id:'other'},{disposition:'retain' as const},{target_line_id:'other'}])expect(controlMatches(p,{...intent,...change},p.source_revision,p.plan_version)).toBe(false)
 expect(controlKey({target_line_id:'t',disposition:'transfer',line_id:'r',control:'archive_line'})).toBe(controlKey(intent))
})
it('qualifies unavailable saved windows and uncovered gap activity independently',()=>{
 expect(controlNeedsQualification(p)).toBe(false)
 expect(controlNeedsQualification({...p,gap:{...p.gap,coverage_complete:false}})).toBe(true)
 expect(controlNeedsQualification({...p,gap:{...p.gap,scope_valid:false}})).toBe(true)
 expect(controlNeedsQualification({...p,after:[{scope_valid:true,coverage_complete:false}] as ControlPreview['after']})).toBe(true)
})
it('preserves archived current allowances but shows zero new future allocation',()=>{
 const setup=blankSetup();setup.income_cents=10000;setup.lines[0].allocation_cents=5000
 setup.lines.push({id:'reserve',kind:'reserve',name:'Flight',allocation_cents:3000,opening_cents:4000})
 const s=setupSummary(setup,['reserve'])
 expect(s.current.allocated).toBe(8000);expect(s.future.allocated).toBe(5000)
 expect(s.current.resources).toBe(10000);expect(s.future.resources).toBe(10000)
})
