---
aliases:
  - Halcyon current status
  - Halcyon resume point
tags:
  - halcyon
  - projects/fin-app
  - finance
type: handoff
status: current
project: Halcyon
updated: 2026-10-22
related:
  - "[[README]]"
  - "[[INDEX]]"
  - "[[SYSTEM_INTEGRITY]]"
  - "[[TAXONOMY_AND_LEDGER_PLAN]]"
---

# Halcyon — Current status

## Resume here

**M5 engineering-complete — 22 October 2026.** Migration 90 implements complete, resumable
before/after impact checks and short atomic acceptance for account, rollover and lifecycle controls.
The final broad regression passed **451 isolated SQL/Edge/browser checks across 90 migrations** in
`halcyon-budget-m2-8dce2fa40f254fb0`. The separate strict workload/recovery run passed **145 checks**
in `halcyon-budget-m2-3dd60fe0ec1347a7`, including the ten-year mixed corpus, signed archive release,
exact uncached-calculation parity, Save/Undo and phone/desktop interruption/reload. Fixture cleanup
passed and exact project resources were removed; follow-up label audits found no residual resources.
Budget TypeScript, **511 unit tests/14 existing skips** and production build passed. The known
unrelated full-app projection metric type mismatch/main-chunk warning remain.

No current M5 engineering item remains. Next planned implementation: **M6 assisted setup**, when
requested by the owner. M7 retains independent human/accessibility, broader hosted performance,
backup/restore/persistent migration rehearsal and rollout. See [[BUDGET_M5_IMPACT_PREPARATION]]
and plan 1.16 for implementation, verification and capacity limits. Earlier failures below are
historical. No personal database migration, feature enablement or rollout occurred.

**Prior M5 impact-scale checkpoint — 22 October 2026:** Migrations 84–89 remove repeated source-
bearing carry prefixes, unused evidence hashing in balance aggregates, repeated whole-ledger claim
proofs and per-transaction/per-line rescans. The dense ten-year fixture (120 periods / 120,000
expenses) now completes its full preview, accepted save, disabled receipt replay and guarded Undo
under the unchanged eight-second SQL bound. No financial constraint, evidence validity or exact
preview acceptance was relaxed; the interface is unchanged.

**At that checkpoint M5 was not closed.** The wider three-account / twelve-line / 240-split-child / 240-linked-claim
fixture matches the original resolver/raw financial kernels and has a correct complete SQL and
authenticated API preview, but its accepted save still times out during final validation.
Final strict run: dense preview/save/Undo **3,927 / 5,802 / 2,136 ms**; mixed preview **7,098 ms**,
save **8,068 ms, timed out**. The timeout preserved exact plan/source versions, dated scope,
operation/policy counts and both derived-cache hashes; the admission test deliberately remains red.
The strict mixed performance gate stays red. Next: durable/version-bound impact preparation with
short atomic acceptance/commit, not a longer timeout or incomplete money. See
[[BUDGET_M5_HISTORY_PERFORMANCE]] for current verification and the precise remaining boundary.
Full lifecycle regression: **432 isolated SQL/Edge/browser checks across 89 migrations**;
**503 unit tests passed/14 existing skips; focused Budget TypeScript and build passed**. Responsive
journeys, fixture counts and scoped project cleanup passed. The known unrelated full-app projection
metric type mismatch and main-chunk build warning remain.
M6/M7 are separate; no personal database reads/migrations, feature enablement or rollout occurred.

**Prior M5 long-history checkpoint — 22 October 2026:** Protected, resumable complete-workspace
preparation and fresh-projection base-fact reuse are implemented in migrations 82–83. Progress is
count-only until the complete compatible prefix is ready; reloads resume committed batches, stale
source/plan/role/method/expired facts cannot be reused, and edits remain disabled during preparation.
Plain-language progress and continuation use the existing shared operation components.

The full lifecycle suite passed **432 isolated SQL/Edge/browser checks across 83 migrations**;
the focused five-/ten-year suite passed **55 checks** (separate, non-additive run totals);
**503 unit tests passed/14 existing skips; focused Budget TypeScript and build passed**. Prepared
real-API reads measured 133 ms for 60 periods/18,000 expenses and 265 ms for 120 periods/120,000
expenses. Both responsive interruption/reload journeys and exact-project cleanup passed.
The known unrelated full-app projection metric mismatch/main-chunk warning remain.
See [[BUDGET_M5_HISTORY_PERFORMANCE]] for raw-reference,
benchmark-environment and timing-outlier qualifications.

**At that checkpoint:** the ten-year financial account-scope impact preview still hit the 8-second bound.
It fails closed; workspace resumption does not authorize an incomplete financial preview/commit.
Next: resumable/version-bound impact evaluation with atomic acceptance/commit, or proven further
complete-chain optimization, plus broader mixed claim/split/line scale admission. M6/M7 remain open.
No personal stack reads/migrations, feature enablement or rollout were performed.

