// Test-only orchestration. Each call is a separate bounded SQL transaction;
// callers own a freshly provisioned isolated fixture, never the personal DB.
export function prepareTestImpact({sql,quote,user,kind,input}){
 let result
 for(let n=0;n<3;n++){
  result=JSON.parse(sql(`SET statement_timeout='8s';SELECT public.budget_review_impact(${quote(user.tenant)},${quote(user.id)},${quote(kind)},${quote(JSON.stringify(input))}::jsonb,true);`).split('\n').at(-1))
  if(result.state!=='preparing_impact')return result
 }
 throw Error('Impact preparation did not complete within its two complete projections')
}
