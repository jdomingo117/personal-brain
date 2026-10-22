---
aliases:
  - Budget Technical Implementation Plan
tags:
  - halcyon
  - projects/fin-app
  - budgeting
type: implementation-plan
status: m5-engineering-complete
project: Halcyon
created: 2026-10-20
updated: 2026-10-22
related:
  - "[[BUDGET_SCOPE_BASELINE]]"
  - "[[BUDGET_FEATURE_SPEC]]"
  - "[[BUDGET_SUGGESTIONS_PROPOSAL]]"
  - "[[SYSTEM_INTEGRITY]]"
  - "[[PLANNING_EXPERIENCE_PLAN]]"
---

# Budget V1 — technical implementation plan

**Plan 1.16 · 22 October 2026 · M0–M5 engineering-complete; M6 is next.**

M5 closeout: [[BUDGET_M5_IMPACT_PREPARATION]] records migration 90, complete resumable before/after
impact preparation, exact intent/input proofs and short atomic Save/Undo. Account, rollover,
pause and signed archive release pass the strict mixed-history gate on 120 monthly periods /
120,000 expenses plus multiple accounts/lines, splits and linked claims. Existing business
validations, exact preview acceptance, immutable audit and durable receipt recovery remain intact.
The UI keeps the existing Review → acknowledge → Save flow with count-based progress and recovery.

Final verification: **451 broad isolated SQL/Edge/browser checks and 145 focused workload/recovery
checks across 90 migrations** (separate run totals), **511 unit tests passed/14 existing skips**;
focused Budget TypeScript and production build passed. Phone/desktop captures were inspected,
fixture cleanup passed and exact project resources were removed. The known unrelated full-app
projection metric type mismatch/main-chunk warning remain. All current M5 engineering gates are
closed; capacity and local benchmark qualifications are in the record. M6 assisted setup and
M7 release verification remain open. No personal migration, feature enablement or rollout occurred.

Prior continuation: [[BUDGET_M5_HISTORY_PERFORMANCE]] adds exact-projection prefix reuse,
lean aggregate activity, once-per-projection claim validation, claimed-key evidence resolution,
grouped claim/allocation totals and removal of a duplicate account post-write validation.
Migrations 84–89 retain full evidence, source/plan/role checks, exact preview acceptance and atomic
financial writes. The original 120-period / 120,000-expense gate now completes preview, accepted save,
disabled same-key replay and guarded Undo within the unchanged eight-second SQL bound.
The broader three-account / twelve-line / 240-split-child / 240-linked-claim corpus matches the
original evidence/financial kernels and its complete authenticated preview was correct, but its
final accepted save still timed out. **At that checkpoint M5 remained open for mixed-history
atomic-save scale**. The strict stress command stayed red until migration 90 closed that gate.
Verification and timing qualifications are in the record.
Regression: **432 isolated SQL/Edge/browser checks across 89 migrations; 503 unit tests passed/14
existing skips; focused Budget TypeScript/build passed**, responsive journeys and cleanup verified.
The known unrelated full-app projection metric type mismatch/main-chunk warning remain.

Prior continuation: [[BUDGET_M5_HISTORY_PERFORMANCE]] profiles complete history and adds durable,
reader/source/plan/method-bound base-fact preparation, count-only progress, reload-safe continuation
and fresh-projection reuse for impact previews. Migrations 82–83 retain exact financial kernels,
atomic mutations and rollback-only hypothetical effects. Long workspace figures are withheld until
the complete prefix is ready; existing verified figures remain explicitly qualified and read-only.
Verification: **432 full isolated checks across 83 migrations; 55 focused five-/ten-year SQL/Edge/
browser checks; 503 unit tests passed/14 existing skips; focused Budget TypeScript/build passed**.
Responsive recovery captures and scoped resource cleanup were verified. Prepared real-API reads
measured 133 ms / 265 ms in the focused five-/ten-year cases, with benchmark qualifications in the
record. That initial ten-year account-scope impact preview timed out at 8 seconds. The latest
continuation at that checkpoint resolved the dense case while retaining the mixed financial-save gate.

Prior continuation: [[BUDGET_M5_TEMPORAL_INTEGRATION]] combines both frequency directions,
effective account scope and signed category/Other carry with monthly goal cadence, separately
reviewed transition/continuing overrides, late purchase/refund corrections, immutable reviews and
goal pause/Undo. Authenticated desktop/phone journeys revisit and reload each saved period.
Migration 81 fixes a discovered historical dropdown inventory gap without changing financial facts.
Verification: **432 full isolated checks across 81 migrations; 44 focused temporal checks;
496 unit tests passed/14 existing skips; focused Budget TypeScript/build passed**. Responsive
captures and scoped fixture/project cleanup were verified. Existing unrelated full-app metric
mismatch/chunk warning remain. Realistic complete-chain performance/query-plan and resumable
evaluation remain M5 work.
This continuation does not authorize personal migration, feature enablement or M6/M7 progression.

Prior continuation: [[BUDGET_M5_ATTENTION_CONTROLS]] implements a counted in-page queue,
acknowledgement, bounded snooze/show-again, independent attention version/history and compatible
Undo. Material deterioration, due-date and relevant evidence changes reopen a check; unrelated
source changes do not. Signed gaps remain visible and financial versions/allocations/frequency
intent stay unchanged. Migration 80 adds the immutable event boundary and gated workspace composer.
**388 full isolated checks across 80 migrations; 40 focused follow-up checks; 496 unit tests passed /
14 existing skips; focused Budget TypeScript/build passed**, responsive captures and cleanup verified.
Temporal/policy/goal integration is continued in the newer record above; realistic full-chain
performance/resumption remains M5 work. Unsupported forecasting/payday/detector queue reasons require their real inputs/adapters;
no frozen M6/M7 requirement is marked complete by this presentation-control slice.

