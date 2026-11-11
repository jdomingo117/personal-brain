# Halcyon Application Index

This index serves as a mental map of the system's architecture and current state for development purposes.

## Budget M7 release decision and candidate — 10 November 2026

The empty Budget workspace in `Budget.tsx` uses the Signal path entry. It shares the guided milestone artwork in `BudgetAssistanceSteps.tsx`, and retains the manual, saved draft and account history actions.

Assisted setup uses `BudgetStartCalendar.tsx` for typed or keyboard-navigable date selection and an inclusive period preview based on the existing Budget date helpers. `BudgetAssistance.tsx` shows eligible AUD accounts in Ledger-style rows with a count and mixed-state Select all.

**Owner-only Budget access.** `requireBudgetAccess` in `supabase/functions/_shared/budgetApi.ts` protects every `query-budget` and `manage-budget` action. The verified caller must match `BUDGET_PILOT_OWNER_USER_ID` and hold the owner role. Migration 107 removes direct client reads on Budget V1 relations. Workspace account names still use RLS, and the private Budget account-scope read is constrained by tenant and plan. The legacy `public.budgets` table keeps its existing grants. See [[BUDGET_OPERATIONS_RUNBOOK]] for configuration and [[BUDGET_M7_RELEASE_DECISION]] for rollout status.

Migration 108 orders items by line ID in account-scope impact facts. This keeps newly prepared and live preview hashes consistent when SQL returns identical items in different orders.

**R09 history coverage implemented — 9 November 2026.** [[BUDGET_R09_HISTORY_COVERAGE]] records the owner-only date confirmation and removal flow, plus isolated proof that forecasts and assistance use attested ranges and return to their safe fallback when evidence is revoked. No personal or hosted migration. Observed accessibility, independent beginner comprehension, hosted performance and exact target preflight remain open.

Migration 106 preserves confirmed history when an import replaces a system balance adjustment. The source revision still advances. Deletion of a settled transaction inside the range still revokes the affected confirmation.

`BudgetHistoryCoverage.tsx` is shared by setup, assisted fallback and active settings. Migration 105 introduces the service-only `budget_coverage` read and two owner commands through `manage-budget`, using `account_activity_coverage`, source invalidation and `budget_operations` receipts. `test-budget-coverage.mjs` verifies creation and revocation through the real boundaries; original M7.7 evidence stays bound to schema 104.

When assisted setup is blocked by missing coverage, `BudgetCoverageReadiness.tsx` replaces the bare warning with a month-by-account checklist built by the pure `lib/budgetCoverageReadiness.ts` (six window months, per-account gaps, months ready vs. 3 needed). Each account gets a pre-filled, explicitly confirmed `confirm_coverage` for exactly its missing dates (capped at today; two-week budgets span the whole month window) or a **Leave out** action, and the panel re-checks history automatically afterwards. It writes only `user_confirmed` evidence through the existing command; nothing is inferred from transaction dates. `assistanceReasons(result,{coverageShown})` drops the reasons the checklist already explains, and the full `BudgetHistoryCoverage` form stays available as the secondary custom-date route.

Assisted setup reads `query-budget` action `account_activity` (migration `20261111010000`, service-only `budget_account_activity`): per AUD account type, latest settled non-system activity date and settled rows in the last six complete months. `lib/budgetAccountActivity.ts` turns that into defaults: a fresh setup pre-selects Liquid/Credit Card/Savings accounts with recent activity and leaves out investment, loan, empty and dormant accounts. The picker and checklist show each account's last activity, and the checklist offers **Leave out N unused accounts** in one step. These are defaults only; eligibility is still decided by `budget_assisted_setup`.

Once history is eligible, `BudgetDetectedBills.tsx` offers the Recurring detector's series (`buildRecurring`) on the checked accounts as bills, via `lib/budgetDetectedBills.ts`. Assistance only counts saved `recurring_series_overrides` with a pinned cadence, amount and next date, which the server removes from everyday spending. So accepting a bill saves it through the existing `manage-recurring-series` route with all three pinned (next date rolled forward to the next due date), refreshes, and re-checks history. Accepted bills are pre-selected in the cost review. A dormant series is still offered when its next charge falls after the account's last activity, because missing imports aren't evidence that a bill stopped. The coverage checklist likewise caps a suggested confirmation at the last import for an account in regular use (`importCappedRange`), with the full range still one link away.

