---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_08A_MY_PLAN]]"
---

# BUI-08b — Look back saved-period review

The owner authorized this phase after BUI-08a. Look back now owns the historical
review surface. Overview/My plan have a compact entry/status; the original
BudgetLifecycle controller remains mounted while hidden, preserving unsaved carry
and next-period choices across view changes. Activity controllers similarly remain
mounted on Overview. Pending writes, read failures and preparation remain visible
at the page level. Negative plan funding gaps stay explicit within Look back.

`budget/BudgetHistory.tsx` is a read-only presentation of lifecycle facts and the
immutable saved review payload. It leads with the signed everyday remainder, then
known net activity and separate exclusions/credits. Original plan, latest saved
plan and plan at last review have distinct income/one-off-cash sections. The saved
review retains its original activity/remainder and incomplete-history meaning.
A local keyboard-scroll table compares original/latest/reviewed allocations and
latest canonical activity; bank and user funding remain separate evidence.

Current/future selections cannot be marked completed or reviewed. Manual plans
show latest observed spending as unavailable, not verified zero. Missing/invalid
history remains qualified. The saved review is never reconstructed from latest
account memberships or transactions. Saved category rollover rules remain the
boundary authority where applicable, rather than a misleading whole-pool carry label.

Existing review/carry, reopen, Undo and next-budget controllers retain their exact
command construction, hashes/versions, incomplete/gap acknowledgements, dirty
period navigation, next-window dates and no-delete-period meaning. No schema,
new calculation, historical series, forecast, dependency or personal data change.

## Verification

Focused run: **180 checks**, **70 axe scans**, **70 captures** and **8 keyboard table
scroll checks** on `halcyon-budget-m2-3dfaea0e371142ae`; exact fixture cleanup passed.
Seven states cover unreviewed, carry choice, recorded review, next-period preview,
changed review/comparison, current and future, at 320/390/768/1024/1440px in both themes.
The original M5 review/carry/late-correction/reopen/Undo/next-period assertions are
retained, with explicit Look back navigation. Capture callbacks verify preview
retention across views and the actual saved-review allowance/spending after change.
The future fixture activates a separate future-starting plan, while an explicit
assertion verifies that an unfinished current period cannot open its next period.

Four focused rendering tests prove distinct original/latest/reviewed amounts,
immutable recorded activity, stale/unavailable values, manual activity qualification
and separate category-policy authority. Full/focused/browser types, 565 unit tests
(14 existing skips), changed script syntax and build pass; the existing large-chunk
advisory remains. The separate full lifecycle regression passed **472 checks** across 91 migrations
on `halcyon-budget-m2-f287db00362940b3`; exact fixture cleanup passed. The normal
settings/lifecycle journeys, including pause/resume/reload, passed through the
existing controller.

Earlier disposable attempts were cleaned: `halcyon-budget-m2-0ce28035b3624a8f`
(activity permission assertion moved before leaving Overview),
`halcyon-budget-m2-c8cfe30041134a11` (shared pause/reload test now waits for existing
ready UI), and `halcyon-budget-m2-53cd59d6e34f422a` (future fixture corrected to respect
the no-early-open guard). Full regression retains the settings/lifecycle journeys;
the bounded focused suite runs the historical portion plus its state matrix.

Next: **BUI-09a — manual setup presentation**. R01–R05 and broader M7 human/release
gates remain independently open. No personal rollout is implied.

Post-run Docker label audit confirmed zero containers, volumes and networks for
all five completed test projects and the retired BUI-08a preview. A fresh retained
preview uses `halcyon-budget-m2-31a581534b68422c` / runner 21119 at
`http://127.0.0.1:57300/budget`. `--manual-preview --lookback-preview` adds a third
captured fictional account with a recorded review and late correction; it leaves
the healthy and fresh-setup examples available. All three normal password sign-in
and relevant UI checks passed. Private credentials remain outside repository docs.
Stop this exact verified runner before conflicting fixture runs.

The in-app browser is signed into the recorded-review example with its completed
September budget selected in Look back. Latest spending/remainder are $135/-$35;
the immutable saved review retains $125/-$25. No review choice was changed during
final inspection. Runtime screenshot: `/private/tmp/halcyon-bui08b-ready.png`.
