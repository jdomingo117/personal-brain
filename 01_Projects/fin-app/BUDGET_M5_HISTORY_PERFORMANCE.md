---
tags:
  - halcyon
  - budgeting
type: implementation-record
status: engineering-complete
project: Halcyon
created: 2026-10-22
updated: 2026-10-22
---

# M5 — long-history performance and safe resumption

**Current status: the M5 performance/resumption and mixed-history atomic-save gates are closed;
M5 is engineering-complete.** [[BUDGET_M5_IMPACT_PREPARATION]] records migration 90 and the final
451-check broad regression / 145-check strict workload and recovery run across all 90 migrations.
Both complete mixed projections match the uncached calculations. Account, rollover, budget pause
and signed archive release preparation, Save, receipt recovery and guarded Undo pass the existing
eight-second bound for each SQL request. Phone/desktop interruption and reload also pass.

The account save measured 366 ms and signed archive save 1,866 ms on the local mixed corpus;
each complete projection check took 3,777–5,307 ms across those control scenarios. These are
local fixture measurements, not hosted latency guarantees. One complete projection remains the
minimum preparation unit; larger workloads retain the explicit capacity boundary in the new record.
The 82–89 implementation and failed-gate evidence below are historical. Report paths are reused;
their current files contain the passing migration-90 run. M6/M7 remain separate milestones.

## Impact-gate continuation — 22 October 2026

The initial measurements and open boundary below describe migrations 82–83. The current
continuation adds migrations 84–89; its final verification/status is recorded separately below.

- `20261022100000_budget_chain_prefix_reuse.sql`: private, bounded derived slots now hold pool
  and category-chain prefix state. Every impact invocation gets a fresh internal UUID context.
  Each completed prefix can seed the next period in that exact projection, rather than rereading
  the entire source-bearing prefix for every period. Hits still check tenant, actor/current role,
  live source/plan versions, period, method and expiry. The old complete pool/partition kernels
  remain as `*_reference`. Contexts are restored on success/error; hypothetical state rolls back
  with the existing preview subtransaction. No prefix is shared between before/after/actual states.
- `20261022110000_budget_aggregate_activity.sql`: `budget_activity_amounts` retains the canonical
  source eligibility, split replacement, effective kinds, dated account scope and signed amount
  rules, but omits evidence JSON/hash construction that balance aggregates do not consume.
  Source selection/matching still uses the full fingerprinted evidence function. The old raw
  details kernel remains `budget_details_m4_evidence_reference`; the replacement differs only in
  its name and aggregate-activity input. SQL equivalence checks compare both source sets.
- `20261022120000_budget_projection_claims.sql`: one private rebuildable row per actor/plan
  contains complete claim validity for a fresh projection context. It is computed from the full
  evidence resolver once per invocation and reused across that invocation's periods. Each hit
  checks tenant, current actor role, source revision and plan version. It is never a client token,
  financial record, cross-request checkpoint or authority for a different hypothetical projection.
  RLS is enabled, no browser role has privileges, and actor/plan cascades bound cleanup.
- `20261022130000_budget_account_validation_once.sql`: account save/Undo already validates all
  saved periods and the hypothetical next partition after applying the real new financial version.
  The outer rollover wrapper no longer repeats that identical validation after only the policy
  audit/receipt inserts. Other delegated financial actions retain their next-partition check.
  Source locking, exact preview hash/acceptance, actual post-write validation, immutable history,
  atomic receipt and guarded compensation are unchanged. No financial validation is deferred.
- `20261022140000_budget_claimed_evidence.sql`: the mixed corpus exposed full-ledger evidence
  materialization even for unclaimed rows. `budget_claim_activity` narrows the unchanged eligibility/
  fingerprint kernel to live claimed transaction keys and live parents of claimed split keys.
  Keys, not a client-supplied identity or date, locate candidate rows; the complete stored fingerprint
  still decides validity. Deleted, split, reparented and otherwise changed sources do not become
  valid merely because their key exists. Transfer/investment/manual funding resolution is unchanged.
  `budget_live_claims_full_source_reference` retains the original full-ledger resolver for SQL
  set-equivalence checks; both resolvers keep invalid claims and linked-refund rules intact.
