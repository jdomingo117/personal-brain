---
aliases:
  - Halcyon operation feedback plan
  - Loading and progress plan
tags:
  - halcyon
  - projects/fin-app
  - design-system
  - accessibility
  - workflow
type: implementation-plan
status: phase-5-verification-in-progress
project: Halcyon
updated: 2026-10-16
related:
  - "[[Halcyon_DesignSystem]]"
  - "[[DESIGN_REVIEW_CHECKLIST]]"
  - "[[TAXONOMY_AND_LEDGER_PLAN]]"
  - "[[INGESTION_HARDENING_PLAN]]"
---

# Halcyon — Operation status and progress feedback plan

## Phase 0 completion record — 2026-10-16

**Completed:** the shared feedback contract, accessibility rules and an authoritative inventory of
the app's meaningful asynchronous workflows. The review-only concept route remains available at
`/concept/operation-status`; no production loading or mutation behaviour changed in this phase.

**Decisions locked for this rollout:**

- Do not add telemetry or analytics now. Any future timing/state instrumentation requires a
  separate product, privacy and data-retention decision; it must never include transaction
  descriptions, amounts, account identifiers or other financial data.
- Do not add a generic server job queue, polling layer or event stream. Existing resumable provider
  checkpoints remain the only approved durable-operation model. A future queue needs its own
  idempotency, tenancy, cancellation, audit and recovery contract.
- The component names and visual direction below are approved as the implementation target, but
  **only Phases 0–4 are complete**. The remaining verification and visual sign-off work is
  deliberately isolated in Phase 5.

## Decision

Adopt one shared, accessible operation-status system for work that takes long enough to make a
person wonder whether Halcyon received their action. The system must show **actual work or an
honest unknown-duration activity state**. It must never invent completion percentages, imply an AI
decision is being made autonomously, or conceal whether a financial-data write has occurred.

The interactive design reference is the authenticated concept route
`/concept/operation-status`. It is a review-only prototype, not a user-facing destination.

## Problem and product outcome

Several workflows already disable a button or display status text, but they do not share a visual
language, stage model or completion behavior. The categorisation-review preview is the clearest
example: a modal remains static while a potentially multi-request engine preview is generated.
That creates uncertainty about whether the request is active, stalled, or changing transaction
data.

After delivery, every meaningful waiting state will tell the user:

1. **The request was received.** The initiating control changes immediately.
2. **What is happening now.** Copy names a real operation, not vague “AI thinking”.
3. **What has or has not changed.** Preview-only work states that it has made no writes; writes
   show an explicit completion or error outcome.
4. **What to do next.** Continue, retry, safely close, or keep working elsewhere.

## Scope and non-goals

### In scope

- Shared foreground loading, determinate progress, staged progress, success and error primitives.
- One accessible status contract for modal, panel, form and background-safe contexts.
- The categorisation-review preview as the reference implementation.
- Rollout to statement/investment import, provider sync/history extension, transfer matching and
  high-frequency short writes.
- Tests for slow, error, completion, keyboard, screen-reader and reduced-motion states.

### Explicitly out of scope

- A generic persistent server job queue, event stream, or polling platform for every Edge Function.
- Fabricated percentages, elapsed-time promises or estimated completion times without a reliable
  source.
- Replacing existing business-state messages, audit history, undo, or error/retry semantics.
- A new “AI assistant” visual language, decorative neural animation, or background work that can
  write financial data after the user has left the approval step.

## Product policy

| Observed wait | Required feedback | Do not use |
| --- | --- | --- |
| Under ~400 ms | Immediate pressed/disabled control; no additional surface | Flashing loader |
| ~400 ms–2 s | Inline activity on the initiating button or local control | Full-screen/modal takeover |
| 2–10 s, or unknown duration | Visible activity indicator plus named current stage | Fake percentage |
| Over ~10 s or countable work | Real percentage, count or completed/current stages | Spinner alone |
| Safe background work | Persistent status that survives navigation, then an outcome | Silent background mutation |

