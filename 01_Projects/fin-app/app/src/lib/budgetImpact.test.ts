import {describe,it,expect} from 'vitest'
import {isImpactPreparation,prepareImpact,type ImpactPreparation} from './budgetImpact'
const body={plan_id:'p',period_id:'d',expected_source:'8',expected_plan:'9'}
const part=(completed:number):ImpactPreparation=>({state:'preparing_impact',total:2,completed,plan_id:'p',period_id:'d',source_revision:'8',plan_version:'9'})
describe('complete impact preparation',()=>{
 it('recognizes count-only progress, not partial financial data',()=>{expect(isImpactPreparation(part(1))).toBe(true);expect(isImpactPreparation({...part(1),completed:3})).toBe(false);expect(isImpactPreparation({state:'fresh'})).toBe(false)})
 it('never treats malformed preparation as a completed financial review',async()=>{await expect(prepareImpact(body,async()=>({...part(1),total:4}),()=>{},()=>true)).rejects.toThrow('verify')})
 it('performs two complete checks then retrieves the full review with identical intent',async()=>{
  const sent:unknown[]=[],progress:unknown[]=[],results=[part(1),part(2),{preview_hash:'ready'}]
  const result=await prepareImpact(body,async b=>{sent.push(b);return results.shift()!},p=>progress.push(p),()=>true)
  expect(result).toEqual({preview_hash:'ready'});expect(sent).toEqual([body,body,body]);expect(progress).toEqual([part(1),part(2),null])
 })
 it('resumes a completed first projection without a client cursor',async()=>{const results=[part(2),{preview_hash:'ready'}];let calls=0;await prepareImpact(body,async()=>{calls++;return results.shift()!},()=>{},()=>true);expect(calls).toBe(2)})
 it('rejects stale versions and clears progress',async()=>{const progress:unknown[]=[];await expect(prepareImpact(body,async()=>({...part(1),plan_version:'10'}),p=>progress.push(p),()=>true)).rejects.toThrow('changed');expect(progress.at(-1)).toBe(null)})
 it('stops on identity/navigation changes and never accepts the late result',async()=>{let active=true;await expect(prepareImpact(body,async()=>{active=false;return {preview_hash:'late'}},()=>{},()=>active)).rejects.toThrow('changed')})
 it('does not spin indefinitely or submit a financial mutation',async()=>{let calls=0;await expect(prepareImpact(body,async()=>{calls++;return part(1)},()=>{},()=>true)).rejects.toThrow('continue');expect(calls).toBe(3)})
 it('preserves server checkpoints on connection failure, clearing only local progress',async()=>{const progress:unknown[]=[];await expect(prepareImpact(body,async()=>{throw Error('offline')},p=>progress.push(p),()=>true)).rejects.toThrow('offline');expect(progress).toEqual([null])})
})
