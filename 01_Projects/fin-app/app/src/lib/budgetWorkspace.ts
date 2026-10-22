import { periodContaining, resourceSummary, today } from './budget'
import type { BudgetDetails } from './budgetItems'

export const BUDGET_ENABLED = import.meta.env.VITE_BUDGET_V1_ENABLED === 'true'
export const BUDGET_METHOD = 'budget-foundation-v1'
export type PlanLine = { id: string; kind: 'everyday'|'fixed'|'reserve'|'contribution'; name: string; allocation_cents: number; opening_cents: number }
export type Setup = {
  currency: 'AUD'; timezone: string; frequency: 'monthly'|'fortnightly'; start_date: string; anchor?: string;
  account_ids: string[]; destination_account_ids: string[]; income_cents: number; opening_drawdown_cents: number; lines: PlanLine[];
  assistance?:{method:string;fingerprint:string;source_revision:string;manual:boolean;periods:{start_date:string;end_date:string}[];provenance:Record<string,string>;goal_intent?:{line_id:string;name:string;target_cents:number|null;needed_by:string|null}};
}
export type Snapshot = {
  details?:(BudgetDetails&{taxonomy_scopes:import('./budgetItems').BudgetTaxonomyScope[];frequency_change?:import('./budgetFrequency').FrequencyChange|null;account_policy?:import('./budgetAccountPolicy').AccountPolicy|null;rollover?:import('./budgetRollover').RolloverFacts;rollover_policy?:import('./budgetRollover').RolloverPolicy|null;controls?:import('./budgetControls').ControlState;control_event?:import('./budgetControls').ControlEvent|null})|null;
  tenant_id: string; source_revision: string; method: string; write_enabled: boolean;
  accounts: {id:string;name:string;currency:string}[];
  account_scope: {original_account_id:string;account_id:string|null;role:'activity'|'destination';start_date:string;end_date:string|null}[];
  plan: null|{id:string;version:string;currency:string;timezone:string;frequency:'monthly'|'fortnightly';anchor:string|null};
  period?: {id:string;start_date:string;end_date:string;timezone:string;frequency:string;transition?:boolean};
  revision?: {income_cents:number;drawdown_cents:number}; lines?: PlanLine[];
  actuals?: null|{gross_expense_cents:number;expense_credits_cents:number;net_expense_cents:number;earned_income_cents:number;pending_signed_cents:number};
  scope_valid?: boolean; coverage_complete?: boolean; source_changed_since_plan?: boolean; generated_at?:string;
  unallocated_cents?:number;
  future_template?: {income_cents:number;unallocated_cents:number;allocations:{line_id:string;amount_cents:number}[]};
}
export type Draft = {draft: unknown;draft_version:string;source_revision:string;method:string;stale?:boolean}
export type Command = {action:string;request_id:string;expected_source:string;expected_method:string;[key:string]:unknown}
export type Receipt = {request_id:string;operation_id:string;status:'committed';result:Record<string,unknown>}

/** Strict decimal entry: blank, exponents, negative amounts and excess precision are not zero. */
export function parseBudgetMoney(input:string):number|null {
  if(!/^\d+(\.\d{1,2})?$/.test(input.trim()))return null
  const [whole,part='']=input.trim().split('.')
  const amount=BigInt(whole)*100n+BigInt(part.padEnd(2,'0'))
  return amount<=BigInt(Number.MAX_SAFE_INTEGER)?Number(amount):null
}
// Input serialization only; money displayed to the user uses fmtCents.
export function moneyEntry(value:number):string {return `${Math.floor(value/100)}.${String(value%100).padStart(2,'0')}`}
export function blankSetup(clock=()=>new Date()):Setup {
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney'
  const start=today({now:clock},timezone)
  return {currency:'AUD',timezone,frequency:'monthly',start_date:start,anchor:start,account_ids:[],destination_account_ids:[],income_cents:0,opening_drawdown_cents:0,
    lines:[{id:crypto.randomUUID(),kind:'everyday',name:'Everyday spending',allocation_cents:0,opening_cents:0}]}
}
export function setupPeriod(setup:Setup) {
  return periodContaining(setup.start_date,setup.frequency==='monthly'?{frequency:'monthly',timezone:setup.timezone}:{frequency:'fortnightly',timezone:setup.timezone,anchor:setup.anchor??''})
}
export function setupSummary(setup:Setup,archived:string[]=[]) {
  const allocations=setup.lines.map(line=>({id:line.id,kind:line.kind,amount:line.allocation_cents}))
  const ids=new Set(archived)
  return {current:resourceSummary(setup.income_cents,setup.opening_drawdown_cents,allocations),future:resourceSummary(setup.income_cents,0,allocations.map(a=>ids.has(a.id)?{...a,amount:0}:a))}
}
export function fromSnapshot(s:Snapshot):Setup {
  if(!s.plan||!s.period||!s.revision||!s.lines)throw new Error('Budget details are unavailable.')
  return {currency:'AUD',timezone:s.plan.timezone,frequency:s.plan.frequency,start_date:s.period.start_date,anchor:s.plan.anchor??undefined,
    account_ids:s.account_scope.filter(m=>m.role==='activity'&&m.start_date<s.period!.end_date&&(!m.end_date||m.end_date>s.period!.start_date)).map(m=>m.original_account_id),
    destination_account_ids:s.account_scope.filter(m=>m.role==='destination').map(m=>m.original_account_id),income_cents:s.revision.income_cents,opening_drawdown_cents:s.revision.drawdown_cents,lines:s.lines}
}
export function validateSetup(s:Setup):void {
  setupPeriod(s);setupSummary(s)
  if(s.lines.length>100||s.lines.filter(l=>l.kind==='everyday').length!==1||s.lines.some(l=>!l.name.trim()||l.name.trim().length>60))throw new Error('Give each allowance a name (up to 60 characters). Keep one everyday allowance.')
}
/** M2 may contain partial/older JSON. Never cast it into a ready form or silently replace it. */
export function readSavedSetup(value:unknown):Setup|null {
  if(!value||typeof value!=='object')return null
  const s=value as Setup
  if(s.currency!=='AUD'||typeof s.timezone!=='string'||!['monthly','fortnightly'].includes(s.frequency)||typeof s.start_date!=='string'||
    !Array.isArray(s.account_ids)||!Array.isArray(s.destination_account_ids)||!Array.isArray(s.lines)||
    !s.account_ids.every(id=>typeof id==='string')||!s.destination_account_ids.every(id=>typeof id==='string')||
    !s.lines.every(l=>l&&typeof l.id==='string'&&typeof l.name==='string'&&Number.isSafeInteger(l.opening_cents)&&l.opening_cents>=0))return null
  try{validateSetup(s);return s}catch{return null}
}

/** Keep a timed-out write's exact body/key for replay, never manufacture a new operation. */
export async function recoverBudgetCommand(command:Command, query:(body:unknown)=>Promise<{outcome:Receipt|null}>, write:(body:Command)=>Promise<Receipt>):Promise<Receipt> {
  const {outcome}=await query({action:'operation',request_id:command.request_id})
  return outcome??await write(command)
}