Prior continuation: [BUDGET_M5_BUDGET_LINE_CONTROLS.md](BUDGET_M5_BUDGET_LINE_CONTROLS.md) implements
budget pause/resume, explicit uncovered-window/carry review and bill/reserve/goal/transfer archive
with signed keep/release/transfer disposition. Migration 79 adds immutable operational projections
and signed rights movements, complete preview/save/compatible Undo and zero archived future refill
without changing unrelated allowances. **360 isolated checks across 79 migrations; 493 unit tests
passed/14 existing skips; focused Budget TypeScript/build passed**. Phone/desktop captures and
exact-project cleanup were verified. Attention acknowledgement/snooze is closed by the newer record
above; wider temporal/goal integration and realistic performance/resumption remain M5 work.

Prior continuation: [BUDGET_M5_CATEGORY_ROLLOVER.md](BUDGET_M5_CATEGORY_ROLLOVER.md) implements
prospective category/Other signed routes, separate protected money, explicit retained/transferred/
released disposition and next-category editing. Migration 78 extends complete-chain previews,
atomic save/undo and dated next-period/frequency adapters. **322 isolated checks across 78
migrations; 490 unit tests passed/14 existing skips; focused Budget TypeScript/build passed**.
Responsive captures and isolated fixture/project cleanup were verified.
General line archive and pause/resume are continued in the newer controls record above.

Prior continuation: [BUDGET_M5_ACCOUNT_POLICIES.md](BUDGET_M5_ACCOUNT_POLICIES.md) implements
effective account dates, rollback-only full-chain/next-window effect previews, fresh preview hashes,
atomic saves and compatible undo. Migration 77 adds immutable account policy history and
non-overlapping live membership windows. **This is the account-scope portion of the policy gate**;
category/Other rollover and general line archive/disposition are continued in the newer records
above; attention controls are also implemented. Wider integration and performance/resumption remain.
Account continuation verification: **284 isolated SQL/Edge/browser checks across 77 migrations;
486 unit tests passed/14 existing skips; focused Budget TypeScript/build passed**, responsive
captures inspected and disposable cleanup verified. Full-app metric mismatch/chunk warning remain.

[BUDGET_M5_LIFECYCLE_CONTROL.md](BUDGET_M5_LIFECYCLE_CONTROL.md) records the first implemented
slice: saved-period selection/opening, immutable reviews, signed everyday carry into Other,
full-chain source recomputation, missing-history qualification and guarded review undo. Two additive
migrations brought the repository to 75 migrations. The continuation adds migration 76 with guided
future frequency intent, separately reviewed first/full templates, atomic bridge application,
cancellation/guarded undo and historical financial-write protection. **The whole M5 milestone
remains open** for wider transition/policy/goal integration and complete-chain performance/
resumption gates. Pause/archive/attention controls are implemented in the newer records above.
This is not authorization to advance to M6 or
migrate/enable the personal stack.

First-slice verification: **223 isolated SQL/Edge/browser checks across 75 migrations**, **475 unit
tests passed/14 existing skips**, focused Budget TypeScript/build passed. Desktop/phone engineering
captures inspected and disposable cleanup verified. The unrelated full-app metric mismatch and
independent M7 human/performance/backup/rollout gates remain open.

Latest continuation verification: **253 isolated SQL/Edge/browser checks across 76 migrations**,
**482 unit tests passed/14 existing skips**, focused Budget TypeScript/build passed; responsive
form captures and disposable cleanup verified. Full M5 closure is still required before M6.

[BUDGET_M4_BILLS_RESERVES_GOALS.md](BUDGET_M4_BILLS_RESERVES_GOALS.md) records the authenticated
bill schedules, dated reserve/goal intent, evidence/matching, purchases/refunds, movements, limits,
featured-goal control and compatible undo. Six additive M4 migrations introduce six protected
append-only tables, the shared production recurring kernel/complete bounded evidence query and
confirmed bank-to-investment proof. Final combined verification: **187 isolated SQL/Edge/browser
checks**, **73 migrations**, **470 unit tests passed/14 existing skips**, focused Budget TypeScript
and production build passed. M4's adapter/interaction gates are closed. M5 lifecycle/control is next;
M6 assisted setup and M7 independent usability/performance/migration/rollout gates remain open.

M3 adds the authenticated manual `/budget` workspace, optional scoped AUD account activity,
monthly/fortnightly setup, durable draft/review/activation, Overview/My plan and explicit current/
future edits. [BUDGET_M3_MANUAL_WORKSPACE.md](BUDGET_M3_MANUAL_WORKSPACE.md) records its control,
responsive handoff, interrupted-save recovery and verification boundary. Flags remain off by default;
no personal-stack migration or public exposure is authorized. The following M4 slice is recorded above.
M3 validation: **109 combined isolated Edge/SQL/browser checks**, all 67 migrations, **447 unit tests
passed/14 existing skips**, focused workspace TypeScript and production build passed. The documented
unrelated full-app TypeScript issue and later release gates remain open.