`BudgetAssistanceInputs.tsx` is one "Check your amounts" screen. Take-home pay is pre-filled (the existing draft's, or the observed figure for a blank setup). Pay dates are suggested by `lib/budgetPayDates.ts` from dated income: weekly, two-weekly or monthly, counting only receipts of at least half the largest. Everyday is a radio choice between typical, keep and own. Each bill is a single row with Include and an Edit disclosure. The component always reports unconfirmed inputs. The single final tick in `BudgetAssistance.tsx` applies `confirmReview()` (income, irregular and every cost confirmed), and `reviewSignature()` clears that tick on any value change. `reviewProblem`/`applyAssistance` invariants are unchanged. The shared harness step `scripts/lib/budgetAssistanceUI.mjs` follows the new flow.

The recent-changes question no longer discards history. "Yes" or "Not sure" asks what changed: pay, a regular bill, or everyday spending (`RecentChanges`). Only those amounts start empty with a prompt: pay clears take-home pay and pay dates, spending switches everyday to "own", and bills shows an edit prompt. Everything else keeps its history defaults. "Yes" needs at least one tick. Changing the answer remounts the review screen with fresh defaults.

Assistance copy is written for beginners. Step 1 leads with a plain summary ("In a typical month you take home … and spend about …"). Calculation detail (per-period amounts, the median explanation, refunds/transfers handling, confirmed bills, excluded dates, older-method notice) lives in one **How we worked this out** disclosure. Dates are shown as `d MMM yyyy`. Step 3 reads Take-home pay / Everyday spending / Bills and set-asides / Left to plan (or Over your pay by). User-facing `reviewProblem` and projection messages in `budgetAssistanceReview.ts` use the same plain wording, and "not yet confirmed" is now a separate message from "invalid take-home amount".

**M7.8 decision recorded — 9 November 2026: No-Go for real-data release.** The owner expressed approval to release Budget V1. [[BUDGET_M7_RELEASE_DECISION]] reconciles that approval with the verified candidate and the requirements open at the decision: R09 history coverage entry point, M7.3 observed accessibility, M7.4 independent beginner comprehension, M7.5 hosted/cold/load, and a named private target with its own preflight. No target was migrated or enabled.

**M7.7 live categorization verified — 9 November 2026.** After the owner restored Gemini credits, [[BUDGET_M7_LIVE_CATEGORIZATION]] recorded **eight passing live-provider golden tests**. The suite verified real cold AI classification, a fresh uncached Ledger suggestion, and unchanged transaction and merchant-cache state after closing the preview. All four rerun targets were cleaned up and the temporary provider file was removed. This completes the M7.7 evidence used in the decision above.

**M7.7 local candidate verified — 29 October 2026.** [[BUDGET_M7_CANDIDATE_OPERATIONS]] records final patched-installation passes: 560 lifecycle, 391 forecast/assistance/candidate assertions, eight provider-disabled golden tests, 78 passing WCAG scans, 609 unit passes/14 existing skips, types/build and eight telemetry-summary assertions. Budget now has fixed-field privacy-safe request metrics and redacted audit/error diagnostics. Compatible development dependency updates (Vite 6.4.5 / Vitest 4.1.12 in the lock) clear 17 npm advisory entries; no runtime dependency version or financial SQL changed. All sixteen M7.7 test projects, including the two live attempts, are cleaned up. [[BUDGET_OPERATIONS_RUNBOOK]] supplies private-exposure/monitoring/recovery procedures. The owner subsequently authorized the live Gemini categorization test; [[BUDGET_M7_LIVE_CATEGORIZATION]] records two isolated attempts and a definitive generation HTTP402 / RESOURCE_EXHAUSTED response: prepayment credits are depleted. The October attempts did not verify live classification/fresh-review; the November rerun above resolves that finding. Human/hosted/M7.8 gates remain open; No-Go. No deployment or personal migration.

`supabase/functions/_shared/budgetTelemetry.ts` wraps `manage-budget` and `query-budget` with content-free endpoint/status/outcome/duration samples. `withAuth.ts` offers Budget error redaction and detects returned audit-insert errors without failing commits. `app/src/lib/budgetTelemetry.test.ts` exercises privacy/response/sink-error and middleware paths; `test-budget-security.mjs` inventories 26 tables/97 functions and probes auth/CORS/schema/body/rate boundaries; `summarize-budget-telemetry.mjs` and its standalone tests aggregate strict records. Guarded release candidates have separate 57521/57600 and alternate 57721/57800 profiles plus per-project Vite caches. Golden candidate mode excludes general personal env and defaults to no provider key/AI refresh; exact label/empty-target checks and cleanup remain. The package/lock security patch is verified in a separate install; retained preview/primary node_modules stay unchanged. Public evidence is under `docs/budget-m7/candidate/`; current procedure/qualifications are in the two linked records.

## Budget M7.6 migration/recovery — 29 October 2026

**M7.6 isolated migration/recovery rehearsal complete — 29 October 2026.** [[BUDGET_M7_MIGRATION_RECOVERY]] records 164 passing final assertions: populated forward migration from 64 to 104 migrations, pre-/post-Budget auth/application backups restored into separate databases, exact 81/108-table content and sequence parity, original-user password sign-in, tenant RLS, signed-cent totals, recorded review/reserves/edited drafts and receipt preservation with writes disabled/re-enabled. The focused workspace suite passes 25 tests. All three rehearsal projects are cleaned up; private fictional backups remain ignored outside Docker, and preview96/personal data are unchanged. Next engineering: M7.7 final candidate cross-feature/security/operations review. M7.3/M7.4 human, M7.5 hosted/cold/load and M7.8 release gates remain open; No-Go.

`app/scripts/test-budget-recovery.mjs` runs only through the guarded durable provisioner's `--recovery-only --secondary-ports` branch (`npm run test:budget:recovery`). It boots the legacy migration prefix, archives auth/application data privately, migrates populated fixtures forward, restores into two fresh databases and tests original Auth identities and write-toggle preservation. `/backups/budget-m7/` is ignored; raw dumps/catalogs remain mode 0600 in mode 0700 project directories. Public evidence/source hashes/cleanup are under `docs/budget-m7/recovery/`. No new production migration or runtime source change.

## Budget R06 optimization — 29 October 2026

**R06 local performance admission verified — 29 October 2026.** [[BUDGET_M7_R06_OPTIMIZATION]] records schema 104 and passing original 10k/100k/1m targets: at 1m, workspace SQL p95 744.926ms, five warm API samples maximum 835ms, assistance API maximum 2,635ms. The first same-generation checkpoint miss was 4,325.854ms SQL; warm p95 is not a first-load/hosted guarantee. Separate suites pass 187 capacity, 142 history and 537 backend assertions; unit 595/14 existing skips, types and script syntax pass. Money/API/UI semantics are preserved, all fourteen run projects are cleaned up, and preview96/personal data are unchanged. M7.5 hosted/cold/load qualification remains pending; next M7.6 isolated migration/restore preparation. Human and release gates remain open / No-Go.

Migrations 98–104 add the private invoker-secure `budget_transactions_analytic` projection (including an explicit private parent-category helper), complete issue-demanded evidence, function-local bulk planning, streaming activity, statement-local selected-fact reuse and forecast/recurring fields on the existing private `budget_history_facts`. The wrappers recheck role/source/plan/date/scope and actual input fingerprints before using derived reads; attention stays live. Public analytics, Edge payloads and frontend sources remain unchanged. Five harness files add canonical/evidence/cache differential checks and backend-only validation modes. Final evidence and 462 source hashes are under `docs/budget-m7/r06-optimization/`; final timing samples are under `docs/budget-m7/r06-capacity/`.

## Budget M7.5 capacity — 29 October 2026

**M7.5 local measurements complete with findings — 29 October 2026.** [[BUDGET_M7_CAPACITY]] records 10k/100k/1m mixed-ledger measurements and the corrected-schema five-/ten-year history proof. Migration 97 restores the history guard bypassed by R01; it is verified only on disposable targets. New finding R06 remains open: 100k workspace SQL misses 1s; 1m workspace times out at 8s and assistance slightly exceeds 3s. The benchmark correctly fails admission. Next is SQL profiling/optimization and the same benchmark rerun. Hosted checks remain pending by explicit owner instruction. Preview retained on schema 96; personal database untouched. Human/operational/release gates remain open / No-Go.

`test-budget-capacity.mjs` adds repeated SQL/API timing, mixed dense fixtures, signed aggregate parity, paging and import/read checks. The guarded provisioner reserves 57521/57522 for capacity mode. `20261029000000_budget_forecast_history_guard.sql` restores `budget_workspace_details` admission/context handling and composes R01 in `budget_workspace_details_uncached`; service-role boundaries remain asserted. Evidence and source hashes: `docs/budget-m7/capacity-local/`.

## Budget copy refinement — 28 October 2026

**Approved Overview copy refinement complete — 28 October 2026.** [[BUDGET_OVERVIEW_COPY_REFINEMENT]] records the positive pending-overage sentence, explicit everyday-spending forecast heading/period end, and threshold policy retained in details. Six width/theme browser accessibility checks, future/stale guards, full TypeScript and production build pass; zero Budget writes. Only two presentation components differ from the pass-three source baseline. Prior owner acceptance remains recorded; this follow-up has engineering verification. Human and operational release gates remain open / No-Go.

## Current Budget verification — 28 October 2026

**Owner Overview comparison accepted — 28 October 2026.** The owner confirmed all three clarity questions: “All 3 questions are a yes. We can resume to the next steps”. The three production passes and owner presentation checkpoint are complete. [[BUDGET_M7_HUMAN_VALIDATION]] now provides the observed accessibility protocol and independent beginner walkthrough. A human beginner tester is no longer available; screen-reader observation is not yet arranged. The owner requested an AI beginner-perspective critique, which does not close either human gate. M7.3/M7.4 results remain pending; M7.5–M7.8 and release remain open / No-Go.

The owner-requested AI beginner critique is recorded in `docs/budget-ui/human-validation/ai-critique.md`: five copy/disclosure findings; no live interaction or human result is claimed. Recommendations are not yet implemented.

The participant-only task card is `docs/budget-ui/human-validation/participant-tasks.md`; the moderator guide and blank results are alongside it. Preparation only; no new implementation/test pass is claimed.

## Architecture Overview
**R01 engineering complete — 28 October 2026.** [[BUDGET_R01_SPENDING_FORECAST]] records forward migration 96 and the owner-approved median of three monthly daily gross rates, date-aware fixed bills, separate pending warnings and conservative unavailable states. Verification: 79 final forecast checks, 243 combined forecast/affected-candidate checks with 78 passing WCAG scans plus eight final threshold-explanation scans, 472 lifecycle checks, 589 unit passes/14 existing skips, full/focused/browser types and production build. These are separate runs, not additive unique checks. All 17 BUI presentation bursts remain delivered; R01–R05 engineering findings are now corrected. Next is the R01 affected-flow owner checkpoint and M7.3 observed human accessibility/M7.4 independent beginner walkthroughs, followed by M7.5–M7.8 operational/release gates. Release remains **No-Go**. No personal migration, deployment or commit occurred.

The application is a modern finance tracker built with a React frontend and a Supabase backend.
- **Frontend:** React, TypeScript, Vite, TailwindCSS (located in `app/`).
- **Backend:** Supabase Local Development Environment (located in `supabase/`).
- **Data Engine:** Powered by Supabase Edge Functions for secure API handling and complex operations.

The ordered ingestion correctness and UX backlog is tracked in
[`INGESTION_REVIEW.md`](INGESTION_REVIEW.md). The ordered integrity, workflow, review-queue and
accessibility items 1–8 are complete. The executable follow-up scope, boundary decisions and
isolated-test release gates are in [`INGESTION_HARDENING_PLAN.md`](INGESTION_HARDENING_PLAN.md).

The categorisation, taxonomy and editable-ledger direction is tracked in
[`TAXONOMY_AND_LEDGER_PLAN.md`](TAXONOMY_AND_LEDGER_PLAN.md). Phases 1–5 are complete:
the ledger supports transaction-only, selected-set and reusable past/future merchant scopes, and
the audited 13-category taxonomy has stable identities. First-class kind and focused classification
attributes now drive accounting behavior independently of spending purpose. Exact-cent optional
splits, tenant custom subcategories, merchant-rule management and confidence review policy are live.

The deterministic Strategic Projections calculator is shipped in Income, including durable goals,
saved scenarios, plan-versus-actual review and auditable rebaselining. Its delivery record is
[`PLANNING_EXPERIENCE_PLAN.md`](PLANNING_EXPERIENCE_PLAN.md); it extends the transparent
calculation model rather than storing stale forecast outputs. The application-wide typography,
spacing and density remediation is staged in [`LEGIBILITY_AND_DENSITY_PLAN.md`](LEGIBILITY_AND_DENSITY_PLAN.md).
The shared loading/progress feedback system has completed its Phase 0 contract/workflow inventory,
Phase 1 shared primitives, Phase 2 Ledger reference integration, Phase 3
ingestion/provider/transfer feedback and Phase 4 routine-write/tile/background-sync rollout; its
review-only concept route and staged verification plan are in
[`OPERATION_STATUS_PLAN.md`](OPERATION_STATUS_PLAN.md). Phase 5 automated status/provider and
reduced-motion coverage is in place, but its isolated-stack browser execution plus visual and
assistive-technology review remain before the feature can be called fully closed. The rollout
prioritises honest checkpoints and accessible status feedback over decorative or fabricated
progress.

## Directory Map

The agreed Budget feature baseline is documented in
[`BUDGET_FEATURE_SPEC.md`](BUDGET_FEATURE_SPEC.md): research evidence, monthly hybrid budgeting,
required page contents, explicit user controls, allocation/rollover/source reconciliation,
history and acceptance criteria. The concept and M0–M3 implementation records below track staged
delivery; Budget is not publicly released or personally migrated. A reconciled spendable-now estimate
is explicitly a later scope.
The UI/UX proposal in [`BUDGET_UI_UX_WIREFRAMES.md`](BUDGET_UI_UX_WIREFRAMES.md) compares
Monthly workspace, Allocation board and Guided check-in, and recommends the workspace with
contextual inspection, explicit allocation previews and guided setup/monthly review. These are
wireframes and interaction proposals; the approved concept and phased implementation now follow them.
The agreed plain-language guidance, assisted-input contract and V1 purchase-goal experience are in
[`BUDGET_GUIDANCE_AND_GOALS.md`](BUDGET_GUIDANCE_AND_GOALS.md). New concepts must follow that
copy/input contract; the first interactive wireframe's older labels are structural references only.
Feature specification v1.5 includes monthly/fortnightly periods and safe frequency changes
(section 3.1 / AC44–AC49), plus B10 **Save for something**, shared reserve accounting and
purchase-goal acceptance criteria. It records **BG-L01 — Your progress** as accepted post-V1
backlog (section 15.1). The concept exit and implementation-readiness checklist is in
`BUDGET_CONCEPT_REVIEW.md`. The UI/UX document defines the concept review journeys; a
fictional-data period-aware workspace concept is now implemented for owner review at
`/budget-concept.html`; its walkthrough, validation and prototype boundaries are in
[`BUDGET_CONCEPT_REVIEW.md`](BUDGET_CONCEPT_REVIEW.md). The authenticated manual route is implemented
in M3, separately from this fictional concept and without public exposure.

**Concept approval recorded 20 October 2026.** [`BUDGET_SCOPE_BASELINE.md`](BUDGET_SCOPE_BASELINE.md)
freezes **BUDGET-V1-2026-10-20**; [`BUDGET_IMPLEMENTATION_PLAN.md`](BUDGET_IMPLEMENTATION_PLAN.md)
defines the proposed schema/API contracts, M0–M7 delivery, data-readiness/migration gates and full
AC01–AC49 / SG01–SG09 verification mapping. **M0 contract stage completed 20 October 2026**:
[`BUDGET_M0_CONTRACTS.md`](BUDGET_M0_CONTRACTS.md) records source/currency/coverage/recurring
contracts, the mutation inventory, tenant revision-gate/MVCC locking design, normalized schema/API
review, money/calendar bounds, legacy preservation and explicit downstream verification gates.
`app/scripts/prove-budget-contracts.mjs` uses a new networkless disposable PostgreSQL container for
15 source/gate checks (1,008 canonical vectors and a complete 100k-row aggregate).
`app/scripts/prove-budget-full-schema.mjs` uses its own uniquely labelled Supabase project on 56422
to replay all 64 migrations and verify fictional source identities/triggers/aggregate/split/RLS
fixtures, then removes only its test resources. Their fixtures are in `app/scripts/fixtures/` and
are not migrations. **M1 calculation foundation completed 20 October 2026**:
[`BUDGET_M1_FOUNDATION.md`](BUDGET_M1_FOUNDATION.md) documents `app/src/lib/budget/` and its
byte-identical `supabase/functions/_shared/budget/` mirror: checked integer-cent money, injected
clock, monthly/fortnightly/bridge and contribution schedules, allocation/Flex/carry arithmetic,
reserves, separate contribution evidence and purchase-goal funding/timing. `foundation.test.ts`
runs 61 shared golden/property tests plus exact mirror checks; the focused config is
`app/tsconfig.budget-foundation.json`.

**M2 durable boundary — 20 October 2026:**
[`BUDGET_M2_DURABLE_BOUNDARY.md`](BUDGET_M2_DURABLE_BOUNDARY.md) records the three additive
`20261020000000`/`20261020010000`/`20261020020000` migrations and their isolated verification.
New tables: `budget_source_versions`, `budget_drafts`, `budget_draft_revisions`, `budget_plans`,
`budget_periods`, `budget_revisions`, `budget_lines`, `budget_allocations`,
`budget_account_memberships`, `account_activity_coverage`, `budget_operations`. They preserve
the legacy `budgets` table. Source triggers instrument 17 underlying tables. Account live references
use enforced ownership/audited invalidation rather than reverse-order source FK locks.
`manage-budget` / `query-budget` use `_shared/withAuth.ts` and strict `_shared/budgetApi.ts` command
schemas; SQL rechecks ownership, revisions, safe-cent totals and atomic/idempotent commits. Writes
are owner-only and disabled unless `BUDGET_V1_ENABLED=true`; reads and receipt recovery survive
write-disable. History and period boundaries are immutable; undo appends/archives.
`app/scripts/test-budget-durable.mjs` (`npm run test:budget:durable`) provisions a uniquely labelled
disposable stack on API 57421 / DB 57422, tests actual JWT-authenticated endpoints, SQL/RLS and
concurrency, and removes only its fixtures/project. No personal-stack migration or live Budget
route was installed during M2. M3 manual integration follows below; M4–M6 workflow-specific records remain later.
Final M2 evidence: 94 isolated integration checks pass across all 67 migrations. One-time opening
drawdown is current-period only; continuing templates do not repeatedly spend the same cash.
These documents/proofs do not authorize a personal migration or assert release readiness.

**M3 manual workspace — 21 October 2026:**
[`BUDGET_M3_MANUAL_WORKSPACE.md`](BUDGET_M3_MANUAL_WORKSPACE.md) records the authenticated
`app/src/views/Budget.tsx` and `budget.css`, `contexts/BudgetContext.tsx`, and contained
`lib/budgetWorkspace.ts` adapter/entry helpers with unit tests and focused
`tsconfig.budget-workspace.json`. The private rail places Budget after Expenses when
`VITE_BUDGET_V1_ENABLED=true`; direct authenticated reads/recovery remain available with navigation
hidden. Client and server write exposure default off. Manual setup supports no bank, zero income,
monthly/anchored fortnightly periods, explicit AUD activity scope, separate save/review/activation,
overall canonical actuals, My plan and current-only/current-and-future amount edits. A scoped tab
checkpoint and durable receipt lookup recover interrupted saves without inventing another request.
No per-line spending, verified goal progress or safe-to-spend figures are fabricated.
`query-budget` adds a strict `workspace` read for real account currencies/names and membership
intervals through RLS, with explicit account/history caps. It introduces no new migration/table.
`app/scripts/test-budget-workspace.mjs` is run only through the guarded disposable M2 provisioner:
`npm run test:budget:workspace`; its own non-reused Vite port is 57300, proxying only the verified
test API. The concept and personal database remain unchanged. M4 bills/reserves/goals is next.
Final M3 validation: 109 combined isolated checks across all 67 migrations, 447 unit tests passed
(14 existing skips), focused workspace TypeScript/build passed. The known full-app metric type
error remains; M7 human, performance and rollout gates are not claimed complete.

**M4 bills/reserves/goals — engineering-complete, 21 October 2026:**
[`BUDGET_M4_BILLS_RESERVES_GOALS.md`](BUDGET_M4_BILLS_RESERVES_GOALS.md) records implementation,
closure evidence and acceptance traceability. Migrations `20261021000000`, `20261021010000`,
`20261021020000` add six append-only tables: `budget_item_revisions`, `budget_manual_funding`,
`budget_source_claims`, `budget_claim_reversals`, `budget_limit_revisions`, `budget_reserve_moves`.
`20261021030000_budget_investment_evidence.sql` extends `budget_funding_sources` (retaining the
bank adapter as `budget_funding_sources_bank`) for confirmed exact-value bank/investment purchase
proof and shared debit capacity. Investment activities/instruments now invalidate sources (19 tables).
`20261021040000_budget_recurring_evidence.sql` adds service-only `budget_recurring_evidence`:
complete historical parent counts and explicit bounded/manual fallback, guarded by source/plan versions.
`20261021050000_budget_item_presentation.sql` extends the owner/receipt command boundary for stable
recurring context and one optional featured goal; metadata edits preserve period-only additions.
`app/src/lib/recurringSignal.ts` is the pure shared Expenses/server detector; byte-identical server
mirrors include `recurringSignal.ts`, `cadence.ts`, `stats.ts`. Edge `budgetRecurring.ts` applies the
normal/Annual-only evidence passes and excluded early signals. `query-budget` appends that evidence
to the consistent workspace, with explicit manual fallback on bounded detector timeout.
`BudgetItems.tsx` adds reviewed bill proposals, goals, evidence/matches, movements, category scopes,
feature control and compatible undo. `budgetItems.ts` supplies typed calendar/timing contracts.
`test-budget-items.mjs` and `test-budget-m4-interactions.mjs` run through the guarded disposable
provisioner/workspace runner: `npm run test:budget:items`. Final: **187 isolated SQL/Edge/browser
checks**, all **73 migrations**, **470 unit tests passed/14 existing skips**, focused TypeScript/build
passed. Desktop light/phone dark captures inspected. No personal migration/exposure; M5 is next once
authorized, while human/performance/backup/rollout gates remain M7.

**M5 lifecycle/control — first slice implemented, phase in progress:**
[`BUDGET_M5_LIFECYCLE_CONTROL.md`](BUDGET_M5_LIFECYCLE_CONTROL.md) records explicit saved-period
navigation/opening, immutable completed-period reviews, signed everyday carry into Other, changed
review evidence and guarded compensation. Additive `20261022000000_budget_period_reviews.sql`
introduces protected append-only `budget_period_reviews`, service-only `budget_lifecycle` and
current-period/carry-qualified `budget_query`/`budget_details` wrappers. The retained functions are
`budget_query_m4` and `budget_details_m4`. `20261022010000_budget_lifecycle_commands.sql` adds
`save_review`, `reopen_review`, `open_next_period` and review undo around `budget_command_m4`, plus
period-effective everyday reserve release and negative-carry movement checks. Total migrations: 75.
`BudgetLifecycle.tsx` supplies the responsive period/review/next-budget controls; `budgetLifecycle.ts`
supplies typed exact-date/template previews. `BudgetContext` preserves URL period selection and the
existing unknown-outcome recovery. `test-budget-lifecycle.mjs` and `test-budget-m5-interactions.mjs`
run only through `npm run test:budget:lifecycle`'s guarded disposable provisioner. **223 isolated
checks across 75 migrations, 475 unit tests passed/14 existing skips, focused TypeScript/build passed**;
phone dark/desktop light captures inspected and disposable cleanup verified.

**M5 continuation — guided frequency controls:** migration
`20261022020000_budget_frequency_changes.sql` (76 repository migrations) adds protected append-only
`budget_frequency_changes` event history, `schedule_frequency` / `cancel_frequency` /
`apply_frequency` and guarded compensation. Retained wrappers are `budget_command_lifecycle` and
`budget_details_lifecycle`. Commands serialize one logical pending intent, keep separate reviewed
first/bridge and continuing templates, preserve explicit category amounts subject to each pool's
capacity, and apply exact future boundaries without rewriting old plans, claims or reserves.
Stale intent requires fresh review; applied periods have no delete undo. Earlier financial mutations
are now rejected server-side once a later period exists. `BudgetFrequency.tsx` is the responsive
guided form/pending inspector inside lifecycle; `budgetFrequency.ts` / `.test.ts` supply bounded
plan/date/schedule previews. `test-budget-frequency.mjs` extends the isolated lifecycle suite;
`test-budget-m5-interactions.mjs` includes actual phone save/reload/cancel/undo, blank/gap validation
and unsaved-navigation protection. Final continuation: **253 isolated SQL/Edge/browser checks across
76 migrations; 482 unit tests passed/14 existing skips; focused Budget TypeScript/build passed**;
390px/1440px form captures inspected and isolated cleanup verified. The existing unrelated full-app
metric mismatch and chunk warning remain. See the M5 record for detailed verification limits.

**M5 account-scope policy continuation:**
[`BUDGET_M5_ACCOUNT_POLICIES.md`](BUDGET_M5_ACCOUNT_POLICIES.md) records the implemented account
portion of effective policy work. Migration `20261022030000_budget_account_policies.sql` is migration
77: protected append-only `budget_account_policies`, non-overlapping dated membership projection,
service-only `budget_replace_account_scope`, `budget_scope_facts`, `budget_scope_impact`,
`budget_preview_account_scope`, and `set_account_scope` / compensation around
`budget_command_frequency`. `budget_details_frequency` is retained behind the policy summary.
Preview evaluates all saved periods plus one provisional next window in rollback-only
subtransactions, then binds complete effects/intent/versions to a hash that Save recomputes.
Source/role/date changes cannot reuse a stale effect preview. Current-only edits restore prior
future choices; future-only edits preserve current dates. Pending frequency intent requires explicit
cancellation/review rather than hidden rebase. No source row lock/FK or browser write bypass.
`BudgetAccountPolicy.tsx` supplies the responsive role/date/effect controls inside lifecycle;
`budgetAccountPolicy.ts` / `.test.ts` supply types, boundary resolution and version/qualification
checks. `BudgetContext` sends only validated Edge preview/commands. Isolated SQL/browser coverage is
in `test-budget-account-policies.mjs` and `test-budget-account-policy-interactions.mjs`, run by the
guarded lifecycle harness. Final: **284 isolated SQL/Edge/browser checks across 77 migrations;
486 unit tests passed/14 existing skips; focused Budget TypeScript/build passed**, 390px/1440px
captures inspected and isolated cleanup verified. Detailed limits remain in the account-policy record.

**M5 category/Other continuation — implemented; wider M5 gates open:**
[`BUDGET_M5_CATEGORY_ROLLOVER.md`](BUDGET_M5_CATEGORY_ROLLOVER.md) records the user contract.
Migration `20261022040000_budget_category_rollover.sql` (78) adds append-only
`budget_rollover_policies`, complete dated timelines and service-only `budget_rollover_at`,
`budget_partition_chain`, `budget_preview_rollover`, limit installation and command/detail wrappers.
Existing M4 residual details, ordinary period opening and frequency adapters resolve the same
dated partition. Signed source balances route once to a category/Other, protected money or recorded
released variance. Protected money is excluded from the spendable everyday pool; shortfalls are
never labelled savings. Stable identities remain routable after category removal. Complete preview
hashes, explicit impact/history acceptance, atomic receipts and compatible compensation apply.
`BudgetRollover.tsx` supplies responsive inline controls inside lifecycle; `budgetRollover.ts` and
`.test.ts` supply bounded intent/version helpers. Edge `preview_rollover`/`set_rollover` use strict
Zod/withAuth. `test-budget-rollover.mjs` and `test-budget-rollover-interactions.mjs` extend the guarded
disposable lifecycle runner. The old current-only limit editor cannot bypass a saved rollover policy;
reviews record results without a second pool carry choice. Parent controls apply prospective rules
to active categories/Other while preserving removed identities' dispositions. Server-owned labels
keep removed categories recognisable after later periods open. Final: **322 isolated checks across
78 migrations; 490 unit tests passed/14 existing skips; focused Budget TypeScript/build passed**,
390px/1440px captures inspected and disposable cleanup verified. Existing unrelated full-app
projection type mismatch/main-chunk warning remain.

**M5 budget/line lifecycle continuation — implemented; wider M5 gates open:**
[[BUDGET_M5_BUDGET_LINE_CONTROLS]] records pause/resume and archive/disposition contracts.
Migration `20261022050000_budget_lifecycle_controls.sql` (79) adds immutable tenant-scoped
`budget_control_events` and signed `budget_control_moves`, service-only operational/gap/delta
helpers, rollback-only `budget_preview_control` and command/detail/revision adapters. Operational
pause leaves the active plan readable while blocking period/frequency generation. Resume previews
uncovered exact date windows and known activity with explicit carry acceptance; it creates no periods.
Archive retains current history/allocations, zeroes only that line's future refill and explicitly
keeps/releases/transfers signed reserve rights. Everyday movements enter later carry once; native
reserve releases use adjusted rights. Voided/archived destinations and archived refill are rejected.
`BudgetControls.tsx` supplies responsive controls inside the single native `budget/BudgetSettings.tsx` host; `budgetControls.ts`
and its tests bind intent and opaque versions. Existing item/frequency/plan controls expose archived
and paused states. Strict Edge `preview_control`/`set_control`, full-chain fresh hashes, atomic
idempotent receipts and compatible append-only Undo apply. `test-budget-controls.mjs` and
`test-budget-control-interactions.mjs` extend the guarded lifecycle provisioner. Final: **360 isolated
SQL/Edge/browser checks across 79 migrations; 493 unit tests passed/14 skips; focused Budget
TypeScript/build passed**, captures inspected and isolated cleanup verified. The known unrelated
full-app projection metric mismatch/chunk warning remain.

**M5 attention continuation — implemented; wider M5 gates open, 22 October 2026:**
[[BUDGET_M5_ATTENTION_CONTROLS]] records the counted queue, explicit review/snooze/show-again and
materiality/evidence contracts. Migration `20261022060000_budget_attention_controls.sql` (80)
adds immutable `budget_attention_events` with tenant/member RLS, service-only helpers, separate
attention versions and deferred operation references. `budget_attention_facts` derives complete SQL
checks and compares saved semantic baselines; private source maps are not exposed in workspace JSON.
`budget_workspace_details` composes attention after gated financial details without contaminating
financial review/preview payloads. Strict Edge `set_attention` guards source/financial/attention
versions, exact issue hash and bounded local dates. Atomic receipts and compatible append-only Undo
do not edit financial versions, allocations or saved frequency intent. Public `budget_command_controls`
retains the prior lifecycle boundary. Existing source/plan gates and browser-write prohibitions remain.
`BudgetAttention.tsx` provides responsive priority/all-check views, persistent signed-gap summaries,
review/date/acceptance controls, stale-choice recovery, inspection links, dirty navigation and focus.
`budgetAttention.ts` / `.test.ts` supply typed tokens, date bounds and plain-copy rules; BudgetContext
distinguishes preference outcomes from financial saves. `test-budget-attention.mjs` and
`test-budget-attention-interactions.mjs` extend the guarded provisioner/workspace harness. The
optional `--attention-only --workspace` mode still provisions a fresh protected target and tears it
down by exact label. Verification: **388 full isolated checks across 80 migrations; 40 focused
follow-up checks; 496 unit tests passed/14 skips; focused Budget TypeScript/build passed**, captures
and scoped cleanup verified. Existing unrelated full-app metric mismatch/chunk warning remain.

**M5 temporal integration continuation — 22 October 2026:** [[BUDGET_M5_TEMPORAL_INTEGRATION]]
adds combined monthly→fortnightly and fortnightly→monthly bridge/full chains with prospective
account scope, signed category/Other carry, independent goal cadence and explicit period overrides,
cross-period purchase/refund/source corrections, retained review facts and goal pause/Undo.
`test-budget-temporal.mjs` returns captured fixture identities for authenticated 1440px/390px
selection/reload journeys in `test-budget-temporal-interactions.mjs`. The lifecycle runner includes
both; optional `--temporal-only --workspace` retains new-target provisioning/guards/scoped cleanup.
Migration `20261022070000_budget_saved_period_navigation.sql` (81) wraps the authorized lifecycle
calculation as `budget_lifecycle_before_navigation` and returns all same-tenant/plan saved-period
metadata. Historical calculations previously omitted later dropdown options after reload; selected
facts and immutable reviews are unchanged. Helpers remain service-only with grant assertions.
Verification: **432 full isolated checks across 81 migrations; 44 focused temporal checks;
496 unit tests passed/14 skips; focused Budget TypeScript/build passed**, responsive captures and
exact-project cleanup verified. Existing unrelated full-app metric mismatch/chunk warning remain.
At that checkpoint realistic carry-chain performance/resumption remained an M5 gate.
General budget pause/resume, line archive and attention controls are implemented. Forecast/payday/
detector-dependent queue reasons require their real production inputs/adapters; they are not invented.
No personal migration or flag enablement; do not advance to M6 on the strength of this slice alone.

**Prior M5 long-history continuation — workspace resumption implemented; impact-scale gate open, 22 October 2026:**
[[BUDGET_M5_HISTORY_PERFORMANCE]] records measured complete-history reads, exact version-bound
resumption and fresh-projection impact reuse. Migration `20261022080000_budget_history_preparation.sql`
(82) adds private/rebuildable `budget_history_facts` with tenant/period/actor references, RLS and no
browser grants; `budget_history_status` and `budget_prepare_history` expose counts and bounded
complete-period batches through strict authenticated `query-budget` `prepare_history`. Source,
plan, actor role, method and expiry guard every hit. Cached base wrappers retain `*_uncached`
kernels; live Undo/Planning names and current attention are not checkpoint authority. Long workspace
responses carry count-only preparation until the entire prefix is ready. BudgetContext bounds
continuation calls, preserves verified figures with a stale warning and disables edits; the page
reuses OperationProgress and one plain-language continuation action.
Migration `20261022090000_budget_scope_fact_reuse.sql` (83) freshly derives saved base facts for each
exact impact projection, then reuses them in `budget_scope_impact_before_history`. Hypothetical
checkpoints roll back with the hypothetical projection; financial preview/save remains atomic.
`test-budget-performance.mjs`, `test-budget-history.mjs`, `test-budget-history-interactions.mjs`
and `budgetHistory.test.ts` cover timing/plans, equivalence, invalidation, failure/expiry and real
responsive interruption/reload. `--performance-only --stress --workspace` retains the guarded
fresh-project provisioner; it cannot target the personal stack. Verification: **432 full isolated
checks across 83 migrations; 55 focused workload/recovery checks; 503 unit tests passed/14 skips;
focused Budget TypeScript/build passed**, responsive captures and exact-project cleanup verified.
Measured prepared API reads: 133 ms / 265 ms for 60/120 periods. The ten-year financial scope
preview still times out at 8 seconds; complete impact/atomic commit scale remains the next M5 gate.
Benchmark timing/outlier qualifications are in the record. No hosted guarantee or M5/M6/M7 closure.

**M5 complete impact preparation — engineering-complete, 22 October 2026:**
[[BUDGET_M5_IMPACT_PREPARATION]] records migration 90,
`20261022160000_budget_impact_preparation.sql`. Private `budget_impact_preparations` has RLS,
no browser grants and at most one intent slot per plan/actor/change kind. `budget_begin_impact`
and `budget_review_impact` prepare complete before/after projections in separate requests, then
return the authoritative review. `budget_impact_proof` binds stable financial inputs while
excluding incidental hypothetical IDs. Existing preview helpers retain validation; the command
wrapper proves the actual applied state before atomic audit/receipt completion and preserves
same-key recovery and guarded Undo. Archive pre-validation can reuse the existing guarded saved
base facts; hypothetical scope calculations still rebuild independently. Source/plan/owner/role/
method/local-date/expiry checks, service-only grants and migration assertions protect every hit.
Strict Zod `query-budget` preview actions call the service helper; the browser never calls SQL.
`app/src/lib/budgetImpact.ts` / `.test.ts` bound continuation to three identical requests,
reject stale/malformed responses and never submit a financial command. `BudgetContext` and
`Budget.tsx` reuse shared progress UI with counts and an explicit no-change-saved explanation.
`scripts/budget-test-impact.mjs`, `test-budget-impact-preparation.mjs`, the existing account/
rollover/control suites and history/stress/browser harnesses cover authority, rollback, raw parity,
strict mixed save/Undo and responsive interruption/reload. Final verification: **451 broad isolated
SQL/Edge/browser checks and 145 focused workload/recovery checks across 90 migrations**, separate
run totals; **511 unit tests passed/14 existing skips**, focused Budget TypeScript/build passed.
Captures, fixture cleanup and exact project resource removal were verified. M5 engineering gates
are closed; M6 assisted setup and M7 release verification remain. See the record for measured
capacity, benchmark qualifications and the known unrelated full-app type/chunk findings.

**Prior M5 impact-scale continuation — dense commits implemented; mixed commit gate open, 22 October 2026:**
[[BUDGET_M5_HISTORY_PERFORMANCE]] records migrations 84–89:
`20261022100000_budget_chain_prefix_reuse.sql` adds exact-invocation pool/partition prefix state
to private `budget_history_facts`, retaining full `*_reference` kernels;
`20261022110000_budget_aggregate_activity.sql` adds source-equivalent `budget_activity_amounts`
and retains `budget_details_m4_evidence_reference`;
`20261022120000_budget_projection_claims.sql` adds bounded, private/RLS/no-browser-grants
`budget_projection_claims` and a guarded once-per-projection `budget_live_claims` wrapper;
`20261022130000_budget_account_validation_once.sql` removes only the duplicate outer validation
after account save/Undo has already validated the actual new version and complete next partition;
`20261022140000_budget_claimed_evidence.sql` narrows fingerprint resolution to live claimed
transaction/split keys, retaining `budget_live_claims_full_source_reference`;
`20261022150000_budget_grouped_claim_usage.sql` groups exact source/line claim usage and cumulative
allocations instead of repeated correlated scans. All new helpers are service-only with migration
assertions. Before/after/actual contexts are fresh, independently guarded and restored; hypothetical
derived writes roll back. No source-row lock/FK, client total authority or split financial commit.
`test-budget-history.mjs` now strictly requires dense five-/ten-year full preview/save/replay/Undo.
`test-budget-impact-scale.mjs`, invoked by `--performance-only --stress`, adds three accounts,
twelve lines, 240 split children and 240 linked claims, full resolver/raw-fact equivalence and real
authenticated preview/recovery assertions. The dense ten-year gate passes; the mixed complete
preview is correct but its accepted save still times out. **The strict mixed gate remains red and
M5 remains open** for durable/version-bound impact preparation plus short atomic acceptance/commit.
Detailed verification and measured-environment limitations are in the phase record. No personal
stack query/migration, flag enablement, hosted latency guarantee or M6/M7 closure.
Regression: **432 isolated SQL/Edge/browser checks across 89 migrations; 503 unit tests passed/14
existing skips; focused Budget TypeScript/build passed**, responsive journeys and cleanup verified.

**Budget concept-to-production UI handover — BUI-04 engineering complete, 25 October 2026:**
[`BUDGET_UI_IMPLEMENTATION_HANDOFF.md`](BUDGET_UI_IMPLEMENTATION_HANDOFF.md) responds to owner
feedback that the real Budget lost the approved concept's hierarchy and feels text-heavy. It
defines 17 separately requested BUI bursts, canonical display-field mappings, component/task
boundaries, responsive/theme/focus specifications, selective shadcn adoption, visual acceptance
and test/resume requirements. BUI-01 is complete in
[`BUDGET_BUI_01_REFERENCE_MAP.md`](BUDGET_BUI_01_REFERENCE_MAP.md): 24 production action
families, canonical/nullable field gaps, state coverage, one task-exit/navigation policy
and release-fix/visual gates. `docs/budget-ui/bui-01/` contains the reproducible capture
script, 36 concept PNGs and measured geometry at five widths in both themes.
[`BUDGET_BUI_02_TASK_PANEL.md`](BUDGET_BUI_02_TASK_PANEL.md) records the production
goal create/edit pilot in `components/BudgetTaskPanel.tsx`: native top-layer modal,
opaque theme surface, single in-panel dirty-exit decision, body scroll and opener focus.
`hooks/useBudgetNavigationGuard.ts` installs at stable `BudgetProvider`, coordinating
registered goal-task route/POP/period requests; `BudgetContext` preserves history indices
and pending-goal recovery. Other tasks retain their existing host. Financial form
construction and command/receipt semantics remain unchanged. No dependency/migration.
`scripts/test-budget-task-panel.mjs` runs via guarded `--task-panel-only --workspace`;
62 focused isolated checks/91 migrations, 12 fresh axe scans, 13 production captures,
full/focused/browser types, 516 unit tests (14 skips) and build pass. Exact target cleanup
verified; old orphaned disposable preview stopped with backup retained.
[`BUDGET_BUI_03_PRESENTATION_ADAPTER.md`](BUDGET_BUI_03_PRESENTATION_ADAPTER.md) records
`lib/budgetPresentation.ts`: bounded canonical display models with independent value
availability, basis, coverage, freshness, provisional status and provenance. It uses
server everyday/carry/rights/Other facts, separate goal evidence and preserved history;
no feed aggregation or invented balance. `components/BudgetValue.tsx` formats known
cents via `fmtCents` and represents unavailable values explicitly. Existing Budget
totals/everyday/category sections consume it. `BudgetContext` distinguishes read
failure/preparation/invalidated facts from command errors; pending outcomes qualify
retained money. Nullable item balance and scalar Other types now match the wire.
`budgetPresentation.test.ts` adds 43 semantic cases; guarded `--presentation-only --workspace`
runs `scripts/test-budget-presentation.mjs`. 559 unit passes/14 skips, full/focused/browser
types/build, 32 focused and 208 item/workspace isolated checks (separate totals/targets),
four axe scans and seven production captures pass. Both exact test projects cleaned;
no migration, financial kernel/command-body change or personal exposure.
[`BUDGET_BUI_04_HEADER_HERO.md`](BUDGET_BUI_04_HEADER_HERO.md) records
`components/budget/BudgetPageHeader.tsx` / `BudgetHero.tsx`: compact saved-period and
three-view navigation, qualified everyday/income hero, signed gaps, inline calculation
and links to retained detail/control sections. `BudgetLifecycle` supplies its existing
exit confirmation through the header's period-navigation event; provider guards and
all financial commands remain unchanged. `budget.css` adds a Budget-local quiet plane
and container-responsive editorial layout; shell/other routes unchanged. Shared local
calendar helpers use lifecycle `as_of`; adapter preserves period transition metadata.
Guarded `scripts/test-budget-hero.mjs` (`--hero-only --workspace`) includes task/recovery
regression, geometry and captures under `docs/budget-ui/bui-04/`. 121 focused / 472 full
lifecycle isolated checks (separate targets/totals), 22 axe scans, 31 captures, 559 unit
passes/14 skips, types/syntax/build pass. Both exact test projects cleaned. Engineering
complete; owner header/hero visual approval received 26 October 2026. BUI-05a everyday rows are complete in
[`BUDGET_BUI_05A_EVERYDAY_ROWS.md`](BUDGET_BUI_05A_EVERYDAY_ROWS.md). New
`components/budget/BudgetEveryday.tsx` consumes the existing adapter and task owner:
category/Other rows, canonical shared total, signed overages, optional native detail,
responsive labels and single-pool limits-off mode. 51 focused isolated checks, ten
axe scans and 14 captures verify geometry and category removal through the real UI.
208 existing item/workspace checks also pass on a separate isolated target;
both exact projects are cleaned. BUI-05b is complete in
[`BUDGET_BUI_05B_COMMITMENTS.md`](BUDGET_BUI_05B_COMMITMENTS.md): new
`components/budget/BudgetCommitments.tsx` groups saved bills/reserves/transfers into
native per-line disclosures; `BudgetItems` retains all forms, occurrences and recurring
update controls. Canonical summaries and evidence preserve qualifications and stable IDs.
45 focused / 208 item-workspace checks on separate disposable targets, ten axe scans,
11 captures, unit/types/build pass; exact projects cleaned. BUI-06a is complete in
[`BUDGET_BUI_06A_GOALS.md`](BUDGET_BUI_06A_GOALS.md): new
`components/budget/BudgetGoals.tsx` supplies featured card, compact native disclosures,
local decorative SVG and qualified canonical values. Its reserve-only track never adds
funding evidence; existing goal timing uses server as-of dates and suppresses unknown/stale
facts. Original task forms/recovery remain in `BudgetItems`; old inline goal rendering removed.
88 focused / 208 item-workspace checks on separate targets, 22 axe scans, 24 captures,
unit/types/build pass; exact projects cleaned. BUI-06b is engineering-complete in
[`BUDGET_BUI_06B_CHECKS_GUIDANCE.md`](BUDGET_BUI_06B_CHECKS_GUIDANCE.md):
`BudgetItems` assembles primary everyday/commitments and secondary goals/attention,
with explicit item write gates retaining historical read navigation. `Budget.tsx`
keeps recorded figures/guide in optional details and lifecycle below the overview;
hero links reveal/focus their targets. `BudgetAttention` retains its original controller,
adds compact explanations and explicit unavailable forecast, and opens exact category/
allowance details for inspection. 87 attention / 121 overview-recovery / 472 full
lifecycle checks on separate fresh targets, 33 axe scans, 62 captures and static/unit/
build checks pass. Legacy monetary/disclosure assertions retain exact financial checks.
Owner overview review was accepted on 26 October 2026; R01 remains open; BUI-07a settings host is complete in [[BUDGET_BUI_07A_SETTINGS_HOST]]: 91 focused / 472 lifecycle / 263 accessibility checks (64 audited states), 22 focused axe scans and 23 captures pass on separate disposable targets, alongside unit/types/build. BUI-07b frequency/accounts presentation is complete in [[BUDGET_BUI_07B_FREQUENCY_ACCOUNTS]]: 171 focused / 472 lifecycle checks on separate fresh targets, 62 axe scans, 63 captures, unit/types/build pass. BUI-07c rollover/lifecycle presentation is complete in [[BUDGET_BUI_07C_ROLLOVER_LIFECYCLE]]: 320 focused / 472 lifecycle checks on separate fresh targets, 112 axe scans, 113 captures, 32 keyboard-scroll checks and unit/types/build pass. Signed effects and in-form preparation counts remain visible. BUI-08a My plan is complete in [[BUDGET_BUI_08A_MY_PLAN]]: 68 focused / 472 lifecycle checks on separate fresh targets, 20 axe scans, 20 captures, 561 unit passes/14 skips and types/build pass. Saved current/future allocations, one-off cash and reserves remain separate; existing edit/recovery behavior is preserved. BUI-08b Look back is complete in [[BUDGET_BUI_08B_LOOK_BACK]]: 180 focused / 472 lifecycle checks on separate fresh targets, 70 axe scans, 70 captures, 8 keyboard-scroll checks, 565 unit passes/14 skips and types/build pass. Original/latest/recorded facts and carry/next-period controllers remain distinct. BUI-09a manual setup is complete in [[BUDGET_BUI_09A_MANUAL_SETUP]]: 193 focused / 472 lifecycle checks on separate fresh targets, 72 axe scans, 73 captures, 565 unit passes/14 skips and types/build pass. Close/Back retain setup; draft save and saved-draft activation remain separate. All 17 presentation bursts are delivered; owner visual acceptance is recorded. BUI-11 is complete in [[BUDGET_BUI_11_OWNER_HANDBACK]]: on 27 October 2026 the owner explicitly replied “Accept the visual presentation”. The engineering handback removes two unused Look back placeholder CSS rules; all other 440 BUI-10 source hashes match. Fresh 586 unit passes/14 skips, full/focused/browser types and build pass. BUI-10 remains the live-test baseline, rather than being claimed as a new BUI-11 run. Presentation acceptance does not close R01 or M7 human/release gates. BUI-10 is complete in [[BUDGET_BUI_10_CANDIDATE_VERIFICATION]]: 263 accessibility checks/64 states, 187 candidate checks/70 state-width-theme scans, and 472 lifecycle checks on separate fresh targets across 95 migrations. All 134 axe scans pass; 144 captures and manifests record seven financial/recovery states and the assembled UI. 586 unit passes/14 skips, full/focused/browser types and build pass. A phone theme-control overlap was fixed by reusing the shared toggle in the Budget header; other routes retain their floating control. No personal migration or exposure. BUI-09b is complete in [[BUDGET_BUI_09B_ASSISTANCE]]: retained native assistance task, numbered evidence/amounts/review sections, preserved optional-change controller, signed planning receipt, explicit fresh review and Close/Back focus recovery. 221 combined presentation/R02–R05 and 472 lifecycle checks pass on separate fresh targets across 95 migrations, with 42 combined WCAG scans, 30 presentation captures, 586 unit passes/14 skips and types/build. No personal migration. R02 eligibility is corrected in [[BUDGET_R02_ELIGIBILITY]]; R03 is corrected in [[BUDGET_R03_READINESS]]; R04 is complete in [[BUDGET_R04_INPUT_REVIEW]]; R05 is complete in [[BUDGET_R05_SIGNED_ESTIMATOR]] (73 reference / 98 dependency / 472 lifecycle checks across 95 migrations, 586 unit passes/14 skips). R01 engineering is complete in [[BUDGET_R01_SPENDING_FORECAST]]; next is affected human verification; M7 human/release gates remain open.
Final
M7.3/M7.4 human validation follows the revised stable presentation, with fresh automated evidence
required. Frozen financial behavior and R01–R05 release findings are unchanged.

**Manual Budget validation environment — 25 October 2026:**
`npm run preview:budget:manual` adds `--manual-preview` to the existing guarded disposable
provisioner. `app/scripts/preview-budget-manual.mjs` creates a sample active budget/goal and a
fresh-setup identity, verifies real UI password login and enabled Budget controls, then retains
Vite at 127.0.0.1:57300 and the isolated API until explicitly stopped. Runtime-only fictional
credentials are saved with mode 0600 inside the disposable work directory. Signal-driven shutdown
returns to scoped fixture/project cleanup. Normal test mode still exits and cleans up automatically.
This enables M7.3 owner validation without changing the personal app's flags or database. Human
validation results remain open.

**M7.2 automated accessibility audit — complete, 22 October 2026:**
[`BUDGET_M7_ACCESSIBILITY.md`](BUDGET_M7_ACCESSIBILITY.md) records 64 rendered-state scans and
260 focused isolated checks across 91 migrations, with axe/overflow/target-height, real keyboard
scrolling and focus, themes, reduced motion and error-state evidence. `test-budget-accessibility.mjs`
uses development-only `@axe-core/playwright`; `npm run test:budget:accessibility` selects its guarded
fresh-project mode through the existing durable/workspace runners. Budget comparison wrappers are
labelled focusable regions; `useBudgetInlineFocus.ts` restores account/frequency form focus;
`budget.css` adds disclosure/scroll focus, target/border and motion-preference rules. Full/focused/
browser TypeScript, 516 unit tests (14 skips) and build pass. M7.3 human/native-zoom/accessibility
checks are next; R01–R05 and release No-Go remain. No personal-stack work or exposure occurred.

**M7.1 baseline audit — complete, release verification in progress, 22 October 2026:**
[`BUDGET_M7_RELEASE_VERIFICATION.md`](BUDGET_M7_RELEASE_VERIFICATION.md) maps every AC01–AC49 and
SG01–SG09 to production evidence, current gaps, commands and responsibility, and records chunks
M7.1–M7.8. R01–R05 qualify M6's earlier blanket closure: forecasting, fortnightly eligibility,
settled-use/outcome readiness, input confirmation/preservation and canonical estimator edge cases
remain open. Release remains No-Go. The Planning UI now translates persisted `net_worth` to
calculator `netWorth`; full/focused/browser TypeScript, 516 unit tests (14 skips) and production
build pass. Existing Vite chunk advisory remains. At this checkpoint M7.2 was next; database evidence was
carried forward from M6, with no personal-stack work or exposure performed.

**M6 assisted setup — historical engineering closeout, qualified by M7.1 above, 22 October 2026:**
[`BUDGET_M6_ASSISTED_SETUP.md`](BUDGET_M6_ASSISTED_SETUP.md) records the production implementation,
acceptance traceability and M7 release handoff. The milestone closes deterministic suggestions,
editable evidence provenance, one bounded what-if, explicit stale/manual conversion and final
activation without an AI dependency or a new browser-write path.
Migration `20261022170000_budget_assisted_setup.sql` (91) adds service-only deterministic assistance
over canonical transaction/split semantics, explicit account-coverage ranges, monthly or
anchor-aligned fortnightly complete periods, exact-cent medians, confirmed recurring identities,
source fingerprints and stale-evidence guards. Historical everyday values subtract only matching
canonical recurring activity; an upcoming confirmed bill is never falsely removed from unrelated
history. Invalid/foreign-currency scope fails closed without exposing a monetary suggestion.
Validated assistance provenance can survive the existing versioned draft and guarded activation;
an optional named goal becomes the matching M4 goal/reserve intent atomically, while any editor
change or stale-evidence conversion relabels the amounts as manual estimates and preserves the
goal line/future contribution. `BudgetAssistance.tsx`, `budgetAssistance.ts`, `BudgetContext` and
the existing Budget editor provide the inline evidence review, recent-change confirmation, bounded
one-change what-if and explicit `Use this draft` → save → activation boundary. Strict `query-budget`
Zod and the service RPC remain read-only until normal activation. `test-budget-assistance.mjs`
extends the positively identified disposable provisioner; focused evidence after Chunk 1 is **107
isolated SQL/Edge checks across 91 migrations**, 5 focused unit tests, Budget TypeScript and
production build. Chunk 2 expands the authenticated harness to phone assistance focus/labels,
390px overflow and dark rendering, insufficient-history/manual fallback, no-write preview,
desktop save/reload, stale-evidence manual conversion and final goal activation. The complete
workspace run passes **143 SQL/Edge/browser checks across 91 migrations** with no browser runtime
errors and exact fixture/project cleanup. Chunk 3 completes the broad regression gate: **472
durable-boundary SQL/Edge/browser checks across 91 migrations; 516 unit tests passed/14 skipped;
focused Budget and browser TypeScript checks and the production build passed**, with no browser
runtime errors and exact disposable-project cleanup. Repo-wide TypeScript still reports the known,
unrelated `StrategicProjections` `net_worth`/`netWorth` metric mismatch, and Vite retains its existing
large-chunk warning. M6 engineering closeout is complete; M7 retains independent human
comprehension/accessibility, hosted performance, backup/restore/migration rehearsal and staged
rollout. No personal migration or feature enablement occurred.

[`BUDGET_SUGGESTIONS_PROPOSAL.md`](BUDGET_SUGGESTIONS_PROPOSAL.md) records the approved assisted
setup: deterministic history-derived draft, explicit suggestion/data-quality gates and one optional
what-if. The fictional concept remains the design reference; the production M6 foundation above is
implemented but the remaining M6 verification gates are still open.

### `app/` (Frontend)
- `budget-concept.html` / `src/budget-concept-main.tsx` / `src/concept/budget/` — Standalone,
  fictional-data Budget design review. Includes guided setup with local draft resume, monthly/fortnightly
  workspace, purchase goals with amount/date planning and impact previews, category reallocation,
  guarded input, latest-operation undo, goal adjustment/pause, existing savings and purchase
  simulation, scoped current/future plan changes, dated bills/goals, guided frequency switches with
  bridge/shortfall review and saved future previews, and completed-review/incomplete-data states.
  `Comprehension.tsx` adds the optional guide, setup-ready screen, evidence-separated goal tracks
  and explicit carry-forward review preview; section 4.3 of the spec records the plain-language contract.
  `suggestions.ts` / `suggestions.test.ts` provide fixture aggregation, gates, exact medians,
  fingerprints and bounded what-if math; `SuggestionFlow.tsx` implements the inline assisted path.
  Native modal tasks and responsive layout support light/dark desktop/phone review. Dedicated
  concept storage never mounts app providers or calls Supabase. `model.test.ts` covers money/date
  invariants; `frequency.ts` / `frequency.test.ts` cover local-date periods, dated occurrences and
  transitions, with `FrequencyFlow.tsx` providing their setup/change previews. `e2e/budget-concept.spec.ts`, `playwright.budget-concept.config.ts` and
  `tsconfig.budget-concept.json` verify the standalone surface without auth/database fixtures.
- `ledger-review-concept.html` / `src/concept/LedgerWorkspaceConcept.tsx` - Standalone,
  development-only Ledger action-design comparison at `/ledger-review-concept.html`. It uses
  fictional data and local component state, without application providers, engine requests or
  transaction writes. It compares the approved quiet toolbar with a review strip and sidebar,
  including attention, session, phone-width and theme states plus simulated batch review.
- `playwright.golden.config.ts` / `e2e/golden-pass.spec.ts` / `scripts/run-golden-pass.mjs` - Self-contained isolated release harness. `npm run test:golden` copies Supabase into a temporary directory, assigns a unique project ID and non-personal ports, migrates from zero, serves the real Edge Functions, and starts the app on a dedicated non-reused browser port through a same-origin isolated proxy. The rendered test creates Macquarie transaction/savings accounts, uploads the current 565+234 row CSV corpus, waits for live categorisation, resolves the 202-review-plus-one-auto result across the enforced 200-item mutation boundary, previews a fresh categorisation review, and checks exact row/batch/balance invariants. Direct API cases cover source/server caps, custom taxonomy isolation, sequential partial overlap plus reconciliation replacement, rollback, connected cutover, saved-profile upsert persistence and denied direct browser transaction writes. `npm run test:gate2` uses the identical generated-stack lifecycle for the six-file quality corpus and retains only an aggregate report outside the repository. Shutdown waits for the function server, then removes only containers carrying that run's exact Compose project label; fail-closed guards reject the personal `54321` project.
- `playwright.config.ts` / `e2e/ledger-bulk.spec.ts` - Real Chromium regression harness for the Ledger repair sequence. The runner uses one serial, schema-complete 512-row tenant fixture (507 cap rows plus mixed category, mixed attribute and protected reconciliation cases), authenticates through the real UI, exercises mutations through the app/Edge Functions, retains traces/screenshots only on failure, and deletes its tenant/auth user after success or partial fixture construction failure. Coverage includes mixed leave-unchanged semantics, explicit impact/change gating, cross-page selection and global clearing, exact 500-row apply/undo with seven disabled overflow rows, safe kind/attribute impact/apply/undo/protection, and focus wrapping/restoration across every Ledger dialog.
- `src/`
  - `components/` - React UI Components.
    - `StrategicProjections.tsx` / `PlanningGoalDialog.tsx` / `PlanningTimeline.tsx` - Deterministic
      cash/net-worth calculator, durable goal/scenario workspace, accessible forecast reconciliation
      and completed-month plan review. Goals are explicit account-scoped planning inputs; they
      cannot create future ledger rows or mutate balances.
    - `Shell.tsx` - Main application layout and navigation rail. The pending-transfer badge belongs to the dedicated Transfers destination (`/transfers`), not statement import.
    - `views/LedgerView.tsx` / `TransactionCategoryDrawer.tsx` / `BulkCategoryDialog.tsx` / `BulkClassificationDialog.tsx` / `CategorizationReviewDialog.tsx` / `TransactionSplitEditor.tsx` / `ClassificationRulesDialog.tsx` - First-class `/ledger` with paginated all-account activity, search/account/category/kind filters, review/source and classification-attribute lenses. Rows support accessible selection, bulk correction, fresh categorisation-engine review and split badges. Cross-page selection remains deliberate and visible as total/current-page/elsewhere counts; page and global clear controls show their scope, stale IDs are pruned, and a completed correction keeps selection only while Undo is available before an explicit `Done and clear selection`. `Select all matching` selects the complete filtered result through 500 rows; larger results explicitly select the first 500 in current sort order. The 500-row boundary is always visible, individual/page actions cannot exceed it, rows beyond it disable, and a partial page at the boundary can still be cleared. Category and accounting/attribute corrections are separate actions and undo groups. Both display common values plus independent `Mixed — leave unchanged` semantics, submit only explicit fields and require a real change. Category preview covers label/provenance effects and derived classification/reporting deltas. Accounting preview covers current kind/attribute distributions, exact per-field/affected counts, manual precedence and expense/earned-income deltas; booleans use Leave unchanged/Yes/No and spending nature can be explicitly cleared. Engine review supports an intentional selection, a source-less `Uncategorized` recovery batch and an all-eligible candidate batch; every scope is visibly capped at 500 rows so preview, heterogeneous apply and grouped guarded undo remain atomic. It asks for a fresh preview without teaching the merchant cache, reports only completed bounded merchant-group requests and an explicit no-write guarantee, separates suggested/unchanged/protected/unresolved rows, defaults only actionable suggestions on, projects their combined reporting impact, and applies accepted heterogeneous category pairs under one guarded undo. A failed preview discards all partial suggestions and retries the complete bounded scope; **Close preview** dismisses the UI without implying request cancellation. Manual rows, user-rule merchants, bank classifications and reconciliation adjustments are protected both at preview and apply time; stale previews fail closed. Every Ledger modal starts focus on its labelled dialog container, traps forward/reverse Tab within live enabled controls, and restores the exact opener after close; completed bulk flows whose opener disappears fall back to the page-selection control. The responsive drawer separates category scope, accounting attributes and exact-cent split allocations; it supports tenant custom subcategory creation and guarded undo. The rule dialog lists/deletes user rules and controls the tenant AI-confidence/missing-subcategory review policy. Reconciliation anchors stay locked as system adjustments.
    - `CSVUploader.tsx` / `UploadHistory.tsx` - Data ingestion components. (`CSVPreviewTable.tsx` was retired when the staging table replaced the read-only preview — see `app/src/components/ingest/`.) On a provider-connected account, `DataContext` passes both connection state and `cutover_date`; `CSVUploader` renders in historical-import mode, blocks overlapping rows, and skips balance/anchor reconciliation. `upsert-transactions` repeats both checks server-side, so a forged or stale client cannot write CSV rows into provider-owned history or restate its balance. It rejects a statement above 5,000 source rows before staging, preserves completed categorisation batches when a later ≤300-merchant request is unavailable, and keeps active tenant custom subcategories visible/selectable in the staging table. Mapping and staging name their real local work; categorisation displays completed/total batches from the existing chunk callback; the final atomic write is explicitly indeterminate because the service supplies no row checkpoint. Each import records durable filename/count/reconciliation metadata; history queries those records directly and retains an “Undone” audit row instead of inferring batches from the globally bounded transaction feed. The Ingestion host requires an explicit account selection and both cash and investment uploaders report their active staging state so that selection stays locked until cancel or completion. Its `workflow-surface` raises opacity over the decorative scene, uses stronger control boundaries, AA helper/semantic text and 44px controls; mapping/staging tables expose captions, pressed filter state and live progress/error semantics.
    - `InvestmentCSVUploader.tsx` - Adapter-driven managed-investment import review and unit reconciliation. Vanguard Personal Investor is the first adapter; the account/instrument/activity model is not Vanguard-specific, and only the final four account digits leave the browser. Its write uses named validate/write/reconcile stages rather than claiming unavailable per-activity server progress.
    - `InvestmentAccountActivity.tsx` / `InvestmentTaxAwareness.tsx` - Invest-account detail surface: verified NAV/date, units, contribution-neutral return, value-vs-contributions history, activity ledger with linked cash-account state, Australian financial-year summaries, disposal flags, protected AMMA workflow status, and record-summary CSV export. Their known-shape reads use compact local activity feedback, and price refresh names the active operation. Tax copy explicitly avoids presenting the summary as tax or CGT advice.
    - `InvestmentCashLinker.tsx` - Cross-ledger funding review inside Transfer review: confirm/reject suggestions, inspect or undo automatic purchase/redemption matches, and preserve cash distributions as income. Its bounded queue load states that it is fetching the review only, not changing a funding decision.
    - `views/TransferReview.tsx` - Dedicated lazy-loaded bank-to-bank and bank-to-investment reconciliation inbox at `/transfers`, with an explicit return to statement import. `views/Ingestion.tsx` never mounts this decision queue.
    - `ConnectBankModal.tsx` - Up Bank connect flow: token → map every returned Up account at once → one shared chunked backfill → success. Each account gets its own new/existing-account choice and a "History to import" preset (All history / 12mo / 90d / 30d / custom for a new account, defaulting to All history via the account's real `created_at`; "No overlap"/recommended plus the same presets for an existing account). Backfill displays saved `pages_fetched`/`rows_inserted` checkpoints as counts, never a percentage with unknown total pages. Calling `refreshData()` mid-flow would unmount this modal (see `contexts/DataContext.tsx` note below), so it's deferred to the modal's own close.
    - `EditAccountModal.tsx` - Identifiers + danger zone, plus (when the account is connected) a bank-connection card: status chip, last-synced, "Sync now", "Extend history" (calls `extend-provider-history` then re-runs the same backfill loop as `ConnectBankModal`), checkpoint counts while that loop runs, "Disconnect" (`keep_transactions` choice, default keep), collapsible recent `sync_runs` history.
    - `Controls.tsx` - Reusable UI components (Buttons, Inputs).
    - `CategorizationReviewActions.tsx` - Compact category-review toolbar and focused setup dialog.
      Presents unclassified/existing-category scope choices, bounded batch selection, empty states,
      contextual filter/selection copy, session continuation/reset and help. Candidate snapshots
      and mutations remain owned by the Ledger and existing preview dialog.
    - `OperationStatus.tsx` - Shared truthful asynchronous-feedback primitives: compact inline
      activity, foreground status panels, named stages, native-progress-backed countable work and
      persistent notices for genuinely background-safe operations. They present state only; a
      caller remains responsible for the service checkpoint and mutation lifecycle.
    - `ProviderSyncNotice.tsx` - The only global background-operation surface. On signed-in
      routes it polls tenant-readable `sync_runs` for currently running provider connections and
      renders one persistent notice with only durable page/transaction/change checkpoints; it does
      not initiate, cancel or mutate a sync.
    - `views/OperationStatusConcept.tsx` - Authenticated review-only concept route at
      `/concept/operation-status`, comparing staged foreground progress (the recommended pattern),
      short inline activity, determinate/indeterminate import progress and persistent background
      status using the shared primitives before a production workflow adopts them.
    - `AllocationDonut.tsx` - Fixed 165px allocation donut with an animated legend. A 420px container query keeps the wide-card side-by-side composition, then stacks the visual over a full-width legend when its own card becomes compact.
  - `contexts/` - React Contexts.
    - `DataContext.tsx` - Global state management and Supabase fetch layer. Its initial `loadState` (`loading`/`ready`/`error`) and non-blocking `isRefreshing` state let the route-level `ViewDataBoundary` render a matching skeleton/error state without unmounting an already-visible page on mutation refresh. Onboarding redirects only after a successful empty-account response; required profile/account/transaction failures render a retry state instead. Optional enrichment failures retain safe defaults. It fires background syncs, deduped per session, for stale bank connections and managed-fund NAVs, reads the SQL `net_worth_monthly` series that combines cash and investment valuation history, and supplies display-only institution/masked-identifier enrichment used to disambiguate ingestion targets.
  - `hooks/` - Shared React behavior.
    - `useResponsiveChartSize.ts` - Measured-container SVG sizing foundation for responsive charts. `useResponsiveChartSize()` observes a chart card with `ResizeObserver`; `resolveResponsiveChartSize()` is the tested pure sizing rule. Area, Bar, Projection and Sparkline all use their measured CSS-pixel width and returned height as SVG viewBox dimensions, never `preserveAspectRatio="none"` against a fixed-width viewBox.
    - `useDialogFocus.ts` - Shared modal keyboard contract for Ledger surfaces. It captures the opener, focuses the labelled dialog container, queries currently enabled/visible controls on every Tab, wraps in both directions, handles empty-control state, ignores an exiting Framer Motion dialog during restoration, and uses a declared fallback only when a completed workflow removed the opener.
  - `lib/` - Utilities and Clients.
    - `supabaseClient.ts` - Frontend client initialized with Anon Key.
    - `chartDensity.ts` - Pure container-aware axis-density rules used by Area, Bar and ProjectionChart. It selects evenly distributed first-to-last x-axis labels from usable plot width and limits compact charts to three horizontal reference guides.
    - `chartInteraction.ts` - Pure CSS-pixel pointer-to-data-index mapping used by Area, Bar and ProjectionChart, preserving bounded tooltip/selection interaction after responsive SVG resizing.
    - `cashFlowSeries.ts` - Exact-range Income analyzer series builder. It retains zero-activity intervals and selects daily (≤45d), weekly (≤183d), or monthly buckets so pacing, KPIs and savings-rate history match the active date range. Earned income includes only `kind='income'`; refund/reimbursement inflows reduce outflow and transfers/investments/adjustments are excluded.
    - `classification.ts` - Canonical frontend kind vocabulary, safe default derivation and analytics helpers (`earnedIncomeCents`, `expenseEffectCents`, gross-expense/income predicates). `effectiveTransactionKind()` applies the durable transfer-decision precedence used only by reporting: rejecting a derived transfer returns it to direction-based ordinary activity, while a user-pinned transfer remains authoritative. A focused mirror-drift test keeps it aligned with the server module.
    - `expenseMetrics.ts` / `period.ts` - Pure Expenses KPI arithmetic. Inclusive day counts and immediately preceding equal-day comparison windows use UTC calendar dates, so daily averages and deltas cannot collapse to one day or drift across daylight-saving boundaries.
    - `allocations.ts` - Pure reporting expansion: an unsplit transaction remains one row, while a split parent is replaced only in analytics by its exact child allocations. Account/statement ledgers continue to use the original row.
    - `chartTooltip.ts` - Pure bounds-aware placement for one grouped multi-series tooltip. Area and Bar share it so close values never render overlapping cards.
    - `categoryColor.ts` - `catColor(name)` → the `--cat-N` token for a category, by taxonomy index. Single source of truth: this was duplicated verbatim in `ExpenseFlowCard.tsx` and `concept/pacingData.ts`, both hardcoding `% 7`. An unknown name returns the neutral `--cat-unknown` rather than silently impersonating a real category (the old `((i + 7) % 7) + 1` form mapped `-1` onto `--cat-7`).
    - `operationStatus.ts` - Pure status feedback rules: state-to-live-region role, completed
      stage count and guardrails that suppress a numeric meter unless its current/total values are
      finite and bounded. Its focused unit tests keep the shared primitives honest without coupling
      them to any financial workflow.
    - `categorizePending.ts` - Loops `categorize-pending` until `done`, called after every provider sync.
    - `ledger.ts` / `bulkCategory.ts` / `bulkClassification.ts` - Pure review/count/filter, current-page/elsewhere summaries, capped all-matching selection and boundary-safe page toggling plus selected-field draft, payload and impact-projection rules. Focused tests keep `Uncategorized`, explicit review and missing-subcategory semantics distinct, ignore stale selected IDs, enforce the exact 500-row UI boundary, prove shared/mixed category/kind/attribute values cannot become accidental writes, verify explicit null/boolean choices, count source-only manual pins and reconcile accounting/reporting deltas while preserving omitted fields and user overrides.
    - `accessibility/workflowAccessibility.test.ts` - Token-level WCAG AA contrast regression plus workflow focus/target and ambient reduced-motion/opacity guardrails.
  - `data.ts` - System types, mock structures, and core constants.

### `supabase/` (Backend)
- `functions/` - Deno-based Edge Functions.
  - `_shared/withAuth.ts` - **The request pipeline every function uses.** Origin check → JWT verify → rate limit → tenant/role resolution → Zod validation → handler → audit. Add new functions through this, not by hand.
  - `_shared/connectedImportPolicy.ts` - Pure CSV/provider ownership-seam validation used by `upsert-transactions`: connected accounts reject reconciliation anchors and any CSV row on/after `cutover_date`.
  - `_shared/rateLimit.ts` - Sliding-window limiter (Upstash, with in-isolate fallback) and the named `LIMITS` table.
  - `_shared/cors.ts` - Origin allowlist driven by `ALLOWED_ORIGINS`. Never `*`.
  - `auth-session/` - HttpOnly refresh-token broker (login/refresh/logout). The only function with `verify_jwt = false`; it does its own origin, rate-limit and lockout checks.
  - `_shared/taxonomy.ts` - **Authoritative** category vocabulary. Validates all AI output; a drift from `app/src/data.ts` is a data-integrity bug.
  - `_shared/classification.ts` - Server mirror of first-class kind/default derivation used by CSV and provider ingestion; it must stay aligned with `app/src/lib/classification.ts`.
  - `_shared/dedupe.ts` - Server-side content hashing (mirrors `app/src/lib/csv/dedupe.ts`).
  - `analyze-csv/` - Gemini 2.5 column mapping, incl. detecting the bank's own Category columns. Reply is Zod-validated and every returned column must exist in the submitted header.
  - `import-investment-activities/` / `delete-investment-upload-batch/` - Validated, audited, idempotent managed-investment ledger writes. Server-side hashes preserve genuine repeated rows while skipping re-imports; balances switch to valuation ownership and cannot be restated by ordinary account edits.
  - `sync-investment-prices/` / `sync-investment-prices-cron/` - Authenticated on-demand/stale refresh plus exact-service-bearer scheduled refresh. The provider adapter retains real publication dates, replays a correction window, preserves the last good valuation on failure, and serializes concurrent runs per instrument. See the cron function's README for scheduling.
  - `update-investment-tax-record/` - RLS-proven, service-role-pinned and audited AMMA workflow status mutation. Authenticated browser clients have read-only table grants and cannot bypass this boundary.
  - `decide-investment-cash-link/` - Validated/audited confirm or reject boundary for one cross-ledger funding match; the service-only RPC records content identity so the verdict survives source deletion and re-import.
  - `categorize-merchants/` - The **CSV** categorisation path: resolves merchants for rows the caller has staged but not yet committed, and returns the answers for the caller to apply. Thin wrapper over `_shared/categorize.ts`.
  - `categorize-pending/` - The **provider** categorisation path: sweeps rows already in the ledger that have never been through the tiers (`category_source IS NULL`), resolves their merchants, and writes categories back via the service-role-only `apply_merchant_categories` RPC through `ctx.admin()`, scoped to the membership-verified `ctx.tenantId` (migration `20261111000000`; the RLS client lost transaction UPDATE in `20261004010000`). Exists because `sync-provider` deliberately never calls Gemini (Law 5) and `upCategoryMap` only covers what Up's own category ids label — everything else arrived Uncategorized with nothing to pick it up. Chunked at PostgREST's `max_rows` (1000) with the same `done`/`progress` contract as `sync-provider`; the client loops via `app/src/lib/categorizePending.ts`, called after every sync.
  - `review-categorization/` - Preview/apply boundary for an intentional Ledger selection of up to 500 transactions. Preview RLS-proves the rows, protects manual/user-rule/bank/system decisions, bypasses non-user cache for a fresh AI opinion and never writes suggestions or cache entries. Apply validates fixed pairs and active, tenant-scoped custom subcategories, rejects reserved reconciliation, and calls a service-only heterogeneous RPC that rechecks protections and the exact previewed before-state, records one category-history operation, marks accepted rows Manual and remains compatible with the existing guarded operation undo. The dialog shows account/amount/description, defaults to suggested changes with an explicit zero-suggestions state, offers status and text filters, and stages individual category choices without writing. Opening a transaction in its full editor excludes it from that preview; any resulting edit invalidates the batch while retaining the displayed choices until the user starts a fresh review.
  - `_shared/categorize.ts` - The tier resolution core both paths share (user rule → cache → Gemini, batched ~50/call, enum-constrained, cached back as `source='ai'`). Shared so the same merchant can never categorise differently depending on whether it arrived by CSV or API. Guards the reserved `Transfer > Reconciliation` subcategory against AI assignment — `transfer_candidates` excludes it by name, so an AI-assigned Reconciliation would silently drop a real transaction out of transfer matching.
  - `apply-merchant-rule/` - Validates canonical merchant identity and taxonomy, returns an exact read-only historical impact preview, then atomically records a permanent `source='user'` rule and back-fills matching rows with scoped history.
  - `update-transaction-category/` - Validated single/selected category boundary plus guarded undo. It proves every target through the caller's RLS client, rejects invented pairs and protected reconciliation anchors, then invokes service-only atomic RPCs. The RLS visibility proof reads UUIDs in bounded parallel chunks so the documented 500-row maximum cannot exceed PostgREST URL limits. Selected changes use explicit per-field update flags so omitted category/subcategory values are preserved; category changes require a deliberate subcategory choice. Changes share an operation id and undo together; every action is audit logged.
  - `update-transaction-classification/` - Validated single/selected kind-and-attribute edit plus guarded-undo boundary. It RLS-proves every target in bounded UUID chunks, locks system adjustments, rejects duplicate/empty/over-500 selections, sends explicit per-field update flags to service-only atomic RPCs, groups bulk history/undo under one operation and audit logs every mutation.
  - `manage-recurring-series/` - Validated, audited write-back for a detected recurring series. It re-proves all supporting expense rows through RLS, rejects pending/transfer evidence, and calls a service-only override RPC; it changes the app’s projection only, never bank-history rows or a merchant’s real subscription.
  - `manage-planning/` - Validated, audited creation/update/status and guarded undo for account-scoped planning goals. Caller-RLS proves every selected account/goal before a service-only RPC persists planning inputs; it never writes transactions, account balances or forecast output.
  - `manage-transaction-split/` - Validated exact-cent allocation replace/guarded-undo boundary. Pending rows and system adjustments are protected; every request is RLS-proven and audited.
  - `manage-taxonomy/` - Creates tenant-wide custom expense subcategories through the validated mutation boundary; global and custom identities remain separate foreign keys.
  - `manage-classification-policy/` / `manage-merchant-rule/` - Persist the tenant AI review threshold/missing-subcategory policy and safely delete user-owned learning rules without rewriting history.
  - `delete-account/` - Cascading account deletion (requires tenant `admin`).
  - `delete-user-account/` - Schedules user deletion after a 30-day grace period (requires `owner`).
  - `upsert-account/` / `upsert-transactions/` / `upsert-profile/` / `delete-upload-batch/` - DB write operations. `upsert-profile` validates the complete camelCase CSV mapping, independently hashes the exact header layout and upserts on `(tenant_id, header_fingerprint)` so a correction updates one saved layout; `name` is a separate human label. `update-callsign`, `manage-account-identifier`, `record-user-session`, `revoke-other-session-records`, and `restore-user-account` cover their respective application writes with the same `withAuth` + Zod + audit boundary. Before `upsert-transactions` hashes rows or calls the atomic RPC, it resolves category pairs case-insensitively against active global and importing-tenant custom taxonomy entries; malformed, inactive and cross-tenant pairs return 422, while SQL triggers remain the final guard. It then computes dedupe hashes and the `transfer_candidate` flag server-side, and calls the metadata-aware `import_transactions_atomic()` so real-row insertion, complete-ledger anchor replacement, manual account balance update and durable upload record are one transaction. `delete-upload-batch` calls `delete_upload_batch_atomic()` so deletion, complete-ledger SQL aggregation, manual balance update and durable undo status also commit or roll back together; provider-owned balances are untouched.
  - `link-transfers/` - Rescans a date window (padded ±`WINDOW_DAYS`), calls `_shared/transferMatch.ts` to score/pair candidate legs, persists via the `replace_transfer_links` RPC, writes back inferred `account_identifiers` for auto-linked pairs. Body: `{scope:'window',from,to}` or `{scope:'all'}`.
  - `decide-transfer/` - Records a user verdict (`confirmed`/`rejected`/`external`) on either an existing `transfer_links` row (`{link_id, verdict}`) or a single unmatched leg with no counterpart (`{txn_id, verdict}`, `external`/`rejected` only — `confirmed` needs a pairing to assert). Durable via `transfer_decisions`, content-keyed so it survives delete-and-reimport.
  - `_shared/transferMatch.ts` - Mirrors `app/src/lib/transfers/{classify,match}.ts` (O(N) bucketed transfer-candidate scoring). See `supabase/CLAUDE.md` for the mirror-pattern discipline.
  - `_shared/crypto.ts` - AES-256-GCM for third-party API tokens (SRD Law 4), keyed by `PROVIDER_TOKEN_KEYS` (version → base64 key), AAD-bound to `tenantId:provider:connectionId` so a ciphertext can't be copied into another tenant's row and decrypt.
  - `_shared/upClient.ts` - Up Bank REST client: retry/backoff, rate-limit backoff, account/transaction fetch, pagination cursor helpers.
  - `_shared/upCategoryMap.ts` - Up category id → Halcyon taxonomy, same discipline as `bankCategoryMap.ts` (unmapped falls to AI, never a catch-all).
  - `_shared/runLinkTransfers.ts` / `_shared/runInvestmentCashLinks.ts` - Bank-to-bank and cross-ledger linking orchestration. Provider sync invokes both in-process after committing a batch; investment import invokes the cash matcher after genuine new activities. Both paginate beyond PostgREST's row cap.
  - `_shared/investmentCashMatch.ts` - Exact-value, four-day, bounded purchase/redemption matcher mirrored by `app/src/lib/investments/cashMatch.ts`; DRP/distributions/non-cash adjustments never enter its candidate set.
  - `connect-provider/` - Validates a Personal Access Token live against Up (`/util/ping`) before storing anything, encrypts it, upserts `provider_connections`/`private.provider_credentials`. Owner-only.
  - `map-provider-accounts/` - Links one Up account to one Halcyon account (existing or new), sets `cutover_date` (CSV owns history before it, API owns forward). Does **not** write the reconciliation anchor — see `sync-provider/` below for why that moved.
  - `sync-provider/` - Chunked, resumable backfill/incremental sync (~45s budget per call, cursor persisted after each committed page). Handles pending (HELD) transaction refresh, never clobbers a user's own category correction, revokes+deletes the credential on a 401, and runs `runLinkTransfers` over the dates it touched before returning. Refreshes `accounts.balance` from Up every successful run (fetched once via `listUpAccounts`, reused across every account_connection on the call — was previously only ever set once, at connect time, and went stale). The **reconciliation anchor** is computed here too, exactly once, the instant a per-account backfill actually finishes (`backfill_done` flips false→true within the call) — `balance_now - sum(everything already in the ledger)`, which is only correct computed *after* backfill lands, not before: computing it beforehand (the old design) double-counts every transaction between `cutover_date` and "now" once cutover isn't pinned to today. `extend-provider-history/`'s whole trick is resetting `backfill_done`/`backfill_cursor` and letting this same reconciliation re-run. It also records Budget **provider history coverage**: migration `20261110020000` adds `account_connections.coverage_walk_{started_at,from,cursor}` and the service-only `budget_provider_coverage_base`/`_extend`. A completed backfill or verification walk becomes `verified_provider` coverage for [cutover, walk start day). Contiguous complete incremental passes extend it. A missing base or a gap queues a resumable verification walk that only inserts missing rows. See `BUDGET_R09_HISTORY_COVERAGE.md`.
  - `disconnect-provider/` - Removes a connection; `keep_transactions` (default true, explicit) decides whether the provider's rows stay.
  - `extend-provider-history/` - Moves an already-connected account's `cutover_date` earlier (owner-only), same overlap-floor check as `map-provider-accounts`. Doesn't touch the anchor itself or fetch anything from Up — just resets backfill state so the next `sync-provider` call walks the newly-exposed range and reconciles at the end, same as a fresh connect.
  - `rotate-provider-keys/` - Re-encrypts every tenant's stored credential under the newest `PROVIDER_TOKEN_KEYS` version. Platform-admin only (JWT `app_metadata.admin`), not tenant-scoped — it reaches across every tenant's credentials by design.
- `migrations/` - SQL schema definitions.
  - `20260804000000_auth_hardening.sql` - Tenancy, session registry, brute-force state, audit log, membership-based RLS, and the grant assertions.
  - `20260804010000_ingestion_engine.sql` - `merchant_rules` cache, transaction dedupe columns + unique index, `apply_merchant_rule`.
  - `20260806000000_transfer_linker.sql` + three follow-ups (`_rejection_unblock`, `_decision_outranks_category`, `_decide_transfer_leg`) - `account_identifiers`, `transfer_links`, `transfer_decisions` tables; `transactions_analytic` view (`is_transfer`/`transfer_state`, `security_invoker=true`); RPCs `transfer_candidates`, `account_identifier_map`, `transfer_match_exclusions`, `replace_transfer_links`, `decide_transfer`, `decide_transfer_leg`. `DataContext` now reads `transactions_analytic`, not `transactions`, directly.
  - `20260807000000_provider_connections.sql` - `private` schema (RLS + zero grants to `anon`/`authenticated`, listed in `config.toml`'s `[api] schemas` only because PostgREST needs it there for `service_role` to reach it at all — grants are the actual boundary). `provider_connections`/`private.provider_credentials`/`account_connections`/`sync_runs` tables; `transactions` gains `provider`/`external_id`/`pending`/`provider_posted_at`/`provider_transfer_account_id`; `transfer_candidates` excludes `pending` rows.
  - `20260808000000_provider_transfer_linking.sql` - `transfer_candidates` also returns `provider`/`provider_transfer_account_id`, so `link-transfers` can resolve Up's own `transferAccount` signal into a Halcyon account id and treat it as ground truth (bypasses the fuzzy scorer entirely when it resolves).
  - `20260809000000_apply_merchant_categories.sql` - `apply_merchant_categories(tenant, jsonb)` RPC: bulk category write-back for `categorize-pending`, one UPDATE instead of thousands of PostgREST round trips (Law 2). `SECURITY INVOKER` so RLS still applies, and refuses to overwrite a `category_source='user'` row regardless of what the caller passes. Superseded by `20261111000000`.
  - `20260818000000_investment_foundation.sql` through `20260818017000_restore_investment_balance_cache.sql` - Generic instrument/holding/activity/price/valuation/sync/tax-record tables; safe set-based NAV rebuild; concurrency guard; performance and mixed-net-worth views; Australian financial-year activity summaries. Price sync composes the same account-scoped valuation function used after genuine activity imports; a zero-row duplicate does not call it or touch cached balance/date. The final migration repairs caches already zeroed by the original bug from their untouched latest valuation snapshot. Global reference prices/catalogue are readable but not publishable by tenant clients; all tenant tables are membership-RLS scoped.
  - `20260818018000_investment_cash_reconciliation.sql` - `investment_cash_links` plus durable content-keyed decisions, service-only atomic replace/decide RPCs, RLS/grant assertions and `transactions_analytic` integration. Suggested/auto/confirmed funding legs are transfers; the newest human verdict wins.
  - `20260819000000_atomic_csv_import.sql` - `import_transactions_atomic()`: account-locked CSV dedupe/insert, one complete-ledger manual reconciliation anchor, and `accounts.balance` update in one transaction; repeats connected-account ownership enforcement inside SQL.
  - `20260820000000_static_profile_fingerprints.sql` - Separates saved-layout identity from display name with a tenant-scoped SHA-256 header fingerprint; normalizes legacy mapping keys, removes old duplicate layouts, and installs the unique upsert constraint.
  - `20260821000000_atomic_upload_batches.sql` + `20260821010000_retire_legacy_import_rpc.sql` - First-class RLS-scoped `upload_batches` provenance, metadata-aware atomic import, account-locked/idempotent atomic undo with complete-ledger SQL `SUM`, read-only browser grants, legacy metadata backfill and removal of the metadata-free RPC overload.
  - `20260822000000_transaction_category_edits.sql` + `20260822010000_refresh_transactions_analytic_category_confidence.sql` - Nullable transaction classification confidence, tenant-readable/otherwise protected before-and-after edit history, service-only atomic edit/guarded-undo RPCs, and a rebuilt `security_invoker` analytic view that exposes confidence to the ledger. Direct browser mutation and RPC execution are revoked.
  - `20260823000000_bulk_category_rules.sql` + `20260823010000_merchant_rule_exact_preview.sql` - Durable indexed `transactions.merchant_key`; scoped/grouped category history; service-only atomic selected-set edit/undo and user-rule application; exact uncapped merchant impact counts; rebuilt analytic view. The legacy directly executable rule RPC is revoked.
  - `20260824000000_taxonomy_v2.sql` + `20260824010000_fix_budget_taxonomy_trigger.sql` + `20260824020000_harden_taxonomy_trigger_grants.sql` - Canonical stable-ID category/subcategory references and legacy aliases; stable IDs on transactions, rules and budgets; validated synchronization triggers; per-tenant before/after migration runs and row events; service-only tenant/run rollback; rebuilt analytic view and RLS/grant assertions. The follow-ups give budgets their own category-only trigger because they have no subcategory field and explicitly revoke browser execution of both trigger functions.
  - `20260825000000_transaction_kind_attributes.sql` plus four hardening follow-ups - First-class transaction kind/source, recurring/subscription/source, spending nature, reimbursable and tax-related fields; deterministic backfill; tenant-readable classification history; service-only atomic edit/guarded undo; kind-based transfer analytics/candidates; and a rebuilt `security_invoker` analytic view. Follow-ups replace legacy category-text system guards, keep reconciliation replacement kind-based, split transaction-only classification logic from the shared merchant-rule taxonomy trigger, and give the transaction trigger a fixed `SECURITY DEFINER` execution context without restoring browser execution grants.
  - `20260826000000_phase5_splits_custom_rules_policy.sql` plus three hardening follow-ups - Tenant custom subcategories and explicit custom identity FKs; exact-cent allocation/history tables and service-only replace/undo RPCs; tenant AI review policy and legacy backfill; rule-deletion/custom-taxonomy RPCs; confidence persistence through provider and atomic CSV ingestion; static-checkable split validation; RLS/grant/view assertions. The follow-ups came from live/schema validation and keep all mutation RPCs unavailable to browser roles.
  - `20260827000000_safe_partial_bulk_categories.sql` - Service-only selected-set correction with explicit category/subcategory update flags. Omitted fields retain each row's existing value, changed rows still share one auditable operation, and guarded undo restores heterogeneous prior values exactly.
  - `20260828000000_bulk_transaction_classification.sql` - Adds selection-scoped classification history and service-only bulk edit/operation-undo RPCs. Six independent update flags preserve omitted kind, attributes and precedence sources; selected changes are capped at 500, locked and recorded per row under one operation. Undo compares every after-state first, then restores heterogeneous kind/source/attribute/transfer-candidate state atomically.
  - `20260917000000_categorization_review_workflow.sql` - Adds the service-only atomic apply boundary for heterogeneous accepted engine suggestions. It caps and locks the selected set, rejects duplicates, protected rows and stale preview state, records exact before/after provenance under one operation, and relies on the normal taxonomy/classification trigger to keep stable identities and derived kind/subscription behavior aligned.
  - `20261013000000_recurring_series_writeback.sql` - Durable account-and-normalized-merchant recurring-series overlays plus event history and guarded undo. User overrides can refine the cadence/amount/date/reminder or stop tracking a detected commitment without mutating statement transactions; browser roles are read-only and service-only RPCs enforce account tenancy.
  - `20261015000000_planning_goals.sql` - Durable tenant/account-scoped planning goals, change history and guarded undo. Browser roles are read-only; service-only RPCs validate account tenancy and persist only planning inputs, never forecast output or ledger/account state.
  - `20260921000000_not_null_derived_subscription.sql` - Makes derived subscription state total rather than nullable when a Lifestyle transaction has no subcategory, while preserving user-pinned values and the trigger's fixed security/grant posture. This closes a real atomic-import failure found by the representative Gate 2 CSV corpus.
  - `20261004000000_harden_csv_source_row_limit.sql` - Makes 5,000 a source-statement boundary as well as a submitted-row boundary. An optional reconciliation anchor remains server-generated account state, is separately recorded in upload metadata and never consumes source-row capacity.
  - `20261004010000_restrict_direct_transaction_mutations.sql` - Removes legacy browser-role INSERT/UPDATE/DELETE policies and grants from `transactions`. Ledger changes must pass through a validated Edge Function and guarded RPC; the migration asserts that anon/authenticated mutation privileges are absent.
  - `20261111000000_categorize_pending_service_rpc.sql` - Restores `categorize-pending` write-back after `20261004010000` (42501 on every post-sync sweep). `apply_merchant_categories` becomes service-role only (EXECUTE revoked from authenticated) and writes only same-tenant rows still `Uncategorized` with `category_source IS NULL`, so a user correction or any other classification landing between the sweep's read and write always wins. Asserts grants and invoker security.
- `config.toml` - Ports, auth settings (15-min JWT, OAuth providers), per-function JWT policy.

### `app/src/lib/csv/` (Ingestion library)
Pure, UI-free, unit-tested. Both the staging preview and the server share this logic.
- `normalizeMerchant.ts` - The cache key. Stability is valued over prettiness: over-normalising would MERGE DISTINCT MERCHANTS, which is worse than a slightly ugly key.
- `parseDate.ts` - Returns `null` on failure, **never today's date**. Builds local dates (no UTC day-shift).
- `parseAmount.ts` - String-based cents conversion (no `parseFloat * 100` drift). Handles `.13`, `(12.34)`, European separators.
- `bankCategoryMap.ts` - Tier 1 translation of bank categories. Unmapped values return `null` and defer to AI rather than being dumped in a catch-all.
- `limits.ts` - Browser-side source/submitted/reconciliation limit contract. It fails a statement above 5,000 physical source rows before profile lookup, AI categorisation or staging; the Edge Function and atomic SQL repeat the same write boundary.
- `categorizeChunks.ts` - Sequential, bounded client orchestration for the 300-merchant endpoint. It retains completed assignment batches and continues if a later request is unavailable or exceeds its 60-second bound, returning only failed merchant keys for review-state marking.
- `dedupe.ts` / `pipeline.ts` - Content hashing and pre-commit staging orchestration (`stageRows`, `applyAssignments`, `markFailedCategorizationRows`, `toTransactionPayload`). Reconciliation deliberately does not live here: PostgreSQL computes it from the complete post-dedupe ledger inside `import_transactions_atomic()`.

### `app/src/lib/ingestion/` (Ingestion workflow)
Pure target-account presentation and selection-lock helpers. `accountSelection.ts` defines the empty initial target, prevents account replacement while either uploader reports active staged work, and generates consistent type/identity/ownership labels for the selector and detail card.

### `app/src/lib/investments/` (Managed-investment ingestion)
Pure decimal-safe adapters and tests. `vanguard.ts` recognizes Vanguard Personal Investor exports and maps purchases, redemptions and DRP rows into the generic activity vocabulary; `decimal.ts` avoids floating-point drift in units and prices; `vanguardPrices.ts` validates normalized official price fixtures. Adding another platform or instrument is an adapter/catalogue addition, not a new account schema.

The end-to-end feature contract, operating checks, duplicate-import invariant and shipped
bank-to-investment reconciliation are documented in `MANAGED_INVESTMENTS.md`.

### `app/src/lib/transfers/` (Transfer matching)
Pure, UI-free, unit-tested — mirrored server-side by `supabase/functions/_shared/transferMatch.ts`.
- `classify.ts` - Extracts transfer signals (reciprocal masks, embedded dates, lexicon hits, direction cues, institution names) from `original_description`.
- `match.ts` - O(N) bucketed candidate generation by absolute amount, then weighted scoring, then greedy mutual-best assignment into `auto`/`suggested` pairs. Bucket sizes above `MAX_BUCKET` are skipped and reported, never partially scored.
- `constants.ts` - Weights, thresholds (`AUTO_THRESHOLD`, `SUGGESTED_THRESHOLD`), `MATCHER_VERSION` (bumping this invalidates stale `auto`/`suggested` links on next rescan without touching user decisions).

### `app/src/components/OskoLinker.tsx`
The transfer review panel (SRD "Same-Day Osko Linker"), mounted only in `views/TransferReview.tsx`. Its
queue-load and rescan surfaces name the bounded fetch and promise that no transfer decision changes while
the queue is replaced. Three
surfaces: suggested pairs needing a decision, a collapsed "linked automatically" list with undo,
and a collapsed "possible transfers — not matched" list for candidate legs with no counterpart
(reviewed via `decide-transfer`'s `{txn_id, verdict}` path). Nothing here rewrites a transaction's
category — a decision is durable state layered on top (`transfer_decisions`), which is what lets a
rejection or an unmatched-leg verdict survive a delete-and-reimport. Repetitive overflow amounts are
summarised behind disclosure; ambiguous pairs never enter bulk selection and get a dedicated review
action when no safe rows are selectable. Paired verdicts explicitly confirm an internal transfer or
return it to regular analytics, while transfer to/from an untracked account is available only for a
lone unmatched leg. Both paired and unmatched group selections mirror the validated 200-item
Edge/SQL boundary: a larger group selects a deterministic 200-row prefix, names how many are
deferred, disables those deferred checkboxes, and promotes the remainder after the first atomic
decision succeeds. This prevents the real 203-link account-pair failure found during personal-data
testing without weakening the server cap or creating partial multi-request writes.
The enclosing workflow surface raises contrast and opacity over the decorative scene; queue
disclosures publish expanded state, compact actions/checkbox rows meet 44px, and async/error copy is
announced through status/alert semantics.

### Tests
`npm test` (vitest, in `app/`) - 337 passing unit/corpus/pipeline/workflow tests over every current file in `Sample datasets/`, including user-rule-over-bank CSV precedence, bounded/partial-failure CSV categorisation chunks, editable-ledger review/filter, staged review choices and server taxonomy validation, capped all-matching and cross-page selection, safe mixed-field category/classification semantics, exact impact projections and modal focus wrapping, managed-investment decimal/parser/price/cash-matcher fixtures, ingestion target-lock state, dedicated workflow-route boundaries, transfer-review presentation state including the exact 203-to-200 batch boundary, WCAG token/workflow guardrails, exact-range adaptive cash-flow pacing, shared multi-series tooltip collision avoidance, responsive chart sizing/migration/density/compact-layout regressions, four-viewport (390/768/1024/1440px) chart visual-and-interaction regression coverage, and transfer-matcher corpus tests. Fourteen environment-dependent tests are skipped unless their keys are set.

`npm run test:golden` / `npm run test:gate2` (disposable Supabase, in `app/`) - The release-confidence and six-file categorisation-quality paths described above. Each owns a generated database lifecycle and must remain isolated; no personal-stack credentials are accepted. Both call the external categorisation provider and therefore require approval before sample merchant/description data is sent.

`npm run test:browser` (Playwright, in `app/`) - Ledger browser regressions require explicit credentials and a positively identified disposable Supabase target, never the personal local stack; see [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md). Run `npm run test:browser:install` once per machine. The fixture uses its service role only for scoped setup/teardown, while interactions sign in through the rendered app; individual tests may mock a preview/apply response where noted. `npm run test:browser:typecheck` checks the Playwright config and suite separately from the Vitest source tree. The dedicated `--review` disposable runner above exercises review filtering and handoff tests without an AI-provider call.

`app/scripts/` integration harnesses — use a separately identified isolated stack and credentials,
with the target guards in [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md) enabled:
- `test-rls-isolation.mjs` - Two users, two tenants; drives B's JWT at every one of A's rows. Covers `account_identifiers`/`transfer_links`/`transfer_decisions` and the transfer-linker RPCs.
- `test-edge-auth.mjs` - Middleware: auth, CORS, validation, tenant-injection, rate limits, audit.
- `test-token-broker.mjs` - Cookie attributes, rotation, lockout, user-enumeration parity.
- `test-analyze-csv.mjs` - Column-mapping quality per bank format, incl. the papaparse-shape regression guard.
- `test-static-profiles.mjs` - Saved-layout create/read/update, client/server fingerprint parity, unique upsert behavior, mapped-column validation and tenant isolation.
- `test-ingestion.mjs` - Deduplication: re-import, genuine same-day repeats, partial overlap, tenant isolation.
- `test-upload-batches.mjs` - Durable metadata, direct-write denial, idempotent atomic undo, tenant isolation and a 1,101-row surviving-ledger regression proving balance aggregation is not response-truncated.
- `test-categorization.mjs` - Taxonomy containment, categorisation quality, cache cost, user-rule precedence.
- `test-categorize-pending.mjs` - Isolated-only (`npm run test:golden:categorize-pending`): cached-merchant write-back with no Gemini call, user-correction and already-classified rows untouched even on direct assignment, cross-tenant refusal, browser EXECUTE denial and an idempotent second sweep.
- `test-category-edits.mjs` - 18 live checks covering transaction-only edits, taxonomy/reconciliation guards, analytic confidence, before/after history, guarded and stale undo, audit logging, direct-write denial and tenant isolation.
- `test-category-rules.mjs` - 26 live checks covering durable merchant identity, atomic selected-set correction and grouped undo, partial-field preservation and heterogeneous undo, mandatory subcategory choice on category changes, exact 500-row update/undo and 501-row rejection, exact read-only rule impact, user-rule persistence/precedence, both direct-RPC denials and tenant isolation.
- `test-taxonomy-v2.mjs` - 16 live checks covering canonical reference visibility, the 13 expense categories, stable transaction/budget IDs, retired/invalid-pair rejection, explicit Uncategorized semantics, database trigger enforcement and migration-audit RLS.
- `test-transaction-classification.mjs` - 39 live checks covering kind/attribute derivation, contra-expense semantics, partial selected-field preservation, source pinning, grouped/stale undo, exact 500/501 boundaries, system-adjustment locking, audit, direct-RPC denial and tenant isolation.
- `test-phase5-classification.mjs` - 30 live checks covering tenant custom identity, exact signed-cent splits, immutable parent rows, guarded undo, persisted confidence thresholds, rule management, audit, direct-write denial and tenant isolation.
- `test-categorization-review.mjs` - Deterministic isolated-stack contract checks for preview protections, heterogeneous atomic acceptance, custom taxonomy validation and identity, Manual provenance, shared history/undo, stale-state refusal, tenant isolation, audit and direct-RPC denial. `node scripts/run-golden-pass.mjs --review` provisions the separate disposable stack and runs those checks plus targeted mocked-preview Ledger browser tests without calling the external categorisation provider. Set `HALCYON_TEST_LIVE_GEMINI=1` only for the separate opt-in provider checks, which require approval before sending sample data; Gate 1 passed the earlier full 13/13 path on 2026-09-20.
- `src/lib/csv/gate2Quality.e2e.test.ts` - Opt-in, fail-closed representative quality gate for five real bank CSVs. It runs production staging/categorisation/import, batches fresh cache-bypassing review, checks protected decisions and obvious merchants, proves preview non-mutation/cache isolation, and writes a structured report. Gate 2 passed 793 rows/167 merchants on 2026-09-21 after repairing nullable subscription derivation and required AI confidence.
- `test-transfers.mjs` - 51 live checks covering detection, analytics exclusion, idempotency, the reject-then-find-the-real-pair regression, batch and unmatched-leg decisions, tenant isolation; multi-ledger fixtures import once per account to preserve the atomic import contract.
- `test-investments.mjs` - 70 live-stack checks over the real anonymized Vanguard corpus: exact units/cents; bank-first cross-ledger funding; all four funding pairs; analytics, DRP and distribution semantics; durable decisions; direct-write denial; tenant isolation; unpriced/priced re-import dedupe; valuation ownership; price history; performance; mixed net worth; Australian FY and protected/audited AMMA workflows.
- `supabase/functions/_shared/cors_test.ts` - `deno test` unit tests for the origin allowlist.

## Current State Notes
- **Authentication:** Supabase Auth (GoTrue) is the credential store and token issuer — email/password, magic link, and OAuth2/OIDC for Google and GitHub. Access tokens are stateless JWTs with a **15-minute** expiry; refresh tokens are DB-backed and rotated. Sign-in state lives in `contexts/AuthContext.tsx` (session, user, tenantId, role, isAdmin); `DataContext` consumes it rather than receiving a session prop.
- **Routing:** Real URLs via `react-router-dom`, with `RequireAuth` / `RequireOnboarded` / `RequireAnon` / `RequireAdmin` guards in `components/Guards.tsx`. `useView()` still works and is backed by the router, so `go('dashboard')` calls are unchanged. The editable all-transactions ledger is `/ledger`, statement import is `/ingestion`, and reconciliation decisions are independently lazy-loaded at `/transfers`. Auth callbacks live at `/auth/callback` and `/auth/reset`.
- **Tenancy:** Every financial table is keyed on `tenant_id`, and RLS is membership-based (`is_tenant_member` / `has_tenant_role`), not `auth.uid() = user_id`. Today each user owns exactly one personal tenant, auto-provisioned by the signup trigger — the multi-tenant shape is in place ahead of any org UI.
- **Browser data-access boundary:** frontend code reads application data through RLS and invokes Edge Functions for every application-database mutation; `app/src/lib/writeBoundary.test.ts` statically rejects direct PostgREST mutations and `supabase.rpc()` calls. `supabase.auth.*` remains client-side only for GoTrue identity/session lifecycle, not application tables.
- **Guardrails that will fail a migration:** the final migration asserts that every `public` table has RLS enabled, that `anon` holds no grants, that no role holds `TRUNCATE` (which RLS does *not* filter), and that `service_role` retains `INSERT` everywhere. Adding a table without RLS breaks `db reset` by design.
- **Not yet wired:** the SPA still uses supabase-js localStorage sessions; the `auth-session` broker is deployed and tested but not yet the app's login path. Refresh-token *reuse detection* (family revocation) is unconfirmed — see the note in `auth-session/index.ts`.
- **CSV Ingestion:** One engine (`components/CSVUploader.tsx`), hosted full-page at `/ingestion` with an explicit account selector. Five steps: drop → map → stage → declare balance → atomic commit. `views/Ingestion.tsx` no longer parses anything itself or mounts the transfer decision backlog; post-import review lives at `/transfers`. Its old implementation wrote to `accounts[0]` with no batch id and has been retired. The client submits only real staged rows and the declared manual balance; `import_transactions_atomic()` inserts after server dedupe, replaces one anchor calculated from the complete surviving ledger, and updates the account balance in the same transaction. Connected accounts are history-only: CSV dates must be strictly before `account_connections.cutover_date`, enforced in the staging UI, Edge Function and SQL; no manual reconciliation anchor or balance write is permitted.
- **The taxonomy is 13 expense categories and its ORDER IS LOAD-BEARING.** The order is Food & drink, Home, Transport, Bills & utilities, Shopping, Health & wellbeing, Lifestyle, Travel, Family & pets, Education, Financial & admin, Giving, Other. `--cat-N` is assigned by array index (`app/src/lib/categoryColor.ts`), so reordering deliberately changes chart identity colours; every current category has a distinct token through `--cat-13`, with no modulo wrap. `Income`/`Transfer`/`Investing` sit outside the expense set. `Other > Miscellaneous` is reviewed miscellaneous spending; `Uncategorized` is unresolved and stays in the review queue. Global reference tables make slug IDs durable across future label changes; display vocabulary is mirrored in `supabase/functions/_shared/taxonomy.ts` (authoritative) and `app/src/data.ts`, with a focused drift regression.
- **Kind controls accounting; category controls purpose.** Every transaction has `expense`, `income`, `transfer`, `investment`, `adjustment`, `refund` or `reimbursement` plus a derived/user/system source. Refunds and reimbursements are contra-expense inflows, never earned income; reconciliation anchors are locked system adjustments. Recurring, subscription, essential/discretionary, reimbursable and tax-related are independent attributes. User-pinned kind/recurrence/subscription values survive category changes, while derived values recalculate. Transfer/investment matching and analytics consume kind rather than display labels. One explicit reporting override preserves durable human precedence: when a user rejects a derived transfer, analytics treat its negative leg as expense or positive leg as income without rewriting the ledger's stored classification; a user-pinned transfer is never overridden this way.
- **Splits preserve the statement ledger.** `transaction_allocations` must contain 2–50 non-zero signed-cent rows whose exact sum equals the parent. The parent remains the account/bank row; `DataContext.reportingTransactions` replaces it with allocation rows only for spending/income/category analytics. Pending rows and protected adjustments cannot split. Allocation replacements have before/after history and guarded undo.
- **Customisation is bounded.** `tenant_subcategories` extends only the 13 curated expense categories, is shared across the tenant, and uses `custom_subcategory_id` instead of weakening global taxonomy FKs. Custom values work in ledger corrections, bulk corrections, user merchant rules, allocations and analytics. User rules are manageable; deleting one changes future learning only. Tenant review policy applies persisted AI confidence (default 75%) and optional missing-subcategory review without changing user > bank > cache > AI precedence.
- **Two categorisation entry points, one precedence contract.** CSV rows are categorised *before* commit (`categorize-merchants`); every included merchant, including bank-classified rows, passes through `_shared/categorize.ts` so a user rule can win while non-user cache/AI cannot overwrite the bank. Provider sync resolves user rules synchronously before its bank mapping, then the out-of-band `categorize-pending` sweep handles genuinely unresolved rows. A row never through the tiers remains identifiable by `category_source IS NULL`.
- **Categorisation is merchant-keyed, four tiers, cheapest first:** user rules → the bank's own Category column → the `merchant_rules` cache → Gemini for the remainder, batched ~50 per call. A 3000-row file asks about ~200 merchants once; the next import of that bank costs **zero** AI calls. Every AI answer is cached (including failures, so no merchant is ever asked about twice), and a user correction writes a `source='user'` rule that outranks the AI permanently.
- **The AI cannot invent a category.** Output is enum-constrained in the Gemini `responseSchema`, then re-validated server-side against `_shared/taxonomy.ts`; anything unrecognised becomes `Uncategorized` + `needs_review`. Database triggers independently reject unknown or mismatched pairs and synchronize stable IDs, protecting chart identity and budget/report joins.
- **Phase 2 categorisation scopes are explicit.** `/ledger` supports one transaction, an intentional selected set, or all matching past/future transactions. Single edits never create a rule. Selected edits are atomic, history-grouped and wholly undoable while every row still matches the operation’s after-state. Cross-page selection is continuously summarized as total/current-page/elsewhere; page/global clear actions expose their scope, and a successful correction retains selection for immediate Undo before closing explicitly clears it. `Select all matching` selects the filtered set through the shared UI/API/SQL maximum of 500; larger results name and select the first 500, while every selection path enforces the same visible boundary. A shared bulk field displays its common value; a heterogeneous field displays `Mixed — leave unchanged` and is omitted from the mutation until explicitly changed. Category changes require an explicit compatible subcategory selection, including the deliberate `No subcategory` choice. Apply is disabled until an effective explicit change exists; the preview reconciles current value distributions, exact label/provenance impact and derived kind/subscription/expense/income consequences before writing. Merchant-wide changes show an exact SQL impact count, then atomically update existing rows and persist a `source='user'` rule keyed by `transactions.merchant_key`. Future CSV/provider classifications follow transaction correction → user rule → bank → non-user cache → AI.
- **Deduplication:** `(account_id, dedupe_hash, occurrence)` is unique. `occurrence` is the ordinal **within an import batch, always counted from 0** — counting from the account's existing total would mean a re-import never collides. Re-importing a statement therefore reports "0 imported, N skipped" for real rows; manual reconciliation still atomically reasserts the declared balance and replaces the single anchor from the complete ledger. Two genuinely identical same-day purchases in one statement still both import.
- **Bad data is quarantined, not guessed.** An unparseable date or amount blocks that row and is shown in the staging table; it is never dated "today" or coerced to $0.00, which is what the old importer did silently.
- **Secrets:** `analyze-csv` and `categorize-merchants` need `GEMINI_API_KEY` in `supabase/.env.local` (pass `--env-file supabase/.env.local` to `functions serve`, or they fail with "GEMINI_API_KEY is not configured"). Capped at 20 and 60 calls/hour/user respectively.
- **Money convention:** every `balance`/`amount` column is integer **cents**, end to end — DB, `DataContext`, and every analytics lib (`lib/recurring.ts`, `lib/stats.ts`, `lib/cadence.ts`). Conversion to dollars happens in exactly two places: `fmt()`/`fmtCents()` in `data.ts`. Add a new money display by calling one of those — never format a raw amount inline, that pattern is how this bug happened five separate times (see `CONTEXT.md`'s 2026-08-05 entry). `app/src/lib/csv/*` money helpers (`CSVUploader.tsx`, `ingest/StagingTable.tsx`) are the one deliberate exception, for the pre-commit staging preview.
- **Fixed 2026-08-07 — Dashboard/HeroCard audit, six issues closed in one pass (all found in the same
  audit that fixed the 30-day income/expense windows above):** Asset Allocation now buckets `Savings`
  into Cash alongside `Liquid` (was only `Liquid`/`Invest` — `Debt`/`Credit Card`/`Loan` are
  liabilities and deliberately still excluded from the donut, not bucketed as $0). Holdings renders
  every linked account instead of a hardcoded `slice(0, 6)` that disagreed with its own "N linked"
  tag. The three fabricated percentage badges (income "+4.2%", expense "-1.8%", net-worth "+0%", all
  hardcoded strings) are now real vs-prior-30-days and vs-start-of-month computations, with
  arrow/color following the sign dynamically — `HeroCard` gained a `monthChangePct?` prop for the
  net-worth one, reusing `Dashboard.tsx`'s existing `netWorthTrend` loop rather than a second
  calculation. "Recent activity"'s tag and row count now share one `RECENT_ACTIVITY_COUNT` constant
  instead of silently disagreeing (tag said 5, rendered 10). Budget Capacity no longer fabricates a
  $500 fallback for categories with no real budget row — since there's no budgets-management UI
  anywhere in the app yet, every category was hitting this fallback, i.e. 100% invented, not an edge
  case; the tile now shows only real budget rows and an honest empty state ("No budgets set yet")
  when there are none. Net worth trend's month-by-month delta now excludes `pending` (HELD)
  transactions, matching every other aggregate in the app.
- **Fixed 2026-08-07 — the Expenses → Recurring hub tab was completely non-functional for every real
  user.** `buildRecurring()` read `data.transactions` — a hardcoded, permanently-empty mock array left
  over from before the app moved to live Supabase data — instead of `useData()`, so the tab always
  showed the empty state regardless of real ledger content. Signature changed to
  `buildRecurring(transactions, accounts, today?)`, both required (no silent fallback to nothing
  possible again); `RecurringHub.tsx` now passes live data through. Bundled in the same fix: the
  detection loop never excluded `isTransfer`/`pending` rows, so a recurring internal sweep (e.g. a
  fortnightly savings transfer) could get detected as a recurring *expense commitment* — now excluded,
  matching every other spend aggregate in the app. The "Funding accounts breakdown" card and each
  directory row also hardcoded three fictional account names (`Operations Checking`/`Sapphire Credit
  Line`/`Auto Loan // Vehicle`) for their color/label mapping — replaced with a `fundingAccountGlow`
  resolved from the real `accounts` list at build time. Two accuracy additions landed alongside the
  rewiring: step-change detection (`Series.priceChange`) reclassifies a subscription that changed
  price once as `'fixed'` with the change annotated, instead of the whole series reading as noisy
  `'variable'`; and a "renews in Nd" callout when an active series' `nextExpected` falls within 14
  days. `recurring.ts` had zero test coverage before this — new `recurring.test.ts` covers cadence
  detection, the `MIN_OBSERVATIONS` guard, erratic-amount rejection, the transfer/pending exclusion,
  dormancy, the step-change classifier, and funding-account glow resolution. Verified against the real
  account: 8 real active commitments detected (was 0), funding accounts show `AMEX CC`/`SG CC` (was
  the fake 3-account list), and multiple real "renews in Nd" badges render correctly.
- **Added 2026-08-07 — Recurring Hub Phase 2: AI early-detection layer for likely-recurring
  merchants.** The deterministic detector needs `MIN_OBSERVATIONS = 3` charges before it can call
  anything recurring, so a brand-new subscription is invisible for two billing cycles. New
  `merchant_recurrence_hints` cache table (mirrors `merchant_rules`' shape/RLS exactly) +
  `_shared/recurrenceHints.ts` (mirrors `categorize.ts`'s Gemini batching/caching discipline) +
  `detect-recurrence-hints` edge function classify merchants with only 1-2 charges by name/category
  archetype (streaming, insurer, gym, SaaS) — out-of-band only, same Law 5 posture as
  `categorize-pending`, triggered from the same three call sites (`ConnectBankModal`,
  `EditAccountModal`'s extend-history, `CSVUploader`'s post-commit) via new
  `lib/detectRecurrenceHints.ts`. Unlike `categorize-pending`, this function never mutates the rows
  it reads, so its poll loop needed an explicit keyset cursor (`after_id`/`next_after_id`) rather
  than relying on the query shrinking by itself — an infinite same-page loop was caught and fixed
  before shipping. `buildRecurring()` takes a 4th optional `hints` param and produces a new
  `Recurring.candidates: RecurringCandidate[]` array — deliberately never merged into
  `series`/`active`/`dormant` or any of `monthlyCommitment`/`annualBurn`/`pressure`, so an AI guess
  can never enter a total the user is planning around. `RecurringDirectory.tsx` renders candidates in
  a visually distinct dashed-border early-signals block below the confirmed sections, keeping AI
  language specific to AI-backed rows. Read-only for this pass — no accept/dismiss/promote action;
  that's real scope for a future round. Verified against the real account: 27 real candidates
  surfaced (Google Cloud, Anthropic Claude, Claude.ai Subscription, etc.), `$569/mo` confirmed total
  unchanged by their presence.
- **Added 2026-10-15 — bounded multi-year Annual detection.** `lib/recurring.ts` now keeps ordinary
  detection, `trailingActual`, pressure and the billing calendar on their existing trailing-year/30-day
  windows, but makes a separate, bounded three-year pass available only to `Annual`. Three stable
  annual renewals confirm a medium-confidence series; its actual spend still counts only the trailing
  year. Two stable annual renewals render as an explicitly non-financial `annual_evidence` early
  signal, never entering a commitment, total or projection. The directory distinguishes that evidence
  from an AI hint, and focused regression coverage protects confirmation, exclusion, cadence tolerance
  and stale evidence handling.
- **Fixed 2026-08-07 — Part F: the unmatched-transfer review queue was 2,298 rows, 74% of which
  (1,692) could never clear — Up's "Round Up" savings sweep.** `original_description` is always the
  exact literal `"Round Up"`, a structurally one-sided transaction with no counterpart to ever pair
  against, but `isTransferCandidateText()` (`_shared/transferMatch.ts` + `lib/transfers/classify.ts`)
  flagged it a candidate anyway via the `category === 'Transfer'` rule (Up sets `transferAccountId`
  on it). Not a money bug — these rows were already excluded from income/expense analytics via
  `category='Transfer'` regardless of match state — but pure queue noise with no way to clear it. Now
  excluded by exact-string match before the `category` check, plus a one-time backfill migration
  (`20260816000000_exclude_round_up_candidates.sql`) flipping the existing 1,692 rows. Confirmed on
  the real account: `transfer_state='unmatched'` count 2,298 → 606, `is_transfer` unchanged (still
  `true`) for all of them. For the remaining genuinely-diverse ~606 (real one-off external transfers:
  "Internet Withdrawal", "Eftpos Debit", "Up Account - Funds transfer", PayID, P2P names, etc.),
  `OskoLinker.tsx`'s unmatched-leg list — previously flat, capped at 100, one-row-at-a-time — now
  groups by `normalizeMerchant()` key with the same bulk-action shape as the suggested-pairs queue.
  New `decide_transfer_legs_batch()` RPC (`20260817000000_decide_transfer_legs_batch.sql`) mirrors
  `decide_transfers_batch()` exactly, just wrapping `decide_transfer_leg()` instead of
  `decide_transfer()`; new `txn_ids` branch on `decide-transfer`'s request schema routes to it,
  verdict restricted to `rejected`/`external` (a lone leg has no counterpart to "confirm"). Query cap
  raised 100 → 500 with an exact count surfaced ("Showing the most recent N of M") so a genuine
  backlog beyond one page is visible, not silently truncated. Verified against the real account: 606
  unmatched legs now render as ~30 merchant groups (Internet Withdrawal ×125, Eftpos Debit ×81, Up
  Account - Funds transfer ×63, etc.) instead of a flat 100-row list.
- **Fixed 2026-08-07 — Income/Expenses always showed $0 for real data.** Two independent bugs stacked: (1) `period.ts`'s `txnIso()` assumed a legacy compact `"MM.DD"` date string and mangled any real ISO `t.date` into a garbage string, silently dropping every transaction from month-bucket/range filters (`Income.tsx`, `Expenses.tsx`, `pacing.ts`, `ExpenseTrendCard.tsx`, `recurring.ts` all called it on real `Txn.date`, which is always full ISO — `txnIso` has been deleted, callers now compare `t.date` directly). (2) `Income.tsx`/`Expenses.tsx`'s account-scope filter compared `accounts` (an array of account **ids**, from `dbAccounts.map(a => a.id)`) against `t.account` (the account **name**, per `DataContext.tsx`) — never matched, so every transaction was excluded regardless of date. Filters now check `t.account_id` against `accounts`. `views/Accounts.tsx` was never affected — it already compared `t.date`/`t.account_id` directly.
- **Batch confirm (`OskoLinker.tsx`):** the `suggested` queue groups by unordered account pair (client-side, mirroring `pairHistoryKey`'s convention) with group-level `Confirm N internal transfers` / `Count N as regular activity` verdicts operating on the current checkbox selection. Every non-ambiguous link is selected by default (opt-out, not opt-in); ambiguous links are never auto-selected and stay in the full-detail `LinkCard` flow. If no safe row remains selected, batch verdicts are hidden; an all-ambiguous group presents `Review N ambiguous matches` instead of a disabled `Confirm 0`. “Transfer to/from an untracked account” is deliberately confined to unmatched single-leg decisions. One bulk click invokes `decide-transfer` once with `{ link_ids: [...], verdict }` (capped at 200) rather than looping the single-link path N times — routed server-side to `decide_transfers_batch()` (`supabase/migrations/20260814000000_decide_transfers_batch.sql`), a thin loop over the existing per-link `decide_transfer()` inside one transaction, so one bad id rolls back the whole batch instead of partially applying.
- **Fixed 2026-08-07 — a full transfer rescan silently truncated the candidate pool at 1,000 rows.**
  `transfer_candidates()` has no `ORDER BY`, and `_shared/runLinkTransfers.ts` fetched it with a
  single unbounded call — PostgREST's default `max_rows` (1,000) truncated the response with no
  error. For a tenant with more transfer-candidate rows than that (confirmed on real data: 3,162),
  which of the 3,162 survived the cut was arbitrary, so any pair whose leg didn't land in that slice
  could never be scored, let alone matched — regardless of how good the matcher's scoring is. Fixed
  by paginating via `.range()` in a loop (`fetchAllCandidates()`) until a page comes back short.
  Confirmed on the real account: a full rescan went from `created: 0` to `created: 377` (`auto: 186`,
  `suggested: 191`) after the fix, with zero other code changes. Also closed a narrower, related gap
  the same day: `classify.ts`'s `LEXICON_RE` didn't recognise Up Bank's own generic "Transfer to
  Spending" / "Transfer from Savings" wording (only compound phrases like "internal transfer"), so a
  real, existing pair scored 0.45 — just under `SUGGESTED_THRESHOLD` — until the phrase was added.
- **Provider (Up Bank) sync:** one connection per tenant, one Halcyon account per connection (`account_connections.account_id` is unique). `pending` (HELD) rows are stored and shown (italic, "HELD" tag in `Ledger.tsx`) but excluded from every spending/income aggregate and from transfer matching until settled — `Account.connectionId` (set from `account_connections`) is what every connected-account code path branches on, both client (`CSVUploader`'s historical mode, the ledger's provider glyph) and server (`delete-upload-batch`/`upsert-account` refuse to recompute or overwrite a provider-owned balance). Up's own `transferAccount` relationship outranks the fuzzy transfer matcher entirely when it resolves — see `_shared/transferMatch.ts`'s `resolvedTransferAccountId`.
- **Transfer detection:** `transactions_analytic.is_transfer` precedence is durable decision → cached link state → first-class `kind = 'transfer'` — a human "Count as regular activity" verdict always outranks a stale derived kind. Reporting enforces the same decision through `effectiveTransactionKind()`: a rejected derived transfer becomes direction-based ordinary activity without mutating its stored kind, while user-pinned transfer behavior stays authoritative. A `rejected` link is deleted from the cache on rescan (not kept, which used to permanently block that leg from ever matching its real counterpart — see the 2026-08-05 entry below); the durable record in `transfer_decisions` is what actually prevents re-suggestion. `suggested` pairs (score 0.55–0.8, not yet reviewed) are also excluded from analytics — only `unmatched` (transfer-shaped, no counterpart found at all) still counts as ordinary activity by default. A skipped amount bucket (>`MAX_BUCKET` same-value legs) is persisted to `transfer_match_overflow` and surfaced as one summarised disclosure in `OskoLinker.tsx`, rather than silently vanishing or repeating one warning per amount. `Shell.tsx`'s Transfers nav item carries a badge counting `suggested`/`unmatched` transaction rows (computed client-side from `DataContext`, free — no new query), worded as "N transactions need transfer review" since it counts rows, not links, and so won't numerically match OskoLinker's own "N transfers need review" (which counts pairs).

- **Fixed 2026-08-14 — Expenses KPI integrity and rejected-transfer reporting.** The hero metric's focused pass subtracted `activeTo` from itself, forcing every selected range to one day; daily average therefore equalled the whole period and every “vs prev” compared against only the day before the range. Inclusive UTC calendar-day helpers now drive both the denominator and the immediately preceding equal-length window, with exact 3M regression coverage. The Phase 4 move to strict kind-based analytics also omitted transactions whose durable transfer verdict was rejected but whose derived kind remained `transfer`; the shared effective reporting kind now returns those legs to ordinary activity consistently across Expenses totals/trend/flow/pacing, Dashboard, Accounts and Income cash flow. Database reconciliation for the reported tenant is current $5,490.82, prior $9,087.97, $73.21/day over 75 days (displayed $5,491, $9,088 and $73; −40%). Unit 257/257, Phase 4 live 23/23, Phase 5 live 30/30, strict TypeScript, production build and authenticated browser checks pass; database invariants report zero invalid kinds and zero non-reconciling splits.
- **Recurring-pair + timestamp matching (`app/src/lib/transfers/pairCadence.ts`, mirrored in `_shared/transferMatch.ts`):** once an account pair has ≥3 confirmed/auto transfers at a consistent cadence (reusing `recurring.ts`'s gap/conformance/CV approach, sourced via the `transfer_pair_history()` SQL function keyed on the unordered account pair), a later candidate landing on that cadence and within ±15% of the established amount gets a capped `+0.15` score bonus (`PAIR_CADENCE_BONUS`) — enough to lift a near-auto pair over `AUTO_THRESHOLD` without a click. Separately, `transactions.provider_posted_at` (a `timestamptz`, populated for every Up-sourced row since 20260807000000 but never previously read by the matcher) now feeds a `scoreTime` ambiguity tie-breaker (`TIME_BONUS_MAX = 0.1`) — two same-day, same-amount Up-sourced candidates split apart by whichever pair's timestamps are closer. Both bonuses are additive on top of the weighted score, never folded into `WEIGHTS` (which assumes full signal coverage); both are exactly 0 for the common case (no pair history yet; CSV-only legs, which never carry a timestamp), so existing behaviour is unchanged when neither applies.

---
*Note to AI Agents: Keep this index concise and update it when structural or architectural changes are made.*

BUI-07a component ownership: `budget/BudgetSettings.tsx` routes the existing frequency,
account policy, rollover and lifecycle controllers once. `BudgetLifecycle` retains
historical review/carry and next-period actions. `BudgetTaskPanel` adds route-reset
and recovery-only completion options for settings; goal completion keeps its original
default. Button-only rollover draft actions expose semantic dirty markers. See
[[BUDGET_BUI_07A_SETTINGS_HOST]] for host verification; [[BUDGET_BUI_07B_FREQUENCY_ACCOUNTS]] records completed grouped forms. [[BUDGET_BUI_07C_ROLLOVER_LIFECYCLE]] records completed rollover/lifecycle presentation and visible native preparation counts. [[BUDGET_BUI_08A_MY_PLAN]] records completed saved allocation composition and edit entry. [[BUDGET_BUI_08B_LOOK_BACK]] records completed historical presentation and preserved review/next-period choices. [[BUDGET_BUI_09A_MANUAL_SETUP]] records completed retained setup and separate draft activation. R02 eligibility is corrected in [[BUDGET_R02_ELIGIBILITY]]. R03 is corrected in [[BUDGET_R03_READINESS]]. R04 is complete in [[BUDGET_R04_INPUT_REVIEW]]. R05 is complete in [[BUDGET_R05_SIGNED_ESTIMATOR]]. BUI-09b is complete in [[BUDGET_BUI_09B_ASSISTANCE]]. BUI-10 is complete in [[BUDGET_BUI_10_CANDIDATE_VERIFICATION]]. BUI-11 is complete with owner presentation acceptance in [[BUDGET_BUI_11_OWNER_HANDBACK]]. R01 engineering is complete in [[BUDGET_R01_SPENDING_FORECAST]]; next is affected human verification.

`components/budget/BudgetPlan.tsx` renders qualified saved allocation values from
`budgetPresentation.ts`; it does not total money or build requests. `Budget.tsx`
keeps the existing editor and focuses it on entry. Its My plan activity route keeps
`BudgetItems` mounted but hidden until Overview is selected. Missing future values
remain unavailable. See [[BUDGET_BUI_08A_MY_PLAN]] for current/future and recovery proof.

`components/budget/BudgetHistory.tsx` presents existing lifecycle facts and immutable
saved review payloads; it does not calculate history or construct commands.
`BudgetLifecycle.tsx` retains carry/reopen/Undo/next-budget controllers and stays
mounted while Look back is hidden. The page exposes a compact Look back entry on
other views. Current/future plans cannot be marked reviewed, and no-account latest
observations remain unavailable. See [[BUDGET_BUI_08B_LOOK_BACK]].

BUI-09a retains the existing inactive `BudgetEditor` in the native task surface.
`BudgetTaskPanel` adds optional `open`, `retainOnClose` and description props;
existing goal/settings defaults are unchanged. Closed setup keeps its mounted
input state and context intent, with explicit session/reload copy. Saved draft
review uses a separate native task; only Start this budget sends activation.
No financial request body changed. See [[BUDGET_BUI_09A_MANUAL_SETUP]].

### R02 assistance eligibility correction — 26 October 2026

[[BUDGET_R02_ELIGIBILITY]] records forward migration
`20261026000000_budget_assistance_calendar_gate.sql` (92): assistance requires
three complete comparable calendar months within the latest six complete months,
plus six covered aligned 14-day windows for fortnightly plans. The response carries
calendar evidence; client draft/what-if/outcome gates fail closed without it.
20 red / 34 green focused checks, 472 lifecycle checks and 568 unit passes
(14 skips), types/syntax/build pass. No personal migration. Next R03 readiness;
UI remains 14/17 and release gates remain open.

### R03 assistance readiness — 26 October 2026

[[BUDGET_R03_READINESS]] records forward migration
`20261026010000_budget_assistance_readiness.sql` (93), with canonical complete
target-period usage, null for unavailable evidence, normalized windows/timezone
and target evidence in the fingerprint. Reviewed client changes enforce unused
current room or explicit future intent. Conditional goal timing checks opening
reserve, signed capacity and actual remaining schedules, shows exact deadline
shortfalls and stays within twelve months. 39 focused / 472 lifecycle checks,
four WCAG scans/four captures, 574 unit passes/14 skips and types/build pass.
No personal migration. Next R04 confirmation/preservation, then R05/BUI-09b.
UI remains 14/17 and final release gates remain open.

### R04 individual inputs and preservation — 26 October 2026

[[BUDGET_R04_INPUT_REVIEW]] records migration
`20261026020000_budget_assistance_input_review.sql` (94), durable chosen
income/pay dates, individually reviewed bill/reserve terms and atomic cost
configuration at activation. `budgetAssistanceReview.ts` selectively merges
confirmed fields, retaining protected lines, reserves, goal intent, top-up and
destinations. `BudgetAssistanceInputs` collects the individual review;
`BudgetSetupInputSummary` exposes the saved terms and confirmation state.
Rechecks keep edited values and clear confirmations; manual fallback retains
valid inputs without a history-derived spending cut. Dated canonical income
observations remain separate from expected pay. Paid costs require manual
matching; unresolved essential costs and known future gaps suppress goal outcomes.
98 final combined / 472 lifecycle checks on separate fresh targets, eight WCAG
scans, 583 unit passes/14 skips and types/build pass. No personal migration.
Next R05, then BUI-09b; UI remains 14/17 and release gates remain open.

### R05 signed estimator — 26 October 2026

[[BUDGET_R05_SIGNED_ESTIMATOR]] records migration `20261026030000_budget_assistance_signed_estimator.sql` (95), method v2, signed median/range and canonical reconciliation, explicit nonnegative manual allowances, conservative current gross spending with unassigned credits separate, exact-cent guards and preserved legacy manual/receipt behavior. `test-budget-estimator.mjs` supplies independent canonical reference vectors and browser proof. 73 reference / 98 dependency / 472 lifecycle checks on separate fresh targets, four focused WCAG scans, 586 unit passes/14 skips and types/build pass. No personal migration. Next BUI-09b; UI remains 14/17, R01 and M7 release gates remain open.

### BUI-09b assistance presentation — 27 October 2026

BUI-09b is complete in [[BUDGET_BUI_09B_ASSISTANCE]]: retained native assistance task, numbered evidence/amounts/review sections, preserved optional-change controller, signed planning receipt, explicit fresh review and Close/Back focus recovery. 221 combined presentation/R02–R05 and 472 lifecycle checks pass on separate fresh targets across 95 migrations, with 42 combined WCAG scans, 30 presentation captures, 586 unit passes/14 skips and types/build. No personal migration. The existing native panel remains the sole focus owner; no dependency, calculation, command or migration change. `test-budget-assistance-presentation.mjs` records five widths and both themes. UI progress is 15/17; next BUI-10, then BUI-11 owner handback. R01 and M7 human/release gates remain open.

### BUI-10 candidate verification — 27 October 2026

BUI-10 is complete in [[BUDGET_BUI_10_CANDIDATE_VERIFICATION]]: 263 accessibility checks/64 states, 187 candidate checks/70 state-width-theme scans, and 472 lifecycle checks on separate fresh targets across 95 migrations. All 134 axe scans pass; 144 captures and manifests record seven financial/recovery states and the assembled UI. 586 unit passes/14 skips, full/focused/browser types and build pass. A phone theme-control overlap was fixed by reusing the shared toggle in the Budget header; other routes retain their floating control. No personal migration or exposure. `test-budget-candidate.mjs` and the refreshed accessibility harness capture current native tasks and preserved canonical financial values. The source manifest records the uncommitted candidate by file hash. UI is 16/17; BUI-11 owner handback is next. R01 and M7 human/release gates remain open.

### BUI-11 owner acceptance and handback — 27 October 2026

BUI-11 is complete in [[BUDGET_BUI_11_OWNER_HANDBACK]]: on 27 October 2026 the owner explicitly replied “Accept the visual presentation”. The engineering handback removes two unused Look back placeholder CSS rules; all other 440 BUI-10 source hashes match. Fresh 586 unit passes/14 skips, full/focused/browser types and build pass. BUI-10 remains the live-test baseline, rather than being claimed as a new BUI-11 run. Presentation acceptance does not close R01 or M7 human/release gates. [[BUDGET_UI_IMPLEMENTATION_HANDOFF]] now records all 17 presentation bursts delivered. `docs/budget-ui/bui-11/cleanup-delta.json` proves the exact two-rule CSS delta from the candidate; active task/controller code and the separate non-shipping concept entry are retained. No personal fixtures/migration, deployment or commit occurred. R01 has since been completed in [[BUDGET_R01_SPENDING_FORECAST]]; affected human and M7 operational/release gates remain.

### R01 spending forecast — 28 October 2026

[[BUDGET_R01_SPENDING_FORECAST]] records engineering closure of the final R01–R05 finding. Migration `20261027000000_budget_spending_forecast.sql` (96) adds service-only `budget_forecast_facts` and composes it into workspace/attention reads, without adding financial tables or changing immutable financial snapshots. `app/src/lib/budgetForecast.ts` validates exact source/version/date and complete-month/safe-cent facts; `app/src/components/budget/BudgetForecast.tsx` presents flexible/fixed projections, separate pending warnings and inspectable dates/method inside existing checks. `budgetAttention.ts`/`BudgetAttention.tsx` retain preferences/reopening and separate projected gaps from real-money shortfall totals. `test-budget-forecast.mjs` and `preview-budget-forecast.mjs` provide guarded disposable proof and the eighth fictional preview account. Final evidence is in `docs/budget-ui/r01/`; human accessibility/comprehension, capacity, authorized migration/restore, final cross-feature/security and release authorization remain open. Release remains No-Go.

### Budget Overview simplification study — 28 October 2026

[[BUDGET_OVERVIEW_SIMPLIFICATION_STUDY]] records the owner-authorized hierarchy and desktop/phone review proposal after the R01 walkthrough passed but exposed text overload. `app/budget-overview-study.html` is a non-shipping fictional standalone entry with a recorded/estimated comparison plot, one priority decision, compact bill/goal summaries and five state variants. `app/scripts/test-budget-overview-study.mjs` verifies its responsive/accessibility/local interaction behavior and zero financial API calls. Screenshots and evidence are under `docs/budget-ui/overview-simplification/`. Production route/components/calculations remain unchanged; owner feedback is next.

`app/budget-ambient-concept.html` compares Original tiles, Statement and Open overview using the same sample figures, shared canvas and bottom-right theme dock. Statement and the softened scene are the defaults. The approved Open overview is implemented on `/budget`. Budget uses the quieter shared scene, open summary and allowance rows, and the shared theme switch in the shell footer.

### Overview simplification pass 1 — 28 October 2026

[[BUDGET_OVERVIEW_PASS_1_SUMMARY_FORECAST]] records the owner-authorized first production pass. `BudgetHero.tsx` now hosts `BudgetForecast.tsx`; the checks component no longer duplicates it. `budgetForecastComparison.ts` supplies guarded display geometry, with six boundary unit cases. The forecast uses direct amount-based copy, solid/hatched comparison and optional method/fixed dates. `test-budget-overview-pass1.mjs` verifies the real eligible preview plus explicitly response-only display states, 30 WCAG/fit cases, seven boundaries/guards, disclosure/navigation and zero Budget writes. Income, attention controller, bills/goals and canonical financial/backend functions are preserved. Evidence: `docs/budget-ui/overview-pass1/`. Ready for separately requested pass two.

### Overview simplification pass 2 — 28 October 2026

[[BUDGET_OVERVIEW_PASS_2_ATTENTION_COMMITMENTS_GOALS]] records the owner-authorized second production pass. `BudgetHero.tsx` hosts canonical attention and moves ordinary income detail into a disclosure; `Budget.tsx` keeps Overview mounted across views for retained review state. `BudgetItems.tsx` retains allowance tools and all original tasks, while `BudgetCommitments.tsx` and `BudgetGoals.tsx` compact line summaries and preserve their detailed evidence/controllers. `BudgetAttention.tsx` shows one server-ordered priority and reachable all/reviewed checks, with existing reminder commands behind options. `test-budget-overview-pass2.mjs` verifies real fictional acknowledgement/Undo, unchanged financial facts, original tasks, retained/stale choices, 30 full-workspace WCAG/fit cases and display-only edge variants. Backend/calculation sources are unchanged. Evidence: `docs/budget-ui/overview-pass2/`; next pass three assembled verification.

**Missing recent activity (2026-11-12).** For the current period, `BudgetHero.tsx` uses `useBehindAccounts` (the `account_activity` read, `DataContext` accounts, and the period's activity scope) with the pure `lib/budgetFreshness.ts`. Together they name budget accounts that are probably behind: a bank-synced account with no sync in 3 days (`Account.lastSyncedAt`, from `account_connections.balance_as_of`), or an imported account in regular use (≥3 recent rows) with no transaction for more than 3× its usual gap (at least 10 days). The hero then shows a "Spending since … may be missing" notice listing each account and its last date, with Import statements / Check bank sync links. It also mutes the remaining amount and labels it "before missing activity", and the spent line reads "Recorded so far … You've probably spent more". It's a warning only; no figure changes. `Shell.tsx`'s footer now shows the real latest bank sync ("Bank sync connected · Last bank sync 7m ago", or "No bank sync") instead of the hardcoded "System nominal · all accounts synced · 2m ago".

**Unplanned pay (2026-11-12).** `components/budget/BudgetUnplanned.tsx` sits at the top of `BudgetItems`. For a current or future budget with known positive `income.unallocated`, it shows "$X of your pay isn't planned yet" (with its share of expected pay) and three choices: bills first (Add a bill / Find bills in my spending, which opens and focuses `#budget-find-bills`), Save for something, or Keep it as a buffer. The buffer choice is a per-period device-only `localStorage` flag that collapses the prompt to one line with "Plan it". While the prompt shows, the duplicate header and empty-state add/save actions are hidden. The hero links down to it (`onUnplanned` → `focusSection('budget-unplanned')`). The empty bills state now explains why bills matter and links to the same actions.

**Overview simplification (2026-11-12).** These are wording and layout changes only; no figure or calculation changed.

**One bill finder (2026-11-12).** Setup (`BudgetDetectedBills`) and the workspace (`components/budget/BudgetBillFinder.tsx`, which replaces the inline list in `BudgetItems`) share `lib/budgetBillSuggestions.ts`:
- `stoppedOrGap`: a dormant pattern counts as an import gap when its next charge is after the account's last activity.
- `rollForward`: past due dates move to the next one.
- `merchantLabel`: ledger display names.
- `classifySuggestions`: current / import-gap are offered; stopped, possible-annual (two charges) and manual go under "Other patterns we noticed". A saved bill that stopped gets "Review pausing it".
- Shared cadence wording.

"Review and add" still opens the existing bill form with a proposal; nothing is saved without the form. Server side, migrations `20261112000000` and `20261112010000` change which ≤100 merchant groups `budget_recurring_evidence_r06_uncached`/`_reference` check. Previously it was `account_id` order, which skipped whole accounts. Now groups that can be checked (≤256 charges) come first, then bill-like groups (charges in 3+ of the last 13 months, or 2–6 charges spread over 300+ days), then most recent, most frequent and a deterministic tie. Evidence, limits and response shape are unchanged, and the cache key is bumped to `recurring-read-r06-v3`. Both migrations were applied to the local main DB after verified backups.
- **Goals:** one headline ("$400 of about $900 set aside (44%) · needed by 14 Jan 2027"), a progress bar and the pace line. Matched transfers and confirmations show only when non-zero. The four separate measures moved into an "All figures" disclosure, which keeps the `goal-planned`/`goal-bank`/`goal-user` value names.
- **Hero "How it works":** plain labels, with the carry and "moved in" rows shown only when non-zero (`everyday-rights` now lives there).
- **`BudgetEveryday`:** its duplicate "How the everyday allowance adds up" breakdown and partial-coverage notice are gone. The tools disclosure is now "Category limits and moving money".
- **Plain wording:** `BudgetForecast` labels and explanation, `forecastReason` and `attentionMessage` texts, "Things to check", and Look back's "carried over from last budget".
- **Coverage notices:** one short notice per section, still outside disclosures as the commitments test requires.

### Overview simplification pass 3 — 28 October 2026

[[BUDGET_OVERVIEW_PASS_3_VERIFICATION]] records fresh 472-check lifecycle and 442-check assembled runs across 96 migrations, 131 passing accessibility scans, a 70-case candidate matrix and 595 unit passes/14 skips. `app/scripts/lib/budgetOverviewUI.mjs` provides explicit native disclosure navigation for legacy journeys. `test-budget-workspace.mjs --overview-pass3` composes the forecast, hero, goal, commitment, attention and candidate suites with isolated capture paths. The only production delta is a qualified phone funding-gap notice above the allowance in `BudgetHero.tsx`/`budget.css`; financial/backend sources are identical to pass two. Final evidence is in `docs/budget-ui/overview-pass3/`. Preview `halcyon-budget-m2-c65dd04871874dcb` / PID 80255 is retained for the pending owner comparison. M7 human and operational/release gates remain open.
