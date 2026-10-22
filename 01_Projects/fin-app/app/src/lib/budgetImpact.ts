export type ImpactPreparation={state:'preparing_impact';completed:number;total:2;plan_id:string;period_id:string;source_revision:string;plan_version:string}
export function isImpactPreparation(value:unknown):value is ImpactPreparation{
 if(!value||typeof value!=='object')return false
 const p=value as Partial<ImpactPreparation>
 return p.state==='preparing_impact'&&p.total===2&&Number.isInteger(p.completed)&&p.completed!>=0&&p.completed!<=2&&typeof p.plan_id==='string'&&typeof p.period_id==='string'&&typeof p.source_revision==='string'&&typeof p.plan_version==='string'
}
/** At most two complete projection checks and one final review, never a loop
 * that silently rebases input or sends a financial save. Retry the same body to
 * resume server checkpoints after an interrupted request. */
export async function prepareImpact<T>(body:Record<string,unknown>,request:(body:Record<string,unknown>)=>Promise<T|ImpactPreparation>,progress:(p:ImpactPreparation|null)=>void,active:()=>boolean):Promise<T>{
 try{
  for(let step=0;step<3;step++){
   if(!active())throw Error('Your budget changed. Review the latest budget effects again.')
   const answer=await request(body)
   if(!active())throw Error('Your budget changed. Review the latest budget effects again.')
   if(!isImpactPreparation(answer)){
    if(answer&&typeof answer==='object'&&'state' in answer&&answer.state==='preparing_impact')throw Error('We couldn’t verify these checks. Review the budget effects again. No budget change has been saved.')
    return answer as T
   }
   if(answer.plan_id!==body.plan_id||answer.period_id!==body.period_id||answer.source_revision!==body.expected_source||answer.plan_version!==body.expected_plan)throw Error('Your budget changed. Review the latest budget effects again.')
   progress(answer)
  }
  throw Error('Review the effects again to continue the completed checks. No budget change has been saved.')
 }finally{progress(null)}
}