**Prior M5 temporal integration checkpoint — 22 October 2026:** Combined monthly→fortnightly
and fortnightly→monthly bridge/full chains now exercise dated account scope, signed category/Other
carry, independent monthly goal cadence and explicit transition/continuing overrides. Cross-period
purchase/refund corrections and deletion recompute later balances while preserving reviewed facts;
goal pause/Undo preserves the current allowance and restores the saved continuing override.
Migration 81 fixes historical-period dropdowns omitting later saved budgets after reload, without
changing financial calculations. Authenticated 1440px/390px journeys revisit/reload all three periods.

Verified: **432 full isolated checks across 81 migrations; 44 focused temporal checks; 496 unit
tests passed/14 existing skips; focused Budget TypeScript/build passed**. Responsive captures and
exact-project fixture/resource cleanup were verified. Existing
unrelated full-app projection metric mismatch/main-chunk warning remain.
See [[BUDGET_M5_TEMPORAL_INTEGRATION]]. **Next M5 gate:** realistic complete-chain performance/
query-plan measurements and safe resumable evaluation; no truncation or invented balances.
M6/M7, independent comprehension/accessibility and rollout gates remain. No personal stack reads,
migrations or feature enablement were performed.

**Prior M5 attention checkpoint — 22 October 2026:** The counted in-page queue and owner
acknowledgement/snooze/show-again controls are implemented. Reminder preferences have their own
version and append-only history; they never change signed money, financial plan versions or pending
frequency intent. Gaps remain visible after review, and material worsening, due-date changes or
relevant evidence reinterpretation bring a check back. Unrelated source bumps do not repeatedly nag.
Financial correction actions reuse the plan editor, actual allowance inspection, Ledger and accounts.

Verified: **388 full isolated SQL/Edge/browser checks across 80 migrations; 40 focused follow-up
checks; 496 unit tests passed/14 existing skips; focused Budget TypeScript/build passed**. Responsive
captures and exact-project cleanup were verified. The known unrelated full-app projection metric
mismatch and main-chunk warning remain. See [[BUDGET_M5_ATTENTION_CONTROLS]].
Temporal/frequency/policy/goal integration is continued in the newer checkpoint above; realistic
complete-chain performance/resumption remains. Forecast/payday/detector-dependent queue reasons await real production
inputs/adapters; M6/M7 gates remain. No personal query/migration, feature enablement or rollout.

**Prior M5 budget/line lifecycle checkpoint — 21 October 2026:** Budget pause/resume and
bill/reserve/goal/transfer archive controls are implemented. Pausing blocks new periods/frequency
changes without hiding history or stopping real obligations. Resume reviews uncovered exact windows,
known spending and reserve effects with explicit carry acceptance; it creates no gap allocations.
Archive preserves current allocations/history, zeroes only that line's future refill and explicitly
retains or moves its signed reserve to Other/another usable reserve. Shortfalls, later corrections,
funding distinctions and guarded append-only Undo remain intact.

Verified: **360 isolated SQL/Edge/browser checks across 79 migrations; 493 unit tests passed/14
existing skips; focused Budget TypeScript/build passed**, 390px/1440px captures inspected and
disposable cleanup verified. Full-app TypeScript retains the known unrelated projection metric
mismatch; the existing chunk warning remains. See [[BUDGET_M5_BUDGET_LINE_CONTROLS]].
Attention controls outstanding at that checkpoint are closed by the newer attention record above.
Wider integration and performance/resumption remain open. No personal database query/migration or
feature flag enablement occurred.

**Prior M5 category checkpoint — 21 October 2026:** Category/Other signed rollover and explicit
retained/transferred/released carry disposition are implemented. Prospective next-boundary controls
cover individual/parent rules, next-category amounts/removal, separate protected balances and
server-owned removed-category labels. Full-chain before/after previews, fresh hashes, atomic
save/compatible undo and dated period/frequency adapters preserve history and new-resource identities.
Late shortfalls reduce budget room without silently consuming protected money or becoming savings.

Verified: **322 isolated SQL/Edge/browser checks across 78 migrations; 490 unit tests passed/14
existing skips; focused Budget TypeScript/build passed**, responsive captures and disposable cleanup
verified. Full-app TypeScript retains only the known unrelated projection metric mismatch; the
existing main-chunk warning remains. See [BUDGET_M5_CATEGORY_ROLLOVER.md](BUDGET_M5_CATEGORY_ROLLOVER.md).
The general line archive/disposition and budget pause/resume work outstanding at that checkpoint
is closed by the newer controls continuation above. Attention, wider temporal/goal integration and
realistic performance/resumption remain open. No personal query/migration or flag enablement occurred.

**Prior M5 account-policy checkpoint — 21 October 2026:** Effective-dated **account scope** is implemented
with three named date scopes, authoritative before/after effects across saved history and the next
date window, fresh preview validation, atomic save and guarded undo. Migration 77 adds immutable
account policy history and non-overlapping membership windows. Allocations, source transactions and
review snapshots are preserved; unavailable or incomplete results remain qualified.

