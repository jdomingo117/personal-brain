import { describe, expect, it } from 'vitest'
import { budgetPresentation, type BudgetValue } from './budgetPresentation'
import { BUDGET_METHOD, type Snapshot } from './budgetWorkspace'
import type { BudgetItem } from './budgetItems'

function fixture():Snapshot {
  const facts={period_id:'period',start_date:'2026-10-01',end_date:'2026-11-01',
    original_plan:{income_cents:600000,drawdown_cents:0,allocations:[]},
    latest_plan:{income_cents:600000,drawdown_cents:0,allocations:[]},
    actuals:{gross_expense_cents:151000,expense_credits_cents:0,net_expense_cents:151000,earned_income_cents:300000,pending_signed_cents:-4500},
    opening_carry_cents:0,closing_everyday_cents:29000,scope_valid:true,coverage_complete:true,excluded_cents:0,unassigned_credit_cents:0}
  return {tenant_id:'tenant',source_revision:'7',method:BUDGET_METHOD,write_enabled:true,
    accounts:[{id:'account',name:'Activity',currency:'AUD'}],account_scope:[{original_account_id:'account',account_id:'account',role:'activity',start_date:'2026-10-01',end_date:null}],
    plan:{id:'plan',version:'3',currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',anchor:null},
    period:{id:'period',start_date:'2026-10-01',end_date:'2026-11-01',timezone:'Australia/Sydney',frequency:'monthly'},
    revision:{income_cents:600000,drawdown_cents:0},lines:[{id:'everyday',name:'Everyday',kind:'everyday',allocation_cents:180000,opening_cents:0}],
    scope_valid:true,coverage_complete:true,actuals:facts.actuals,unallocated_cents:20000,generated_at:'2026-10-19T10:00:00Z',
    future_template:{income_cents:600000,unallocated_cents:-5000,allocations:[]},
    details:{source_revision:'7',plan_version:'3',undo_operation_id:null,taxonomy:[{id:'groceries',name:'Groceries'}],taxonomy_scopes:[],planning_goals:[],recurring:[],claims:[],
      items:[{line_id:'everyday',name:'Everyday',kind:'everyday',config:null,item_revision:null,opening_cents:0,opening_date:'2026-10-01',planned_cents:180000,reallocated_cents:0,opening_carry_cents:0,remaining_cents:29000,used_cents:151000,reserve_cents:null,net_purchases_cents:0,bank_confirmed_cents:0,user_confirmed_cents:0,changed_claims:0,occurrences:[]}],
      limits:[{id:'limit',category_id:'groceries',subcategory_id:null,custom_subcategory_id:null,amount_cents:70000,used_cents:76000,remaining_cents:-6000,opening_carry_cents:0}],
      other_flexible_cents:110000,other_flexible_used_cents:75000,other_opening_carry_cents:0,other_flexible_remaining_cents:35000,excluded_cents:0,unassigned_credit_cents:0,
      lifecycle:{state:'current',as_of:'2026-10-19',carry_mode:'fresh',provisional_carry:false,chain_valid:true,facts,review:null,changed_since_review:false,previous_id:null,next_id:null,is_latest:true,periods:[]}}
  }
}
function known(value:BudgetValue,cents:number){expect(value).toMatchObject({availability:'known',cents})}
function unavailable(value:BudgetValue,reason?:string){expect(value.availability).toBe('unavailable');expect('cents' in value).toBe(false);if(reason)expect(value.reasons).toContain(reason)}

describe('canonical Budget presentation',()=>{
  it('maps the reference amounts without deriving everyday spend from all expenses',()=>{
    const s=fixture();s.actuals!.net_expense_cents=401000
    const p=budgetPresentation(s)
    known(p.everyday.planned,180000);known(p.everyday.spent,151000);known(p.everyday.remaining,29000)
    known(p.income.expected,600000);known(p.income.received,300000);known(p.income.unallocated,20000)
    known(p.actuals.net,401000);known(p.actuals.pending,-4500)
  })
  it('uses canonical signed remainders including carry and rights, not naive subtraction',()=>{
    const s=fixture(),row=s.details!.items[0]
    row.opening_carry_cents=-10000;row.reallocated_cents=5000;row.remaining_cents=24000
    const p=budgetPresentation(s)
    known(p.everyday.remaining,24000);known(p.everyday.carry,-10000);known(p.everyday.rightsMoved,5000)
  })
  it.each([false,true])('uses the scalar Other remainder with rollover enabled=%s',enabled=>{
    const s=fixture();s.details!.other_flexible_remaining_cents=-12345
    s.details!.rollover={enabled,policy:null,parts:[],protected:null,protected_cents:null,released_variance_cents:null,opening_carry_cents:null,closing_cents:null,flows:[]}
    known(budgetPresentation(s).other.remaining,-12345)
  })
  it('does not recreate a null Other remainder from positive planned and used values',()=>{
    const s=fixture();s.details!.other_flexible_remaining_cents=null
    unavailable(budgetPresentation(s).other.remaining,'missing-field')
  })
  it('does not recreate missing Other or optional category usage from zero',()=>{
    const s=fixture();delete s.details!.other_flexible_remaining_cents;delete s.details!.limits[0].used_cents
    const p=budgetPresentation(s);unavailable(p.other.remaining);unavailable(p.categories[0].spent)
  })
  it('does not hide a malformed null item plan behind the saved allocation fallback',()=>{
    const s=fixture();Reflect.set(s.details!.items[0],'planned_cents',null)
    unavailable(budgetPresentation(s).everyday.planned,'missing-field')
  })
  it('retains a child overage while its parent pool remains positive',()=>{
    const p=budgetPresentation(fixture());known(p.categories[0].remaining,-6000);known(p.everyday.remaining,29000)
    expect(p.categories[0]).toMatchObject({id:'limit',categoryId:'groceries',name:'Groceries'})
  })
  it('uses stable custom scope identity and label instead of merging same-category children',()=>{
    const s=fixture();s.details!.limits[0].custom_subcategory_id='custom'
    s.details!.taxonomy_scopes=[{key:'custom',name:'Special groceries',category_id:'groceries',subcategory_id:null,custom_subcategory_id:'custom'}]
    expect(budgetPresentation(s).categories[0]).toMatchObject({id:'limit',customSubcategoryId:'custom',name:'Special groceries'})
  })
  it('returns the single pool with limits off, without inventing category observations',()=>{
    const s=fixture();s.details!.limits=[]
    const p=budgetPresentation(s);expect(p.categoryMode).toBe('pool');expect(p.categories).toEqual([]);known(p.everyday.spent,151000)
  })
  it('keeps current and future gaps signed, and keeps one-off cash separate',()=>{
    const s=fixture();s.revision!.drawdown_cents=10000;s.unallocated_cents=-9000
    const p=budgetPresentation(s);known(p.income.cashOnce,10000);known(p.income.unallocated,-9000);known(p.income.futureUnallocated,-5000)
  })
  it('accepts a real complete zero as known',()=>{
    const s=fixture();s.actuals!.earned_income_cents=0
    expect(budgetPresentation(s).income.received).toMatchObject({availability:'known',cents:0,coverage:'complete',provisional:false})
  })
  it.each([null,undefined])('never treats %s plan income as zero',raw=>{
    const s=fixture();Reflect.set(s.revision!,'income_cents',raw);unavailable(budgetPresentation(s).income.expected,'missing-field')
  })
  it.each([NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,'1200'])('rejects inexact/malformed cents %s',raw=>{
    const s=fixture();Reflect.set(s.revision!,'income_cents',raw);unavailable(budgetPresentation(s).income.expected,'invalid-money')
  })
  it('retains exact extreme signed cents',()=>{
    const s=fixture();s.unallocated_cents=-Number.MAX_SAFE_INTEGER;known(budgetPresentation(s).income.unallocated,-Number.MAX_SAFE_INTEGER)
  })
})

describe('independent value qualifications',()=>{
  it('keeps manual planning and provisional budget authority while observations are unavailable',()=>{
    const s=fixture();s.account_scope=[]
    const p=budgetPresentation(s);known(p.income.expected,600000)
    expect(p.income.expected.provisional).toBe(false)
    unavailable(p.income.received,'no-activity');unavailable(p.everyday.spent,'no-activity')
    expect(p.everyday.remaining).toMatchObject({availability:'known',cents:29000,coverage:'none',provisional:true})
  })
  it.each(['expired','destination'] as const)('does not count %s membership as activity for the selected dates',mode=>{
    const s=fixture();if(mode==='expired')s.account_scope[0].end_date=s.period!.start_date;else s.account_scope[0].role='destination'
    unavailable(budgetPresentation(s).income.received,'no-activity')
  })
  it('qualifies incomplete known activity without hiding its actual recorded amount',()=>{
    const s=fixture();s.coverage_complete=false
    expect(budgetPresentation(s).income.received).toMatchObject({availability:'known',cents:300000,coverage:'partial',provisional:true,reasons:['partial-history']})
  })
  it('does not qualify received income using unrelated provisional carry',()=>{
    const s=fixture();s.details!.lifecycle!.provisional_carry=true
    const p=budgetPresentation(s);expect(p.income.received.provisional).toBe(false);expect(p.everyday.remaining.provisional).toBe(true)
  })
  it('keeps a retained value both stale and provisional after a failed read',()=>{
    const s=fixture();s.coverage_complete=false
    expect(budgetPresentation(s,'failed').everyday.remaining).toMatchObject({availability:'known',cents:29000,freshness:'stale',provisional:true})
  })
  it.each([['loading','refreshing'],['preparing','preparing-history'],['failed','read-failed'],['invalidated','facts-changed']] as const)('qualifies retained figures during %s', (state,reason)=>{
    const p=budgetPresentation(fixture(),state);known(p.income.expected,600000);expect(p.income.expected.freshness).toBe('stale');expect(p.income.expected.reasons).toContain(reason)
  })
  it('does not confuse newer source than the plan with a failed current read',()=>{
    const s=fixture();s.source_changed_since_plan=true
    expect(budgetPresentation(s).everyday.remaining.freshness).toBe('current')
  })
  it('qualifies the previous snapshot while a write result is unresolved',()=>{
    const p=budgetPresentation(fixture(),'ready',{pendingWrite:true})
    expect(p.income.expected).toMatchObject({availability:'known',cents:600000,freshness:'stale',reasons:['pending-write']})
  })
  it('suppresses future observed money while preserving provisional plan and budget values',()=>{
    const s=fixture();s.details!.lifecycle!.state='future'
    const p=budgetPresentation(s);unavailable(p.income.received,'future-period');unavailable(p.everyday.spent,'future-period')
    expect(p.everyday.remaining).toMatchObject({availability:'known',provisional:true});known(p.income.expected,600000)
  })
  it('makes invalid-scope actuals/balances unavailable but keeps plan-only inputs',()=>{
    const s=fixture();s.scope_valid=false
    const p=budgetPresentation(s);unavailable(p.income.received,'invalid-scope');unavailable(p.everyday.remaining,'invalid-scope');known(p.income.expected,600000)
  })
  it('never formats a null/invalid-chain balance as zero even if activity is valid',()=>{
    const s=fixture();s.details!.lifecycle!.chain_valid=false;s.details!.items[0].remaining_cents=null
    const p=budgetPresentation(s);unavailable(p.everyday.remaining,'invalid-chain');unavailable(p.other.remaining,'invalid-chain');known(p.everyday.planned,180000)
  })
  it.each(['source','plan'] as const)('refuses incompatible detail %s versions',kind=>{
    const s=fixture();if(kind==='source')s.details!.source_revision='old';else s.details!.plan_version='old'
    const p=budgetPresentation(s);unavailable(p.everyday.remaining,'incompatible-details');expect(p.categoryMode).toBe('unavailable');known(p.everyday.planned,180000)
  })
  it('can show saved plan allocation without details but never invented observed balances',()=>{
    const s=fixture();s.details=null
    const p=budgetPresentation(s);known(p.everyday.planned,180000);unavailable(p.everyday.remaining,'details-missing');unavailable(p.income.received,'details-missing')
  })
  it('does not let null observed data become verified zero',()=>{
    const s=fixture();s.actuals=null;unavailable(budgetPresentation(s).income.received,'missing-field')
  })
  it('does not interpret an unsupported method or empty setup as saved money',()=>{
    const s=fixture();s.method='future-method';unavailable(budgetPresentation(s).income.expected,'unsupported-method')
    unavailable(budgetPresentation(null,'loading').income.expected,'no-plan')
    s.plan=null;expect(budgetPresentation(s).state).toBe('empty')
  })
  it('preserves saved read facts for viewers or paused writes',()=>{
    const s=fixture();s.write_enabled=false
    known(budgetPresentation(s).income.received,300000)
  })
})

it('keeps goal reserve, purchases, bank and user evidence separate without a composite total',()=>{
  const s=fixture(),goal:BudgetItem={...s.details!.items[0],line_id:'goal',name:'Flight',kind:'reserve',reserve_cents:70000,net_purchases_cents:10000,bank_confirmed_cents:60000,user_confirmed_cents:60000,
    config:{type:'goal',name:'Flight',target_cents:null,estimated:true,due_date:null,cadence:'monthly',anchor:'2026-10-25',amount_cents:10000,state:'draft',recurring_id:null,planning_goal_id:null}}
  s.details!.items.push(goal)
  const p=budgetPresentation(s).goals[0]
  known(p.reserve,70000);known(p.bankConfirmed,60000);known(p.userConfirmed,60000);known(p.purchases,10000);unavailable(p.target)
  expect('confirmedTotal' in p).toBe(false);expect('completionDate' in p).toBe(false)
})

it('preserves original/latest/recorded history and source provenance without mutation',()=>{
  const s=fixture(),l=s.details!.lifecycle!
  l.state='past';l.changed_since_review=true
  l.review={id:'review',version:'2',state:'reviewed',carry_mode:'carry',source_revision:'6',accepted_incomplete:false,payload:structuredClone(l.facts)}
  l.review.payload.closing_everyday_cents=40000;l.facts.latest_plan.income_cents=610000
  const before=JSON.stringify(s)
  function freeze(value:unknown){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze)}}
  freeze(s)
  const p=budgetPresentation(s)
  expect(p.history).toMatchObject({original:{income_cents:600000},latest:{income_cents:610000},recorded:{closing_everyday_cents:40000},changedSinceReview:true})
  expect(p.period).toMatchObject({asOf:'2026-10-19',timezone:'Australia/Sydney',endExclusive:'2026-11-01'})
  expect(p.everyday.remaining.provenance).toMatchObject({tenantId:'tenant',planId:'plan',periodId:'period',sourceRevision:'7',planVersion:'3',method:BUDGET_METHOD})
  expect(JSON.stringify(s)).toBe(before)
})


