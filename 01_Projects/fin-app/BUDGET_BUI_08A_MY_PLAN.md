---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_07C_ROLLOVER_LIFECYCLE]]"
---

# BUI-08a — My plan allocation summary and edit entry

The owner authorized this phase after BUI-07c. `budget/BudgetPlan.tsx` presents
saved allocation facts for the selected period: expected income, one-off cash,
each line once and the canonical signed unallocated amount. Setup reserves remain
separate text beside their line. Continuing income/allocations/unallocated amounts
have their own labelled disclosure; one-off top-ups are not repeated. A pending
frequency change retains its separately reviewed windows in settings.

The bounded presentation adapter exposes saved current/future values with the
existing availability, method, source and freshness qualification. It performs no
new totals, resource arithmetic, source-feed aggregation or command construction.
Missing future data is unavailable; signed gaps remain negative. Archived current
amounts are retained, and future amounts come from the saved template without
client zeroing. Per-line rows adapt the concept's allocation composition without
inventing aggregate totals or a bank-balance meter.

The existing active-plan editor remains intact behind Adjust plan. Entry focuses
its heading. Its original scope, review, validation, gap acknowledgement, revise
body, cancellation and same-request recovery remain authoritative. Setup drafts
still use their distinct review/activation flow and never appear as active plans.

My plan has a direct View allowance activity route to Overview. Activity controllers
stay mounted while hidden on My plan, retaining local disclosure state; native task
portals and their pending recovery are not recreated. Look back composition remains
for BUI-08b. Temporal regression explicitly opens Overview for goal reserve/activity
checks; its money, history, period and freshness assertions remain unchanged.

## Verification

Focused run: **68 checks**, **20 axe scans** and **20 captures** on fresh disposable
project `halcyon-budget-m2-63465badf0b74247`; exact fixture cleanup passed.
An earlier successful 68-check target was `halcyon-budget-m2-2c4f034a08c24db7`. The mixed
manual fixture distinguishes all saved allocations, continuing amounts and setup
reserves. Current/future views cover 320, 390, 768, 1024 and 1440px in both themes.
Tests assert no writes on view/disclosure changes, retained activity disclosure,
read-only past period, editor focus, dirty cancellation, exact revise identity/
amount set, period-only versus continuing scopes, lost-response recovery, signed
gap and saved-draft distinction. The first attempt assumed insertion order for a
UUID-sorted line response; the corrected assertion compares the exact ID/amount
set. That attempt's target `halcyon-budget-m2-69f3f170ce3241b5` was cleaned.

The final separate full lifecycle regression passed **472 checks** on
`halcyon-budget-m2-38c36d97941844b2`, across 91 migrations; exact fixture cleanup
passed. It includes the final composition, unchanged financial assertions and
explicit activity navigation. The first full attempt passed the
financial and temporal boundaries, then reached an old goal journey that assumed
activity actions remained on My plan. It now explicitly uses View allowance activity
before continuing; all original financial assertions remain. Its exact target
`halcyon-budget-m2-476a33c4e30a4863` was cleaned. Full/focused/browser TypeScript, 561 unit
tests (14 existing skips), changed script syntax and production build pass. Two
adapter tests cover independent current/future/opening values, no mutation,
stale qualification, missing future data and unsupported methods. The existing
large-chunk build advisory remains.

Next: **BUI-08b — Look back saved-period review**. R01–R05 and broader M7 human/
release gates remain independently open. No personal rollout is implied.

Post-run Docker label audit confirmed zero containers, volumes and networks for
all five completed test targets and the retired BUI-07c preview. A fresh retained
fictional preview is `halcyon-budget-m2-0c01ef049aae48ee` / runner 96484 at
`http://127.0.0.1:57300/budget`. Sample/fresh-setup password sign-in checks passed.
Private credentials remain outside repository docs. Stop this exact verified runner
before conflicting fixture runs.

The in-app browser is signed into the fresh fictional sample with My plan open.
No financial edits were made in the final manual inspection. Runtime screenshot:
`/private/tmp/halcyon-bui08a-ready.png`.
