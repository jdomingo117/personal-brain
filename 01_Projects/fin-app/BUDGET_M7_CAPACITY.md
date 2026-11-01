---
type: verification-record
status: local-r06-corrected-hosted-pending
project: Halcyon
created: 2026-10-29
updated: 2026-10-29
---

# M7.5 — capacity and query performance

**Current follow-up:** [[BUDGET_M7_R06_OPTIMIZATION]] corrects R06 locally on schema104, passing the original repeated-read matrix and financial/history regressions. Its 1m first checkpoint rebuild remains 4.326s SQL. M7.5 remains open for hosted/cold/load qualification. The schema97 failed baseline below is retained as historical evidence. Hosted performance has not been measured; no hosted target has been identified or authorized. The owner explicitly requested completing local work and leaving hosted checks pending on 29 October 2026. M7.5 is not a release authorization.

## Scope and environment

The guarded fresh-project provisioner runs `--performance-only --stress --capacity` on API 57521, database 57522 and shadow port 57520, separately from the retained fictional preview on 57300/57421/57422. Capacity mode refuses browser/manual-preview combinations and requires performance-only. The default personal stack is never a target. Docker reports 11 CPUs and 8,321,372,160 bytes of memory. Host/SQL settings and query plans are recorded with the results. The existing preview stack remains present, so these measurements are not dedicated-host guarantees.

The retained visual preview is not migrated by this run. New migrations are replayed only into the new empty disposable stack. All test users, tenants and financial rows are captured fixtures; cleanup uses the provisioner's project-label boundary.

## Regression discovered before measurement

The first target, `halcyon-budget-m2-00928d9fdd7044fe`, replayed 96 migrations and failed the real long-history admission assertion. Migration 96 had replaced `budget_workspace_details` with direct forecast composition, bypassing M5's count-only preparation guard and cache context. The target was removed by its scoped cleanup.

Forward migration `20261029000000_budget_forecast_history_guard.sql` places forecast composition in the uncached composer and restores the complete-history wrapper, including cache-context restoration on success/error. It preserves existing forecast calculations, source/version gates, private service-role permissions and the 8-second SQL bound. No tables or financial intent are changed. The history equivalence comparator excludes only the forecast's read-time `checked_at`; all financial forecast and attention fields remain compared.

## Measurement protocol

- Existing five-/ten-year fixtures: 60 periods / 18,000 transactions and 120 periods / 120,000 transactions. Test resumable preparation, reference parity, late-source corrections, expiry, owner/viewer isolation, policy save/replay/Undo and the mixed accounts/lines/splits/claims workload.
- Re-run the established R01 SQL/Edge checks after the guard repair.
- Fresh mixed ledger grows through 10,000, 100,000 and 1,000,000 raw transactions over twelve months and three selected accounts. Approximately 70% expenses, 10% refunds, 10% transfers and 10% income; 10% of parents have two expense splits (20% additional child rows). All ordinary source triggers remain enabled.
- Twenty SQL samples per operation use `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` with an explicit 8-second statement limit. Workspace SQL combines snapshot, details and recurring evidence. Five real authenticated Edge samples cover the complete workspace and six-month assistance.
- Record first-after-load and warm repetitions; do not claim true cold-cache testing or flush OS/Postgres buffers. Nearest-rank p95 of five Edge samples is the maximum of five observations, not a stable production percentile or SLA.
- Record the actual recurring-evidence SQL path and scoped source index plan. Validate assistance periods against independently grouped raw signed amounts; validate foreign-scope denial, source-page disjointness/total stability and unchanged financial versions. Traverse up to 1,000 source rows using the actual 50-row API cap. A coordinated real import/read checks source-version coherence on the small fixture.
- Keep normal authentication and rate limiting. Pause reads when needed; no bypass or changed production limit. Thresholds from M0 remain engineering targets: representative snapshot SQL p95 under 1 second, workspace end-to-end under 2 seconds and assistance under 3 seconds.

## Remaining evidence boundaries

The finite corpus is not every possible plan or accounting pattern. No hosted or true cold-cache result is inferred. Annual evidence uses the real three-year query, but the new dense ledger itself spans twelve months; the mixed ten-year fixture supplies broader history separately. Distinct page sizes 1/100/1000 are not invented where the production source API has a fixed 50-row cap. Larger concurrent load, hosted resource limits and any uncovered frozen matrix cases must remain explicit qualifications before M7.5 closure.

## Initial local results — schema 97

Final ledger target: `halcyon-budget-m2-95a0dd1b685e464d`, all 97 migrations replayed on an empty disposable stack. Environment: Apple M3 Pro / 11 logical CPUs / 18 GiB host RAM; Docker 11 CPUs / approximately 7.75 GiB RAM; Postgres 17.11, shared_buffers 128MB, work_mem 4MB. The retained preview is a separate running stack.

