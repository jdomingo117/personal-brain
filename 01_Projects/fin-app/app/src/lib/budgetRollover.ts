import type {BudgetLimit} from './budgetItems'
import type {AccountScopeFacts} from './budgetAccountPolicy'
export type RolloverRule={id:string;mode:'carry'|'retain'|'release'|'transfer';target:string|null}
export type RolloverIntent={limits:BudgetLimit[];rules:RolloverRule[]}
export type RolloverEntry=RolloverIntent&{from:string;identities?:(BudgetLimit&{label?:string})[]}
export type RolloverPolicy={id:string;version:string;action:'saved'|'undo';timeline:RolloverEntry[]}
export type RolloverFacts={enabled:boolean;policy:RolloverEntry|null;parts:(BudgetLimit&{opening_carry_cents:number|null;remaining_cents:number|null})[];protected:Record<string,number>|null;protected_cents:number|null;released_variance_cents:number|null;opening_carry_cents:number|null;closing_cents:number|null;flows:{id:string;mode:RolloverRule['mode'];target:string|null;amount_cents:number|null;period_balance_cents:number|null;previous_protected_cents:number|null;protected_cents:number|null;shortfall_cents:number|null}[]}
export type RolloverPreview=RolloverIntent&{effective_from:string;timeline:RolloverEntry[];source_revision:string;plan_version:string;preview_hash:string;before:(AccountScopeFacts&{rollover:RolloverFacts})[];after:(AccountScopeFacts&{rollover:RolloverFacts})[]}
export const plainLimit=({id,category_id,subcategory_id,custom_subcategory_id,amount_cents}:BudgetLimit):BudgetLimit=>({id,category_id,subcategory_id,custom_subcategory_id,amount_cents})
/** Preserve removed identities so protected rights always have an explicit route. */
export function rolloverDraft(limits:BudgetLimit[],policy:RolloverPolicy|null|undefined,date:string):RolloverIntent{
 const entries=policy?.timeline??[],entry=[...entries].reverse().find(e=>e.from<=date)
 const next=(entry?.limits??limits).map(plainLimit)
 const ids=new Set(['other',...limits.map(l=>l.id),...next.map(l=>l.id),...entries.flatMap(e=>e.rules.map(r=>r.id))])
 return {limits:next,rules:[...ids].map(id=>entry?.rules.find(r=>r.id===id)??{id,mode:'release',target:null})}
}
export function rolloverMatches(p:RolloverPreview,intent:RolloverIntent,source:string,version:string){
 const rules=(rows:RolloverRule[])=>rows.map(({id,mode,target})=>({id,mode,target}))
 return p.source_revision===source&&p.plan_version===version&&JSON.stringify(p.limits.map(plainLimit))===JSON.stringify(intent.limits.map(plainLimit))&&JSON.stringify(rules(p.rules))===JSON.stringify(rules(intent.rules))
}
/** Parent control changes active children only; removed identities keep their explicit disposition. */
export function bulkRollover(intent:RolloverIntent,mode:'carry'|'retain'):RolloverIntent{
 const active=new Set(['other',...intent.limits.map(l=>l.id)])
 return {...intent,rules:intent.rules.map(r=>active.has(r.id)?{id:r.id,mode,target:null}:r)}
}
