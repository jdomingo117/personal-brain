#!/usr/bin/env node
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'

/** Financial-content-free aggregation of the fixed Budget log schema. */
export function summarizeBudgetTelemetry(input){
 const groups=new Map();let accepted=0,rejected=0
 for(const sample of input){
  const keys=sample&&typeof sample==='object'?Object.keys(sample).sort():[]
  const status=sample?.status
  const expected=status>=500?'unavailable':status===409?'conflict':status===429?'rate_limited':status===401||status===403?'denied':status>=400?'rejected':'success'
  if(JSON.stringify(keys)!==JSON.stringify(['duration_ms','endpoint','event','outcome','status'])||sample.event!=='budget.request.v1'||!['query-budget','manage-budget'].includes(sample.endpoint)||!Number.isInteger(status)||status<100||status>599||sample.outcome!==expected||!Number.isInteger(sample.duration_ms)||sample.duration_ms<0){rejected++;continue}
  accepted++
  const key=`${sample.endpoint}:${sample.outcome}`
  if(!groups.has(key))groups.set(key,{endpoint:sample.endpoint,outcome:sample.outcome,status_counts:{},durations:[]})
  const group=groups.get(key);group.status_counts[status]=(group.status_counts[status]??0)+1;group.durations.push(sample.duration_ms)
 }
 return {schema:'budget.aggregate.v1',accepted_samples:accepted,rejected_samples:rejected,groups:[...groups.values()].sort((a,b)=>`${a.endpoint}:${a.outcome}`.localeCompare(`${b.endpoint}:${b.outcome}`)).map(({endpoint,outcome,status_counts,durations})=>{durations.sort((a,b)=>a-b);return {endpoint,outcome,count:durations.length,status_counts,p50_ms:durations[Math.ceil(durations.length*.5)-1],p95_ms:durations[Math.ceil(durations.length*.95)-1],max_ms:durations.at(-1)}})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const source=readFileSync(process.argv[2]&&process.argv[2]!=='-'?process.argv[2]:0,'utf8')
 let samples
 try{const parsed=JSON.parse(source);samples=Array.isArray(parsed)?parsed:(parsed.telemetry_samples??[])}catch{samples=source.split('\n').flatMap(line=>{try{return [JSON.parse(line.match(/\{"event":"budget\.request\.v1".*?\}/)?.[0]??line)]}catch{return []}})}
 process.stdout.write(JSON.stringify(summarizeBudgetTelemetry(samples),null,2)+'\n')
}