describe('saved allocation plan',()=>{
 it('keeps current allocations, initial reserves and continuing amounts separate without mutation',()=>{
  const s=fixture();s.lines!.push({id:'goal',name:'Trip',kind:'reserve',allocation_cents:10000,opening_cents:50000})
  s.future_template!.allocations=[{line_id:'everyday',amount_cents:200000},{line_id:'goal',amount_cents:0}]
  const before=JSON.stringify(s),p=budgetPresentation(s)
  expect(p.plan.lines.map(line=>line.id)).toEqual(['everyday','goal'])
  known(p.plan.lines[1].planned,10000);known(p.plan.lines[1].opening,50000)
  known(p.plan.futureLines[1].planned,0);known(p.plan.futureLines[0].planned,200000)
  known(p.income.futureUnallocated,-5000);expect(JSON.stringify(s)).toBe(before)
 })
 it('qualifies stale reads and preserves missing future data as unavailable',()=>{
  const s=fixture();delete s.future_template
  const p=budgetPresentation(s,'failed')
  expect(p.plan.futureAvailable).toBe(false);expect(p.plan.futureLines).toEqual([])
  unavailable(p.plan.futureIncome,'missing-field');expect(p.plan.lines[0].planned.freshness).toBe('stale')
  s.method='unsupported';unavailable(budgetPresentation(s).plan.lines[0].planned,'unsupported-method')
 })
})
