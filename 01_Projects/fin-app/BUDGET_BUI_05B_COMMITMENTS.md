---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_05A_EVERYDAY_ROWS]]"
---

# BUI-05b — compact commitments

**Complete — 26 October 2026. Next: BUI-06a goals.**

Commitments are grouped as Bills & regular payments, Upcoming costs and Planned
transfers. Each saved line has a native disclosure with its name, qualified canonical
planned amount and setup/paused/archive state. Opening a line reveals the existing
item content, exact occurrences, evidence and action buttons. Unconfigured lines
retain their setup entry; goals remain in their existing cards for BUI-06a.

There is no second financial aggregate: summaries read each line's planned amount
from the BUI-03 adapter. Reserve balances, bank evidence and user confirmations stay
separate. Bill dates and expected amounts retain the saved schedule; invalid or
future observed data displays Unavailable for matched and still-expected values.
Partial coverage, stale reads and changed claims are visible outside disclosures.
Reserve targets remain plan facts without adding an invented combined progress total.

`BudgetCommitments.tsx` owns read-only grouping/disclosure; `BudgetItems.tsx` retains
one task owner, existing forms, recurring proposals/update controls, matching and
Undo. Native disclosure state never calls a command. Budget-scoped CSS supplies
responsive rows, visible amount labels and full item names without truncating money.
No dependencies, schema, financial command body, exposure or personal data changed.

## Verification

**45 focused isolated checks pass across 91 migrations**, target
`halcyon-budget-m2-03211f5bb6714bbc`. These include keyboard disclosure with no
write, inspection of all five saved commitment lines, exact $40 matched / $100
expected / $60 still expected, separate $300 reserve from $200 new allowance,
setup/adjust/match entry points, a changed claim that no longer counts, partial
coverage and unavailable observations under invalid source scope.

Ten axe scans and row-width checks pass at 320, 390, 768, 1024 and 1440px in
both themes. Eleven PNGs are in `docs/budget-ui/bui-05b/captures/`; desktop dark
and phone light open-detail outputs were visually inspected. Native summaries
provide keyboard access and keep every amount labelled on narrow screens.
The original glyph-based disclosure indicator caused overflow at 320px; a bounded
SVG and wrapping detail controls fixed it. Failed test projects were cleaned by
the guarded provisioner before retry; no personal services were targeted.

559 unit tests pass with 14 existing skips. Full/focused/browser TypeScript,
changed runner syntax and production build pass. Existing bundle-size advisory
remains. **208 existing item/workspace isolated checks also pass**, on separate
fresh target `halcyon-budget-m2-c8a305cec3b74593`, covering real UI goal, bill
suggestion/update, matching, purchase/refund, move, Undo, draft, activation and
recovery paths. These counts are separate from the 45 focused checks. The guarded
provisioner cleaned both exact test projects after scoped fixture deletion. A label
audit of both passing projects and all four earlier failed geometry-run projects
found zero remaining containers, volumes or networks.

Next burst: **BUI-06a — goals**. Preserve distinct planned reserve,
matched evidence and confirmed funding when presenting the featured goal and others.
R01–R05 and broader M7 gates remain independently open.

## Retained review preview

After test cleanup a new guarded disposable project
`halcyon-budget-m2-23578e0ea78e4263` was launched at
`http://127.0.0.1:57300/budget` (dedicated API/DB 57421/57422). Normal password
sign-in, sample headline values, goal control and fresh setup were verified. The
in-app browser is signed into the new sample and showing compact commitments.
The sample's unconfigured Bills, Upcoming costs and Longer-term savings lines
retain Finish setup; the test captures contain configured partial-payment examples.
Private runtime credentials are outside docs. The preview remains available while
its retained runner lives, and does not change personal data or exposure.
