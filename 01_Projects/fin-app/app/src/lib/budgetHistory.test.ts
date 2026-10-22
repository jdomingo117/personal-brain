import {describe,it,expect} from 'vitest'
import {isPreparing,historyRequest} from './budgetHistory'
const p={plan_id:'plan',period_id:'period',source_revision:'42',plan_version:'9',completed:8,total:60,ready:false}
describe('resumable budget history',()=>{
 it('recognizes count-only preparation, never a financial snapshot',()=>expect(isPreparing({state:'preparing',tenant_id:'t',preparation:p})).toBe(true))
 it.each([-1,61,1.5,NaN])('rejects invalid completed count %s',completed=>expect(isPreparing({state:'preparing',preparation:{...p,completed}})).toBe(false))
 it('binds continuation to exact plan, selected period and opaque versions',()=>expect(historyRequest(p)).toEqual({action:'prepare_history',plan_id:'plan',period_id:'period',expected_source:'42',expected_plan:'9'}))
 it('does not mistake unavailable or partial data for preparation',()=>expect(isPreparing({state:'unavailable',actuals:null})).toBe(false))
})