M2 adds protected drafts/immutable revisions, atomic activation/revision/undo, durable request
receipts, source invalidation and complete canonical snapshot totals. Its implementation and
verification boundary are in [BUDGET_M2_DURABLE_BOUNDARY.md](BUDGET_M2_DURABLE_BOUNDARY.md).
The three new migrations are applied only to disposable projects, not the personal stack.
M2 verification: 94 real Edge/SQL/isolation/concurrency checks passed against all 67 migrations;
422 unit tests passed, focused Budget TypeScript and build passed. The existing full-app metric
type mismatch remains a documented release gate, not a green full-app typecheck.

M1 pure calendar/money/allocation/reserve/contribution/goal modules and byte-identical server
mirror are implemented. [BUDGET_M1_FOUNDATION.md](BUDGET_M1_FOUNDATION.md) records module contracts,
61 focused tests, full-suite/type/build evidence and the still-unpassed later integration gates.

M0 findings, reviewed contract choices, isolated-source/full-schema evidence and explicitly
unpassed downstream gates are recorded in [BUDGET_M0_CONTRACTS.md](BUDGET_M0_CONTRACTS.md).
No production Budget schema, Edge Function or authenticated route has been deployed.

Implements frozen baseline **BUDGET-V1-2026-10-20**, feature spec v1.5 AC01–AC49 and assisted-setup
checks SG01–SG09. M2's record distinguishes implemented core tables/APIs from the later workflow
families below that remain proposed. M0 resolved the source contracts before isolated migration
validation. This document is not personal-stack migration or
deployment approval and changes no live data. No calendar estimate is claimed before M0 sizing.

## 1. Implementation strategy

Build a durable, deterministic budget subsystem inside the existing Vite/React + Supabase app.
Reuse canonical classification, tenancy, money formatting and the approved UI; do not promote the
fictional fixture engine directly into production. Both frequencies are part of the first model.

```text
Canonical ledger + recurring evidence + explicit coverage
                         ↓
Tenant-scoped SQL aggregates and versioned source snapshot
                         ↓
Deterministic budget calculations / suggestion gates / previews
                         ↓
Budget view and guided tasks → explicit validated command
                         ↓
Authenticated Edge Function → atomic service-only SQL write + operation record
```

The browser proposes intent and may preview calculations; the server revalidates sources, ownership,
revisions and money effects before saving. Budget never edits ledger/account/Planning truth as a
side effect. No AI, queue platform or general-purpose event-sourcing framework is required.

## 2. Repository findings and consequences

Read-only source inspection on 20 October 2026; these are code findings, not a live database audit.

| Evidence | Consequence |
| --- | --- |
| Original router had Expenses followed by Ledger and no Budget route | M3 adds authenticated `/budget` and private Budget navigation after Expenses; later rail numerals shift only with preview exposure; existing deep links remain unchanged |
| `DataContext.tsx` reads `transactions_analytic` and allocations, then expands splits in memory | Do not use that potentially response-capped list for complete Budget totals/history; add scoped SQL aggregates plus paginated drill-down |
| `Account` and its mapper omit currency while DB accounts retain it | Extend the eligible-account read contract; validate AUD on the server, not from UI labels |
| Legacy `public.budgets` stores category limits; later migrations add tenancy/taxonomy | Preserve it. It cannot encode periods, reserves, reviews, goals or revisions; offer verified legacy limits only as draft suggestions |
| `classification.ts` defines effective-kind, earned-income and expense-effect rules; split expansion is separate | Implement SQL parity for effective classification and child replacement, not a new category-name accounting heuristic |
| `manage-recurring-series` re-proves evidence before a service-only write; the detector remains client-side | Reuse durable overrides/identity but design a complete server evidence/occurrence adapter; do not treat the current UI detector output as authoritative |
| `upload_batches` records counts/reconciliation/undo, not a proof of full statement date coverage | Design explicit account/date coverage evidence. Do not infer completeness from first/last transaction or upload counts |
| Planning tables/functions and `manage-planning` already exist | Reference Planning goals contextually; purchase goals use Budget reserves and must not create a second Planning event |
| `_shared/withAuth.ts`, service-only RPC patterns, RLS and isolated harnesses exist | Extend those boundaries; do not introduce browser PostgREST writes or a different auth system |

Primary read references: `supabase/migrations/20260804000000_auth_hardening.sql`,
`20260821000000_atomic_upload_batches.sql`, `20260825000000_transaction_kind_attributes.sql`,
`20260826000000_phase5_splits_custom_rules_policy.sql`, `20260826010000_custom_subcategory_identity_fix.sql`,
`20261013000000_recurring_series_writeback.sql`, and the `202610150*` Planning migrations.
Review the full migration chain when designing SQL; older definitions alone are not the deployed contract.

## 3. Domain/calculation module

M1 implemented `app/src/lib/budget/{types,money,periods,plan,reserves,index}.ts`; matching, review,
forecast and suggestion integration remain later milestones. Corresponding server-safe modules
are under `supabase/functions/_shared/budget/` following
the repository mirror convention. Use shared golden vectors/parity tests to prevent divergence.
SQL aggregates raw activity; TypeScript handles bounded plan inputs/period aggregate series, not
thousands of raw transactions. Server output is authoritative.

Required invariants:

- Money is signed integer cents; validate safe bounds before arithmetic and JSON conversion. SQL
  sums may be bigint; explicitly range-check/serialize them so JS precision cannot silently change.
