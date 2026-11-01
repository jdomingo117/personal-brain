import {expect,it} from 'vitest'
import {forecastComparison} from './budgetForecastComparison'
import type {SpendingForecast} from './budgetForecast'
const example=()=>({phase:'current',flexible:{available:true,scope_valid:true,integrity_ok:true,coverage_complete:true,settled_net_cents:2000,projected_cents:11000,allocation_cents:10000}} as SpendingForecast)
it('compares recorded spending, additional estimate and allowance on one amount scale',()=>{
 const plot=forecastComparison(example())!;expect(plot.recordedPercent).toBeCloseTo(2000/11000*80);expect(plot.estimatedPercent).toBeCloseTo(9000/11000*80);expect(plot.allowancePercent).toBeCloseTo(10000/11000*80);expect(plot.provisional).toBe(false)
})
it('represents a true zero projection without replacing unknown amounts with zero',()=>{
 const f=example();f.flexible.settled_net_cents=0;f.flexible.projected_cents=0;expect(forecastComparison(f)).toEqual({recordedPercent:0,estimatedPercent:0,allowancePercent:80,provisional:false});f.flexible.settled_net_cents=null;expect(forecastComparison(f)).toBeNull()
})
it('makes a future plot provisional without presenting recorded activity',()=>{
 const f=example();f.phase='future';f.flexible.settled_net_cents=null;f.flexible.coverage_complete=false;expect(forecastComparison(f)).toMatchObject({recordedPercent:0,provisional:true})
})
it('does not turn negative or unsupported signed amounts into positive bars',()=>{
 for(const [recorded,projected,allocation] of [[-100,500,1000],[100,-100,1000],[100,50,1000],[0,100,0],[0,100,-100],[0,Number.MAX_SAFE_INTEGER+1,100]]){const f=example();Object.assign(f.flexible,{settled_net_cents:recorded,projected_cents:projected,allocation_cents:allocation});expect(forecastComparison(f)).toBeNull()}
})
it('suppresses graphics when evidence is unavailable, incomplete or historical',()=>{
 for(const key of ['available','scope_valid','integrity_ok','coverage_complete'] as const){const f=example();f.flexible[key]=false;expect(forecastComparison(f)).toBeNull()}const f=example();f.phase='past';expect(forecastComparison(f)).toBeNull()
})
it('keeps safe-cent extremes finite without multiplying monetary values for a scale',()=>{
 const f=example();Object.assign(f.flexible,{settled_net_cents:1,projected_cents:Number.MAX_SAFE_INTEGER,allocation_cents:Number.MAX_SAFE_INTEGER});const plot=forecastComparison(f)!;expect(plot.allowancePercent).toBe(80);expect(Number.isFinite(plot.estimatedPercent)).toBe(true);expect(plot.recordedPercent+plot.estimatedPercent).toBeCloseTo(80)
})
