---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_04_HEADER_HERO]]"
---

# BUI-05a — everyday rows

**Complete — 26 October 2026. Next: BUI-05b commitments.**

The everyday allowance now uses compact category rows with planned, spent and left
columns, a separate canonical shared total and an explicit Other row. Narrow layouts
keep a visible label beside each amount. Signed category shortfalls retain an “Over
plan” label even when the shared pool is positive. Stable limit IDs identify each row;
taxonomy and custom-scope names come from the existing presentation adapter.

With category limits off, one canonical everyday pool replaces the category list.
There is no invented category breakdown or requirement to configure limits. Opening
row details reveals carry and the existing move/activity entry points without saving.
A separate optional calculation shows pool carry, reserve rights and excluded credits.
Manual, future, partial, stale and unavailable states retain visible qualifications.

`BudgetEveryday.tsx` is a read-only component inside the existing `BudgetItems` task
owner. It uses `BudgetValue` and the BUI-03 adapter; no requests, money arithmetic,
financial command changes or extra task host were introduced. Existing limit, move,
activity, reserve and transfer forms remain in use with their write restrictions.
The current section placement is retained until the later overview composition phases;
BUI-05b will group commitments and BUI-06b completes the overview hierarchy.

## Verification

Focused guarded command, from `app/`:

```sh
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --everyday-only --workspace
```

**51 isolated checks across 91 migrations pass**, target
`halcyon-budget-m2-7ebae93ffce0470e`. These include ten axe scans (320, 390, 768,
1024 and 1440px, both themes), row overflow checks, keyboard inspection with no write,
real UI removal of the last category limit, preserved $290 pool/$1,510 spending,
activity/move entry points, canonical released rights, stale recovery, partial and
invalid scope, manual and future amounts. Shopping remains -$60 while Other is $350
and the shared pool is $290. Reinstating the same persisted limit ID refreshes its row.

14 PNGs are under `docs/budget-ui/bui-05a/captures/`. Desktop dark and phone light
outputs were inspected for hierarchy, signed amounts, responsive labels and overflow.
These are engineering observations; the next planned assembled-overview owner checkpoint
is BUI-06b. BUI-04's explicit owner acceptance remains recorded separately.

559 unit tests pass, with 14 existing skips. Full/focused/browser TypeScript,
changed runner syntax and production build pass. The existing bundle-size advisory
remains. No dependency, schema, feature exposure or personal database change.

**208 existing item/workspace isolated checks pass** on separate fresh target
`halcyon-budget-m2-586730f7d69a41da`, including real browser goal, match, limit,
move, purchase/refund, Undo and draft/activation flows. Counts are separate from
the 51 focused checks. Both exact projects were removed by the guarded provisioner;
a post-run label audit found zero remaining containers, volumes or networks. The prior disposable
manual preview `halcyon-budget-m2-7e361640947a4e3b` was positively identified and
stopped before reusing its ports; personal services were untouched.

## Next burst

**BUI-05b — commitments:** compact summaries and disclosures for bills, upcoming
reserves and planned transfers, preserving every occurrence, partial match and action.
R01–R05 and broader M7 release/accessibility/comprehension gates remain open.

## Retained review preview

A new guarded disposable preview `halcyon-budget-m2-0f945b8b9ace4b12` was launched
at `http://127.0.0.1:57300/budget` after both test projects were cleaned. Normal
sample/fresh-setup password login passed. The in-app browser is signed into the
sample and showing Your everyday spending, initially with limits off. Credentials
are private runtime details only. Availability lasts while the retained runner lives.

Final browser inspection also confirmed that desktop row names announce Planned,
Spent and Left; those labels stay available to accessibility APIs when the visible
column header is used. On narrow screens the same labels are visible beside amounts.
