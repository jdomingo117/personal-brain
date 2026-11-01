---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_05B_COMMITMENTS]]"
---

# BUI-06a — featured goal and compact savings goals

**Complete — 26 October 2026. Next: BUI-06b checks and guidance.**

One goal receives the primary card, using the saved featured preference when present.
Otherwise the first unarchived saved goal is shown without saving a new preference.
Other goals use native disclosures with stable line IDs and visible state/review hints.
An empty collection has an explicit create entry; unknown-price, paused, purchased
and archived goals retain their distinct meaning and available controls.

`BudgetGoals.tsx` uses the BUI-03 models and `BudgetValue` for target, selected-period
allocation, reserve, matched transfers, user confirmations and purchases after refunds.
The values remain separate. The decorative progress track is **reserve only**, clamped
visually without changing signed text; it never adds bank/user evidence or purchases.
Purchased/unknown-target goals have no progress track. The concept's mountain/plane
SVG is adapted as a local decorative asset without importing concept runtime code.

Dates use the existing `goalEstimate` helper with lifecycle server `as_of`; no second
clock or forecast kernel was introduced. Unavailable/stale/future facts suppress timing;
manual plans retain provisional reserves without inventing recorded zero purchases.
Partial/no/unknown coverage and stale reads remain visible at section level. Archived
edit is disabled while history and matching remain accessible. Existing Planning links,
feature/edit, funding, purchase/refund, Undo and panel recovery paths remain owned by
`BudgetItems` and the original forms. No schema, financial command body or dependencies
changed. The old inline goal rendering was removed from the commitment renderer.

## Verification

**88 focused isolated checks across 91 migrations pass**, target
`halcyon-budget-m2-30bb7b85d79a4388`. A real saved featured goal has $400 in its
reserve and $100 separately confirmed; its reserve-only track stays at $400, with
$0 bank evidence. Paused, unknown-price and purchased goals remain inspectable via
keyboard with no save. Secondary edit and purchased-goal matching reach the existing
forms. A stale read suppresses updated timing; unavailable reserve suppresses progress.
The same guarded run includes the existing goal-panel dirty/route/period/focus and
interrupted-save/same-request recovery suite, including create/edit and compatible Undo.

**22 axe scans** pass: ten goal-page scans at 320, 390, 768, 1024 and 1440px in both
themes, and 12 panel/dirty-decision scans. Goal row width checks pass at all five widths.
24 PNGs are under `docs/budget-ui/bui-06a/` (11 card/state and 13 task captures).
Desktop dark and phone light outputs were visually inspected. The full overview
placement remains part of BUI-06b; phone cards deliberately retain explicit evidence
labels. This is engineering review, with the next owner checkpoint after BUI-06b.

559 unit tests pass/14 existing skips; full/focused/browser TypeScript, runner syntax
and production build pass. Existing bundle advisory remains. **208 existing item/workspace
checks also pass** on separate fresh target `halcyon-budget-m2-89a6a27aee384209`,
including real UI goal creation, feature, purchase/refund, reserve release, Undo and
recovery. Counts are separate from the 88 focused checks. Both exact projects were
cleaned after scoped fixture deletion; a label audit found zero remaining containers,
volumes or networks. Personal services and data were untouched.

## Next burst

**BUI-06b — checks and guidance:** compact priority queue, all-checks route and optional
explanations, preserving existing priority/hash/review/snooze behavior and visible
read/pending failures. R01 gates final acceptance of affected checks; R01–R05 and
broader M7 release/human gates remain independently open.

## Retained review preview

A fresh guarded disposable preview `halcyon-budget-m2-3dadf2d58a284109` runs at
`http://127.0.0.1:57300/budget` on API/DB 57421/57422 after test cleanup. Normal
sample/fresh-setup sign-in and controls passed. The in-app browser is signed into
the sample and showing the Weekend away goal. The preview lasts while the runner
lives; credentials remain private runtime data outside repository docs. This is
engineering preview availability, not owner acceptance of the assembled overview.