The timing bands are presentation thresholds, not a substitute for performance work. If an action
is normally fast but crosses a threshold, the status surface may appear after a short delay so the
interface does not flash unnecessarily.

## Phase 0 workflow inventory

This inventory assigns the only honest presentation pattern for each workflow. A later phase may
improve its visuals, but must not turn an indeterminate action into numeric progress unless the
listed source exposes a real checkpoint.

| Workflow | Write/cancellation reality | Truthful status source | Assigned pattern | Rollout |
| --- | --- | --- | --- | --- |
| Route data load and refresh (`DataContext`, `ViewDataBoundary`) | Read-only; a refresh preserves the visible route | Existing `loadState` and `isRefreshing` | Route skeleton/error state; compact refresh notice | 4 |
| Ledger categorisation preview (`CategorizationReviewDialog`) | Preview-only; closing dismisses UI but cannot abort an in-flight request | `categorizationPreviewPages()` gives total client page groups and each resolved page gives completion | Foreground panel with named stages and **N of M** merchant groups | 2 |
| Ledger preview apply/undo and bulk corrections | Financial-data writes; no server sub-step is currently exposed | Pending request and final audited result only | Button-level activity, then explicit outcome/undo state; no percentage | 4 |
| Statement CSV parse, mapping, staging and categorisation (`CSVUploader`) | Parse/stage are local; final import is atomic and must not be backgrounded | Known source/staged rows and existing categorisation chunk completion; final commit has no checkpoint | Foreground staged panel; real batch/count progress where available, named indeterminate commit | 3 |
| Managed-investment import (`InvestmentCSVUploader`) | Confirmed import is a server-side write; no per-activity checkpoint is returned | Client confirmation/result boundary only | Named indeterminate foreground stages; explicit success/error outcome | 3 |
| Provider connection, sync and history extension (`ConnectBankModal`, `EditAccountModal`) | Resumable provider work; safe checkpoint state already persists | Existing `pages_fetched`, `rows_inserted` and `sync_runs` | Foreground checkpoints as counts; later one persistent background notice only for this safe operation | 3 then 4 |
| Transfer and investment-cash review/linking | Bounded review/decision writes; service returns final outcome rather than progress | Local request state and deterministic result count | Named local activity followed by result count/outcome | 3 |
| Routine account, planner, recurring, settings, security and auth writes | Short writes; existing controls own the action and result | Pending boolean plus success/error response | Inline activity in the initiating control; preserve current outcome/error treatment | 4 |
| Investment/tax/activity/audit tile reads | Read-only; destination shape is known | Local loading/error state | Tile skeleton or compact local activity, never shrunken paragraph copy | 4 |
| Browser export/download | A local response/download, not a durable background job | Request start and completed download response | Brief inline activity and existing confirmation/error feedback | 4 |

No workflow is approved to silently continue a financial-data mutation after its initiating surface
closes. Categorisation previews, imports, applies and undo remain foreground operations until a
separate durable-operation contract is designed.

## Shared component contract

The system should be deliberately small and composed from existing `Controls`, `Tile`, token and
motion conventions.

| Primitive | Purpose | Required inputs | Key behavior |
| --- | --- | --- | --- |
| `InlineActivity` | A small cue inside a button/field/row | accessible label, compact/regular size | Replaces a label icon; does not change layout or steal focus |
| `OperationStatusPanel` | Foreground operation in a dialog, card or workflow step | title, explanation, state, optional action | Uses `aria-busy` while changing and shows a distinct success/error outcome |
| `OperationSteps` | Ordered, named, real stages | current stage; completed stages; optional count | Completed = check; current = activity cue; future = quiet marker |
| `OperationProgress` | Measurable work | known min/max/current, or indeterminate mode | Native `<progress>` where suitable; no `aria-valuenow` when unknown |
| `BackgroundOperationNotice` | A safe operation continuing beyond its initiating surface | operation name, latest real checkpoint, outcome link | One compact, persistent notice; no competing spinners |
| `useOperationStatus` | Optional view-state helper, not a data mutation layer | start/update/succeed/fail/reset actions | Keeps state transitions and copy testable; services remain authoritative |

