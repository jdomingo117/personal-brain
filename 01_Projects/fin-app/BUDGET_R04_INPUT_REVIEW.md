---
tags: [halcyon, budgeting, engineering, verification]
type: correctness-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_R03_READINESS]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
---

# R04 — confirmed individual inputs and preserved intent

R04 corrects G06/G07 and S02/S03/S08/S11: historical income is dated evidence,
not an automatic pay promise; costs need individual review; accepting one
suggestion must preserve unrelated user-entered intent.

## Implementation

`BudgetAssistanceInputs` collects a chosen expected take-home amount and actual
pay dates inside the selected budget. Zero is allowed when explicitly confirmed.
The observed-income button copies a reference amount into an editable field; it
does not confirm it. Receipt dates are shown separately from expected pay dates.
Each recurring cost has its own name, amount, cadence, schedule, selected/confirmed
choice and paid flag. Manual annual/quarterly/essential reserves additionally keep
an explicit opening reserve, full bill target, deadline and budget contribution.
Missing amounts or dates stay unreviewed; a manual fallback labels unresolved
inputs rather than treating a placeholder 0 as evidence of no cost.

Assistance starts from the edited or saved draft. Income and the everyday median
are replacements only when selected. Individual selected costs merge by stable
line identity. Protected rent, debt/essential allowances, goals, opening reserves,
destination accounts and the one-off top-up stay. Rechecking retains edited review inputs but clears confirmations; a previously assisted
draft reuses cost IDs and preserves protected goal metadata. A second one-change
goal cannot silently replace the original protected goal; the unassigned route
and existing goal editor remain available. Back/Cancel returns the original
edited draft. Manual fallback retains valid manually entered income/cost inputs
and keeps the original protected lines and goal intent. Valid newly entered positive goal contributions are retained as additional manual allowances; no past spending or existing everyday allocation is silently reduced.

Already-paid observations deliberately require the manual matching route.
Assistance neither fabricates a transaction match nor creates a fresh outstanding
bill from that paid observation. The existing post-activation matching flow is
the authority for bank/expense evidence. This is an explicit fallback, not an
inferred payment or a new automatic matching mechanism.

The R03 preview now uses the complete reviewed allocation set, including protected
lines, rather than just the historical everyday/bill totals. Known future dated
bill gaps and essential reserve deadline shortfalls suppress goal outcomes.
Preserved allowances with no confirmed schedule remain user estimates and also
suppress unsupported outcomes. Concrete allocation changes and known gaps remain
visible. The same twelve-month horizon and current-room/future-intent guards apply.

## Durable boundaries

Forward migration `20261026020000_budget_assistance_input_review.sql` (94) extends
validated assistance metadata with reviewed income/pay dates and individual cost
inputs. The regular setup validator checks tenant-owned recurring references,
unique identities, real dates, exact-cent values, matching selected line amounts,
opening reserves and real occurrence totals. Nonmanual assistance requires the
explicit confirmations; older automatic drafts need individual review or explicit
manual conversion. Manual estimates can still be saved with visible unresolved
inputs. No cost is silently discarded to balance a plan.

Activation uses the existing atomic command and creates separate bill/reserve item
configurations for the selected confirmed unpaid costs. Their cadence, occurrence
start, reserve target and deadline survive activation; protected goal intent is
retained. Existing command bodies/ledger rules are unchanged. Receipt replay is
resolved through the established owner/hash gates before reading a mutable newer
draft, and creates no duplicate item configuration. Any failed validation rolls
back the entire operation. Fixed search paths, timeouts and service-only grants
remain. The assistance query keeps the R02/R03 rules and adds complete grouped
historical income receipt dates; it does not send a truncated transaction feed.
No personal migration has been applied.

`BudgetSetupInputSummary` exposes saved confirmation state, pay dates, cost terms,
opening reserves and deadlines after save/reload. Editing a linked income or cost
clears its confirmation without losing unrelated choices or the saved schedule.
These are setup inputs and conditional plan assumptions, not bank funding evidence
or a cash-flow forecast. R01 forecast and R05 signed estimator reconciliation remain
separate work.

## Verification

The initial focused R04 run passed 55 checks on 94 migrations, including four WCAG
scans and four light/dark phone/desktop captures. Nine added unit cases exercise
explicit/zero income, pay dates, field selection, protected intent, real occurrence
counts, manual/paid fallback, confirmation invalidation, future bill gaps and
reserve deadline readiness. 583 unit tests pass, with 14 existing skips; full,
focused and browser TypeScript and production build pass. The existing bundle
advisory remains. The concurrency combined R04/R03/R02 run passed **97 checks across all 94 migrations**
on `halcyon-budget-m2-3ee4f8421d7b4db5`, including eight WCAG scans/eight captures
across the individual-input and R03 readiness flows. Dated income observations,
invalid confirmations/pay dates, foreign recurring references, selected-line
binding, protected goal/cost activation, manual estimates and exact receipt replay
are covered. A forced tenant source-lock race queues both duplicate activation
requests before either can commit; both return the same receipt with one plan and
exactly three item configurations. The wrapper rechecks receipts after the source
gate to cover a commit while the request was waiting. Exact cleanup passed.

An initial broad run reached the late lifecycle browser flow, then stopped on a
Settings-panel transition after Resume. The test now explicitly finishes that
existing settings task before opening the separate archive journey; financial and
invalidation assertions remain. The final separate broad rerun passed **472 checks across all 94 migrations** on `halcyon-budget-m2-f29fdb60def546b9`; its exact target was cleaned. The final combined rerun on `halcyon-budget-m2-d9a22678fd7341bb` passed **98 checks**, including unsaved review-input retention across a new history query. Its exact target cleanup passed. A further pure-function case verifies that a newly entered goal survives manual fallback as an extra manual allowance, without a history-derived cut to everyday spending; the resulting full unit/type/build run also passes.

UI progress remains 14 of 17 bursts. Next after R04: R05 estimator reconciliation,
then BUI-09b finalization and BUI-10/11 verification/handback. R01 and M7 human,
persistent migration and release gates remain open.

Verified commands (from `app/`, with the installed CLI supplied as `SUPABASE_CLI`):

- `node scripts/test-budget-durable.mjs --input-review-only --workspace` (R04 plus R03/R02)
- `node scripts/test-budget-durable.mjs --items --lifecycle --workspace`

These commands each provision a new unique project on API 57421/DB 57422. They
must never be repointed at the personal stack or a retained preview.

## Retained review site

Historical preview: disposable project `halcyon-budget-m2-3d88e991362a401e` served
`http://127.0.0.1:57300/budget` (API 57421/DB 57422). All six fictional accounts
passed real password sign-in and their sample/manual/history/eligibility/readiness/
individual-input controls. The user's existing in-app tab is signed into the
individual-input account through normal login. It keeps the saved $700 expected
income distinct from the $500 historical observation, confirms 15 October pay,
and reviews the phone plan and annual insurance separately. The reviewed plan
keeps protected rent, trip reserve and top-up. It is ready for explicit Use this
draft; no replacement was saved and no plan was activated in that example.

Screenshot: `/private/tmp/halcyon-r04-ready.png`. Runtime credentials remain in
the runner's mode-0600 `manual-preview.json`, not in this document. Every completed
R04 test/failed-fixture target was audited for exact container, volume and network
cleanup. The retained preview must never be reused for a destructive test run.
The personal stack remains unchanged.

The R04 retained runner was positively identified, stopped and cleaned before R05 testing. The replacement review site and current next step are recorded in [[BUDGET_R05_SIGNED_ESTIMATOR]].