- Monthly periods use local calendar boundaries. Fortnights advance 14 local dates from an anchor,
  never 14 elapsed 24-hour timestamps across DST. Persist start inclusive/end exclusive and timezone.
- Inject the clock. Remove fixture dates, hardcoded accounts, four-month histories and private storage
  keys from production calculations. Use strict real-date validation, including impossible dates.
- New income plus explicit opening drawdown funds new allocations. Existing protected reserves/carry
  are not earned income. Parent pool and category partitions reconcile with no duplicate carry.
- Source actuals use canonical settled expense effects, contra-expenses, effective transfer decisions
  and split child replacement. Pending values and unassigned credits remain separate and inspectable.
- Expected bill occurrences have stable identities and actual due dates; paid matches remove expected
  occurrences once. Reserve-funded expenses consume their reserve, not the everyday pool again.
- Planned, confirmed and remaining goal evidence stay separate. Matching a transfer fulfils the
  existing allocation; it must not create a second allocation/reserve credit. Purchases count once.
- Goal deadlines count actual remaining contribution dates, excluding contributions already included.
  Pause/zero/unknown targets give no unsupported date; suggestion what-ifs have the approved 12-month horizon.
- Ordinary forecast methods remain those in feature spec section 9.4; do not substitute linear
  pacing for bills or portray historical ranges as prediction-confidence intervals.

## 4. Proposed persistence model

Use additive schema and immutable revisions with derived results, not a copy of the concept's
single JSON/localStorage object. The table families below are the schema review starting point;
combine mechanically redundant records during M0 only if integrity and auditability remain explicit.

| Proposed record/table family | Essential fields and constraints |
| --- | --- |
| `budget_plans` | ID, tenant, currency, timezone, lifecycle, revision counter, created-by; partial unique constraint for one active plan per tenant |
| `budget_account_memberships` | Plan/account/tenant, activity versus contribution-destination role, effective bounds; all references same tenant |
| `budget_frequency_changes` | Old/new frequency, anchor/timezone, effective boundary, optional bridge, reviewed initial/continuing template refs, pending/applied/cancelled state |
| `budget_periods` | Stable ID, plan/tenant, explicit bounds/timezone/frequency revision, transition flag, activated/current revision refs; no overlap, contiguous generated sequence |
| `budget_lines` and effective policies | Stable purpose/kind (bill, reserve, everyday partition, contribution, purchase goal), taxonomy/recurring/Planning references, archive state; effective-dated mapping/rollover/schedule policies |
| `budget_revisions` + `budget_allocations` | Immutable period or future-template revisions, parent/source refs, activation baseline, effective date, expected income/pay schedule/explicit opening drawdown, per-line cents and provenance; one current pointer, no destructive history overwrite |
| Purchase-goal metadata | Reserve-line FK, versioned name/target/estimate/needed-by/mode and lifecycle state with revision references; no separate duplicate savings balance or overwritten historical target |
| Reserve opening/release intent | Line, effective date, dated opening amount/confirmation, release/reallocation legs; signed amounts and operation provenance, not a second bank ledger |
| `budget_assignments` | Explicit source transaction/allocation assignment or effective category policy, named inclusion/exclusion; stable source identity and evidence version |
| `budget_source_matches` | Bill occurrence, contribution, purchase/refund match; source leg/pair/allocation identity, amount, purpose, revision/status; prevent overlapping claims across lines/goals |
| Funding evidence | Source movement/pair or dated manual confirmation, claimed amount/purpose, reversal state; separate from planned reserve intent; no reuse of one amount across goals |
| `budget_reviews` | Period, reviewed plan revision and source fingerprint, totals, carry choices, reviewed-by/time; later source changes flag changed, not overwrite reviewed truth |
| Attention state | Tenant/plan/issue identity, evidence revision, acknowledgment/snooze expiry and operation reference; preserve signed gap and reopen on material deterioration |
| `budget_operations` | Tenant/plan, actor, request ID/payload hash, expected/committed versions, action, before/after refs, outcome and undo-of link; append audit, retain dedupe result |
| `account_activity_coverage` | Tenant/account, bounded local dates, source/evidence ref, provider/statement/user-confirmed provenance, invalidation/revocation; evidence not derived from row density |
| Source revision tracking | Tenant/affected scope/version and earliest dirty date for relevant ledger, split, transfer, recurring, account and coverage changes; exact mechanism chosen/proven in M0 |
| Resumable setup draft | Tenant/owner, version, bounded draft/provenance payload, last verified source fingerprint and updated time; no active plan effects until atomic activation |

Use composite tenant/parent keys or equivalent enforced ownership checks for every relation.
M2 live account references deliberately use ownership triggers and gate-protected invalidation,
not source FKs whose implicit row locks would reverse the source/gate lock order; see M2 §1.
Reject foreign source IDs even if the row exists. Store PostgreSQL `date` for budget windows and
`timestamptz` for audit timestamps. Archive lines/plans; do not cascade-delete financial meaning.
All public tables get member-read RLS and no anonymous grants; application writes are service-only.
Use `security_invoker` for views and explicit tenant scoping for privileged RPCs.

## 5. Source read and evidence contracts

### 5.1 Canonical SQL reporting

Build a split-aware tenant/date/account-scoped reporting relation/query that:

1. resolves durable effective kind and transfer decisions using current classification semantics;
2. replaces a split parent with its canonical allocations while retaining parent account/date/source
   identity; handles global and tenant custom subcategory IDs without conflating them;
