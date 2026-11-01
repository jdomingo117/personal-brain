---
type: verification-record
status: local-admission-verified-hosted-pending
project: Halcyon
created: 2026-10-29
updated: 2026-10-29
---

# R06 — Budget read performance

**The declared local capacity matrix now passes its original targets.** R06's repeat-read timeout/latency finding is corrected locally. M7.5 remains open for hosted and broader cold/load qualification; the owner explicitly requested leaving hosted checks pending. Human checks and M7.6–M7.8 remain open. Release remains No-Go.

## Results and interpretation

All three admitted suites replayed **104 migrations** into fresh disposable projects on API 57521 / database 57522. The retained preview on 57300/57421/57422 remains on schema 96. No personal database or hosted target was inspected or migrated.

| Raw transactions | Workspace SQL p95, 20 consecutive reads | Workspace API maximum, 5 warm samples | Assistance API maximum, 5 samples |
| --- | --- | --- | --- |
| 10,000 | 37.635 ms | 53 ms | 49 ms |
| 100,000 | 81.053 ms | 155 ms | 241 ms |
| 1,000,000 | 744.926 ms | 835 ms | 2,635 ms |

Targets remain workspace SQL p95 <1s, workspace API <2s and assistance API <3s. The million-row fixture includes 200,000 split children. No data, history, line, goal or account limit was added to meet the targets. Assistance SQL p95 was 44.566 / 206.150 / 2,715.203 ms; recurring-evidence checkpoint-read SQL p95 was 3.328 / 3.257 / 3.378 ms.

**The first million-row derived-checkpoint miss took 4,325.854 ms SQL.** It completed within the unchanged 8s limit; repeat reads were faster. The first misses at 10k and 100k were 111.978 and 294.461 ms. The 20 SQL samples include that first miss; nearest-rank p95 is the second-highest of 20, not the maximum. API samples follow the SQL repetitions and are checkpoint-warm. These results do not establish a sub-2s first-load API guarantee, true OS/Postgres cold-cache behavior, hosted latency or performance under sustained concurrent imports.

Reference environment: Apple M3 Pro, 11 logical CPUs, 18 GiB host memory; Docker 11 CPUs / 8,321,372,160 bytes RAM; Postgres 17.11 with shared_buffers 128MB and work_mem 4MB. The separate visual-preview stack remained running. API samples use a fresh HTTP connection to avoid an idle-socket race after long SQL intervals; no retry is hidden. Intentional client waits to honour the existing read limiter occur outside request timing. SQL budgets and the tested fixture distributions are unchanged from the initial M7.5 matrix.

## What changed and why

The nested baseline profile found 70,000 transfer-link probes and latest-decision sorts in the 100k recurring read, repeated M4 derivation four times within a workspace, and expensive attention evidence maps even when no check consumed them. The narrow source index was already used; this was not solved by adding another overlapping index or raising timeouts.

Seven forward migrations implement the repair:

| Migration | Change |
| --- | --- |
| 98 — `20261029010000_budget_set_based_transfer_reads.sql` | Private invoker-secure Budget analytics projection resolves link/decision sets in bulk. Conflicting equal-time decisions and malformed multiple-role links fall back to the unchanged canonical view. Public analytics and its grants stay unchanged. The projection first freezes exactly the canonical columns, then migration 103 deliberately adds one private parent-category helper field |
| 99 — `20261029020000_budget_demanded_attention_evidence.sql` | Run the unchanged check rules first; derive complete per-source evidence only if an actual issue consumes it. Attach the original evidence before comparison, reopening logic and issue hashing. Count uncategorized spending without building unused source fingerprints |
| 100 — `20261029030000_budget_bulk_read_plans.sql` | Function-local custom planning and set-join preference for complete reads; JIT disabled on those functions to avoid compiling normally unexecuted canonical fallback branches. Server-wide settings, request/SQL bounds and write logic are unchanged |
| 101 — `20261029040000_budget_streaming_read_ctes.sql` | Let deterministic intermediate relations stream so date/category predicates reach source scans, instead of spilling duplicate materializations |
| 102 — `20261029050000_budget_workspace_read_reuse.sql` | Reuse identical selected-period M4 details and explicitly scoped snapshots within one locked workspace statement. Keys include tenant, actor, role, plan, selected period, source and plan version; caller settings are restored on success/error. Default or other-period snapshot requests do not borrow the selected-period slot |
| 103 — `20261029060000_budget_inline_activity_amounts.sql` | Expose the existing parent custom-category UUID privately, remove redundant joins back to that same parent row and inline lean activity SQL where a second function tuplestore is unnecessary |
| 104 — `20261029070000_budget_derived_read_checkpoints.sql` | Extend the existing private, rebuildable history-fact slots with forecast and recurring read checkpoints. Complete base facts are prepared for the selected period without bypassing the >12-period all-history admission guard. No worker, job, financial intent store or client cache is added |

SQL-only changes preserve integer-cent calculations, signed credits/refunds, source identities, matching precedence, currency/account/date scopes, coverage gates, median sampling/rounding, method labels, private-function permissions and the public response shape. No frontend or Edge Function source changed. The only extra view column is private and its non-null value is checked against the original parent field.

