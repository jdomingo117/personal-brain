---
tags:
  - halcyon
  - budgeting
type: implementation-record
status: implemented-performance-gate-open
project: Halcyon
created: 2026-10-22
updated: 2026-10-22
---

# M5 — wider cross-period frequency, policy and goal integration

## Scope and behavior

This continuation verifies combined behavior, rather than adding a new budgeting mode or
expanding the approved UI. Monthly → fortnightly and fortnightly → monthly chains combine:

- Exact adjoining original, transition and continuing windows. The monthly transition includes
  a short bridge when the old fortnight ends mid-month.
- A prospective activity-account exclusion effective at the old period's exclusive end. Old
  activity retains its original scope; later excluded-account activity does not enter the budget.
- Signed category and Other carry, each applied once and never added to planned income.
- A monthly goal schedule with explicit initial and continuing period allowances of $30 and $70.
  Changing budget frequency does not rescale or rewrite the independent contribution schedule.
- A prior-period purchase and later linked refund, historical source corrections/deletion,
  retained invalid-claim audit, and immutable reviewed facts beside live recalculated balances.
- Per-goal pause and compatible Undo after the transitions: current explicit allowances and
  accumulated rights remain; pause stops future refill, and Undo restores the saved override.
- Authenticated desktop and phone selection/reload of all three saved periods, period-specific
  goal amounts, changed-review disclosure, no bank-cash claim and horizontal-overflow checks.

The ordinary scheduling/account preview/save/undo, concurrency, archive/disposition, attention
and pause/resume suites remain part of the full lifecycle run. These combined fixtures supplement
those tests; they do not replace them or claim to exhaust every possible policy permutation.

## Defect found and implementation

Historical calculation correctly stopped its carry-chain scan at the selected budget, but reused
that partial list as the period dropdown inventory. Reloading an older period therefore hid later
saved periods from the dropdown, despite a working adjacent-period button.

Migration `20261022070000_budget_saved_period_navigation.sql` (81) retains the existing authorized
calculation as `budget_lifecycle_before_navigation`. Public `budget_lifecycle` first runs that
existing membership/source/plan/selected-period boundary, then reads **all saved-period metadata
for that same tenant and plan**, with latest review state. It replaces only navigation metadata,
not selected-period facts, review snapshots, financial amounts or history. No later-period actuals
are calculated for this inventory. Both functions remain service-only, with closing grant assertions.
No browser RPC, source-row locking, new table, financial write or feature flag change is introduced.

## Test and fixture boundary

`app/scripts/test-budget-temporal.mjs` runs both combined SQL/Edge chains. Its returned captured
fixture identities feed `test-budget-temporal-interactions.mjs` through the existing isolated
workspace harness. Full lifecycle runs include both. Focused reproduction:

```sh
cd app
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --temporal-only --workspace
```

This mode still creates a new uniquely labelled disposable project, validates an empty target,
replays all migrations, uses only API 57421/DB 57422 and a non-reused private browser port 57300,
and performs captured-ID fixture cleanup plus exact-project teardown. It accepts no existing target.

Passage of time is **not** simulated by overriding the production clock or by pretending a browser
waited through a boundary. Dated account projection/history and pending frequency intent are explicit
ended-boundary fixtures representing choices saved earlier. The account guard is separately asserted
to reject retrospective edits. Applying the frequency change, opening the continuing period,
matching claims, reviews, goal pause/Undo and all subsequent reads run through production functions;
workspace reads use real authenticated Edge requests. Source corrections are isolated fixture writes.
Normal current-period account and frequency intent creation are covered in their existing suites.

## Verification

- **432 full lifecycle SQL/Edge/browser checks passed across all 81 migrations**, including
  existing concurrency, policy previews, signed dispositions, attention and disabled-write recovery.
- **44 focused temporal SQL/Edge/browser checks passed** in a separate fresh disposable project.
  These overlap the full run; do not add them to the full-suite total.
- **496 unit tests passed; 14 existing tests skipped.** Focused Budget TypeScript and production
  build passed. Full-app TypeScript retains the known unrelated `StrategicProjections.tsx:252`
  `PlanningMetric` / `ProjectionMetric` mismatch; the build retains its existing main-chunk warning.
- Phone (390px) and desktop (1440px) journeys revisit/reload original, transition and continuing
  periods, assert their own planned/reserved goal amounts, qualified evidence, no horizontal overflow
  and no browser runtime errors. Captures `/tmp/halcyon-budget-m5-temporal-390.png` and
  `/tmp/halcyon-budget-m5-temporal-1440.png` were inspected.
- Focused target `halcyon-budget-m2-f02e5df8f2474b16`; full target
  `halcyon-budget-m2-a4e7ed2b7a4a4ad9`. Captured fixture identity/account/transaction/plan/source-gate
  cleanup passed before exact-label project teardown. No personal target was queried or modified.
- Two earlier diagnostic targets (`halcyon-budget-m2-cc30ac0f11534738` and
  `halcyon-budget-m2-3c7b62b8c2974648`) exposed the retrospective-policy guard and dropdown defect;
  both were torn down in `finally`. Exact-label container/volume/network listings confirmed no
  remaining resources for these diagnostic or final validation projects.

## Remaining gates

This is engineering integration evidence, not human comprehension/accessibility approval,
long-history latency proof or rollout approval. M5 still requires realistic complete-chain
performance/query-plan measurements and a safe resumable strategy when complete evaluation exceeds
the request budget. Reads must continue to fail closed rather than return truncated or invented
balances. Unsupported forecasting/payday/detector inputs and M6/M7 gates remain unchanged.
No personal stack reads, migrations, feature enablement or deployment are authorized by this work.