3. separately aggregates settled gross expense, refunds/reimbursements, earned income, pending,
   assigned/excluded/unassigned effects and contribution/source-match evidence;
4. returns complete totals even when drill-down spans multiple pages; and
5. proves assigned + excluded + unassigned-credit expense effects equal canonical ledger effect.

Do not overwrite or fork `transactions_analytic` just for Budget unless shared correctness requires
it. Prefer a narrow reporting adapter with parity tests. Corrections remain Ledger actions.
Pagination is for details, not totals; use stable date/ID cursors and explicit `has_more`/count.

### 5.2 Coverage and freshness

Confirm source ingestion can prove continuous completed sync/statement ranges. A successful import
with no explicit full-period evidence is not complete coverage. Where no provider/statement proof
exists, allow explicit dated user confirmation and label its provenance. Preserve zero-activity
covered periods; partial/unknown periods are not zero. Missing coverage leaves manual planning usable.

Snapshot response includes plan/template revisions, source version/fingerprint, covered account/date
ranges, freshness time, recurring evidence revision, pending semantics and method version. The same
snapshot powers totals, review and proposals. Do not mix independently refreshed numbers under one
unqualified status. Out-of-date reads retain last verified values with a timestamp/qualification.

### 5.3 Recurring adapter and matches

Resolve stable account/merchant recurring identities and durable overrides, then generate dated
occurrences on the server from complete evidence. Exclude dormant/stopped/unconfirmed series as
defined by recurring rules; show uncertainty rather than treating detection as contractual truth.
Budget changes cannot cancel a merchant subscription. Changed recurring amounts produce proposals.

Explicitly match expense/split IDs and linked transfer legs; enforce amount conservation under
concurrent claims. Store original canonical IDs plus existing stable dedupe/overlay identity where
needed. Deleted/replaced sources become changed evidence; never silently rematch by amount alone.
A match must not prevent a legitimate Ledger edit/import undo or disappear by cascading deletion:
retain audited stable source identity and mark the reference invalid/changed through the source
contract, using nullable live references or an equivalent reviewed design.
A refund arriving later affects the receipt period and restores its matched reserve once.

## 6. API and mutation protocol

Proposed Edge Functions: `query-budget` (scoped reads/previews/suggestions) and `manage-budget`
(validated discriminated commands), both through `withAuth`. Reads use member/viewer scope as
appropriate; writes explicitly require **owner** for this personal-budget V1, regardless of broader
member permissions on older Planning/recurring functions. UI permissions are not the security boundary.

Read operations: configuration/current period, past/future snapshot, paginated source detail,
source/coverage diagnostics, revision history, change preview and suggestion proposal. Aggregate
RPCs are called server-side; never add direct browser RPC access for convenience.

Command families:

- Save/replace setup draft; activate a fully reviewed draft (known funding gap explicitly accepted).
- Revise current allocation or future template; move allocation atomically; add/edit/archive line.
- Set opening reserve, confirm/match/reverse funding evidence, assign expense/refund/purchase.
- Accept a recurring proposal; change scope/mapping/rollover; acknowledge/snooze attention.
- Review/close period, confirm carry choice, schedule/cancel/replace frequency change; pause/resume.
- Undo the latest compatible operation or retrieve a previous request's durable outcome.

Each consequential command includes `request_id`, expected plan revision, source fingerprint when
source-dependent, explicit effective scope and a server-recomputed preview/input reference.
Tenant/actor come only from verified auth. Money/date/ID/string bounds are Zod-validated; ownership
and all financial constraints are rechecked in one SQL transaction.

Commit protocol:

1. Check owner/tenant and the idempotency key. Same request + same payload returns the recorded
   outcome; same key + different payload conflicts. A lost response must not duplicate an operation.
2. Lock the budget and affected resources in a consistent order, recheck expected revisions and
   source facts, then recompute signed deltas/match capacity and accepted-gap policy.
3. Commit revision pointers, all debit/credit legs, matches and operation outcome atomically.
   Authoritative operation history belongs in that transaction; audit transport failure must not
   make a committed write appear uncommitted or safe to replay under a different request ID.
4. Return committed versions and operation ID. Undo appends a guarded compensating operation;
   it cannot delete source activity or rewrite a later dependent change.

Distinguish validation (400/422), forbidden (403), unavailable/not found (404), stale/conflict (409),
rate limit (429) and transient service failures. A timeout is **outcome unknown**, not cancelled:
retain draft/request ID and check outcome or retry with the same ID. A completed server save wins
over a late UI close. Disable duplicate submissions without pretending it is the integrity guard.

## 7. Revision, recomputation and period lifecycle

M0 must inventory every financial mutation path: CSV import/undo, provider sync, manual edits,
classification/rules, splits, transfer decisions, account scope, recurring overrides and coverage.
Each relevant committed change advances a source revision or equivalent reliable fingerprint.
UI refresh alone and `max(updated_at)`/row-count shortcuts are insufficient, especially for deletes.

Financial matches must transactionally revalidate affected sources and enforce single-claim capacity.
Define one lock order with existing mutation paths before extending them; review source-version
locks versus budget/source locks for deadlock and race safety. M0 chose a tenant revision gate,
Budget-owned claim locks and subsequent-statement MVCC source reads: Budget must not take source
row locks after that gate, reversing existing source-writer order. See the M0 contract §5.
Never claim a stale-preview guard
is atomic until this is proven with concurrent integration tests.