- `20261022150000_budget_grouped_claim_usage.sql`: materialized grouped claim usage joins activity
  once per source key rather than rescanning every claim for every transaction. Line-level period/
  lifetime usage, confirmed funding, linked net purchases and changed-claim counts are grouped once
  per line, preserving the original date/purpose/validity predicates and refund-parent semantics.
  Cumulative allocations are grouped once per selected period instead of separately scanning saved
  revisions for each budget line; current revision pointers and exact end-date boundaries still apply.
  The original evidence-bearing raw details kernel remains available for every-field equivalence.

This uses complete-chain optimization, not a new background impact job or a split commit. The
existing simple review/save interface is unchanged. The SQL performance review directed work toward
repeated derivation and unused evidence materialization; no speculative source index was added.

`test-budget-history.mjs` now requires five-/ten-year previews, accepted saves and guarded Undo
to finish under an explicit outer eight-second statement timeout, and verifies disabled same-key
receipt recovery. `test-budget-impact-scale.mjs` extends the ten-year fixture with three accounts,
twelve lines, 240 split children and 240 linked purchase/refund claims. It checks source-set parity,
complete period inclusion, exact signed carry/reserve results, authenticated preview/recovery and
prefix-kernel reference equivalence. The strict admission test does not turn green merely because
a failed save rolls back safely. Executed checks versus blocked post-save assertions are recorded below.

## Outcome and scope

This continuation profiles complete saved history, removes repeated derivation of identical base
period facts and adds durable, version-bound preparation for long workspace reads. It does not
truncate carry, sample source rows, approximate cents, silently accept a changed preview or turn
preparation into a financial operation. All testing uses newly provisioned disposable projects.

Initial isolated baseline: 60 monthly budgets / 18,000 settled expenses loaded complete workspace
details in 1,606 ms (client/psql elapsed, not a production percentile). A single base-period read took
78 ms including client overhead. `EXPLAIN (ANALYZE, BUFFERS)` showed the existing
`budget_transactions_scope_date` index; the scoped source scan took approximately 0.38 ms. An extra
source index was not justified. Repeated period derivation across carry/policy prefixes was the
appropriate optimization target.

## Architecture

Migration `20261022080000_budget_history_preparation.sql` (82) adds:

- `budget_history_facts`, a **rebuildable private derived cache**, not financial intent/history.
  One slot per reader and period contains a complete base snapshot and M4 details. Identity includes
  tenant/plan/period, reader, current membership role, source revision, financial plan version,
  `history-v1` method and a 24-hour expiry. Old generations are overwritten rather than accumulated.
  Composite period and auth-user foreign keys cascade cleanup. RLS is enabled; neither anonymous
  nor authenticated clients receive any table privilege. Only checked service-owned functions write it.
  Expiry controls eligibility, not a scheduled physical purge; slots remain bounded by actor/period
  and are overwritten or removed by the relevant cascades. Future kernel changes must advance the
  method identity (or invalidate these derived slots), never silently reuse a prior calculation method.
- `budget_history_status`, a gated count-only inventory; `budget_prepare_history`, which chooses
  the next missing periods server-side. Each successful batch checkpoints at most eight complete
  periods, yielding after approximately 1.5 seconds of completed work. This is a yield target, not an
  invented ETA or a guarantee for one unusually heavy period. Existing SQL request/lock settings remain.
  A failed batch rolls back atomically; earlier committed batches survive reloads and retries.
- Opt-in cached `budget_details_m4` / `budget_query_m4` wrappers with retained `*_uncached` kernels.
  Every hit rechecks membership, role and live source/financial versions. Financial Undo availability
  and the Planning-goal directory are fetched live rather than accepted from a checkpoint.
- A protected `budget_workspace_details` composer: histories over 12 saved periods require a
  complete compatible prefix before returning financial details. It retains the old composer as
  `budget_workspace_details_uncached` for reference verification. The cache mode is scoped/restored
  inside the service function, including errors; it is never a replacement for authorization.