Verification: **284 isolated checks across 77 migrations; 486 unit tests passed/14 existing skips;
focused Budget TypeScript/build passed**, 390px/1440px captures inspected and disposable cleanup
verified. Existing unrelated full-app metric mismatch/chunk warning remain. Implementation record:
[BUDGET_M5_ACCOUNT_POLICIES.md](BUDGET_M5_ACCOUNT_POLICIES.md). Category/Other signed rollover and
carry disposition are continued in the newer checkpoint above; general line archive remains. M5 remains
open for that work, pause/archive/attention, frequency integration and large-history performance/
resumption. No personal stack migration, query, feature flag enablement or M6 advancement.

**Prior M5 frequency continuation — 21 October 2026:** Durable guided monthly/fortnightly changes are now
implemented: one logical pending intent, separately reviewed first/bridge and full templates,
preserved category amounts/capacity checks, explicit gap/incomplete-data acceptance, boundary-only
application, cancellation/guarded undo and historical financial-write protection. Migration 76 adds
append-only frequency event history. Existing reserves, matches, dates and reviews survive;
applying a change creates durable period history rather than deleting/rewriting a period on undo.
Verified: **253 isolated SQL/Edge/browser checks across 76 migrations; 482 unit tests passed/14
existing skips; focused Budget TypeScript/build passed**, responsive captures inspected and
disposable cleanup verified. The unrelated full-app metric mismatch and existing chunk warning remain.
See [BUDGET_M5_LIFECYCLE_CONTROL.md](BUDGET_M5_LIFECYCLE_CONTROL.md) for final verification and
remaining effective scope/category/rollover, transition/policy integration, pause/archive/attention
and large-history performance/resumption gates. **M5 remains open; M6 has not started.** Budget
flags remain off by default and the personal stack has not been queried or migrated.

**Prior M5 foundation checkpoint — 21 October 2026:** Its first slice adds
saved-period navigation/opening, immutable completed-period reviews, signed everyday carry into
Other, late-source carry-chain recomputation and guarded review undo. See
[BUDGET_M5_LIFECYCLE_CONTROL.md](BUDGET_M5_LIFECYCLE_CONTROL.md) for verification and remaining
category/scope policies, frequency transitions, pause/archive/attention and full-chain performance/
resumption gates. Verified first slice: **223 isolated checks across 75 migrations, 475 unit tests
passed/14 existing skips, focused Budget TypeScript/build passed**; real desktop/phone journeys and
disposable cleanup verified. M5 is not closed and M6 has not started. No personal migration or flag enablement.

**Prior Budget checkpoint — 21 October 2026: M4 is engineering-complete.** The authenticated private
workspace supports dated schedules, targets, separate funding evidence, purchase/refund matches,
balanced allocation/reserve movements, category scopes and compatible undo after reload. The remaining
server recurring-history adapter, confirmed investment funding proof, featured-goal control and wider
desktop/tablet/phone interaction gates are now closed: **187 isolated SQL/Edge/browser checks across
73 migrations; 470 unit tests passed/14 existing skips; focused Budget TypeScript/build passed.** See
[BUDGET_M4_BILLS_RESERVES_GOALS.md](BUDGET_M4_BILLS_RESERVES_GOALS.md) for the exact boundary and
acceptance traceability; M5 was subsequently authorized as recorded above. No personal Budget
migration or flag enablement has occurred. The existing unrelated full-app TypeScript metric mismatch
and later M7 human/performance/backup/rollout gates remain open. Earlier
dated phase paragraphs below are historical checkpoints, not the current next step.

Halcyon is a working personal-finance SPA: Vite/React/TypeScript on the client,
with Supabase Auth, Postgres/RLS and validated Deno Edge Functions on the backend.
The earlier implementation run ended **2026-08-17**; work resumed with the
selected categorisation-review slice on **2026-09-17**. Gate 1 isolated-stack
validation completed on **2026-09-20**, followed by representative-CSV Gate 2
validation on **2026-09-21** and safe forward migration of the personal local
stack on **2026-09-26**. Real statement-import testing resumed on
**2026-09-30**. A full isolated golden-pass browser harness was added and passed
on **2026-10-01**. Durable recurring/planning work and the application-wide
legibility pass followed on 2026-10-13–15. This document is the concise current
handoff as at **2026-10-21**.

The application has moved well beyond the original thin MVP. Its major completed
capabilities are:

- authenticated, tenant-scoped accounts and a real-data dashboard, income,
  expenses, ingestion, settings and ledger experience;
- reviewed CSV ingestion with saved mappings, atomic batches, durable history,
  deduplication and merchant classification;
- direct read-only Up Bank connection, resumable sync, historical CSV cutover
  protection and bank-transfer review;
- a 13-category taxonomy with stable identities, user rules, custom
  subcategories, confidence policy, classification attributes and exact-cent
  transaction splits;
- a cross-page Ledger workflow with capped bulk correction, impact previews,
  guarded undo and browser-level accessibility coverage;