Source changes recompute derived actuals, reserve usage and carry chains from the earliest affected
period, preserve original activated plans/review snapshots and mark changed reviews. Never rewrite
saved allocation intent to hide an overspend. Detect stale manual review choices before applying them.
Compute complete affected results server-side; benchmark carry-chain cost before adding a cache or
background job. If computation cannot complete within a bounded request, expose recalculating/unavailable
state and a resumable server strategy—never silently truncate the carry chain or display fresh totals.

Period creation is deterministic/idempotent and can be ensured on read/explicit next-period action;
a new scheduler is not required initially. Current periods cannot be marked final early. Reviews
are optional and do not block future access; provisional carry is labelled until sources are reviewed.
Actual carry/policy application is durable and audited, not merely the prototype's saved preference.

Frequency changes take effect at the current end boundary. Preserve existing periods and reserve
identities. When needed, create exactly one short bridge to the next calendar-month boundary.
Review/store **both** bridge amounts and the continuing full-period template in the same scheduled
change; do not copy short-period values into full months or leave a missing future template.
Check due bills, pay dates, goal schedules, override conflicts and funding gaps for each window.
Activation/cancellation/undo are atomic and cannot produce overlapping or missing activity windows.

## 8. Suggestions and one-change what-if

Use the same production read/period/reserve engine; only replace fixture sourcing, not the approved
gate definitions. Implement G01–G09 and S01–S11 with structured reason codes and provenance.
Three complete comparable calendar months are the proposed minimum, six preferred; fortnightly
everyday suggestions additionally need six covered anchor-aligned windows. Thresholds remain product
defaults, not scientifically established reliability or predictive confidence.

Server supplies bounded per-period aggregate series and a fingerprint. Calculate exact median,
named evidence dates and variability flag without hiding exceptional spending. User confirms current
income, essential/annual costs and recent changes; unsupported components stay unresolved/manual.
No AI dependency. No real data in `halcyon-budget-*` concept storage.

The optional isolated what-if reassigns one user-authorized, unprotected source amount to one goal
or unassigned capacity. Validate current settled usage versus future scope, conserve total resources,
retain all protected lines, show conditional outcomes/deadline gaps and apply no bank movement.
Cap suggestion outcome display at 12 months. `Use this draft` only updates setup; activation and
any subsequent active-budget edit still use the normal guarded command. User edits survive stale
evidence; explicit manual conversion preserves goal and future-plan intent.

## 9. Frontend/design handoff

Proposed `BudgetView.tsx`, scoped `useBudget`/API adapter and typed production components for
Overview, Plan, Review, Setup, Assistance, Goals, Allocation, Frequency and Carry tasks. Mount under
the existing authenticated shell. Do not put all historical data into `DataContext`; consume its
identity/account conveniences while dedicated Budget queries provide complete snapshots.

Reuse `Screen`/`ViewHeader`, existing Controls/Tile patterns, canonical `fmt`/`fmtCents`, operation
status conventions and dialog focus helper. Extract/adapt concept presentation; do not ship the
duplicate shell, fake date, Phone preview toggle, fixture selector, restart controls or demo assets
as production application state. No new navigation for assistance or scenarios.

| Handoff item | Required implementation |
| --- | --- |
| Tokens/type | Existing `index.css` source of truth: surface/ink/muted/accent-ink, hair/track/input, semantic warn/neg; Archivo display + Hanken Grotesk body; solid versus patterned goal evidence with text labels |
| Geometry | Concept reference: two-column workspace/secondary details; container transitions at 1150/850/600px, right-side task up to 560px desktop and full-width phone; adapt to real shell without inventing new hardcoded colours |
| Controls | At least 44px production touch targets and approximately 48px money/date fields; preserve 14–15px supporting text. Fix smaller concept-only disclosure/metadata targets during extraction |
| Context | Current/past/future period and timezone always explicit; future plans remain provisional. Header meanings explain everyday versus unassigned income without requiring a tutorial |
| Tasks | Opaque scrollable task surface, sticky header/footer that do not obscure focused fields; Escape/dirty protection, initial focus, forward/reverse trap and opener/fallback restoration |
| Guide/setup | Optional five-step guide, resumable authenticated draft, setup-ready next steps; assistance stays three stages with details disclosed on demand |
| Long/empty content | Goal names capped at approved 60-character UI contract; wrap long names/dates and signed amounts, never truncate money; no-goal/no-history/zero-income states remain usable |
| Save feedback | Named saving/validating state, actionable inline errors and outcome-unknown handling; no fabricated percentage. Preserve dirty drafts and announce meaningful status once |
| Motion | Existing Framer layout boundaries; no chart animation engine for simple progress tracks. Honour reduced motion; no animation is necessary to understand an amount |

State coverage required before release: first load, no budget, manual/no history, suggested eligible,
limited/stale/changed history, goal draft/paused/completed/part-purchased, overspend/credit-heavy/zero
income, incomplete accounts, changed past review, source match conflict, read-only permission,
failed save, unknown write outcome, retry and incompatible undo. Every state works at 320px and in
both themes with equivalent text values and without hover-only actions or colour-only distinctions.

## 10. Migration and legacy compatibility

No destructive replacement of `public.budgets`. Inventory actual rows/tenancy/units/taxonomy during
an approved read-only M0 check. Add the new model alongside it, leave existing readers unchanged,
and expose verified legacy values as optional setup suggestions only. Never backfill arbitrary
budget start dates, invented historic allocations or reserves. Track any opt-in migration reference
so retries cannot create multiple plans. Retirement of old writes/reads is a separately reviewed
compatibility change after every consumer is identified.

