---
aliases:
  - Planning Experience Plan
  - Goals and Scenarios Plan
tags:
  - halcyon
  - projects/fin-app
  - roadmap
  - planning
status: shelved
project: Halcyon
up: "[[MVP_SCOPE]]"
related:
  - "[[CURRENT_STATUS]]"
  - "[[Halcyon_DesignSystem]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# Durable planning experience — phased implementation plan

**Checkpoint — 2026-10-15:** Phases 1–4 are implemented and validated. The existing deterministic
projection model now has cent-accurate dated planning inputs, saved-baseline-versus-scenario
comparison, an inspectable monthly reconciliation and clear completeness warnings. The broader
output-contract work in Phase 0 remains future work.

## Decision and boundary

Halcyon already ships a deterministic **Strategic Projections** calculator in
`app/src/components/StrategicProjections.tsx`. It forecasts cash holdings or net worth from current
balances and up to six completed months of observed activity, can answer a value-by-date or
date-for-value question, and supports a temporary what-if adjustment. `app/src/lib/projections.ts`
is deliberately pure and tested.

The remaining product is **not** a replacement forecasting engine. It is a durable planning layer
on top of that calculator:

```text
Current accounts + settled ledger history + detected recurring commitments
                         + saved plan inputs
                                      ↓
                       deterministic monthly forecast
                                      ↓
                goals, scenarios, explanation and actual-vs-plan review
```

The source of truth is always the current ledger and the user's saved *inputs*. Never persist a
forecast line as if it were a balance or future bank transaction. Recalculate it when balances,
history, recurring overrides or planning inputs change; record the inputs and their audit history
instead.

This plan intentionally excludes tax advice, personalised investment advice, autonomous spending
changes, and bank-account writes. It must always present an estimate and its assumptions, not a
promise.

## Completion definition

The feature is complete when a signed-in user can:

1. Create, edit, pause, archive and restore multiple named goals.
2. Choose cash or net-worth measurement and an explicit set of included accounts for every goal.
3. Save a baseline and multiple named what-if scenarios without any scenario changing real account
   data, transactions, recurring commitment settings or another scenario.
4. Add known future one-off and monthly events (for example a holiday, salary change or rent rise)
   to a scenario, with a visible start/end date and signed monthly impact.
5. See an auditable forecast month-by-month: observed baseline, confirmed recurring commitments,
   saved planned events, scenario adjustments and—for net worth only—an explicit investment-return
   assumption.
6. Compare a selected goal's plan with actual settled results for completed months, understand the
   variance, and intentionally rebaseline or retain the original plan.
7. Undo the most recent planning mutation when no later conflicting planning mutation exists.

It is not complete merely because the chart draws or a goal can be stored.

## Product rules

- **Separate planning from ledger truth.** Planning records must never manufacture future `transactions`
  or alter account balances. Forecast values are display/model output only.
- **Use cents and ISO dates everywhere.** Inputs use integer cents and `YYYY-MM-DD`; dollars are a UI
  conversion only.
- **Tenant and account scoped.** A user can only select accounts visible through their tenant/RLS
  scope. An account is never identified by display name.
- **Settled history only.** Pending rows, reconciliation anchors and transfer artefacts stay out of the
  observed-run-rate baseline according to the projection model's documented rules.
- **Recurring commitments are explicit inputs.** A confirmed active recurring series may contribute a
  planned outflow only when the user enables it for the plan. Stopped/dismissed series and early
  candidates never contribute. The month detail must identify the commitment and whether its amount
  is detector-backed or has a user-managed override.
- **Scenarios are isolated.** A scenario belongs to one goal and only changes the forecast comparison;
  it does not become the baseline until the user explicitly promotes or copies it.
- **No hidden precision.** Return rate, monthly baseline, account inclusion and events must be shown in
  the UI and available in the calculation explanation. Empty or insufficient history produces an
  honest state, not a fabricated run rate.
- **No AI in money math.** The engine is deterministic. AI may later phrase a plainly labelled summary,
  but may not generate the forecast, infer a planned event, or modify a goal.