- an implemented selected-row “Review with categorisation engine” workflow that produces
  fresh non-mutating AI suggestions, protects manual/user-rule/bank/system
  decisions, applies individually accepted heterogeneous results atomically,
  rejects stale previews and provides grouped guarded undo (unit/type/build plus
  isolated migration, Edge Function, live-provider and rendered-browser Gate 1
  verification plus representative-CSV Gate 2 quality validation covered the original workflow).
  The review now also shows account, amount and original description, defaults to suggested changes
  with a clear empty state when none are available, supports status/search filters
  and locally staged category choices, and can hand a transaction to the full Ledger editor. Opening
  that editor excludes the row from the current preview; a saved editor change invalidates the whole
  preview before further apply. Active tenant custom subcategories are validated by the Edge Function;
  the existing atomic protection and guarded-undo boundary is unchanged. On 2026-10-17 the expanded
  workflow passed 15 deterministic isolated-stack API checks and two browser interaction tests
  (the browser previews are mocked), as well as the unit suite and production build. The suggested
  default and empty state were verified on 2026-10-18 with three isolated browser tests; and
- the Ledger uses the approved quiet toolbar: the counted Needs attention view replaces the
  header statistic; “Review categories” opens focused scope and batch setup, and “Continue review”
  exposes actual preview progress. Other lenses remain under More views, and selected-row review
  stays beside selection controls. Batches retain stable session membership, server protections,
  explicit apply/undo and next-batch warnings. The development-only concept page compares the
  quiet toolbar with a review strip and sidebar using fictional data;
  verification: 342 unit tests passed (14 skipped), seven browser regressions passed using
  in-memory fixtures, production build and browser-test typecheck passed. Desktop/phone review
  checked layout and overflow; the separate full app typecheck still reports the existing
  StrategicProjections metric-type mismatch at line 252;
- Vanguard managed-investment activity import, NAV valuation, performance/tax
  awareness and bank-to-investment cash-link review;
- recurring commitment overlays with stop/resume, guarded undo, in-app reminder
  states and bounded multi-year annual cadence detection; and
- durable, account-scoped financial planning goals, scenarios, planned events,
  month-by-month explainability, completed-month plan review and auditable
  rebaselining.

The latest application-wide `npx tsc --noEmit` check (Budget M2, 20 October) reports the existing
`PlanningMetric`/`ProjectionMetric` mismatch in `StrategicProjections.tsx:252`. The previously
reported `dashboard-insight` route-state comparison is not present in this run's diagnostics.
The separate browser-test typecheck passed in the earlier categorisation work; it was not rerun
for the pure Budget calculation layer. No unrelated type fixes were made in M1.

The detailed architectural map is [INDEX.md](INDEX.md). The original decision and
implementation diary is [CONTEXT.md](CONTEXT.md); it is useful background but is
not the live backlog.

**Budget discovery — 2026-10-19:** The owner accepted the research direction and requested a
feature/behaviour specification before UI/UX planning. The proposed baseline is
[BUDGET_FEATURE_SPEC.md](BUDGET_FEATURE_SPEC.md): monthly fixed/non-monthly/Flex budgeting,
protected contributions, optional category partitions, explicit reallocation/rollover controls,
source reconciliation and review history. It resolves the initial product recommendations and
records acceptance criteria. The initial UI/UX proposal is now in
[BUDGET_UI_UX_WIREFRAMES.md](BUDGET_UI_UX_WIREFRAMES.md), comparing three page structures and
recommending a Monthly workspace with contextual allocation previews, guided setup/review and
responsive inspection. Production integration has not started; the standalone concept is available below. A spendable-now cash
estimate is deferred until balance, pending and liability reconciliation can support it.
The owner subsequently agreed beginner-friendly language, guided setup, editable evidence-based
suggestions and help/estimate/defer input paths. These are now requirements in both Budget docs and
[BUDGET_GUIDANCE_AND_GOALS.md](BUDGET_GUIDANCE_AND_GOALS.md). The owner has now also accepted
the **Save for something** experience for named purchases/experiences using existing set-aside
rules. It is required V1 scope as B10 in feature specification v1.5, with acceptance criteria
AC36–AC43 and guided creation, plan-impact previews, honest progress, adjustment and purchase
completion. The fictional-data Monthly workspace concept is now implemented at
`/budget-concept.html`, including guided setup/draft resume, a snowboard goal with date/amount
planning, category adjustment/undo, goal changes and purchase simulation, scoped current/future
plan edits, and phone/dark states. It has no auth/data providers or real-account writes. The owner
review walkthrough and prototype boundaries are in [BUDGET_CONCEPT_REVIEW.md](BUDGET_CONCEPT_REVIEW.md).
Validation includes the 361-passing unit suite (14 skips), focused concept TypeScript, production
build, and browser-only journey/responsive/keyboard checks. The next stage is owner concept review,
not production rollout.

**Budget period decision — 2026-10-19:** The owner approved monthly and fortnightly budgets for
V1. Feature spec **v1.3 section 3.1 / AC44–AC49** defines actual anchored 14-day periods, dated
income/bills, per-period goal contributions and safe future-effective frequency changes, including
an explicitly reviewed transition period when aligning back to calendar months. Weekly/custom
periods remain later. The concept now includes frequency setup, **Overview** naming, a true
fortnightly example and guided switch previews on desktop and phone, including the short bridge,
goal/date effects, shortfall confirmation, saved future preview and cancellation/undo. The
browser-only suite has 24 passing cases. These remain local fictional previews; production period
closing, full templates and source reconciliation are not built. Next step: owner frequency review.
Longer-term progress is accepted backlog item **BG-L01 — Your progress**, recorded in feature spec
section 15.1, deferred until after Budget V1 and not scheduled. The concept completion and
production-readiness checklist is now in [BUDGET_CONCEPT_REVIEW.md](BUDGET_CONCEPT_REVIEW.md).