Before persistent migration: verify exact target, obtain/check a restorable auth+application backup,
review forward migration and rollback/exposure plan, apply/test on a uniquely identified isolated
project, and validate constraints/RLS/grants. No reset of the personal stack. Production rollback
first disables Budget exposure/writes while retaining tables, revisions and user input; do not drop
new data to roll back a UI. Restoration is a separate verified recovery operation, not a test step.

## 11. Delivery milestones and exit gates

| Milestone | Deliverable | Exit gate |
| --- | --- | --- |
| **M0 — contracts/readiness** | Authoritative source/mutation inventory, currency/coverage/recurring adapters, legacy inventory approach, lock/version design, schema/API review and benchmark dataset | Resolve section 13 decisions; prove canonical aggregate parity and coverage provenance with isolated fixtures; no personal-data mutation |
| **M1 — calculation foundation** | Production types, injected clock, monthly/fortnightly/bridge schedules, allocations, reserves, contribution/goal rules and parity vectors | Exact-cent/date property tests; no fixture imports or alternate money semantics |
| **M2 — durable boundary** | Additive schema, RLS/grants, versioned drafts/revisions, read snapshots, atomic/idempotent commands and undo | Isolated migrations, owner/tenant tests, concurrent writes, duplicate retries, invalid IDs and failure rollback pass |
| **M3 — manual vertical slice** | Real `/budget`, manual setup/save/reload, Overview/My plan, complete actuals and explicit account scope | No-bank/zero-income/partial data works; aggregates independent of detail pagination; private feature exposure only |
| **M4 — bills/reserves/goals** | Dated recurring adapter/proposals, reserve funding, source matching, purchase/refund lifecycle, contribution evidence, reallocation/limits | Mixed-account reconciliation, single-claim funding, parent/child sums and planned/confirmed distinction pass |
| **M5 — lifecycle/control** | Reviews, real signed carry, source recomputation, effective scope/policies, frequency change and bridge/full templates, pause/resume | Late imports preserve reviewed history; no lost/overlapping windows; transition and guarded undo concurrency pass |
| **M6 — assisted setup** | Production gated suggestions, editable provenance, one bounded what-if, manual conversion and final activation | SG01–SG08 technical checks pass with real source adapters; no ghost writes/AI dependency/unknown-as-zero |
| **M7 — release verification** | Full traceability, usability/a11y, cross-feature regression, performance, migration rehearsal and staged rollout | All AC/SG technical checks, human checks and section 14 release gates signed off |

Milestones are dependency-ordered engineering slices, not separate public releases or reductions of
scope. Both frequencies exist from M1 even if initial UI integration exercises one fixture first.
Preserve the standalone concept as a design reference during build. No new feature exploration is
needed unless a dependency requires an explicit owner-visible scope decision.

## 12. Acceptance/test traceability

U = pure/unit/property/parity tests; I = isolated SQL/Edge integration/concurrency; B = authenticated
browser journeys; H = human comprehension/accessibility. Each group lists the exact covered IDs.
Expand to test case names as implementation lands; an entry here is planned coverage, not a pass.

| Requirements | Proof and milestone |
| --- | --- |
| AC01, AC03, AC04, AC34, AC35 | U/I/B manual activation, draft resume, estimates, mid-period known activity and explicit gaps — M1–M3 |
| AC02 | U/I/B exact history dates, excluded incomplete windows and no pre-activation write — M6 |
| AC05, AC06, AC07 | U/I/B partition sums, signed child overage, reallocation and limit removal/carry preservation — M1/M4 |
| AC08, AC09, AC16, AC17, AC31 | U/I/B canonical ledger effects: cards/repayments, splits, contra-expense, unassigned credits and total identity — M0/M3/M4 |
| AC10, AC11, AC20, AC21 | U/I/B occurrence counts/matches, proposed recurring updates, stated forecast method and unavailable states — M4/M6 |
| AC12, AC13, AC14, AC15 | U/I/B exact reserve usage/deadlines, negative carry and rollover/archive dispositions — M1/M4/M5 |
| AC18, AC19 | U/I/B one contribution claim, no phantom goal funding/Planning mutation — M4 |
| AC22, AC23, AC24 | U/I/B acknowledgement semantics, future overrides and late-source changed-review chain — M5 |
| AC25, AC26, AC27 | I/B owner and cross-tenant denial, direct-write denial, atomic failure/guarded undo, currency and cap-independent totals — M0/M2/M7 |
| AC28 | U/I dates/timezones/leap years, zero/negative/refund-heavy money cases — M1/M5 |
| AC29, AC32 | B/H keyboard/touch and focus; I/B partial/timeout/conflict/retry outcomes — M2/M3/M7 |
| AC30, AC33 | B/H explain expected/received/remaining and an adjustment; verify labels make no cash-affordability promise — M3/M7 |
| AC36, AC37, AC38, AC39, AC40 | U/I/B/H named amount/date goal, exactly one allocation, drafts/paused/zero, funding evidence and controlled adjustment/undo — M4/M7 |
| AC41, AC42, AC43 | U/I/B purchase/refund partial lifecycle, no auto-refill/extra expense, booking-date timing and no cash guarantee — M4 |
| AC44, AC45, AC46 | U/I/B true 14-day windows across date boundaries, actual bill/pay dates and goal schedules — M1/M4/M5 |
| AC47, AC48, AC49 | U/I/B/H atomic frequency changes, bridge and full template, preserved history, phone controls and comparable calendar windows — M5/M7 |
| SG01, SG02, SG03, SG04 | U/I/B approved gates, median/coverage/integrity/recency/variability, canonical source parity — M0/M6 |
| SG05, SG06 | U/I/B one authorized source/destination, protected values and conditional/horizon/deadline outcomes — M6 |
| SG07 | I/B preserve edits, reject stale source, apply draft only, explicit activation and manual conversion — M2/M6 |
| SG08, SG09 | B/H labelled keyboard/phone/theme/error states; beginner explains evidence/what-if/no movement — M6/M7 |

