import {expect,it} from 'vitest'
import {forecastReadProblem,forecastReason,type SpendingForecast} from './budgetForecast'
import type {Snapshot} from './budgetWorkspace'
const now=()=>new Date('2026-10-27T01:00:00Z')
function snapshot(){return {source_revision:'9007199254740993',plan:{id:'p',version:'9007199254740995',timezone:'Australia/Sydney'},period:{id:'x'},details:{forecast:{method:'budget-forecast-v1',source_revision:'9007199254740993',plan_version:'9007199254740995',period_id:'x',as_of:'2026-10-27',phase:'current',checked_at:'2026-10-27T01:00:00Z',through_date:'2026-10-27',flexible:{line_id:'e',available:true,reason:null,status:'within_plan',allocation_cents:10000,settled_net_cents:1000,remaining_allocation_cents:9000,pending_expense_cents:0,pending_overage:false,projected_cents:1400,remaining_days:4,threshold_cents:2500,history:[{start_date:'2026-07-01',end_date:'2026-08-01',days:31,gross_cents:3100},{start_date:'2026-08-01',end_date:'2026-09-01',days:31,gross_cents:3100},{start_date:'2026-09-01',end_date:'2026-10-01',days:30,gross_cents:3000}],median:{start_date:'2026-08-01',end_date:'2026-09-01',days:31,gross_cents:3100},policy_names:[],scope_valid:true,coverage_complete:true,integrity_ok:true},fixed:[]} as SpendingForecast}} as unknown as Snapshot}
it('binds estimates to exact source, plan, period, method and local calculation date',()=>{
 const s=snapshot();expect(forecastReadProblem(s,'ready',false,now)).toBeNull()
 for(const patch of [{source_revision:'9007199254740992'},{plan_version:'9007199254740994'},{period_id:'other'},{method:'old'}]){const changed=snapshot();Object.assign(changed.details!.forecast!,patch);expect(forecastReadProblem(changed,'ready',false,now)).toMatch(/basis changed/)}
 expect(forecastReadProblem(s,'failed',false,now)).toMatch(/out of date/)
 expect(forecastReadProblem(s,'ready',true,now)).toMatch(/out of date/)
 expect(forecastReadProblem(s,'ready',false,()=>new Date('2026-10-28T01:00:00Z'))).toMatch(/different local date/)
})
it('fails closed on unsafe cents, missing sample money and malformed calendar basis',()=>{
 for(const mutate of [(f:SpendingForecast)=>{f.flexible.projected_cents=Number.MAX_SAFE_INTEGER+1},(f:SpendingForecast)=>{f.flexible.history[1].gross_cents=null},(f:SpendingForecast)=>{f.flexible.history[1].days=NaN},(f:SpendingForecast)=>{f.flexible.history[0].end_date='2026-08-02'},(f:SpendingForecast)=>{f.flexible.median=null},(f:SpendingForecast)=>{f.flexible.history[1].days=30},(f:SpendingForecast)=>{f.flexible.scope_valid=false},(f:SpendingForecast)=>{f.flexible.coverage_complete=false},(f:SpendingForecast)=>{f.checked_at='invalid'},(f:SpendingForecast)=>{f.flexible.median!.gross_cents=1}]){const s=snapshot();mutate(s.details!.forecast!);expect(forecastReadProblem(s,'ready',false,now)).not.toBeNull()}
})
it('never presents Within plan from unavailable data, and distinguishes known zero from unknown',()=>{
 const s=snapshot(),f=s.details!.forecast!;f.flexible.available=false;f.flexible.reason='not_enough_history';f.flexible.projected_cents=null
 expect(forecastReadProblem(s,'ready',false,now)).not.toBeNull()
 f.flexible.status='unavailable';expect(forecastReadProblem(s,'ready',false,now)).toBeNull()
 f.flexible.available=true;f.flexible.status='within_plan';f.flexible.projected_cents=0;for(const m of f.flexible.history)m.gross_cents=0;f.flexible.median!.gross_cents=0
 expect(forecastReadProblem(s,'ready',false,now)).toBeNull()
 expect(forecastReason('not_enough_history')).toContain('missing months are not zero')
 expect(forecastReason('incomplete_coverage')).toContain('cannot establish a Within plan')
})
