---
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: engineering-complete
project: Halcyon
created: 2026-10-22
updated: 2026-10-22
related:
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[BUDGET_M5_HISTORY_PERFORMANCE]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# M5 — complete impact preparation and atomic acceptance

## Outcome and boundary

**M5 is engineering-complete.** Migration 90,
`20261022160000_budget_impact_preparation.sql`, closes the remaining mixed-history impact
preparation and atomic-save gate. The final broad regression passed 451 isolated checks, and
the strict workload/recovery run passed 145 checks across all 90 migrations. Earlier performance
failures remain historical evidence in [[BUDGET_M5_HISTORY_PERFORMANCE]].

Long account, rollover and budget/line-control reviews prepare **two complete projections**:
the unchanged budget, then the hypothetical changed budget. Each projection is an independently
committed private checkpoint. A third request returns the complete authoritative review.
Financial acceptance, dated rights, immutable audit and receipt remain a single transaction.

This is request-driven preparation, not a detached worker or a staged financial commit.
Small histories (up to 12 saved periods) retain the existing single-request review path.

## Authority and correctness

- One private slot per plan/actor/change kind (at most three), cascade-cleaned with its plan or
  actor. `budget_impact_preparations` has RLS, tenant/actor membership policy, no browser table
  privileges, and service-only helpers with end-of-migration grant assertions.
- Each slot binds tenant, current owner/role, plan, selected period, exact canonical intent,
  source/financial versions, calculation/preparation method, relevant local date and one-hour
  expiry. No client totals, cached projection payloads, job IDs or progress cursors are accepted.
- The existing tenant source gate serializes reads/preparation/commands. No new source-row FK
  or source-row locks are acquired after that gate. All source/evidence derivation retains the
  existing complete kernels and exact integer cents.
- Preparing a projection uses the existing rollback-only hypothetical preview implementation.
  A local result survives that rollback; only the finished derived projection is checkpointed.
  A failed second projection preserves the first. Incompatible choices/generations restart
  preparation, while stale confirmed saves fail closed rather than silently rebase.
- The final review reruns existing business validations. Save reruns them again, checks the
  exact hash and explicit acknowledgements, applies the real intent and validates the actual
  semantic inputs against the prepared after-projection under the same gate.
- Archive disposition/capacity validation, which runs before the scope projections, opts into
  the existing guarded complete saved-base facts. This removes repeated full historical claim
  derivation before preparation can start. Every hit retains tenant/actor/current-role/source/
  plan/method/expiry checks; missing facts fall back to the full kernel. Each hypothetical scope
  projection still rebuilds its own independent facts/context, never reusing unchanged-state
  facts as hypothetical authority. The cache mode is restored on both success and failure.
- The proof includes stable plan/window/line identities, current and activated allowance contents,
  template contents, dated account scope, item/evidence/reversal/funding/move/limit/review inputs,
  current rollover timeline, lifecycle state and net signed lifecycle rights. The live source
  revision separately protects Ledger, coverage and taxonomy inputs. Incidental hypothetical
  revision/membership/event IDs and financial-version counters are not semantic money inputs.
  Control inverse moves net to the original rights; absence of rollover history is equivalent
  to its empty restored timeline. These normalizations do not collapse different dated rights.
- A forward commit must match the prepared after-state at original financial version +1.
  Compatible immediate Undo can reuse the before-state at +2; existing dependency/source checks
  and append-only compensation remain. Expired/missing Undo preparation uses the original
  complete calculation, never expired facts.
- Same-request receipt replay remains ahead of disabled/stale/expired preparation checks.
  A failed final history/receipt write rolls back all financial changes atomically. Preparation
  itself never supplies a financial receipt or claims that a change was saved.

## Interaction and recovery

The existing **Review effects → inspect → acknowledge → Save** flows remain. There is no new
setup screen, preparation setting or finance term to learn. The shared progress component says
“Complete checks saved · 1 of 2”, explains that it is checking before/after effects, and states
that no budget change has been saved. No partial reserves, carry or spending totals are shown.

The client sends at most three identical review requests; it does not spin indefinitely,
rebase intent or submit a financial command. Identity/navigation/version changes reject late
responses. Unknown/malformed progress cannot masquerade as a complete review. Connection errors
retain current form choices and explain that Review can continue compatible completed checks.
Reload discards local progress; reopening and **reselecting identical choices** resumes compatible
server work. Unsaved policy forms themselves are not newly persisted across reloads.

The existing pending-command/receipt recovery path still handles interrupted Save. Review
interruption is explicitly different: no financial outcome lookup is needed because preparation
cannot save a financial change. Existing explicit acceptance and incomplete-history qualifications
remain mandatory before Save is enabled.

The SQL-performance skill guided elimination of repeated complete projection evaluation; the
UX-copy skill guided count-based, plain-language progress and the review-versus-save distinction.
Existing design tokens and shared operation primitives are reused without a new visual system.

## Capacity and remaining release boundaries

SQL statement timeout remains eight seconds; lock timeout remains two seconds; authenticated
query rate remains 30 requests/minute. **One whole projection is the minimum work unit** in this
iteration, not a per-period resumable chain or an unbounded-history guarantee. If one complete
projection exceeds the bound, it fails closed and earlier compatible checks remain; admission
for a larger corpus would require further engineering, not partial money or a longer timeout.