Migration `20261022090000_budget_scope_fact_reuse.sql` (83) optimizes complete impact previews:
`budget_scope_impact` **freshly derives every saved base period for the exact current projection**,
then reuses those facts in the existing prefix composer. It never reuses a pre-existing generation
for a hypothetical account/category/control projection. Hypothetical cache writes share the existing
rollback-only subtransaction, so they cannot become authority for the live workspace. The prior
composer is retained as `budget_scope_impact_before_history`. A timeout still fails the entire
preview/save; no incomplete impact is accepted and no financial change commits on failure.

All helpers remain service-only and both migrations close with privilege assertions. The tenant
source gate remains the consistency boundary. No source-row FK/lock, browser RPC, background worker,
cron, AI, ledger mutation or automatic budget allocation is introduced. Calculations remain in SQL.

## API and user experience

Strict Zod `prepare_history` is exposed through authenticated `query-budget`, with its existing
rate limit and independently checked DB membership. It accepts only plan/period and opaque source/
plan versions—no client totals or caller-supplied progress cursor. A workspace that needs preparation
returns only tenant identity and count/version metadata, **never a partial financial snapshot**.

The client performs at most four batches per refresh. Its one count-based status region explains:
“Checking your budget history” and that balances appear only after the complete check. The existing
`OperationProgress` primitive exposes actual completed/total counts; there is no fabricated time
estimate. “Continue loading history” resumes after interruption or the bounded refresh allowance.
Reload needs no stored client cursor: the server finds compatible committed work. An old verified
workspace can remain visible with an explicit out-of-date warning, but changes are disabled until
preparation finishes. User/tenant changes discard local state. Source/plan conflicts require a fresh
workspace; they never silently rebase an old continuation. Busy/error copy distinguishes this read
preparation from a financial save.

## Validation and measurements

Focused verification: **55 isolated SQL/Edge/browser checks passed across all 83 migrations** in
`halcyon-budget-m2-2894bb680581456a`. This includes both workload sizes, every-field reference
equivalence (entity arrays compared by identity where SQL has no ordering contract), preserved
signed balances, source and real financial-write invalidation, failed-batch durability, actor/role
isolation, expiry, and 390px/1440px interrupted/reloaded continuation. Captures
`/tmp/halcyon-budget-history-preparing-390.png` and `-1440.png` were inspected; both preparation and
completed views passed overflow checks and no browser runtime errors occurred. Fixture and
exact-project resource cleanup passed.

The full lifecycle regression also passed **432 SQL/Edge/browser checks across all 83 migrations**
in `halcyon-budget-m2-2be154e8e6c145d9`, including the established effective-policy, hypothetical
rollback, receipt/Undo, source-writer concurrency, signed archive/carry, attention and disabled-write
recovery cases. **503 unit tests passed / 14 existing skips; focused Budget TypeScript and production
build passed.** The known unrelated full-app `StrategicProjections.tsx:252` metric mismatch and
main-chunk build warning remain. Full/focused totals overlap in infrastructure and must not be added
as a unique-case total. Captured fixture identities/accounts/transactions/plans/source gates were
removed and exact-label container/volume/network listings confirmed no resources remained for the
successful projects or the earlier diagnostic projects. The personal stack was never queried or changed.

Measured local evidence (all source rows are generated, not personal data):

| Workload | Uncached complete read | Prepared real Edge read | Completed preparation batches | Future-account impact preview |
| --- | --- | --- | --- | --- |
| 60 monthly periods, 18,000 expenses | ~1.6–1.7 s in repeated baseline runs | 133 ms in final focused run | 231–283 ms | 3,624 ms, complete |
| 120 monthly periods, 120,000 expenses | 7,660 ms in final focused run; another run hit the 8 s bound | 265 ms | 352–380 ms | 8,068 ms elapsed, **timed out** |

Times include the respective client/transport overhead, so these are not an apples-to-apples hosted
speedup claim. Buffers were warm from fixture construction. One later five-year measurement showed
an anomalous 168,123 ms client wall interval despite successful execution with an 8 s SQL setting;
that unexplained environment/timing sample is **excluded from latency conclusions**, not presented
as an engine benchmark or silently edited out of its generated report. Stable earlier observations
and the raw reports remain available. No production percentile/SLA is claimed.