**Budget comprehension pass — 2026-10-20:** Implemented the owner-approved final refinement in
feature spec v1.4 section 4.3: headline meanings, separate confirmed/planned goal tracks, optional
five-step guide with setup-draft return, setup-complete guidance, grouped frequency review and a
worked period-end choice with persistence/undo and changed-source qualification. Carry choices
are labelled previews and do not alter the current budget. Desktop/phone checks pass; next step
is owner review and beginner comprehension walkthroughs, then production architecture/planning.
Automated checks do not establish human understanding. BG-L01 stays deferred.

**Budget suggestions — 2026-10-20:** The owner approved
[BUDGET_SUGGESTIONS_PROPOSAL.md](BUDGET_SUGGESTIONS_PROPOSAL.md); its rules/gates now supplement
feature spec v1.5. The concept implements **Try setup → Help me build a budget**, with a deterministic
history-derived draft, manual fallback, recent-change confirmation, explicit funding gaps and one
optional user-chosen goal trade-off. Current/future scope, setup-only apply, source fingerprints,
stale-review/manual conversion and goal intent preservation are covered. Outer Suggestions fixtures
are review-only controls. No AI, new page or real data integration. Validation: 361 unit tests
passed (14 skips), 24 browser journeys, focused TypeScript and build. Next: owner assisted-flow
review (now complete), independent comprehension checks and production architecture/implementation planning.

**Budget concept approval and scope freeze — 2026-10-20:** The owner explicitly approved recording
concept approval, freezing scope and preparing the technical plan. **BUDGET-V1-2026-10-20** in
[BUDGET_SCOPE_BASELINE.md](BUDGET_SCOPE_BASELINE.md) freezes feature spec v1.5 + approved S1
assisted setup, while keeping BG-L01/AI coaching and the other Later capabilities out of V1.
[BUDGET_IMPLEMENTATION_PLAN.md](BUDGET_IMPLEMENTATION_PLAN.md) now defines M0–M7, proposed
records/APIs, canonical SQL/source/coverage contracts, security/revision/undo semantics, responsive
handoff, safe migration/rollback and complete AC01–AC49 / SG01–SG09 test mapping. Status:
**concept approved; technical plan prepared; production implementation not started**. Next work,
when requested: M0 source/readiness proofs and schema/API review, not immediate live migration or
copying the fixture page into the app. This documentation task made no code/schema/data changes.

**Budget M0 contracts/proofs — 2026-10-20:** The owner authorized the first phase of the technical
plan. The M0 contract/readiness stage is complete in
[BUDGET_M0_CONTRACTS.md](BUDGET_M0_CONTRACTS.md): canonical split/effective-kind SQL semantics,
explicit coverage provenance, server recurring/confirmation contract, complete source mutation
inventory, tenant revision-gate + MVCC revalidation order, normalized storage/API/undo/draft
contracts, money/date bounds, legacy preservation and private exposure controls. The reproducible
networkless PostgreSQL experiment passed 15 checks, including 1,008 parity combinations, coverage
gaps/revocation/zero activity, a complete 100k-row total and real two-session gate ordering.
A separate uniquely generated Supabase project replayed all 64 migrations and passed full-schema
UUID/bytea/taxonomy/10k aggregate, real split-RPC and existing invoker/RLS source checks. Its fictional
transaction was rolled back and only its own project-labelled test resources were removed.
The existing classification/allocation/recurring suites passed 27 tests. These are source-readiness
proofs, not new Budget RLS, installed invalidation or end-to-end release evidence; mandatory M2–M7
gates remain unpassed. **Next: M1 calculation foundation**, not live migration. No personal data,
production Budget schema/endpoint, authenticated route or concept behavior was changed.

**Budget M1 calculation foundation — 2026-10-20:** Implemented the pure `app/src/lib/budget/`
modules and byte-identical Deno-safe mirror under `supabase/functions/_shared/budget/`. Includes
checked exact-cent money, strict dates/injected timezone clock, monthly/fortnightly/bridge windows,
real contribution dates, new-resource/allocation reconciliation, Flex partitions/removal,
conserved spending-line moves, signed reserve/carry, separate contribution evidence and conditional
purchase-goal funding/timing. [BUDGET_M1_FOUNDATION.md](BUDGET_M1_FOUNDATION.md) records contracts,
limitations and verification: 61 focused tests, 422 unit tests passed/14 existing skips, focused
client/server TypeScript and production build passed, native Node server smoke passed. Deno CLI
is unavailable; native Deno runtime is not claimed. Full app typecheck still reports only the
documented StrategicProjections metric mismatch at line 252. No UI/database changes or live
financial data access in M1. **Next: M2 durable boundary**, with isolated migrations and
owner/tenant/concurrency/duplicate-request/undo proofs; no personal migration authorized.