## Proposed durable model

The exact SQL names can follow project conventions, but the relationships and constraints below are
load-bearing.

| Record | Essential fields | Purpose and constraints |
| --- | --- | --- |
| `planning_goals` | `id`, `tenant_id`, `created_by`, `name`, `metric`, `target_cents`, `target_date`, `status`, timestamps | A goal is `cash` or `net_worth`; `status` is `active`, `paused` or `archived`. `target_cents > 0`; target date is optional for a date-free milestone. |
| `planning_goal_accounts` | `goal_id`, `account_id` | Explicit account scope. Unique per pair; the mutation boundary proves account tenancy. Net-worth goals may include all asset/liability account types; cash goals are limited to eligible cash accounts unless product rules deliberately expand them. |
| `planning_scenarios` | `id`, `goal_id`, `tenant_id`, `name`, `kind`, `annual_return_bps`, `is_baseline`, timestamps | The baseline is a saved configuration, not cached forecast output. One active baseline per goal; comparison scenarios are named and independently editable. Return is basis points, bounded conservatively. |
| `planning_events` | `id`, `scenario_id`, `tenant_id`, `name`, `amount_cents`, `cadence`, `start_date`, `end_date`, timestamps | User-known changes. `cadence` starts as `once` or `monthly`; signed cents identify inflow/outflow. Monthly events require a start; end is optional. No transaction ID is created. |
| `planning_change_events` | `id`, `tenant_id`, `actor_id`, `operation_id`, `entity`, `entity_id`, `before`, `after`, timestamps | Audit and guarded undo. Every mutable planning action is an operation; undo fails closed if a newer conflicting state exists. |

Do **not** add a `forecast_months` table in the first release. If performance later requires a cache,
it must have a visible input fingerprint, bounded invalidation and no authority over the model.

## Security and mutation boundary

Read [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md) in full before implementing migrations or executing
any test stack. The owner's normal local Supabase instance is not disposable.

- RLS allows tenant members to read their tenant's planning records, with ownership/role policy made
  explicit before release.
- Browser roles receive no direct insert/update/delete grant on planning tables or change-event tables.
- A `manage-planning` Edge Function uses the standard `withAuth` pipeline, Zod discriminated actions,
  caller-RLS proof of every referenced account/goal/scenario/event, then service-only SQL RPCs.
- RPCs own atomic validation, state mutation, `planning_change_events` insertion and audit logging.
  They reject cross-tenant identifiers, duplicate IDs, invalid dates/cadences, invalid account scope,
  target/amount overflow and stale guarded-undo state.
- All list reads use ordinary RLS-backed frontend queries; all writes pass through the mutation
  boundary. Rate limits and audit event names are added with the function.

## Delivery phases

### Phase 0 — Contract, model extraction and test fixtures

**Goal:** make the current calculator a reusable model without changing user-facing behaviour.

1. Extract a richer pure forecast contract from `lib/projections.ts`:
   - monthly input components and output month rows;
   - inclusion/exclusion reasons for observed history;
   - recurring-commitment inputs separate from generic planned events;
   - baseline and scenario comparison outputs; and
   - a stable calculation-input fingerprint for future cache invalidation only.
2. Preserve the existing calculation semantics as fixtures: cash vs net worth, completed-month
   baseline, transfers, investment contribution, target timing and scenario start month.
3. Add new pure fixtures for one-off event timing, monthly event start/end, included/excluded
   account scopes, recurring override changes, insufficient history and zero/negative trajectories.
4. Write the data-model/RLS/RPC migration design before SQL, including the exact undo conflict rule.
5. Update the design system with the planning vocabulary: **observed**, **planned**, **scenario**,
   **forecast**, **estimate**, **actual**, **variance**, and **rebaseline**.

**Exit gate:** existing projection tests remain green; new model tests prove every forecast value can
be decomposed into components; no schema or UI behaviour changes yet.

### Phase 1 — Durable goals and account scope

**Status: shipped (2026-10-15).**