### Visual contract

- Use existing semantic tokens only: mint for active/safe completion, muted ink for queued detail,
  amber for actionable delay, red for failure. Colour never carries the entire meaning.
- Use one compact ring or indeterminate line for active work; no particle fields, “thinking” dots
  or decorative AI imagery.
- `outcome-panel` is the structural baseline. Status panels may add semantic border/wash tone but
  must not look like a new form field.
- Use 14–15px supporting copy and existing `control-label`/`body-copy` roles. Stage labels must be
  readable, not micro metadata.
- Motion is subtle and continuous only while activity is current. With `prefers-reduced-motion`,
  use a static activity icon plus text; status meaning never depends on motion.

### Accessibility contract

- Keep keyboard focus on the initiating control or dialog container; never move focus for every
  progress update.
- Mark a changing operation region `aria-busy="true"`; reset it when results are ready or failed.
- Use a polite `role="status"`/live region for meaningful stage and completion changes. Do not
  announce every tick or count increment.
- For true progress, expose the label and values via native `<progress>` or `role="progressbar"`.
  Unknown-duration indicators omit a numeric value.
- Error content uses `role="alert"`, says whether a write occurred, and offers retry only when
  retry is safe.
- Tests cover both reduced-motion preference and visual static fallback.

## Phased delivery

### Phase 0 — Finalise the contract and baseline — complete

**Goal:** prevent a generic loader from becoming inconsistent bespoke UI.

1. Approved the concept-page direction as a review-only prototype.
2. Recorded the workflow inventory above, including write safety, cancellation reality and each
   permitted status source.
3. Defined the `OperationState` vocabulary: `idle`, `working`, `succeeded`, `failed`; distinguish
   indeterminate activity from determinate progress.
4. Added the component specification, copy rules and accessibility contract to
   `Halcyon_DesignSystem.md`.
5. Explicitly deferred analytics and a generic durable job platform; neither is authorised by this
   plan.

**Exit gate:** met — every target workflow has an assigned pattern and an honest source for its
status; no production behavior changed.

### Phase 1 — Shared primitives and test fixtures — complete

**Goal:** establish one implementation path before wiring business workflows.

1. Added `InlineActivity`, `OperationStatusPanel`, `OperationSteps`, `OperationProgress` and
   `BackgroundOperationNotice` in `app/src/components/OperationStatus.tsx`.
2. Added motion-safe CSS using existing semantic tokens; the existing reduced-motion media query
   turns the activity mark into a static icon.
3. Added the small pure `app/src/lib/operationStatus.ts` view-model helper for state roles,
   completed-stage counts and valid bounded progress fractions.
4. Rebuilt the concept route with the production primitives for working, ready, failed,
   determinate and background-status fixtures.
5. Kept the concept route review-only and out of product navigation. Focused tests pass (5/5), the
   full unit suite passes (326 passed, 14 environment-dependent skips), and the production build
   passes.

**Exit gate:** code/test gate met. The pure tests prove bounded/indeterminate progress and live-role
selection; the concept fixture is available for the owner-led light/dark 390px and desktop visual
review before the workflow integration phase.

### Phase 2 — Categorisation-review reference implementation — complete

**Goal:** repair the workflow that exposed the problem without changing review or mutation rules.

1. Replaced the static loading sentence in `CategorizationReviewDialog.tsx` with
   `OperationStatusPanel`, `OperationSteps` and `OperationProgress`.
2. Derived the denominator from `categorizationPreviewPages(transactions)`. The dialog advances
   only after a bounded request resolves, showing the real completed/total group count and current
   group; it then combines all responses into the existing protected/suggested/unresolved review.
