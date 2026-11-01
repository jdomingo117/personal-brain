import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {summarizeBudgetTelemetry} from './summarize-budget-telemetry.mjs'
const sample=(status,duration_ms)=>({event:'budget.request.v1',endpoint:'manage-budget',status,outcome:status===409?'conflict':'success',duration_ms})
const valid=[sample(200,10),sample(200,30),sample(409,40)]
const result=summarizeBudgetTelemetry(valid)
assert.equal(result.accepted_samples,3)
assert.deepEqual(result.groups.find(g=>g.outcome==='success'),{endpoint:'manage-budget',outcome:'success',count:2,status_counts:{200:2},p50_ms:10,p95_ms:30,max_ms:30})
assert.equal(result.groups.find(g=>g.outcome==='conflict').count,1)
const poisoned=summarizeBudgetTelemetry([...valid,{...sample(200,4),name:'PRIVATE MERCHANT',amount:123456},{...sample(200,4),endpoint:'PRIVATE NAME'},{...sample(200,4),duration_ms:NaN},{...sample(200,4),status:200.5},{...sample(200,4),outcome:'PRIVATE ERROR'}])
assert.equal(poisoned.rejected_samples,5)
assert.equal(JSON.stringify(poisoned).includes('PRIVATE'),false)
assert.deepEqual(summarizeBudgetTelemetry([]),{schema:'budget.aggregate.v1',accepted_samples:0,rejected_samples:0,groups:[]})
const cli=spawnSync(process.execPath,[fileURLToPath(new URL('./summarize-budget-telemetry.mjs',import.meta.url)),'-'],{encoding:'utf8',input:'PRIVATE unrelated log\n[Info] '+JSON.stringify(valid[0])+'\n'})
assert.equal(JSON.parse(cli.stdout).accepted_samples,1)
assert.equal(cli.stdout.includes('PRIVATE'),false)
console.log('8 telemetry aggregation assertions passed; unknown/private fields rejected and never echoed.')