**Goal:** replace the single ephemeral goal form with correctly scoped, persisted goals.

1. Create migrations for `planning_goals`, `planning_goal_accounts` and `planning_change_events`,
   including indexes on tenant/status and foreign keys with safe deletion behaviour.
2. Add RLS, revoked browser mutation grants, service-only RPCs and the `manage-planning` Edge
   Function for goal create/update/status/archive/restore and guarded undo.
3. Extend `DataContext` with RLS-backed planning reads, loading/error states and a scoped refresh
   after mutation. Do not reload unrelated application data unnecessarily.
4. Add a goal switcher on Strategic Projections with a clear empty state: **Create your first goal**.
   The creation flow asks for name, metric, target amount, optional target date and included accounts.
5. Show goal status and account scope in the projection header. Archive hides a goal by default but
   never deletes its audit history; paused goals remain readable but do not appear in active planning
   summaries.
6. Provide a short undo affordance after each goal mutation and accessible dialog focus/keyboard
   behaviour following existing Ledger modal conventions.

**Exit gate:** tenant isolation and browser-direct-write denial are schema tested on an isolated
stack; a user can manage multiple goals and refresh/reopen the app without losing them; goal data
does not alter balances, transactions or existing projections outside its selected scope.

### Phase 2 — Saved scenarios and planned events

**Status: shipped 2026-10-15.** Each goal receives a durable baseline scenario. Users can create,
rename, duplicate, archive and restore comparison scenarios; add signed one-off or bounded monthly
planning events; and undo the latest compatible saved scenario/event change. The opt-in recurring
input uses only active confirmed commitments and converts their upcoming schedule into read-only
forecast inputs after removing their observed ledger charges from the historical baseline, avoiding
double counting. Saved plans remain assumptions, never ledger transactions or cached forecast rows.

**Goal:** make an intentional, reusable future plan rather than a disposable slider.

1. Add `planning_scenarios` and `planning_events`, their RLS/constraints/RPC actions/audit history,
   and guarded undo for scenario/event mutations.
2. Seed exactly one baseline scenario when a goal is created. The baseline stores assumptions and
   planned events but no computed trajectory.
3. Support saved comparison scenarios: create, rename, duplicate from baseline or another scenario,
   edit, archive and restore. A scenario must always remain attached to exactly one goal.
4. Replace the current single what-if control with an event editor:
   - one-off inflow/outflow on a date;
   - monthly inflow/outflow from a start date, optionally until an end date;
   - explicit assumption changes such as investment return (net-worth only).
5. Add an explicit per-scenario **Include recurring commitments** setting. When on, construct forecast
   entries from active confirmed series using the same schedule/amount user sees in Recurring; show
   them as read-only imported planning inputs with a link back to manage the commitment.
6. Enforce deterministic ordering and cent-accurate monthly composition. A scenario with no events
   must match the existing baseline trajectory exactly.

**Exit gate:** scenario isolation is proven in unit and browser tests; duplicate/cross-tenant IDs are
rejected; archived/stopped recurring series and early signals never enter the forecast; event
boundaries work across month/year transitions.

### Phase 3 — Planning workspace and explainability

**Status: shipped 2026-10-15.** Forecasts now expose a saved baseline versus selected comparison
when one is selected, endpoint/target-date deltas, explicit warnings and a keyboard-accessible
monthly table. Each table row reconciles opening value, observed run rate, named recurring/planned
inputs, return and closing value. The full dashboard summary remains intentionally deferred until
the planning workspace has been used and its selected-goal semantics are proven in production.

**Goal:** make the forecast useful for decisions, not just visually plausible.

1. Give each month in the trajectory an inspectable breakdown:
   - opening value;
   - observed-run-rate movement;
   - each included recurring commitment;
   - each one-off/monthly planned event;
   - investment growth, if selected; and
   - closing forecast value.
2. Add a compact scenario comparison view: baseline versus one selected scenario, endpoint delta,
   target-date delta, and an accessible table fallback for the chart.