3. Kept the preview copy explicit: no transaction changes are being made. The header and pre-result
   button now say **Close preview**, accurately describing UI dismissal rather than cancellation.
4. A preview-page failure discards all partial results, states that no transaction changes were
   made and offers **Try preview again**, which restarts the complete preview. It does not expose a
   partial selectable result or create a resumable-preview contract.
5. Reused `InlineActivity` for apply/undo and replaced the applied-success box with a clear
   `OperationStatusPanel` before the existing guarded-undo control.

**Exit gate:** met. Selected, unresolved and all-eligible bounded review scopes derive the same
real page units; protected rows, the 500-row limit, stale-preview rejection and guarded undo are
unchanged. Focused review/status tests pass (14/14), the complete unit suite passes (327 passed,
14 environment-dependent skips), browser-suite TypeScript checks and the production build pass.

### Phase 3 — Measurable ingestion and provider workflows — complete

**Goal:** use true counts and existing checkpoints where the backend already supplies them.

1. **CSV import:** added named status panels for profile/mapping work, staged categorisation and
   atomic commit. Existing categorisation chunk callbacks now drive real completed/total merchant
   batch progress; the atomic `upsert-transactions` write remains an explicitly indeterminate stage.
2. **Investment import:** replaced the static processing sentence with named, indeterminate stages:
   validated holding → writing activities → reconciling valuation/cash links. It does not imply a
   per-activity server checkpoint.
3. **Provider connect/sync/history extension:** connected-backfill and account sync now expose the
   existing `pages_fetched` and `rows_inserted` checkpoints as absolute counts, while preserving
   resumable sync behavior and the existing safe **Run in background** option.
4. **Transfer scan/linking:** transfer and investment-funding queues now name their bounded fetch or
   rescan operation and explicitly state that no decision changes during it; existing final queue
   counts remain the deterministic outcome.

**Exit gate:** met. Every displayed number comes from an existing categorisation loop or provider
checkpoint; imports with no trustworthy denominator show named indeterminate activity instead of a
fabricated percentage. Focused ingestion/status tests pass (29/29), the complete unit suite passes
(327 passed, 14 environment-dependent skips), browser-suite TypeScript checks and the production
build pass.

### Phase 4 — Short writes and safe background status — complete

**Goal:** make routine operations feel responsive without putting every save behind a panel.

1. Standardise button-level `InlineActivity` for save, apply, undo, archive, restore, password,
   account and planning writes. Preserve current disabled/undo/error behavior.
2. Convert isolated “Loading…” paragraphs in data tiles to skeletons or compact local activity
   status depending on whether the eventual shape is known.
3. Introduce `BackgroundOperationNotice` only for operations that are genuinely safe to outlive
   the initiating view. Initially limit it to provider sync, using existing `sync_runs` data.
4. Do not make categorisation preview, imports, applies or undo backgroundable in this phase; each
   needs its result before the user can continue safely.

**Completed:** targeted routine writes now replace their static pending label with `InlineActivity`
and a named action in account creation, Ledger correction/undo, planning-goal save, recurring
commitment save/stop/resume/undo, identity updates and investment-price refresh. `AuditLogCard`,
investment activity and tax-record reads use compact local activity states rather than isolated
loading paragraphs. `ProviderSyncNotice` is mounted once for signed-in routes; it reads durable
`sync_runs` records every ten seconds, names the affected account(s), and only shows actual
pages/transactions/changes when the persisted checkpoint has them. It is the sole global
background notice and never starts, cancels or writes a sync.

**Verification:** `npm test -- --run` passed (327 tests, 14 environment-dependent skips),
`npm run test:browser:typecheck` passed, `npm run build` passed, and `git diff --check` passed.
The standalone `npx tsc --noEmit` remains blocked by two pre-existing errors outside this feature:
the `net_worth`/`netWorth` metric mismatch in `StrategicProjections.tsx` and an impossible
`dashboard-insight` comparison in `LedgerView.tsx`.

