---
aliases:
  - Budget Manual Workspace
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: m3-complete-isolated-only
project: Halcyon
created: 2026-10-21
updated: 2026-10-21
related:
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[BUDGET_M2_DURABLE_BOUNDARY]]"
  - "[[BUDGET_SCOPE_BASELINE]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# Budget M3 — authenticated manual workspace

Implementation of the next dependency-ordered slice of **BUDGET-V1-2026-10-20**. This is not a
public release, a replacement concept or a personal-stack migration. The approved concept remains
unchanged. M4–M7 are still required for the complete feature.

## Implemented boundary

- Authenticated `/budget`, with Budget immediately after Expenses when the client preview flag is
  enabled. Later rail numerals shift only in that build. Budget bypasses the bank-account onboarding
  requirement, not authentication, tenancy or owner authorization.
- Guided manual setup: monthly calendar months or anchored 14-day periods; visible dates/timezone;
  AUD only; explicit optional activity-account selection; expected income, one-off existing-cash
  drawdown, one everyday allowance and optional bill/reserve/planned-transfer allowances.
- Exact decimal inputs become checked integer cents. Invalid, blank, negative, exponent or
  over-precision input cannot become an implicit zero or pass the review/save boundary.
- Preview of resources, allocations, unallocated amount or funding gap. Show continuing-period
  resources separately: one-off existing cash never repeats in the future template. Both current
  and future gaps require explicit acceptance where applicable.
- Explicit **Save setup draft**, resume/reload, **Review saved draft**, then **Start this budget**.
  Draft save never activates. Changing source information requires reviewing/resaving a stale draft.
- Overview distinguishes expected income from recorded income, planned money from bank balances,
  settled expenses from refunds/credits, and pending activity from settled totals. My plan lists
  allocation intent and saved future-template amounts. Adjustments default to this period only;
  applying to this and future periods is an explicit radio choice and separate preview.
- Missing/partial history is visibly incomplete. No selected accounts means manual planning, not
  a claim of complete zero spending. Missing/deleted/unsupported account scope hides actual totals.
  Failed refresh retains the last verified figures with an out-of-date warning, never fake zeros.
- Latest persisted period is labelled with its actual saved dates. An expired period is not called
  today's budget and cannot be edited through this UI while lifecycle advancement is unbuilt.

## System and control design

`app/src/contexts/BudgetContext.tsx` is the contained Budget fetch/command boundary, above the
route tree. Its state is keyed by authenticated user and tenant; source errors and route navigation
do not reset accepted editor values. Old identity responses cannot populate a new workspace.
No Budget calculation uses `DataContext`'s capped ledger list. No browser application-table writes
or direct RPC calls were added.

`query-budget` adds strict `{action:'workspace'}` to its existing Zod read selector. It returns the
canonical SQL snapshot plus tenant-bound, RLS-read account IDs/names/currencies, saved account
membership intervals and the server's write-exposure state. It deliberately omits account balances,
raw transactions and credentials. Account/scope reads are ordered and bounded at 501; more than
500 fails explicitly rather than silently truncating. Source changes after the snapshot are caught
by the command's source version. These supporting reads are not a new atomic financial snapshot.
All financial snapshot totals still come from the M2 gate-protected SQL query.

Two independent flags remain off by default: `VITE_BUDGET_V1_ENABLED` exposes navigation and new
client writes; `BUDGET_V1_ENABLED` authorizes new server writes after normal owner checks. Direct
authenticated `/budget` reads/result recovery remain reachable when navigation is hidden, as the
M0 rollback contract requires. The server flag is never substituted with client authorization.

### Interrupted saves and privacy

Before sending a command, save its exact body and request UUID in tenant/user-scoped **sessionStorage**
under a production-only `halcyon-budget-pending-v1:<user>:<tenant>` key. This is a short-lived tab
checkpoint, not the source of budget truth, and is separate from all fictional concept keys. It
contains the owner's pending financial inputs; it must not be logged or sent to telemetry.
No concept localStorage engine or fixture state is imported.

The checkpoint survives route changes/reload. While unresolved it blocks new commands. Recovery
looks up the durable receipt first and only replays the exact original body/key if no result is
present. A lookup failure does not send another mutation. Confirmed success/definitive rejection or
sign-out/identity switch clears the checkpoint. Tab closure discards sessionStorage; successfully
saved drafts/plans and server receipts remain durable. Browser-storage failure prevents sending a
write without a recoverable checkpoint. Unsaved/unknown state warns before browser unload.

Server conflicts preserve the editor and require refresh/review; they do not silently overwrite or
automatically rebase. Refreshing resets the confirmation step before another save.

M2 permits arbitrary partial draft JSON. This UI validates the saved shape before opening it; older
or unsupported partial formats remain on the server with an explanation instead of crashing or
being silently converted to zero-filled ready setup. Replacing a saved draft starts with an explicit
confirmation and still requires a separate save. This phase's own drafts use the documented Setup
shape. General migration/editing of arbitrary legacy partial formats is not claimed.

## Design handoff and interaction states

The design-handoff review applies the existing Halcyon components/tokens, not a new visual system:

| Element | Implementation contract |
| --- | --- |
| Workspace | 1200px maximum, single scroll-region, 4px right inset, 24px bottom breathing room |
| Grouping | Existing Screen/ViewHeader/Grid/Tile; 16px radius glass; 20px desktop padding, 16px below 480px |
| Forms | Single column on phone; two columns at existing `md` breakpoint; 16px gaps; native controls |
| Inputs/actions | Minimum 44px target; input fill and strong boundary use existing theme variables |
| Type | Archivo headings, Hanken body, existing body-copy/detail-copy/field-label; tabular money; sentence-case actions |
| Colour | Ink-first, accent-ink for selection/focus, warn for incomplete/gaps, neg for errors; light/dark tokens only |
| Overview/My plan | Native pressed view buttons, 44px targets; selected underline plus text, not colour alone |
| Help | Optional native disclosures and short inline explanations; no forced tutorial or jargon-only figures |
| Loading/saving | Shared OperationStatusPanel, meaningful stage text, aria-busy/status; no invented percent/ETA |
| Errors | Alert, preserved data/edits, recovery or refresh action; no empty-success or zero substitution |
| Focus | Native keyboard controls, global visible focus; return to Budget heading after write outcome; native confirmation for leaving/replacing edits |
| Motion | Existing Framer layout/entrance only, global reduced-motion support; no new chart or anime owner |

Editor changes invalidate review/gap acceptance. Disabled write state explains the preview/server or
role boundary. Account currency is visible and unsupported choices disabled. Scope is explicit in
setup and visible on Overview. No hidden “apply all” action, forced bank link, confidence score,
success streak, savings percentage or safe-to-spend claim is introduced.

## Deliberate later-phase boundaries

- M4: dated bills, goals/targets/deadlines, earned/confirmed funding, purchase/refund matching,
  contributions and source-claim evidence, category limits/reallocation and per-line actuals.
- M5: period advancement/close/review, carry, frequency changes/bridges, effective account scope,
  lifecycle policies and workflow-specific undo UI. Snapshot totals alone are not line usage.
- M6: gated suggestions and one bounded scenario; no AI dependency is added in M3.
- M7: full acceptance mapping, independent beginner/human accessibility checks, realistic performance,
  backup/restore rehearsal and separately approved personal/production rollout.

## Verification

`npm run test:budget:workspace` extends the M2 runner. It provisions a fresh uniquely labelled
Supabase project on API **57421**, DB **57422**, and a non-reused Vite origin **57300**, with the
existing same-origin test proxy pointing only at that isolated API. No personal environment file is
copied. Browser signup fixtures use genuine Auth sessions; mutations occur through the real page and
authenticated Edge boundary. Fictional data setup/cleanup is scoped to captured fixture IDs.

The runner also rechecks the full M2 SQL/RLS/concurrency suite, all 67 migrations and write-disable
receipt recovery, then removes only its generated project resources. Browser artifacts are temporary
fictional-data screenshots, not evidence of live deployment or independent usability approval.

Final validation, 21 October 2026:

- **109 combined real Edge/SQL/RLS/concurrency/browser checks passed**, replaying all **67 migrations**.
  Final disposable project: `halcyon-budget-m2-000168d2100f4d6d` (the provisioner retains its M2
  project prefix). Follow-up Docker checks found no labelled containers, volumes or networks.
- Browser flows: desktop monthly setup, explicit account currency, save without activation,
  reload/resume/activation, complete 1,005-row totals independent of the detail cap, incomplete and
  confirmed coverage, period-only and continuing edits, dropped post-commit response recovered after
  reload with exactly one revision, stale-source rejection preserving edits and requiring review,
  genuine read-only viewer on tablet, no-bank/zero-income fortnightly phone setup, phone future-gap
  acceptance, and failed refresh preserving verified data. No browser runtime errors were observed.
- Desktop 1440px/light and phone 390px/dark screenshots were inspected after tile animations
  settled. The phone workspace has no horizontal overflow. This is engineering visual QA, not an
  independent beginner test, a contrast audit or a screen-reader sign-off.
- **447 unit tests passed, 14 existing skips**, including 25 new workspace entry/preview/recovery/navigation
  tests and the 61 existing foundation vectors/mirror guards.
- Focused Budget workspace TypeScript and production Vite build passed. Full-app TypeScript still
  fails at the previously documented `StrategicProjections.tsx:252` metric mismatch; no unrelated
  fix is included. The existing large-chunk build warning remains.

The initial direct-cross-origin browser attempt could not resolve workspace membership. The runner
uses the repository's existing same-origin test proxy instead; no production authentication code or
data-safety guard was weakened to make the test pass. All failed disposable runs were also removed.

Next implementation milestone: **M4 bills/reserves/goals**. Remaining M7 gates include arbitrary
legacy-partial-draft handling, independent beginner and assistive-technology reviews, expanded
breakpoint/theme/zoom checks, broader cross-feature regressions, realistic performance and approved
backup/migration/rollout. No personal database was queried, migrated, seeded, reset or cleaned up.
