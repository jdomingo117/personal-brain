import { BUDGET_METHOD, type BudgetReadState, type Snapshot } from './budgetWorkspace'
import type { BudgetItem, BudgetLimit } from './budgetItems'

export type ValueReason = 'no-plan'|'missing-field'|'invalid-money'|'unsupported-method'|
  'details-missing'|'incompatible-details'|'invalid-scope'|'invalid-chain'|'no-activity'|
  'partial-history'|'future-period'|'provisional-carry'|'refreshing'|'read-failed'|'preparing-history'|'pending-write'|'facts-changed'
export type ValueBasis = 'plan'|'recorded'|'budget-balance'|'bank-evidence'|'user-evidence'
export type ValueProvenance = {
  tenantId:string|null; planId:string|null; periodId:string|null;
  planVersion:string|null; sourceRevision:string|null; method:string|null; generatedAt:string|null
}
type Qualification = {
  basis:ValueBasis; coverage:'complete'|'partial'|'none'|'unknown';
  freshness:'current'|'stale'; provisional:boolean; reasons:readonly ValueReason[];
  provenance:ValueProvenance
}
export type BudgetValue = Qualification & (
  {availability:'known';cents:number} | {availability:'unavailable'}
)

/** A bounded, read-only adapter. No alternate balance arithmetic, feeds, clock,
 * requests, storage, commands or combined goal-evidence total belongs here. */
