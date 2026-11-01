---
tags: [halcyon, budgeting, engineering, verification]
type: correctness-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_R02_ELIGIBILITY]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
---

# R03 — unused room and conditional goal outcomes

R03 implements G09, S10 and the one-change rules: a current-period reduction
cannot undo settled spending; a future-period change must be explicit; incomplete
inputs and signed funding gaps cannot produce successful goal timing claims.

## Bounded implementation

Forward migration `20261026010000_budget_assistance_readiness.sql` (93) replaces
only the assistance query. It retains the R02 dual eligibility gates, historical
medians, recurring estimator and command bodies. The response adds a normalized
target window, timezone, server-local date, independent coverage/integrity flags
and complete settled everyday usage. It aggregates all canonical transaction/
allocation rows from the true selected-period start through the server-local
current date, excluding pending, own transfers, future-dated rows and confirmed
regular-cost matches outside the everyday source. Missing coverage or ambiguity
returns null usage. It never infers zero from missing history. These target facts
join the fingerprint; the fixed search path, service-only grants and timeouts
remain. The Edge schema accepts a bounded optional timezone; SQL validates it
against known zones, with the prior Australia/Sydney default for old callers.

Pure client helpers validate normalized date windows, safe cents and reviewed
intent. For the current period the reduction cannot exceed the source allowance
minus settled usage; refunds never enable a reduction beyond the source allowance.
A pre-existing overage stays signed and cannot be erased by a reduction. Old
responses without target evidence and evidence from a different date fail closed.
Future-period usage is not invented: explicit future intent is required and the
selected future period is passed through to setup unchanged.

Goal outcomes additionally need an explicit positive target/contribution, goal
name, confirmed opening reserve (including intentional zero), reviewed assumptions
and non-negative signed recurring plan capacity. Missing inputs or a funding gap
leave the allocation arithmetic visible but suppress the timing outcome with a
concrete reason. Opening reserves are not income. The generated goal line retains
its explicit opening reserve. Current-period planned contribution rights are
included once and their scheduled date is excluded from future contributions.
Monthly dates use the real calendar-period start; fortnightly dates use the
normalized anchor-aligned window. No elapsed contribution date is reintroduced.
Due-date previews show the exact shortfall and number of remaining contribution
dates, including full shortfall when none remain. Completion illustrations stop
at twelve calendar months; a later deadline receives no unsupported success claim.

The UI clears outcome confirmation when its inputs change. This remains an
editable setup preview: no transaction, bank movement, saved scenario, draft or
activation is created by checking history or trying a change. R04 still owns
individual income/pay-date/bill input confirmation and unrelated draft preservation;
this task does not claim those broader editor paths are complete. R05 still owns
historical signed estimator reconciliation. No personal migration was applied.

## Verification

The focused guarded run passed **39 checks across 93 migrations** on
`halcyon-budget-m2-b7961faf3add4d82`, including complete current usage above 1000
rows, canonical exclusions, split-parent replacement, missing evidence, explicit
future-window facts and a real phone flow proving exact unused-room boundaries
and confirmation invalidation after edits. Four WCAG scans and four overflow
checks cover 390/1440 pixels in light/dark, with four captures under `/tmp/halcyon-r03-*`.

Six added unit cases cover current room (exact boundary and one cent beyond),
missing/malformed/stale target proof, future intent, signed capacity, missing
review/price/reserve/contribution, opening/current contribution counted once,
normalized fortnightly dates, no-date shortfalls and the twelve-month horizon.
**574 unit tests pass, with 14 existing skips**, alongside full/focused/browser
TypeScript, script syntax and the production build. The existing bundle-size
advisory remains. The separate full lifecycle regression passed **472 checks across all 93 migrations** on `halcyon-budget-m2-36e6a117023e43cd`; its exact target cleanup passed.

Initial isolated attempts found a fixture taxonomy error and a fixture coverage
error: deleting its ambiguous test transaction correctly revoked account coverage.
The corrected fixture explicitly re-confirms coverage after source deletion and
split changes. No production invalidation or tenant/source guard was weakened. R02 also replayed **34 checks on all 93 migrations** on a separate target, `halcyon-budget-m2-76c2ffdddf154a05`, with exact cleanup.
Completed fixture targets are cleaned by exact project identity; the personal
stack and its data were never used for tests.

UI completion remains 14 of 17 bursts. Next engineering after R03: R04 input
confirmation/preservation, then R05 and BUI-09b finalization. R01 and the M7 human,
persistent migration and release gates remain separate and open.

Verified commands (from `app/`, with the installed CLI supplied as `SUPABASE_CLI`):

- `node scripts/test-budget-durable.mjs --readiness-only --workspace`
- `node scripts/test-budget-durable.mjs --items --lifecycle --workspace`
- `node scripts/test-budget-durable.mjs --eligibility-only --workspace`

Each command provisions a fresh unique project on API 57421/DB 57422; it must
never be repointed at the personal stack or the retained preview.

## Retained owner preview

Disposable project `halcyon-budget-m2-f71866ee48974b62` was retained at the R03 checkpoint at
`http://127.0.0.1:57300/budget`, with API 57421/DB 57422. Five fictional accounts
passed normal password sign-in and their sample/manual/review/eligibility/readiness
controls. The user’s existing in-app tab was signed into the readiness account
through the normal login flow. It visibly retains $81 recorded spending and
previews a $100 redirection from a $200 allowance, with $30 explicit opening
reserve and a $600 target. The conditional result shows five remaining monthly
contributions, estimated 1 March 2027, and a $170 shortfall at the 1 January 2027
deadline (three remaining dates). No draft was saved or activated.

The result screenshot is `/private/tmp/halcyon-r03-ready.png`. Runtime credentials
are held in the runner's mode-0600 `manual-preview.json`; no credentials are stored
in this document. The retained preview is separate from every completed test
target and must never be reused as a destructive test target. All completed R03
fixture and regression targets, including failed fixture attempts, were audited
for exact container, volume and network cleanup. The personal stack is unchanged.

The R03 preview was subsequently stopped and exactly cleaned for R04 validation.
See [[BUDGET_R04_INPUT_REVIEW]] for the replacement retained review site.