3. Surface completeness warnings rather than guessing: no completed history, excluded account
   activity, no target date, negative forecast, target outside the ten-year horizon, or changed
   recurring input since the scenario was last viewed.
4. Add a goal summary to Dashboard only after the goal workspace is reliable: at most one selected
   active goal, direct link to planning, and no duplicate planning controls.
5. Document all labels, empty states, keyboard interaction, reduced-motion presentation and chart
   contrast/tooltip requirements in `Halcyon_DesignSystem.md`.

**Exit gate:** a user can answer “what changes this month?”, “what gets me to this target?”, and
“how does this scenario differ?” without reading source code or trusting an unexplained curve.

### Phase 4 — Plan versus actual and rebaseline loop

**Status: shipped 2026-10-15.** The workspace reviews only the most recent completed month using
settled, goal-scoped ledger activity. Its visible variance reconciles observed movement against the
saved run rate and dated plan inputs; uncategorised rows remain an explicit residual rather than an
inferred explanation. Keeping a plan is a no-write acknowledgement. Rebaselining versions the
active baseline, archives rather than overwrites its predecessor, copies still-relevant planned
events, records the effective month, and supports guarded undo. Users can also copy the plan into a
comparison scenario for deliberate follow-up.

**Goal:** turn planning into an ongoing feedback loop after a plan survives contact with reality.

1. For each completed month, calculate an actual result over the goal's selected accounts using the
   same cash/net-worth rules as the baseline. Never compare a partial month as if it were final.
2. Compare actual to the applicable baseline/scenario forecast and create a deterministic variance
   breakdown: observed income/spend movement, recurring timing/amount difference, planned-event
   difference and uncategorised residual. Do not use AI to assign causes.
3. Offer three deliberate actions after variance review:
   - **Keep plan:** retain original assumptions;
   - **Rebaseline from current history:** create a new baseline version, preserving the old one; or
   - **Create scenario from actual:** copy the old plan into a new comparison scenario.
4. Show the last rebaseline date and which completed months informed it. A rebaseline is auditable
   and undoable while no later conflicting planning mutation exists.
5. Add a monthly planning-review state to the planning workspace; notification delivery remains a
   separate opt-in system and is not required for this feature's completion.

**Exit gate:** actual-versus-plan values reconcile to settled ledger/account data for fixture months;
rebaseline never overwrites history; each variance number has a visible, deterministic derivation.

## Explicitly post-completion / not in this plan

These are valuable, but must not delay the completed scope above:

- Debt amortisation, interest-rate schedules and repayment optimisation.
- Tax estimation, salary packaging, superannuation and jurisdiction-specific advice.
- Inflation modelling, probabilistic/Monte Carlo returns, market predictions or financial advice.
- Shared household plans, collaboration, approvals or advisor access.
- Automatic notification delivery (email/push), account transfers or any real-world financial action.
- AI-written planning narratives beyond a separately approved, source-cited presentation layer.

## Validation matrix

| Layer | Required checks |
| --- | --- |
| Pure model | Vitest fixtures for cents, date boundaries, account scope, recurring series, event cadence, target timing, no-history and negative cases. |
| Schema/RPC | Isolated `test:golden`-style migration/RLS/grant tests: no browser write privileges, tenant isolation, account proof, invalid input rejection, atomic mutation and guarded undo. |
| Edge Function | Request validation, rate limit/audit invocation, RLS proof and failure-path tests. |
| UI | Loading/error/empty states, scenario isolation, accessible modal focus, keyboard controls, reduced motion, responsive charts/table fallback. |
| Regression | Existing projections and recurring tests, full unit suite, production build, browser TypeScript check, `git diff --check`; isolated browser/database checks only against a generated non-personal target. |

## Suggested implementation order

Do not begin Phase 1 until the rest of the current app completion work is done. When this plan is
resumed, complete one phase and its exit gate before starting the next. Phase 1 is the first
deployment-worthy milestone; Phase 2 makes saved planning genuinely useful; Phase 3 makes it
trustworthy; and Phase 4 completes the planning feedback loop promised by this plan.