**Exit gate:** met. A single user-visible persistent notice aggregates active provider-sync
operations; routine forms keep their context and do not acquire unnecessary overlays. Preview,
import, apply and undo behavior remains foreground and unchanged.

### Phase 5 — Verification, rollout and retirement of the concept page

**Goal:** prove trustworthy behavior under real delays and make the system maintainable.

1. Add unit tests for status transition and copy models; add component tests for ARIA state,
   progress values and reduced motion.
2. Extend Ledger browser coverage with a delayed categorisation preview, success, error and retry;
   assert that no preview path writes a transaction.
3. Add ingestion/provider tests for real checkpoint displays and atomic-write wording.
4. Run visual review in light/dark at 390px, 768px, 1024px and 1440px. Verify contrast, wrapping,
   focus, live-region announcement and no clipped status panel inside dialogs.
5. Run `npm test`, `npm run build`, relevant browser tests, and `npm run test:golden` for any
   ingestion/backend interaction change. Remove or hide the concept route once the shared
   primitives are accepted, or retain it only as an explicitly non-production visual fixture.

**Progress record — 2026-10-16:** the pure/component status suite now verifies bounded versus
indeterminate native progress, live-region/busy/failure roles, compact activity labels and stage
meaning, durable-background roles, provider-sync checkpoint copy and the reduced-motion static
icon rule. The Ledger Playwright suite now includes a delayed preview that fails, confirms no
transaction write, retries from the complete preview and succeeds through a mocked function
response; it typechecks with the suite. The full unit suite passes (331 tests, 14
environment-dependent skips), browser-suite TypeScript checks pass, the production build passes,
and `git diff --check` passes.

The rendered Ledger test has **not** been executed in this working copy: its safety guard rejected
the personal local Supabase target at port 54321, as intended. It must run only against an explicitly
identified isolated stack. The owner-led authenticated light/dark visual review at 390px, 768px,
1024px and 1440px also remains outstanding, as does the final decision to retain or hide the
review-only concept route.

**Exit gate:** the reference flows have consistent, truthful feedback; an assistive-technology
user receives equivalent start, meaningful update and finish/error information; no application
data mutation has changed behavior merely to support presentation.

## Rollout order and dependencies

1. Phase 0–1 shared contract and primitives.
2. Phase 2 categorisation review, because it is bounded, preview-only and already has explicit
   client-side page units.
3. Phase 3 CSV/provider workflows, because some progress data already exists.
4. Phase 4 short writes and narrowly scoped background status.
5. Phase 5 gates, then concept-route disposition.

The plan intentionally does **not** require schema changes in Phases 0–2. A durable server-side
operation model is considered only if future backgroundable workflows require it; its idempotency,
tenancy, cancellation and audit semantics must be separately designed before any migration.

## Risks and safeguards

| Risk | Safeguard |
| --- | --- |
| Progress is misleading | Every count/stage is sourced from a known client loop or backend checkpoint; unknown work stays indeterminate. |
| A visual “cancel” overpromises | Label UI dismissal accurately; only offer Cancel when the operation can be safely aborted. |
| Status noise overwhelms routine work | Use the timing policy and one local/persistent indicator per operation. |
| Screen readers receive chatter | Announce stage changes and outcomes, not every progress tick; retain focus. |
| A presentation refactor weakens financial integrity | Keep all Edge/RPC boundaries, guarded undo, atomic writes and review protections unchanged; test no-write preview paths. |
| Background work loses user trust | Limit it to resumable, checkpointed, safe operations and preserve visible outcome/error history. |

## Next approval

Phases 0–4 are complete. The remaining approval is for **Phase 5 — Verification, rollout and
retirement of the concept page**, including the owner-led visual/accessibility pass and any
relevant live browser coverage.
