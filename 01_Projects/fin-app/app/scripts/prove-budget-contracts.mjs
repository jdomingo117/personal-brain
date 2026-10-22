#!/usr/bin/env node
/** M0 source-contract experiment. No connection URL, host mount, exposed port or user data.
 * Node >=22.18 (native TS stripping), Docker and the locally cached PG17 image required.
 * This proves query semantics on reduced source relations, NOT full migration/RLS/Edge readiness.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TRANSACTION_KINDS, effectiveTransactionKind, expenseEffectCents, earnedIncomeCents } from '../src/lib/classification.ts'
import { expandTransactionAllocations } from '../src/lib/allocations.ts'

const here = dirname(fileURLToPath(import.meta.url))
const migrations = resolve(here, '../../supabase/migrations')
const image = 'public.ecr.aws/supabase/postgres:17.11.0.004'
const identity = `halcyon-budget-m0-${randomUUID()}`
let created = false
let checks = 0
function run(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60_000 })
  if (r.status !== 0) throw new Error(`Docker experiment failed: ${r.error?.message ?? r.stderr}`)
  return r.stdout.trim()
}
function sql(query) {
  return run(['exec', '-i', identity, 'psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-h', '/tmp', '-U', 'postgres', '-d', 'budget_m0'], query)
}
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label)
  checks++
  console.log(`PASS ${label}`)
}
const quote = v => v === null ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replaceAll("'", "''")}'`
const values = rows => rows.map(row => `(${row.map(quote).join(',')})`).join(',\n')

// Scan the full migration chain so a later analytic-view replacement is not missed.
let analyticView
let viewFile
for (const name of readdirSync(migrations).filter(n => n.endsWith('.sql')).sort()) {
  const source = readFileSync(resolve(migrations, name), 'utf8')
  const matches = [...source.matchAll(/CREATE(?: OR REPLACE)? VIEW public\.transactions_analytic\b[\s\S]*?;/gi)]
  if (matches.length) { analyticView = matches.at(-1)[0]; viewFile = name }
}
assert(analyticView?.includes('security_invoker'), 'Expected invoker analytic view')

try {
  run(['image', 'inspect', image, '--format', '{{.Id}}']) // No pulling unreviewed images.
  run(['run', '-d', '--name', identity, '--label', `halcyon.budget-proof=${identity}`,
    '--network', 'none', '--user', 'postgres', '--tmpfs', '/tmp:rw,mode=1777',
    '--entrypoint', '/bin/sh', image, '-c',
    'initdb -D /tmp/budget-m0-db -A trust >/tmp/init.log 2>&1 && exec postgres -D /tmp/budget-m0-db -k /tmp -c listen_addresses= -c shared_buffers=64MB'])
  created = true
  for (let n = 0; ; n++) {
    const ready = spawnSync('docker', ['exec', identity, 'pg_isready', '-h', '/tmp', '-U', 'postgres'], { encoding: 'utf8' })
    if (ready.status === 0) break
    if (n >= 60) throw new Error('Ephemeral database did not become ready')
    await new Promise(r => setTimeout(r, 250))
  }
  check('target is this run’s networkless container', run(['inspect', identity, '--format', '{{.HostConfig.NetworkMode}}|{{index .Config.Labels "halcyon.budget-proof"}}']), `none|${identity}`)
  run(['exec', identity, 'createdb', '-h', '/tmp', '-U', 'postgres', 'budget_m0'])
  console.log(`Target: ${identity}; socket=/tmp; database=budget_m0; no host ports or mounts`)
  sql(readFileSync(resolve(here, 'fixtures/budget-m0-source.sql'), 'utf8') + '\n' + analyticView)
  console.log(`Analytic projection loaded from ${viewFile}`)

  const tx = [], decisions = [], links = [], expected = new Map()
  let id = 0
  for (const kind of TRANSACTION_KINDS) for (const amount of [-101, 0, 101])
    for (const kindSource of ['derived', 'user', 'system']) for (const pending of [false, true])
      for (const verdict of [null, 'rejected', 'confirmed', 'external']) for (const linked of [false, true]) {
        const key = `v${++id}`
        tx.push([key, 'A', 'cash', '2026-09-10', amount, kind, kindSource, pending, key, 0, false])
        if (verdict) decisions.push(['A', 'cash', key, 0, null, null, null, verdict, '2026-09-11T00:00:00Z'])
        if (linked) links.push([key, key, null, 'suggested'])
        const isTransfer = verdict === 'rejected' ? false : verdict === 'confirmed' || verdict === 'external' || kind === 'transfer' || linked
        const transferState = linked ? 'suggested' : verdict ?? 'none'
        const row = { kind, amount, kindSource, transferState, pending }
        expected.set(key, [effectiveTransactionKind(row), isTransfer, isTransfer ? 0 : expenseEffectCents(row), isTransfer ? 0 : earnedIncomeCents(row)])
      }
  tx.push(['split','A','cash','2026-09-10',-1000,'expense','derived',false,'split',0,false])
  sql(`INSERT INTO transactions VALUES ${values(tx)}; INSERT INTO transfer_decisions VALUES ${values(decisions)}; INSERT INTO transfer_links VALUES ${values(links)};
    INSERT INTO transaction_allocations VALUES ('child-a','A','split',-700,'expense','food',NULL,'custom-a'), ('child-b','A','split',-300,'expense','shopping','retail',NULL);`)
  // Candidate adapter preserves inherited parent transfer state, matching current expansion.
  sql(`CREATE VIEW budget_source_proof AS
    WITH reporting AS (
      SELECT COALESCE(a.id,t.id) id,t.id parent_id,t.tenant_id,t.account_id,t.date,
        COALESCE(a.amount,t.amount)::bigint amount,COALESCE(a.kind,t.kind) kind,
        t.kind_source,t.transfer_state,t.is_transfer,t.pending,
        a.category_id,a.subcategory_id,a.custom_subcategory_id
      FROM transactions_analytic t LEFT JOIN transaction_allocations a ON a.transaction_id=t.id AND a.tenant_id=t.tenant_id
    ), effective AS (
      SELECT *, CASE WHEN kind='transfer' AND kind_source='derived' AND transfer_state='rejected'
        THEN CASE WHEN amount>=0 THEN 'income' ELSE 'expense' END ELSE kind END effective_kind FROM reporting
    ) SELECT *, CASE WHEN pending OR is_transfer THEN 0 WHEN effective_kind='expense' THEN greatest(0,-amount)
        WHEN effective_kind IN ('refund','reimbursement') THEN -greatest(0,amount) ELSE 0 END expense,
      CASE WHEN NOT pending AND NOT is_transfer AND effective_kind='income' THEN greatest(0,amount) ELSE 0 END earned
    FROM effective;`)
  const actual = JSON.parse(sql(`SELECT json_agg(json_build_array(id,effective_kind,is_transfer,expense,earned)) FROM budget_source_proof WHERE id LIKE 'v%';`))
  check('all generated vectors are returned exactly once', actual.length, expected.size)
  check(`${id} SQL classification/direction/pending/transfer combinations match canonical helpers + transfer filter`, actual.every(([key, ...row]) => JSON.stringify(row) === JSON.stringify(expected.get(key))), true)
  const splitRows = expandTransactionAllocations([{ id:'split', amount:-1000, kind:'expense', allocations:[
    {id:'child-a',amount:-700,kind:'expense',category:'Food'}, {id:'child-b',amount:-300,kind:'expense',category:'Shopping'},
  ] }])
  check('split children replace parent and preserve canonical total', Number(sql("SELECT sum(expense) FROM budget_source_proof WHERE parent_id='split';")), splitRows.reduce((n,r) => n+expenseEffectCents(r),0))
  check('custom/global taxonomy identity remains distinct', sql("SELECT count(*) FROM budget_source_proof WHERE custom_subcategory_id='custom-a' AND subcategory_id IS NULL;"), '1')

  sql(`INSERT INTO coverage VALUES ('cash','2026-08-01','2026-08-15','user-confirmed',false),('cash','2026-08-15','2026-09-01','statement',false),('card','2026-08-01','2026-08-10','user-confirmed',false),('card','2026-08-11','2026-09-01','statement',false),('empty','2026-08-01','2026-09-01','user-confirmed',false),('revoked','2026-08-01','2026-09-01','statement',true);`)
  const covered = account => sql(`SELECT COALESCE(range_agg(daterange(start_date,end_date,'[)')) @> daterange('2026-08-01','2026-09-01','[)'),false) FROM coverage WHERE account_id=${quote(account)} AND NOT revoked;`)
  check('adjacent evidence ranges cover a full period', covered('cash'),'t')
  check('one missing local date blocks completeness', covered('card'),'f')
  check('covered account with no transactions is not missing', covered('empty'),'t')
  check('revoked evidence is incomplete', covered('revoked'),'f')
  check('unknown account is incomplete, not zero', covered('missing'),'f')

  // Performance fixture: complete aggregate exceeds API's 1000-row default.
  sql(`INSERT INTO transactions SELECT 'large-'||g,'B','bench','2026-09-01'::date+(g%30),-101,'expense','derived',false,'large-'||g,0,false FROM generate_series(1,100000) g;
    CREATE INDEX budget_probe_tenant_account_date ON transactions(tenant_id,account_id,date,id);
    ANALYZE transactions; ANALYZE transaction_allocations; ANALYZE transfer_links; ANALYZE transfer_decisions; ANALYZE investment_cash_links; ANALYZE investment_cash_decisions;`)
  const aggregate = "SELECT sum(expense) FROM budget_source_proof WHERE tenant_id='B' AND account_id='bench' AND date>='2026-09-01' AND date<'2026-10-01'"
  check('100,000-row total is complete, not detail-page capped',sql(`${aggregate};`),'10100000')
  const plan = JSON.parse(sql(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${aggregate};`))[0]
  console.log(`100k synthetic query: ${plan['Execution Time']}ms execution; ${plan['Planning Time']}ms planning; root=${plan.Plan['Node Type']}; shared hit blocks=${plan.Plan['Shared Hit Blocks']}`)
  // Narrow date query must also be explainable; no forced-index benchmark tricks.
  const narrow = JSON.parse(sql(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT sum(expense) FROM budget_source_proof WHERE tenant_id='B' AND account_id='bench' AND date='2026-09-02';`))[0]
  const indexNames = node => [...(node['Index Name'] ? [node['Index Name']] : []), ...(node.Plans ?? []).flatMap(indexNames)]
  console.log(`One-day query: ${narrow['Execution Time']}ms; indexes=${indexNames(narrow.Plan).join(',')}`)

  // Two actual database sessions: source DML owns its row then waits on the gate;
  // budget takes gate first but only MVCC-reads source, avoiding opposite row locks.
  const held = spawn('docker',['exec','-i',identity,'psql','-XAt','-v','ON_ERROR_STOP=1','-h','/tmp','-U','postgres','-d','budget_m0'],{stdio:['pipe','pipe','pipe']})
  let heldOutput='', heldErrors=''
  held.stdout.on('data',b => {heldOutput+=b}); held.stderr.on('data',b => {heldErrors+=b})
  const finished = new Promise((res,rej) => {held.on('error',rej);held.on('close',code => code===0?res():rej(new Error(heldErrors)))})
  held.stdin.end("BEGIN; SELECT revision FROM source_gate WHERE tenant_id='A' FOR UPDATE; SELECT 'gate-held'; SELECT pg_sleep(2); SELECT amount FROM source_probe WHERE id=1; COMMIT;")
  for (let n=0;!heldOutput.includes('gate-held');n++) { if(n>100)throw new Error('Gate session readiness timeout');await new Promise(r=>setTimeout(r,25)) }
  sql('UPDATE source_probe SET amount=200 WHERE id=1;')
  await finished
  check('concurrent gate holder reads committed old source without deadlock',heldOutput.includes('100'),true)
  check('source update commits with revision atomically',sql("SELECT revision||':'||(SELECT amount FROM source_probe WHERE id=1) FROM source_gate WHERE tenant_id='A';"),'1:200')
  sql('BEGIN; DELETE FROM source_probe WHERE id=1; ROLLBACK;')
  check('rollback cannot advance invalidation revision',sql("SELECT revision FROM source_gate WHERE tenant_id='A';"),'1')
  sql('DELETE FROM source_probe WHERE id=1;')
  check('delete advances invalidation revision',sql("SELECT revision FROM source_gate WHERE tenant_id='A';"),'2')
  console.log(`${checks} contract checks passed. Reduced-schema experiment only; production migration/RLS/Edge and full mutation-concurrency proofs remain required.`)
} finally {
  if(created) {
    const label = run(['inspect',identity,'--format','{{index .Config.Labels "halcyon.budget-proof"}}'])
    assert.equal(label,identity,'Refusing cleanup of an unowned container')
    run(['rm','-f','-v',identity])
    console.log(`Removed this run’s disposable container and anonymous image volumes: ${identity}`)
  }
}