export function budgetPresentation(snapshot:Snapshot|null, readState:BudgetReadState='ready', options:{pendingWrite?:boolean}={}) {
  const s=snapshot, d=s?.details, period=s?.period
  const active=!!s?.plan&&!!period
  const supported=s?.method===BUDGET_METHOD
  const compatible=!!d&&d.source_revision===s?.source_revision&&d.plan_version===s?.plan?.version
  const detailReason:ValueReason|undefined=!d?'details-missing':!compatible?'incompatible-details':undefined
  const lifecycle=compatible?d?.lifecycle:undefined
  const phase=lifecycle?.state??'unknown'
  const hasActivity=!!period&&!!s?.account_scope.some(m=>m.role==='activity'&&m.start_date<period.end_date&&(!m.end_date||m.end_date>period.start_date))
  const coverage:Qualification['coverage']=!hasActivity?'none':s?.scope_valid!==true?'unknown':s.coverage_complete===true?'complete':'partial'
  const readReason:ValueReason|undefined=readState==='failed'?'read-failed':readState==='invalidated'?'facts-changed':readState==='preparing'?'preparing-history':readState==='loading'?'refreshing':undefined
  const provenance:ValueProvenance={tenantId:s?.tenant_id??null,planId:s?.plan?.id??null,periodId:period?.id??null,
    planVersion:s?.plan?.version??null,sourceRevision:s?.source_revision??null,method:s?.method??null,generatedAt:s?.generated_at??null}
  function value(raw:unknown,basis:ValueBasis,blocked?:ValueReason,extra:ValueReason[]=[]):BudgetValue {
    const evidenceDependent=basis!=='plan'
    const reasons:ValueReason[]=[]
    if(readReason)reasons.push(readReason)
    if(options.pendingWrite)reasons.push('pending-write')
    if(evidenceDependent){
      if(!hasActivity)reasons.push('no-activity')
      else if(coverage==='partial')reasons.push('partial-history')
      if(phase==='future')reasons.push('future-period')
      if(basis==='budget-balance'&&lifecycle?.provisional_carry)reasons.push('provisional-carry')
    }
    reasons.push(...extra)
    const failure:ValueReason|undefined=!active?'no-plan':!supported?'unsupported-method':blocked??
      (raw===null||raw===undefined?'missing-field':typeof raw!=='number'||!Number.isSafeInteger(raw)?'invalid-money':undefined)
    const common:Qualification={basis,coverage,freshness:readReason||options.pendingWrite?'stale':'current',
      provisional:phase==='future'||evidenceDependent&&(coverage!=='complete'||basis==='budget-balance'&&!!lifecycle?.provisional_carry),
      reasons:[...new Set(failure?[...reasons,failure]:reasons)],provenance}
    return failure?{...common,availability:'unavailable'}:{...common,availability:'known',cents:raw as number}
  }
  const observedBlock:ValueReason|undefined=detailReason??(!lifecycle?'details-missing':phase==='future'?'future-period':s?.scope_valid!==true?'invalid-scope':!hasActivity?'no-activity':undefined)
  const balanceBlock:ValueReason|undefined=detailReason??(s?.scope_valid!==true?'invalid-scope':lifecycle?.chain_valid!==true?'invalid-chain':undefined)
  const items=compatible?d!.items:[]
  const pools=items.filter(item=>item.kind==='everyday'&&!item.config?.voided)
  const pool=pools.length===1?pools[0]:undefined
  const savedPools=s?.lines?.filter(line=>line.kind==='everyday')??[]
  const savedPool=savedPools.length===1?savedPools[0]:undefined
  const categoryNames=new Map(d?.taxonomy.map(row=>[row.id,row.name])??[])
  const scopeNames=new Map(d?.taxonomy_scopes?.map(row=>[`${row.category_id}:${row.subcategory_id}:${row.custom_subcategory_id}`,row.name])??[])
  function category(row:BudgetLimit){return {
    id:row.id,categoryId:row.category_id,subcategoryId:row.subcategory_id,customSubcategoryId:row.custom_subcategory_id,
    name:scopeNames.get(`${row.category_id}:${row.subcategory_id}:${row.custom_subcategory_id}`)??categoryNames.get(row.category_id)??row.category_id,
    planned:value(row.amount_cents,'plan',detailReason),spent:value(row.used_cents,'recorded',detailReason??observedBlock),
    carry:value(row.opening_carry_cents,'budget-balance',balanceBlock),remaining:value(row.remaining_cents,'budget-balance',balanceBlock)
  }}
  function item(row:BudgetItem){return {
    id:row.line_id,name:row.name,kind:row.kind,config:row.config,archived:!!row.archived,
    planned:value(row.planned_cents,'plan',detailReason),remaining:value(row.remaining_cents,'budget-balance',balanceBlock),
    reserve:value(row.reserve_cents,'budget-balance',balanceBlock),purchases:value(row.net_purchases_cents,'recorded',detailReason??observedBlock),
    bankConfirmed:value(row.bank_confirmed_cents,'bank-evidence',balanceBlock??(phase==='future'?'future-period':undefined)),
    userConfirmed:value(row.user_confirmed_cents,'user-evidence',balanceBlock??(phase==='future'?'future-period':undefined)),
    target:value(row.config?.target_cents,'plan',detailReason),occurrences:row.occurrences
  }}
  const mappedItems=items.filter(row=>!row.config?.voided).map(item)
  const state:'empty'|'unsupported'|'saved'=!active?'empty':!supported?'unsupported':'saved'
  const detailsState:'missing'|'available'|'incompatible'=!d?'missing':compatible?'available':'incompatible'
  const categoryMode:'unavailable'|'limits'|'pool'=!compatible?'unavailable':d!.limits.length?'limits':'pool'
  return {
    state,phase,coverage,detailsState,
    period:period?{id:period.id,start:period.start_date,endExclusive:period.end_date,timezone:period.timezone,frequency:period.frequency,transition:!!period.transition,asOf:lifecycle?.as_of??null}:null,
    provenance,readState,
    everyday:{id:pool?.line_id??savedPool?.id??null,
      planned:value(pool?pool.planned_cents:savedPool?.allocation_cents,'plan'),
      spent:value(pool?.used_cents,'recorded',detailReason??observedBlock),
      remaining:value(pool?.remaining_cents,'budget-balance',balanceBlock),
      carry:value(pool?.opening_carry_cents,'budget-balance',balanceBlock),
      rightsMoved:value(pool?.reallocated_cents,'budget-balance',balanceBlock)},
    income:{expected:value(s?.revision?.income_cents,'plan'),cashOnce:value(s?.revision?.drawdown_cents,'plan'),
      received:value(s?.actuals?.earned_income_cents,'recorded',observedBlock),
      unallocated:value(s?.unallocated_cents,'plan'),futureUnallocated:value(s?.future_template?.unallocated_cents,'plan')},
    plan:{
      lines:(s?.lines??[]).map(line=>({id:line.id,name:line.name,kind:line.kind,
        planned:value(line.allocation_cents,'plan'),opening:value(line.opening_cents,'plan'),
        archived:compatible&&!!d?.controls?.archives.some(a=>a.line_id===line.id)})),
      futureAvailable:!!s?.future_template,
      futureIncome:value(s?.future_template?.income_cents,'plan'),
      futureLines:(s?.future_template?.allocations??[]).map(line=>({id:line.line_id,
        name:s?.lines?.find(saved=>saved.id===line.line_id)?.name??'Saved allowance',
        planned:value(line.amount_cents,'plan')}))
    },
    actuals:{gross:value(s?.actuals?.gross_expense_cents,'recorded',observedBlock),credits:value(s?.actuals?.expense_credits_cents,'recorded',observedBlock),
      net:value(s?.actuals?.net_expense_cents,'recorded',observedBlock),pending:value(s?.actuals?.pending_signed_cents,'recorded',observedBlock)},
    categoryMode,
    categories:compatible?d!.limits.map(category):[],
    other:{planned:value(compatible?d!.other_flexible_cents:undefined,'plan',detailReason),
      spent:value(compatible?d!.other_flexible_used_cents:undefined,'recorded',detailReason??observedBlock),
      carry:value(compatible?d!.other_opening_carry_cents:undefined,'budget-balance',balanceBlock),
      // Already canonical for both rollover-on and rollover-off server paths.
      // A missing/null value stays unavailable; never derive it from the pool.
      remaining:value(compatible?d!.other_flexible_remaining_cents:undefined,'budget-balance',balanceBlock)},
    items:mappedItems,goals:mappedItems.filter(row=>row.config?.type==='goal'),
    commitments:mappedItems.filter(row=>row.kind!=='everyday'&&row.config?.type!=='goal'),
    history:lifecycle?{original:lifecycle.facts.original_plan,latest:lifecycle.facts.latest_plan,recorded:lifecycle.review?.payload??null,changedSinceReview:lifecycle.changed_since_review}:null,
    checks:compatible?d?.attention??null:null
  }
}
export type BudgetPresentation=ReturnType<typeof budgetPresentation>

/** Short shared qualifications; visible section copy supplies the same meaning. */
export function budgetValueQualification(value:BudgetValue):string {
  const messages:Partial<Record<ValueReason,string>>={
    'no-plan':'No saved budget','missing-field':'Information unavailable','invalid-money':'Amount unavailable',
    'unsupported-method':'Budget method unavailable','details-missing':'Details unavailable','incompatible-details':'Details need refreshing',
    'invalid-scope':'Account scope unavailable','invalid-chain':'History balance unavailable','no-activity':'No account activity included',
    'partial-history':'Known activity only','future-period':'Future plan, not received money','provisional-carry':'Includes provisional history',
    'refreshing':'Previously loaded figures','read-failed':'Previously loaded figures may be out of date','preparing-history':'History check incomplete',
    'pending-write':'Saved result needs checking','facts-changed':'Saved facts changed; refresh needed'
  }
  return value.reasons.map(reason=>messages[reason]).filter(Boolean).join('; ')
}