**Budget M2 durable boundary — 2026-10-20:** Implemented three additive migrations, 11 RLS-protected
tables, owner-only `manage-budget`, viewer-capable `query-budget`, SQL ownership/revision checks,
resumable immutable draft revisions, atomic activation and period/template revisions, durable
idempotent request receipts, guarded compensating undo, source invalidation and complete canonical
actuals/coverage diagnostics. `BUDGET_V1_ENABLED` defaults off and disabling new writes preserves
reads and receipt recovery. Live source account references use ownership triggers plus audited
gate-protected invalidation, avoiding implicit source-FK lock reversal during deletion. The legacy
`budgets` table and concept are unchanged. See
[BUDGET_M2_DURABLE_BOUNDARY.md](BUDGET_M2_DURABLE_BOUNDARY.md) for the isolated integration evidence,
supported commands and remaining workflow/release gates. Final validation: **94 integration checks
passed** across the complete 67-migration chain, including actual Edge JWT/role checks, real
import/undo/classification/split/transfer invalidation, competing writes and source/account deletion,
immutable intent/history, request recovery with writes disabled, date-bounded coverage revocation
and no repeated opening cash in future templates. 422 unit tests passed/14 existing skips; focused
Budget TypeScript and production build passed. Full-app typecheck retains the existing
StrategicProjections metric mismatch. All generated test resources were cleaned up.
**No personal migration or live Budget
route was added. Next: M3 manual vertical slice**, still privately exposed and without pretending
later matching, carry, review or suggestion workflows are complete.

**Budget M3 manual vertical slice — 2026-10-21:** Added authenticated `/budget` with private
navigation after Expenses, monthly/anchored-fortnightly manual setup, optional real AUD account
scope, no-bank/zero-income planning, durable setup save/resume/review/activation, Overview/My plan,
explicit period-only/period-and-future amounts, separate continuing gaps, scoped complete SQL totals
and truthful partial/unavailable states. `query-budget` adds a strict RLS-backed `workspace` read;
no new schema/migration was needed. `BudgetContext` owns tenant/user/role-separated state and exact
interrupted-command checkpoints with durable outcome lookup/replay. Flags stay off by default;
direct authenticated read/recovery survives hidden navigation and paused server writes.
Validation: **109 combined disposable Edge/SQL/browser checks passed**, all 67 migrations,
**447 unit tests passed/14 existing skips**, focused workspace TypeScript and production build passed.
Desktop/light and phone/dark captures were inspected; a genuine viewer tablet flow passed. The
existing full-app StrategicProjections type mismatch remains. The final generated project and all
its labelled resources were removed; personal auth/data/config were untouched. See
[BUDGET_M3_MANUAL_WORKSPACE.md](BUDGET_M3_MANUAL_WORKSPACE.md) for handoff, privacy and release
limitations. **Next: M4 bills/reserves/goals**, not public release or personal migration.

**Budget M4 manual core — 2026-10-21:** Implemented three more additive migrations (70 total) and
six protected append-only tables; strict item/match/manual-confirmation/reversal/limits/movement
commands extend the durable owner/idempotency/source-gate boundary. Goal reserves and recorded
funding remain separate; explicit purchases count once, linked refunds restore once, completion
stops future refill, and pause preserves the reserve. Calendar-date occurrences drive bill and
contribution amounts, including five-payment months. Source identities survive deletion and changed
evidence no longer counts as verified. The production page adds responsive, portalled tasks with
dirty/focus/error handling, source pagination, category/subcategory scopes and explicit release/undo.
Validation: **154 combined isolated SQL/Edge/browser checks passed across all 70 migrations**;
**459 unit tests passed/14 skips**, focused workspace TypeScript and production build passed.
Existing full-app StrategicProjections type mismatch remains. All disposable fixtures/resources
were cleaned up. No personal auth/data/config migration, reset or flag enablement occurred.
**Next: finish M4**, specifically complete-evidence recurring-detector extraction, confirmed
bank-to-investment funding, broader rendered interaction/acceptance coverage and remaining B10
presentation controls. Managed-recurring proposals/manual bill confirmation are implemented fallback,
not proof of a server history detector. Do not call M4 complete or advance to M5 prematurely.

## Important operational state

The default local Supabase database was reset during validation in August. The
owner has since recreated the account through normal sign-up, and a verified
custom-format backup captured a clean zero-row baseline. On 2026-09-26 it contained one user/profile,
one tenant/member, three accounts and zero transactions. A pre-migration backup
was catalog-verified at
`backups/halcyon-pre-categorization-migrations-20260926.dump` (SHA-256
`4da3ab92f986fd7a4d725aa7036b6f842b538ec99b51f8964bb0dd7f87755322`), then
the Gate 1/2 migrations `20260917000000` and `20260921000000` were applied with
forward-only `migration up`. Post-migration counts were unchanged. Do not run
reset-based validation or use this database for destructive test fixtures.