The fixtures deliberately stress dense expense rows, signed category debt/Other offsets and goal
reserves. They are not a maximal mixed-account/split/claim/line corpus; broader scale admission
still needs those workloads. Preparation readiness means calculation completeness, never proof
that bank history is complete or that a purchase is affordable.

Scripts:

- `test-budget-performance.mjs`: generated five-year and optional ten-year histories, integer-cent
  reconciliation, complete/base timing and source query-plan evidence.
- `test-budget-history.mjs`: reference equivalence, count-only API, bounded/idempotent continuation,
  failed-batch durability, source/plan invalidation, expiry, actor isolation and bounded generations.
- `test-budget-history-interactions.mjs`: real authenticated 390px/1440px interruption/reload/continue
  journeys, no invented setup/figures, no page overflow/runtime errors.
- `budgetHistory.test.ts`: progress discrimination and version-bound continuation payloads.

Reproduction uses the existing guarded provisioner; no existing target can be supplied:

```sh
cd app
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --performance-only --stress --workspace
```

Omit `--stress` for 60 periods / 18,000 transactions. `--profile-baseline` records raw measurements
without preparation assertions. Generated `/tmp/halcyon-budget-history-60.json` and `-120.json`
contain synthetic-fixture timings/plans only. These are bounded local measurements, not a hosted
SLA, cold-disk benchmark, production P95 or proof of every large claim/split/line permutation.

## Initial open boundary — migrations 82–83 (superseded by the continuation)

**Open M5 gate: large financial impact previews/commits.** The measured ten-year account-scope
preview timed out even with fresh base-fact reuse. Its incomplete result was not accepted. The next
continuation needs resumable/version-bound impact evaluation and an atomic commit protocol (or
further complete-chain optimization proven to fit); a warm workspace alone does not close this gate.

Workspace preparation is a read-side protocol. It does **not** split a financial commit or relax
exact impact-preview acceptance. Large impact previews/commits still have to fit their request
budget; any measured timeout must remain an explicit M5 gate, not be hidden by a warm workspace
result. Unusually heavy single periods also fail closed and preserve previously committed batches.
Further scale work requires evidence for that workload rather than increasing timeouts or returning
partial money. M6/M7, human comprehension/accessibility, backup/restore and personal rollout remain
separate. No personal stack inspection/migration or feature enablement is authorized by this slice.

## Prior verification — migrations 84–89

The complete lifecycle regression passed **432 isolated SQL/Edge/browser checks across all 89
migrations** in `halcyon-budget-m2-e914c938d0d1470b`. This includes both frequency directions,
cross-period source changes, linked refunds and deletion, signed child carry/protection, account/
rollover/control preview rollback, actual save/Undo, concurrency, funding capacity/evidence adapters,
attention, phone/desktop interaction, stale/lost-response recovery and exposure disable/replay.
New private tables/helpers are included in the global RLS/grant assertions. Captured fixture
identities/accounts/transactions/plans/source gates were removed, then only the exact generated
project resources were removed. No browser runtime errors occurred.

**503 unit tests passed / 14 existing skips; focused Budget TypeScript and production build passed.**
Full-app TypeScript still reports the pre-existing unrelated `StrategicProjections.tsx:252`
`net_worth`/`netWorth` mismatch; the existing main-chunk build warning remains. Neither is reported
as a new Budget regression or silently fixed in this task.

The strict five-/ten-year scale run verifies complete dense preview/save, exact version advance,
disabled same-key receipt replay and guarded Undo under an explicit outer eight-second SQL timeout.
The mixed fixture extends, rather than replaces/shrinks, the 120-period / 120,000-expense corpus:
three accounts, twelve lines, 240 split children and 240 linked purchase/refund claims. Full-ledger
versus claimed-key evidence, every raw financial field, source-amount sets, complete before/after
period inclusion and signed carry/reserve totals agree. The authenticated preview hash agrees
with the SQL preview. **The mixed accepted save still times out during actual-state validation.**
Its post-save receipt/Undo/workspace assertions cannot be credited as passed while save is blocked.
Final strict target: `halcyon-budget-m2-7dfe09da98994999`. Both exact-context prefix kernels
matched their retained complete reference before admission. On the mixed save timeout, a before/
after SQL state comparison proved unchanged financial plan/source versions, dated memberships,
operation/policy counts and hashes of both private derived caches. The test then deliberately
rethrows the timeout: **the stress run fails the admission gate**, not a successful stress suite.
The mixed post-save replay/Undo/workspace assertions and this run's later history-browser stage
were not reached. The separate full 432-check browser regression above did complete.