Add adversarial cases: two tabs match the same funding amount; source split changes during a preview;
same operation ID races with itself/different payload; delete/reimport after purchase matching;
refund crossing a frequency boundary; a funding gap during a bridge; zero-transaction but covered
account; complete totals beyond default PostgREST page size; changed historical scope; late network
response after dialog close; invalid/foreign custom subcategory and failed second reallocation leg.

Current concept evidence (361 unit tests across the app, 24 fictional browser journeys, focused
TypeScript/build) is reference coverage only. It neither replaces these production tests nor proves
independent usability. Track and resolve the existing app-wide TypeScript metric mismatch before
calling a production typecheck green; focused concept success is not full-app success.

## 13. M0 decisions and readiness register

These are engineering investigations, not invitations to expand product scope.

| ID | Decision/proof required | Default/fallback |
| --- | --- | --- |
| D01 | Exact SQL source/split/effective-kind semantics and date/account indexes | Reuse canonical classification; no frontend cap workaround or category-name shortcuts |
| D02 | Which ingestion/provider records prove coverage, and how revocation works | Explicit user-confirmed ranges with provenance; suggestions unavailable where still incomplete |
| D03 | Server recurring detection/identity and complete evidence query | Confirm manual bill schedules where detection cannot be verified; do not blindly accept client output |
| D04 | Source version invalidation and lock ordering across all write paths | Reliable transactional version/fingerprint + source-row revalidation; no stale-query timestamps as a substitute |
| D05 | Final normalized schema and money/API bounds; legacy consumers and counts | Additive model, explicit audit/revisions and preserved legacy rows; never infer old period/reserve meaning |
| D06 | Clock/timezone migration and transition/full-template contracts | Future boundary changes, historical timezone preserved and one explicit alignment bridge |
| D07 | Complete snapshot and carry-chain performance on realistic data | Benchmark first; optimize SQL/indexes before introducing cache/job infrastructure |
| D08 | Draft tenancy, lost-response outcome retention and feature-exposure mechanism | Durable owner draft/request outcome; route flag controls exposure only, never authority |

M0 output must give query plans/fixture parity, a reviewed schema/API contract and a testable result
for each decision. If a fallback cannot meet a frozen requirement, report that gap rather than
silently shipping a reduced feature. Final migration DDL is reviewed after these outputs exist.

## 14. Release/operational gates

- Unit/property and SQL parity suites pass; focused **and** full production typechecks/build pass
  (or a separately approved, documented unrelated baseline failure is explicitly retained).
- All new tables/views/functions pass RLS/grant/tenant and owner-only mutation tests. Audit operations
  are complete; no merchant descriptions/goal names/raw financial payloads enter telemetry.
- Authenticated browser journeys run against a uniquely identified disposable stack. Follow
  `SYSTEM_INTEGRITY.md`; do not repoint golden tests at the personal database or weaken guards.
- Measure complete-history read/suggestion latency and query plans against realistic large fixtures;
  set recorded request/line/detail caps and latency budgets in M0, then test them at M7. No claimed
  performance guarantee without a measured environment. Rate-limit costly reads and writes.
- Manual/no-bank path, both frequencies, source errors, unknown outcomes and recovery work on desktop
  and phone. Screen-reader, keyboard, contrast/zoom and reduced-motion checks include human review.
- Owner acceptance and independent beginner walkthroughs address AC30/AC33/SG09. Concept approval
  does not substitute for those outcomes. Record issues/decisions, not a fabricated usability score.
- Rehearse additive migration, pre/post row-count and aggregate checks, backup catalog/isolated restore,
  exposure rollback and durable-data preservation. No production migration until separately authorized.
- Expose privately first, verify snapshots/matches/carry with observed inputs, then enable wider V1
  only after all required gates pass. Feature disable must retain plans/history/drafts and prevent
  accidental new writes; record aggregate failure/latency/conflict metrics without sensitive content.

## 15. Immediate next step

M0–M5 engineering implementation and verification are recorded in the phase records. M5 closeout
is complete in [[BUDGET_M5_IMPACT_PREPARATION]]; no M5 engineering item remains on this plan.
The next planned implementation is **M6 — assisted setup**: production suggestions using the
approved history/data-quality gates, editable provenance, one bounded what-if, manual conversion
and explicit final activation. Start M6 when requested by the owner.

Preserve the distinction between planned allocations, canonical activity and verified per-line/
funding evidence. The concept remains presentation reference. M7 retains human comprehension and
accessibility, broader hosted performance, backup/restore and persistent migration rehearsal, and
staged rollout. Personal migrations require their own approval and backup/preflight. M5 engineering
completion does not enable Budget or authorise deployment.
