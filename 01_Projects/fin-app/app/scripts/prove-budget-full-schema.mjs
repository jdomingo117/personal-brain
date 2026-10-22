#!/usr/bin/env node
/** Replay existing migrations only on a freshly generated isolated Supabase DB.
 * No credentials copied, no existing target accepted. SUPABASE_CLI is optional.
 * This proves source integration, not future Budget RLS or mutation readiness.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// Keep below the CLI's project-ID truncation limit; never infer a truncated target.
const project = `halcyon-budget-m0-${randomUUID().replaceAll('-','').slice(0,16)}`
const work = mkdtempSync(resolve(tmpdir(), 'halcyon-budget-schema-'))
const container = `supabase_db_${project}`
const cli = process.env.SUPABASE_CLI ?? 'supabase'
let attempted = false
function run(command,args,input,timeout=60_000) {
  const r=spawnSync(command,args,{cwd:repo,input,encoding:'utf8',timeout,maxBuffer:16*1024*1024})
  if(r.status!==0)throw new Error(`${command} failed: ${r.error?.message??r.stderr}\n${r.stdout??''}`)
  return r.stdout.trim()
}
function sql(query) {return run('docker',['exec','-i',container,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],query)}
try {
  // Only migrations and a generated non-secret configuration, not the project .env.
  cpSync(resolve(repo,'supabase/migrations'),resolve(work,'supabase/migrations'),{recursive:true})
  writeFileSync(resolve(work,'supabase/config.toml'),`project_id = "${project}"
[api]
port = 56421
[db]
port = 56422
shadow_port = 56420
major_version = 17
[db.seed]
enabled = false
[analytics]
enabled = false
`)
  assert.match(project,/^halcyon-budget-m0-[0-9a-f]{16}$/)
  console.log(`Isolated project=${project}; DB container=${container}; database=postgres; port=56422 (NOT personal port 54322)`)
  attempted=true
  run(cli,['db','start','--workdir',work],undefined,180_000)
  const inspected=JSON.parse(run('docker',['inspect',container]))[0]
  assert.equal(inspected.Config.Labels['com.supabase.cli.project'],project,'Unexpected database project label')
  assert.equal(sql('SELECT count(*) FROM auth.users;'),'0','New target must have no user data')
  // db start initializes the service schema. Explicitly apply pending repo migrations if needed.
  run(cli,['migration','up','--local','--workdir',work],undefined,180_000)
  const migrations=sql('SELECT count(*) FROM supabase_migrations.schema_migrations;')
  assert.equal(Number(migrations),readdirSync(resolve(repo,'supabase/migrations')).filter(n=>n.endsWith('.sql')).length,'Migration replay incomplete')
  console.log(`PASS full migration chain applied: ${migrations} migrations`)
  console.log(sql(readFileSync(resolve(repo,'app/scripts/fixtures/budget-m0-full-schema.sql'),'utf8')))
  assert.equal(sql('SELECT count(*) FROM auth.users;'),'0','Fictional identity transaction did not roll back')
} finally {
  if(attempted) {
    // Never select by a prefix, port, default project or a user-supplied target.
    const ids=run('docker',['ps','-aq','--filter',`label=com.supabase.cli.project=${project}`]).split(/\s+/).filter(Boolean)
    for(const id of ids) {
      const info=JSON.parse(run('docker',['inspect',id]))[0]
      assert.equal(info.Config.Labels['com.supabase.cli.project'],project)
      run('docker',['rm','-f',id])
    }
    const volumes=run('docker',['volume','ls','-q','--filter',`label=com.supabase.cli.project=${project}`]).split(/\s+/).filter(Boolean)
    for(const volume of volumes) {
      const info=JSON.parse(run('docker',['volume','inspect',volume]))[0]
      assert.equal(info.Labels['com.supabase.cli.project'],project)
      run('docker',['volume','rm',volume])
    }
    const networks=run('docker',['network','ls','-q','--filter',`label=com.supabase.cli.project=${project}`]).split(/\s+/).filter(Boolean)
    for(const network of networks) {
      const info=JSON.parse(run('docker',['network','inspect',network]))[0]
      assert.equal(info.Labels['com.supabase.cli.project'],project)
      run('docker',['network','rm',network])
    }
    console.log(`Removed only containers/volumes labelled ${project}`)
  }
  rmSync(work,{recursive:true,force:true}) // Exact mkdtemp-owned directory only.
}