Local fixture timings include transport overhead and warmed fixture buffers. They are not
hosted cold-cache measurements, production P95s or SLAs. M6 assisted setup and M7 independent
comprehension/accessibility, broader hosted performance, backup/restore/persistent migration and
rollout remain separate. No personal database migration, inspection or feature enablement is
authorized or performed by this gate.

## Verification

The strict mixed-history admission run passed **145 isolated SQL/Edge/browser checks across all
90 migrations** in `halcyon-budget-m2-3dd60fe0ec1347a7`. It completed the dense five-/ten-year
cases and the unchanged ten-year base of 120 monthly periods / 120,000 expenses, extended with three
accounts, twelve lines, 240 split children and 240 linked purchase/refund claims. Both complete
mixed projections matched the uncached calculations field for field; authenticated preview and
receipt recovery, signed carry/reserve totals, Save and guarded Undo passed.

All timings below are local elapsed milliseconds, including the respective client/transport
overhead. Each SQL work request retained the explicit eight-second statement timeout.

| Mixed-history action | Before check | After check | Complete review | Atomic save | Guarded Undo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Account scope | 3,812 | 3,870 | 300 | 366 | 381 |
| Category/Other rollover | 3,777 | 3,805 | 282 | 368 | 482 |
| Budget pause | 4,099 | 5,041 | 1,426 | 1,493 | 453 |
| Signed archive release | 4,552 | 5,307 | 1,784 | 1,866 | 410 |

The dense five-year checks took 623 / 629 ms, with save 85 ms and Undo 202 ms. Dense ten-year
checks took 2,518 / 2,295 ms, with save 117 ms and Undo 204 ms. The complete mixed API read after
history preparation took 434 ms; its entire multi-request history resumption took 8,469 ms.
That total spans separate bounded requests and is not a single SQL statement or a warm-read
latency. Dense prepared API reads were 130 / 260 ms. The raw physical source query used the
existing `budget_transactions_scope_date` index; no speculative new source index was added.

The run also passed stale source/plan/method/role/date/expiry rejection, interrupted second-check
durability, exact original-preview parity, actual-state proof mismatch rollback, failed final audit
rollback, receipt recovery after expiry/disable, compatible Undo fallback and service-only/RLS
checks. At 390px and 1440px, real signed-in browser journeys interrupted preparation after one
committed check, reloaded, reselected the same choices and resumed in two requests. Neither
preparation nor review saved a financial change; no browser runtime errors or page overflow occurred.

The following captures were visually inspected during closeout:
`/tmp/halcyon-budget-impact-preparing-390.png`,
`/tmp/halcyon-budget-impact-preparing-1440.png`,
`/tmp/halcyon-budget-impact-ready-390.png` and
`/tmp/halcyon-budget-impact-ready-1440.png`.
Progress text/counts fit both viewports; the phone result uses local table scrolling and readable
confirmation controls. Save remains disabled before explicit acceptance. This inspection is not
independent user comprehension or assistive-technology sign-off; those remain M7.

Synthetic reports are `/tmp/halcyon-budget-history-60.json`, `/tmp/halcyon-budget-history-120.json`
and `/tmp/halcyon-budget-impact-mixed.json` (`mixed_gate: passed`). Reports were generated by
the harness and not hand-edited. Only `mixed_*` fields in the mixed report describe the augmented
corpus; its dense measurements are carried forward from the preceding dense run.
Fixture identity/account/transaction/plan/source-gate cleanup
passed, and follow-up exact-label container, volume and network queries found no remaining
resources for the focused project.

**Final broad regression passed 451 isolated SQL/Edge/browser checks across 90 migrations** in
`halcyon-budget-m2-8dce2fa40f254fb0`, using API 57421 / DB 57422 and the final archive optimisation.
The command was `SUPABASE_CLI=<installed CLI> npm run test:budget:lifecycle` from `app/`.
It includes temporal/frequency/goal integration, effective account and rollover policy, signed
archive disposition, attention preferences, concurrency, source corrections and immutable reviews,
M2–M4 regression, new impact authority/rollback cases, authenticated browser journeys and disabled
exposure/receipt recovery. Fixture cleanup passed, the command exited successfully and the runner
removed only its exact disposable project. Follow-up container/volume/network label audits found
no remaining resources. The earlier 450-check run preceded the last optimisation and is superseded
by this final run. Full and focused totals are separate run totals, not additive unique-test counts.

Budget TypeScript, 511 unit tests (14 existing skips) and the production build passed before closeout;
the final optimisation changed SQL only. No further application code changed during closeout.
Full-app TypeScript retains the known unrelated `StrategicProjections.tsx:252` metric-name mismatch,
and the existing large main-chunk build warning remains.

## Closeout and next milestone

All planned M5 engineering gates are closed: lifecycle/reviews/carry, effective account and category
policies, frequency transitions, budget/line controls, attention, combined temporal/goal integration,
long-history workspace resumption and complete impact/atomic-save admission. No M5 engineering
item remains on the current implementation plan.

M6 assisted setup is the next planned implementation milestone. M7 retains independent human/
accessibility review, broader hosted performance, backup/restore and persistent migration rehearsal,
and staged rollout. The owner authorised this M5 closeout; it does not itself start M6 or deploy
Budget. Personal data and feature exposure were unchanged.
