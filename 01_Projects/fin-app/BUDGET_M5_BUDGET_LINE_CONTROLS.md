---
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: budget-line-controls-implemented-m5-gates-open
project: Halcyon
created: 2026-10-21
updated: 2026-10-21
related:
  - "[[BUDGET_M5_LIFECYCLE_CONTROL]]"
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
---

# Budget M5 — budget and line lifecycle controls

## User contract

This slice adds budget pause/resume and archive controls for bill, reserve, savings-goal and
planned-transfer lines. Existing M4 per-item pause/resume remains available for nonarchived
items. Attention acknowledgement/snooze and complete-chain performance remain separate gates.

The owner opens **Manage budget and allowances** from the latest saved budget, chooses a
change, reviews authoritative saved-history and next-window effects, acknowledges incomplete
history where applicable, then saves. The interface is an inline panel on desktop and phone,
not another mandatory setup wizard. Native controls, 44px targets, captioned locally scrollable
tables, visible status/error text and focus restoration follow the design handoff conventions.

### Pause and resume

- Pause blocks opening another period and scheduling/applying a frequency change. It does not
  hide the budget, stop bank payments, remove current allowances, disable historical reviews or
  stop canonical activity from being reflected. A pending frequency change must first be cancelled.
- Resume explicitly reviews all dates after the latest saved period through the current local
  day, grouped into exact monthly/14-day windows. Gross settled spending and credits are shown
  separately, with missing/unavailable history qualified, never assumed to be zero. Reserve
  effects reflect only valid matched usage; unmatched activity is not silently assigned to a goal.
- Resume requires a separate carry acknowledgement. It creates no missing periods, hypothetical
  income or gap contributions. Next contiguous periods are still opened individually with reviewed
  amounts. This is not automatic scheduling or a shortcut that silently skips missing dates.
- No completion date is displayed for goals while the whole budget is paused.

### Stop using an allowance

Archive preserves current allocations, source matches, achievement history and reviewed snapshots.
Future template allocations become zero and later period/frequency writers cannot refill the line.
The everyday parent cannot be archived. Earlier or ended periods cannot be used to archive a line.

| Reserve/goal choice | Effect |
| --- | --- |
| Keep it here | Preserve the signed balance separately, including any shortfall |
| Move to everyday Other | Move the exact reviewed signed balance; a shortfall reduces everyday room |
| Move to another reserve/goal | Debit and credit the same signed amount; destination must be another visible, nonarchived reserve, never an undone/voided line |

Bills and planned transfers have no lifetime reserve. They retain this period's allowance,
activity and variance; their unused allowance is not fabricated savings. Archive never cancels
a merchant obligation or performs a bank transfer. Moving budget rights creates neither earned
income nor bank/user-confirmed funding evidence.

The disposition is a fixed reviewed movement, not an ongoing automatic sweep. A later correction
or refund may leave a new signed remainder at the archived purpose; it stays visible and can be
reviewed/matched. Existing explicit positive reserve releases remain available when rights exist.
Archived items cannot be revived through the old item-edit flow. Compatible latest-change Undo
is supported; arbitrary restore/unarchive is not added in this slice.

## Durable boundary

Migration `20261022050000_budget_lifecycle_controls.sql` adds immutable tenant-scoped
`budget_control_events` (complete operational projections) and `budget_control_moves` (signed
double-entry budget-right movements). Member SELECT RLS, no browser writes and service-only
helpers are asserted. Operational pause is deliberately separate from `budget_plans.state` so
existing active-plan reads, history and reviews do not disappear.

`budget_preview_control` uses the tenant source gate and rollback-only writes to compute complete
saved-period plus hypothetical-next effects. Its hash binds intent, opaque source/plan versions,
local date, exact gap windows, financial effects and continuing allocations—not random temporary
revision IDs. Preview leaves no events, movements, revisions or period pointers behind.