Real-data testing has now moved beyond that zero-row checkpoint. On 2026-09-30
the personal stack held 799 transactions from two durable upload batches and
203 suggested transfer links. Attempting to confirm the whole account-pair
group exposed a client/server cap mismatch: the UI selected 203 although the
validated Edge/SQL boundary permits 200 per atomic decision. The request was
rejected before execution and left zero transfer decisions. The client now
selects a deterministic maximum of 200, visibly defers the remainder to the
next action and has an exact 203-item regression. Preserve this imported state;
it is evidence, not a reason to reset.
A post-import custom-format backup was catalog-verified at
`backups/halcyon-post-test-import-20260930.dump` (SHA-256
`93e0b4f5214a4d191c0972bfd34995d40ec394094ae639c3260001d125f01c5c`).

On 2026-10-05, after a fresh restorable backup at
`backups/halcyon-pre-transaction-mutation-policy-20261005.dump` (SHA-256
`59baf2d1d2bfa2e95df318c2fe88cfe16d6fd1fb53af9bac23c69803921051cd`), the
forward-only ingestion migrations `20261004000000` and `20261004010000` were
applied to the personal stack. Identity/account/transaction counts remained
1/9/8,777 and the net ledger total remained 14,526,233 cents. `anon` and
`authenticated` now hold no direct INSERT, UPDATE or DELETE privilege on
`public.transactions`; imports remain available only through the validated
Edge Function/RPC boundary. No fixture data or reset was used.

Before any migration, recovery, live integration test or re-import, read and
follow [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md). In particular, use a positively
identified isolated project for destructive test flows.

## Verified state at the last implementation pass

The August verification passed the unit suite, strict TypeScript check,
production build, live Phase 4/5 checks, database invariants and authenticated
Ledger browser checks. The current suite passes 321 unit tests with 14
environment-dependent skips, frontend and browser-suite
TypeScript checks, and a production build. On 2026-09-20 its migration applied
cleanly to a positively identified disposable Supabase project; the isolated
contract harness passed 13/13 checks, including a real Gemini preview that did
not mutate the transaction or teach the durable merchant cache. Authenticated
rendered validation then covered a mixed bank/AI selection, protection and
impact presentation, keyboard focus wrapping and Escape, atomic apply and
grouped undo. The personal local database was not used or modified.

Gate 2 then reset only that positively identified disposable stack and imported
the then-five-file representative bank CSV corpus through the production staging,
categorisation and atomic-ingestion path: 793 transactions across 167 merchants,
with 137 bank-sourced and 656 AI-sourced rows. The final run left 6 rows needing
review, including 3 unresolved. A cache-bypassing fresh review sampled 676 rows
and returned 618 unchanged, 38 actionable suggestions and 20 protected bank
rows; it made no transaction changes and added no merchant-cache entries. Gate
2 found and fixed two defects: nullable Lifestyle subcategories could derive a
NULL `is_subscription` into a NOT NULL column, and Gemini confidence was not
required by the response schema, causing every answer to fall back to 0.5. The
full migration chain and Gate 2 harness passed after both repairs. The personal
local database remained untouched.

On 2026-10-01 the new `npm run test:golden` harness passed against a fresh,
positively identified disposable Supabase project on dedicated ports. It
replayed every migration, served the real Edge Functions, created both accounts
through the rendered workflow, imported the current 565-row Macquarie
transaction and 234-row Macquarie savings CSVs, exercised live categorisation,
matched 203 transfer links (202 review plus one automatic), confirmed the safe
200-row batch and remaining decisions, generated a fresh categorisation-review
preview, and asserted 799 source rows, two upload batches, final balances and
zero browser errors. It then deleted only its fixture tenant/user and stopped
the disposable stack. The personal database was neither targeted nor modified.

## Sensible next directions

Choose one of these deliberately; they represent different kinds of work rather
than a single mandatory sequence.

1. **Keep the golden pass as the release gate.** Run `npm run test:golden`
   after changes to migrations, ingestion, transfer review or categorisation.
   It now provides the repeatable confidence check that was previously missing.
2. **Classification review workflow — Gates 1 and 2 complete.** The Ledger
   now previews and applies fresh suggestions for an intentional selected set,
   safe unresolved rows, or session-navigable bounded all-eligible batches (each at most
   500 rows), with protected decisions, impact preview, atomic application and
   guarded undo. Its isolated migration/API/browser gate and original five-file,
   793-row representative CSV quality gate are green. Durable/resumable review
   runs that persist after leaving or refreshing remain deliberately deferred unless repeated bounded-batch usage
   justifies a new persistence contract. The contract is in
   [TAXONOMY_AND_LEDGER_PLAN.md](TAXONOMY_AND_LEDGER_PLAN.md).
