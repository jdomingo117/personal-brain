import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {withBudgetTelemetry} from '../../../supabase/functions/_shared/budgetTelemetry'

describe('Budget request telemetry',()=>{
 it.each([[200,'success'],[401,'denied'],[403,'denied'],[409,'conflict'],[413,'rejected'],[422,'rejected'],[429,'rate_limited'],[503,'unavailable']] as const)('classifies %s without reading private input or output',async(status,outcome)=>{
  const samples:unknown[]=[]
  const response=new Response(JSON.stringify({name:'PRIVATE GOAL',amount_cents:987654,token:'PRIVATE TOKEN'}),{status})
  const request=new Request('http://example.test/manage-budget?private=PRIVATE QUERY',{method:'POST',headers:{Authorization:'Bearer PRIVATE AUTH'},body:JSON.stringify({name:'PRIVATE MERCHANT',amount:123456})})
  let tick=10
  const actual=await withBudgetTelemetry('manage-budget',async()=>response,s=>samples.push(s),()=>tick+=7)(request)
  expect(actual).toBe(response)
  expect(samples).toEqual([{event:'budget.request.v1',endpoint:'manage-budget',status,outcome,duration_ms:7}])
  expect(request.bodyUsed).toBe(false);expect(response.bodyUsed).toBe(false)
  expect(JSON.stringify(samples)).not.toContain('PRIVATE')
 })
 it('does not turn a completed operation into a failure when the sink throws',async()=>{
  const receipt=new Response('{"status":"committed"}')
  expect(await withBudgetTelemetry('manage-budget',async()=>receipt,()=>{throw Error('sink unavailable')})(new Request('http://example.test',{method:'POST'}))).toBe(receipt)
 })
 it('records an unexpected failure without serializing or replacing its error',async()=>{
  const samples:unknown[]=[],error=new Error('PRIVATE GOAL 12345'),request=new Request('http://example.test',{method:'POST'})
  await expect(withBudgetTelemetry('query-budget',async()=>{throw error},s=>samples.push(s),()=>0)(request)).rejects.toBe(error)
  expect(samples).toEqual([{event:'budget.request.v1',endpoint:'query-budget',status:500,outcome:'unavailable',duration_ms:0}])
 })
 it('does not count CORS preflight as an application request',async()=>{
  const samples:unknown[]=[]
  await withBudgetTelemetry('query-budget',async()=>new Response(null,{status:204}),s=>samples.push(s))(new Request('http://example.test',{method:'OPTIONS'}))
  expect(samples).toEqual([])
 })
 it('emits bounded nonnegative finite durations',async()=>{
  for(const clock of [()=>NaN,(()=>{let n=2;return()=>n--})()]){
   const samples:{duration_ms:number}[]=[]
   await withBudgetTelemetry('query-budget',async()=>new Response(),s=>samples.push(s),clock)(new Request('http://example.test',{method:'POST'}))
   expect(samples[0].duration_ms).toBe(0)
  }
 })
})

// Execute the production middleware with dependency seams, including generic error and
// PostgREST audit-error paths. No live service, Deno runtime or remote import is needed here.
function middleware(){
 const logs:unknown[][]=[]
 const source=readFileSync(new URL('../../../supabase/functions/_shared/withAuth.ts',import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const client={auth:{getUser:async()=>({data:{user:{id:'actor',email:'PRIVATE EMAIL'}}})},from:()=>({select:()=>({eq:()=>({order:()=>({limit:()=>({maybeSingle:async()=>({data:{tenant_id:'tenant',role:'owner'}})})})})}),insert:async()=>({error:{message:'PRIVATE AUDIT PAYLOAD'}})})}
 const exports:Record<string,any>={}
 const require=(name:string)=>name.includes('supabase-js')?{createClient:()=>client}:name.includes('cors')?{corsHeadersFor:()=>({}),isAllowedOrigin:()=>true}:name.includes('rateLimit')?{rateLimit:async()=>({allowed:true}),LIMITS:{writePerUser:{}}}:{}
 new Function('require','exports','Deno','console',code)(require,exports,{env:{get:()=>''}},{error:(...args:unknown[])=>logs.push(args)})
 return {withAuth:exports.withAuth,logs}
}
describe('Budget middleware redaction',()=>{
 it('redacts unexpected financial errors and request URL query values',async()=>{
  const {withAuth,logs}=middleware()
  const response=await withAuth({redactErrorDetails:true},async()=>{throw new Error('PRIVATE NAME AND AMOUNT')})(new Request('http://example.test?input=PRIVATE QUERY',{method:'POST',headers:{Authorization:'Bearer token'}}))
  expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'Request failed'})
  expect(logs).toEqual([['unhandled error',{detail:'redacted'}]])
 })
 it('detects returned audit errors without failing the committed operation or leaking details',async()=>{
  const {withAuth,logs}=middleware()
  const response=await withAuth({redactErrorDetails:true},async(ctx:any)=>{await ctx.audit('budget.command_committed');return {status:'committed'}})(new Request('http://example.test',{method:'POST',headers:{Authorization:'Bearer token'}}))
  expect(response.status).toBe(200);expect(await response.json()).toEqual({status:'committed'})
  expect(logs).toEqual([['audit write failed',{action:'budget.command_committed',err:'redacted'}]])
 })
})