The strict owner-only Edge path validates `preview_control` / `set_control`; the browser never
writes tables or invokes database mutations directly. Save recomputes the preview, requires
explicit acknowledgements, and atomically commits the event, signed movement, template revision,
plan version and idempotent receipt. Unknown outcomes use existing exact-key recovery. Concurrent
same-version saves have one winner; a source/plan refresh clears confirmation but retains choices.

All template writers normalize only the archived line's refill to zero; every unrelated future
allowance stays unchanged. Existing current allocations stay distinct from future intent. Later
period allocations for archived lines must be zero. Reserve movements
are lifetime effects; their everyday destination is applied only in the origin period so later
carry sees it once. Native positive release capacity uses adjusted rights, preventing transferred
funds from being rejected or spent twice. SQL numeric aggregates and safe-cent checks fail closed.

Undo appends a new projection, inverse signed movements and a restored template revision. It
requires the original source and latest plan version and rejects dependent changes; history is
never updated or deleted. There is no source-row lock or foreign-key acquisition after the tenant
gate, preserving the existing source-writer lock order.

## Verification and remaining work

Final verification:

- **360 isolated SQL/Edge/browser checks across 79 migrations passed**, using
  `npm run test:budget:lifecycle` with the guarded disposable provisioner. New cases are in
  `app/scripts/test-budget-controls.mjs` and `test-budget-control-interactions.mjs`.
- Preview rollback, one-winner concurrency, exact-key disabled-write replay, owner/viewer/foreign
  isolation, atomic failure rollback, immutable event/movement history, signed retain/release/
  transfer, native release capacity, negative balances, late source corrections and rematching,
  zero archived refill and preservation of every unaffected allocation are covered. Undo verifies
  both actual rights and the reversed operational/movement/template audit payload.
- Ended-plan resume shows known spending and exact uncovered windows, requires carry acceptance
  and creates no synthetic periods. Item edits and later-period amounts cannot revive archives;
  undone/voided destinations are rejected. Existing account, rollover, review, source-lock and
  frequency regressions pass with the new wrappers installed.
- Real signed-in phone and desktop journeys cover pause/reload/frequency lockout, resume
  acknowledgement, refreshed-source confirmation invalidation with retained choices, archive save/
  reload, compatible Undo, dirty exit, restored focus, no page overflow and no runtime errors.
- **493 unit tests passed / 14 existing skips**; focused Budget TypeScript and production build
  passed. Full-app TypeScript retains the unrelated `StrategicProjections.tsx:252` PlanningMetric /
  ProjectionMetric mismatch; the existing main-chunk size warning remains.
- Responsive captures were inspected at `/tmp/halcyon-budget-controls-phone.png` (390px) and
  `/tmp/halcyon-budget-controls-desktop.png` (1440px). Visual QA caught an overly broad template
  correlation; it was corrected at the SQL boundary and exact unaffected-allocation regressions
  were added before the final passing run. Tables now have aligned amounts, row separation and
  local horizontal scrolling with guidance on narrow screens.
- The final target was `halcyon-budget-m2-7a45b4796fab4c7f` on API57421/DB57422. Fixture auth,
  accounts/transactions, plans and source gates were cleared by captured identities. Its labelled
  containers, volumes and network were removed and verified absent. Earlier interrupted/failed
  test targets also ran their exact-project teardown. No personal database query/migration or
  flag enablement occurred.

This closes the requested budget/line lifecycle implementation slice, not M5 as a whole.
Attention materiality/acknowledgement/snooze, wider temporal/goal integration and realistic
full-chain performance/resumption proof remain open. Independent beginner/accessibility review,
backup/restore, persistent migration and rollout remain M7 gates. Budget remains off by default;
M6 advancement or live migration requires separate authorization.

Subsequent continuation: [[BUDGET_M5_ATTENTION_CONTROLS]] closes attention acknowledgement/
snooze/materiality controls, with independent presentation versions and persistent signed gaps.
Wider temporal integration and complete-chain performance/resumption remain open M5 gates.