3. **Ingestion hardening is complete.** A 5,000
   physical-source-row cap fails closed before browser staging, in the Edge
   Function and in atomic SQL; categorisation retains successful ≤300-merchant
   batches when a later request fails and flags only unresolved rows for
   review; imports resolve active global and tenant-custom category pairs
   before entering the atomic write. Isolated golden coverage proves the
   source cap/anchor/zero-write boundary, server batch cap and taxonomy
   isolation. The release gate verifies
   sequential partial-overlap/reconciliation, atomic rollback, connected
   cutover and saved-profile persistence; it also bounds a hung categorisation
   chunk and verifies project-scoped test-container cleanup. A forward
   security migration removes the legacy browser-direct transaction-mutation
   path. The unit/build/browser-typecheck gate, real-AI golden rerun and
   six-file (2,850-row, 605-merchant) Gate 2 corpus are green; the non-mutating
   fresh review made no transaction writes or merchant-cache changes. The
   implementation workflow, phased contract and isolated-test gates are in
   [INGESTION_HARDENING_PLAN.md](INGESTION_HARDENING_PLAN.md); the original
   audit remains in [INGESTION_REVIEW.md](INGESTION_REVIEW.md).
4. **Investment expansion.** Add parcel-level cost base/disposal accounting or
   another provider/instrument adapter. The Vanguard vertical slice is designed
   as an adapter boundary, so this extends an existing model rather than starts
   a parallel one.
5. **Product polish.** Recurring write-back is now live as durable
   account-scoped schedule overlays, stop/resume tracking, guarded undo and
   in-app reminder states. Annual multi-year cadence detection is now live
   through a bounded Annual-only evidence window; two matching renewals remain
   excluded early signals until a third confirms them. Remaining related scope
   is, only if needed, separately designed email/push notification delivery.
6. **Planning experience.** The deterministic Strategic Projections calculator
   is already shipped in Income (cash/net-worth trajectories, dated goals and
   temporary what-if comparisons). Phase 1 of its durable follow-up is now
   live: account-scoped, persisted goals with audited service-only mutation,
   archive/pause state and guarded undo. Phase 2 is now also live: each goal
   gets a durable baseline, with isolated saved comparison scenarios,
   one-off/bounded-monthly planning events, scenario archive/restore/duplicate,
   guarded undo and an opt-in active-recurring forecast input that avoids
   historical double counting. Phase 3 is now live: saved baseline-versus-
   comparison forecasting, monthly opening-to-closing reconciliations,
   accessible table fallback, and clear completeness warnings. A Dashboard
   goal summary remains intentionally deferred. Phase 4 is now live: the
   workspace reconciles the most recent completed, account-scoped month to
   its saved plan and supports a no-write keep-plan choice, an auditable
   baseline version/guarded undo, or a copied actual-review scenario. Its
   bounded delivery plan is
   [PLANNING_EXPERIENCE_PLAN.md](PLANNING_EXPERIENCE_PLAN.md).
7. **Legibility and density — implementation complete; visual sign-off remains.** Shared
   typography, spacing, outcome and data-table primitives are now in use across the planning,
   categorisation, recurring, ingestion, settings and authentication surfaces. Planning charts now
   use the available space of their adjacent decision panel rather than leaving an empty plot area.
   The remaining closure task is an owner-led authenticated visual pass at the documented
   breakpoints and themes, followed by a commit; it is not an unimplemented product feature. The
   completed remediation and ongoing review rules are in
   [LEGIBILITY_AND_DENSITY_PLAN.md](LEGIBILITY_AND_DENSITY_PLAN.md) and
   [DESIGN_REVIEW_CHECKLIST.md](DESIGN_REVIEW_CHECKLIST.md).
8. **Operation status and progress feedback — Phases 0–4 complete.** The app-wide asynchronous
   workflow inventory, truthful-progress/accessibility contract and review-only concept route are
   documented in [OPERATION_STATUS_PLAN.md](OPERATION_STATUS_PLAN.md). Shared primitives now back
   the real Ledger categorisation preview: it shows completed bounded merchant groups, a no-write
   guarantee, accurate close/retry language and inline apply/undo activity without changing review
   or mutation guarantees. CSV staging shows real categorisation-batch counts; atomic imports and
   investment writes remain named indeterminate stages; provider flows show saved page/row
   checkpoints; and transfer queues name bounded refresh work. Routine account, Ledger, planning,
   recurring and identity writes now add a named inline activity cue without changing their
   underlying mutation/undo behavior; selected data tiles use compact loading activity rather than
   bare loading paragraphs. A single signed-in persistent notice reads durable `sync_runs` records
   for provider work that continues safely across navigation, naming the affected account and only
   displaying persisted page/transaction/change checkpoints. Phase 5 verification is in progress:
   status/provider/reduced-motion tests and a delayed no-write/retry Ledger browser regression are
   implemented and typechecked, while execution of that browser test requires a separately
   identified isolated Supabase target. The remaining closure tasks are that isolated run, the
   owner-led authenticated visual review, and the concept-route disposition.

## First commands when resuming

```bash
# From the project root; read SYSTEM_INTEGRITY.md before doing anything destructive.
npx supabase start
npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local

# In another terminal
cd app
npm test
npm run build
npm run test:golden  # self-provisions and tears down an isolated local stack
```

Run browser and live integration harnesses only against an isolated, explicitly
acknowledged target; their safety guard intentionally refuses the personal local
database.