## Checkpoint authority and invalidation

Checkpoints never replace financial authority. Before a hit, the functions recheck membership/role, the live source gate and plan version. Forecasts additionally bind selected period, local date, full input-fact fingerprint and membership-scope fingerprint; the stored forecast's source/plan/period/method envelope must agree. Recurring reads bind live membership scope, actor role, source, plan version, local date and freshness. The existing per-actor/per-period slot keeps generations bounded, with a 24-hour maximum lifetime and local-date invalidation. Old extension fields cannot borrow a newly prepared base slot's generation.

Attention and reminder status remain live rather than being persisted in these read checkpoints. Existing M5 behavior keeps Undo availability and planning-goal directory metadata live. Neither source nor financial versions advance when rebuilding derived reads. The source lock still serializes a read against imports; a failed source check cannot serve a retained healthy estimate. Failed-refresh client suppression is unchanged.

The source-specific read-code tags must be bumped and affected derived fields invalidated when financial derivation/projection semantics change. Do not treat a same-version hypothetical scope as the actual plan. Rebuild/restore procedures may discard these derived fields after verifying target identity; they must preserve financial intent, source history and auth identities.

## Verification

| Run | Result and scope |
| --- | --- |
| `halcyon-budget-m2-d76a8166df44435f` | **187 checks passed:** all sizes/targets, canonical row multiplicity and every frozen field, private parent category, full internal attention evidence/hash equivalence, cached/uncached forecast and recurring equivalence, role changes, same-version scope changes, date rollover, expiry, stale-generation payloads, import/read coherence, 1,000 paged source rows and unchanged financial/source versions |
| `halcyon-budget-m2-68b426e1839346ca` | **142 checks passed:** complete 60/120-period histories, dense/mixed workloads, source corrections, checkpoint expiry, actor isolation, exact reference facts, complete account/rollover/control/archive previews, receipt replay, save and Undo |
| `halcyon-budget-m2-32c2e095fdda482c` | **537 checks passed:** broader backend lifecycle/items/temporal/control/attention/security/receipt regression plus SQL/Edge R02–R05 assistance checks. R04's browser presentation section was explicitly not run in this backend-only mode |

Counts overlap; they are separate suite results, not an additive unique count. Final unit tests: **595 passed / 14 existing skips**. Full app TypeScript and syntax checks for all five changed/new scripts pass. No new browser/axe/human acceptance or cross-feature M7.7 release-candidate result is claimed.

Canonical differential checks cover manual/derived kinds, null identities, pending/unresolved rows, all transfer-link states, decision precedence, later investment decisions, equal-time conflicts and malformed multiple-role link fallback. The same actor changing from owner to viewer cannot reuse owner checkpoints or Undo. Private views/facts and service-only functions retain asserted permissions. The 100k dense comparison checks the complete canonical row, excluding only the explicitly private helper field, using `EXCEPT ALL` to retain multiplicity.

## Evidence and reproduction

- `docs/budget-m7/r06-capacity/measurements.json`: every final timing sample, first-miss plan, source plans, targets and errors.
- `docs/budget-m7/r06-optimization/verification.json`, `runs.json`, `source-manifest.json`: final scope, cleanup, run identities and 462 source hashes. Twelve files differ from the initial M7.5 baseline: seven migrations and five harness files. Production frontend/Edge hashes are unchanged.
- `docs/budget-m7/r06-profile-baseline/`: nested canonical baseline plans. Later diagnostic profiles are exploratory, not admission runs.
- `docs/budget-m7/r06-optimization/history-60.json`, `history-120.json`, `impact-mixed.json`: final long-history measurements.

With the installed official CLI assigned to `SUPABASE_CLI`:

```sh
node app/scripts/test-budget-durable.mjs --performance-only --capacity --capacity-ledger-only
node app/scripts/test-budget-durable.mjs --performance-only --stress --secondary-ports
node app/scripts/test-budget-durable.mjs --items --lifecycle --secondary-ports --assistance-backend
```

Secondary ports reject browser/manual-preview modes and still create a new guarded project. They preserve the visual preview. Every one of the fourteen optimization-run projects has zero labelled containers, volumes and networks after cleanup. The existing preview remains running on schema 96; no persistent migration, deployment, hosted infrastructure, staging exposure or commit occurred.

Exploratory failures are retained as failures: normal-role profiler loading was refused; migration assertions caught the frozen-view shape and a declaration anchor; test-fixture cleanup needed the captured investment-decision FK removed and a psql command-tag fix; one intermediate run lost an idle HTTP socket; earlier SQL candidates still missed targets. None is counted as a passing full suite or used as final capacity proof. Final admitted runs above complete their identity/tenant/financial-fixture cleanup checks.

Next: M7.6 isolated migration/backup/restore preparation can proceed. Hosted capacity, first-load/concurrent-load qualification, human accessibility/comprehension, final cross-feature/security/ops and release authorization remain open.