Final local timings (milliseconds, including respective client/transport overhead):

| Corpus | Complete impact preview | Accepted save | Guarded Undo | Prepared API read |
| --- | ---: | ---: | ---: | ---: |
| 60 periods / 18,000 expenses | 1,043 | 1,676 | 702 | 139 |
| 120 periods / 120,000 expenses | 3,927 | 5,802 | 2,136 | 264 |
| Same ten-year base plus mixed accounts/lines/splits/linked claims | 7,098 | **8,068; timed out and rolled back** | Not reached | Not measured for mixed corpus |

The dense uncached reads measured 1,139 / 4,406 ms. The physical scoped-source query still used
`budget_transactions_scope_date`; its ten-year fixture scan took about 0.18 ms. These freshly
provisioned local stacks have buffers warmed by fixture creation, not hosted cold-cache/P95/SLA
evidence. The mixed report embeds earlier dense measurements unchanged; only its `mixed_*` fields
describe the augmented corpus. Do not mislabel the dense warm-read/Undo timings as mixed results.

At that checkpoint, generated reports were `/tmp/halcyon-budget-history-60.json`, `-120.json` and
`/tmp/halcyon-budget-impact-mixed.json` (`mixed_gate: open-atomic-save-timeout`). They contain
synthetic-fixture data only and were not hand-edited. Exact-label container/volume/network audits
confirmed no resources remained for the full regression, final strict run or earlier diagnostic
projects. Failed diagnostic fixture data disappeared only with its positively identified disposable
resources; no personal stack was inspected, migrated, reset or cleaned.

## Prior remaining M5 gate and recommended implementation — superseded by migration 90

**At migrations 84–89, M5 remained open for mixed-history financial impact preparation and atomic-save admission.**
The original dense timeout is resolved; this broader failed save is not moved to M7 or hidden by
the successful regression/read/preview results. The stress command intentionally remains red.

The next continuation should implement durable, request-driven impact preparation with a short
atomic acceptance/commit boundary, retaining the current simple review/save flow:

1. Bind private preparation to tenant, owner/current role, plan/selected period, live source and
   financial versions, calculation method, canonical change intent and relevant local-date/effective
   boundary inputs. Never accept caller-supplied money, projection facts or progress cursors.
2. Checkpoint complete before/after impact units in bounded requests. Resume compatible committed
   work after interruption; reject/discard incompatible generations rather than silently rebase a
   previously confirmed review. Progress remains count-based, with no partial spendable balances.
3. Offer acceptance only when the entire server projection is complete. Bind the reviewed hash to
   that exact manifest. Under the existing source/plan gate, prove the actual applied projection
   matches it and recheck all financial constraints. Canonical semantic inputs must account for
   incidental hypothetical row IDs; a cached client-looking result is not an authorization proof.
4. Keep financial changes, immutable policy history and the durable receipt in one short atomic
   transaction. Preserve same-key replay before disabled/version checks and guarded append-only
   Undo. No detached background financial commit, partial policy application or skipped constraint.
5. Prove stale source/plan/role/method/date rejection, failed-batch durability, exact preview binding,
   final-write rollback, lost-response recovery, Undo and successful strict mixed-workload admission
   through SQL/API and responsive recovery journeys before marking M5 complete.

This is a remaining engine/protocol item, not a need for a more complicated budgeting interface.
M6 assisted setup and M7 independent comprehension/accessibility, broader hosted performance,
backup/restore/migration rehearsal and rollout remain separate. No personal migration or feature
enablement follows from the passing dense benchmark or lifecycle regression.