| Raw ledger rows | Combined workspace SQL p95, 20 attempts | Workspace API maximum, up to 5 samples | Assistance SQL p95, 20 samples | Assistance API maximum, 5 samples |
| --- | --- | --- | --- | --- |
| 10,000 | 224.595 ms | 225 ms | 47.184 ms | 66 ms |
| 100,000 | 1,540.717 ms — misses 1s target | 1,632 ms | 312.459 ms | 321 ms |
| 1,000,000 | First attempt canceled at 8s; no successful SQL sample/p95 | First request returned retryable 503 after 8,772 ms; remaining samples stopped | 3,232.825 ms | 3,219 ms — misses 3s target |

The largest fixture also contains 200,000 split children. Its insertion/analysis took 62,055 ms; that is fixture load time, not a measured production import SLA. Recurring-evidence SQL p95 was 63.518 / 256.736 / 3,783.507 ms at the three sizes. Recurring limits/overflow remain explicit. The million-row source traversal returned 1,000 disjoint rows over 20 real 50-row pages, with a stable complete count of 100,000 eligible sources. Reads preserved ledger count, source revision and financial plan version.

Source plans use `budget_transactions_scope_date` at all three sizes. At 100,000 rows the combined workspace first plan records 2,261,454 shared buffer hits and 5,502/5,479 temporary blocks read/written, while the narrow source scan remains indexed. The million-row timeout context is in the forecast facts CTE. These facts warrant profiling the composed forecast/workspace SQL; they do not prove that another index or a larger timeout is the right fix. Outer function plans do not expose every nested plan.

The prior corrected-schema history run `halcyon-budget-m2-67e163d20a904119` passed its complete five-/ten-year, mixed-policy and R01 subchecks before a separate new-benchmark argument error. Ready workspace calls measured 153 ms at 60 periods, 328 ms at 120 periods and 554 ms after mixed-workload Undo. Those are single illustrative measurements, not percentiles. The mixed history preparation plus resumed read took 9,452 ms in total; ready-read timing does not conceal that preparation. Financial equivalence, correction/expiry, replay/Undo and private-boundary checks passed. This whole process did not pass: its later harness failure is preserved in `runs.json`.

## Finding and disposition

**Original R06 — dense-ledger capacity, corrected locally in [[BUDGET_M7_R06_OPTIMIZATION]].** The 100k combined SQL misses its engineering target; the 1m workspace times out, and 1m assistance slightly exceeds its target. The final benchmark exited nonzero at its strict latency assertion. The completed final run has 76 preceding successful assertions; that count is not a passing full suite or a unique total across all runs. No limit, money rule, rate limiter or timeout was relaxed to obtain a pass.

Original next step (now implemented and verified in the follow-up): profile and reduce repeated work/materialization in the complete forecast/workspace composition, retain source/account/match/refund semantics and conservative unavailable behavior, verify equivalence, then repeat this identical corpus and targets. Assistance/recurring need separate attention at the large size. Do not add hidden history caps or infer a cache/job approval merely from this result. Record any chosen SQL/index change and its proof before claiming admission. Hosted checks remain pending by owner instruction; cold-cache/concurrency/corpus qualifications above remain explicit.

## Run provenance, cleanup and reproducibility

`docs/budget-m7/capacity-local/measurements.json` contains samples, buffers, plans, errors and targets. `source-manifest.json` binds 454 source files; exactly four differ from the copy-refinement baseline: the provisioner, history comparator, new capacity harness and migration 97. `history-60.json`, `history-120.json` and `impact-mixed.json` preserve the completed history subchecks. `runs.json` distinguishes all four nonzero processes; counts overlap and must not be added.

Attempts: (1) real history-guard regression at schema 96; (2) restored guard/history/R01 passed, then benchmark passed six arguments to a five-argument recurring function; (3) benchmark removed its captured concurrent-import row, correctly revoking coverage, but did not renew the known-complete fictional evidence before the next scale. The two harness issues were corrected. Final measurements use the correct function signature and explicitly verify the real deletion revocation before renewing the fictional coverage; production protection is unchanged. Partial captures in `attempts/` are excluded from final timings.

Full path commands, with SUPABASE_CLI pointing to the installed official CLI:

```sh
node app/scripts/test-budget-durable.mjs --performance-only --stress --capacity
node app/scripts/test-budget-durable.mjs --performance-only --capacity --capacity-ledger-only
```

The first runs complete-history admission plus ledger measurements. The focused command repeats ledger/R01 coverage without repeating the completed heavy history checks. Both remain strict on latency targets. Syntax checks of all three changed/new scripts and full app TypeScript pass. Unit baseline: 595 passes / 14 existing skips. A passing production-performance or full-suite result is not claimed.

All four run projects have zero containers, volumes and networks after cleanup, verified by exact project labels. The existing preview project `halcyon-budget-m2-c65dd04871874dcb` remains running on schema 96. No personal data inspection/migration, hosted resource, deployment or commit occurred. Migration 97 is verified only on disposable targets so far. Human accessibility/comprehension and M7.6–M7.8 remain separate open gates in [[BUDGET_M7_RELEASE_VERIFICATION]].
