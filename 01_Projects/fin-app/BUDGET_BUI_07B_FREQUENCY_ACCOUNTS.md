---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_07A_SETTINGS_HOST]]"
---

# BUI-07b — frequency and accounts form presentation

The owner authorized this phase after BUI-07a. Frequency and account controllers
remain in the single native settings host. No additional dialog, dependency,
schema, financial calculation or command construction was introduced.

Frequency keeps its first budget and continuing full budgets separate, including
short monthly transition dates. Each window has three semantic fieldsets: income
and bills (fixed and non-goal reserves), everyday spending, and savings and goals
(contributions and explicitly configured goals). Every saved allocation appears
once; paused and archived behavior is retained. All editable amounts keep their
existing labels, cents conversion, validation and independent template state.
Optional date/carry explanations use native disclosures. Stale warnings, signed
gaps, totals, required acknowledgements and save/apply/Undo meaning remain visible.

Account choices follow effective dates, separate activity/destination roles, then
reviewed effects. Selected choices have a visible border and full label hit area.
The account preview retains every before/after comparison, incomplete/unknown
qualification, local keyboard-scroll table and explicit acceptance. Changing input
or source invalidates the original preview and acknowledgements as before. The
existing preview hash, source/plan checks, request body and recovery are unchanged.

Both forms stack according to the narrow task surface, even on desktop. Styling
is scoped to the two forms and shared settings classes; rollover/lifecycle form
presentation remains BUI-07c. The established native panel owns focus and exits.

## Verification

The focused run passed **171 checks**, **62 axe scans** and **63 captures** on
`halcyon-budget-m2-d19763704bcb4408`; its exact disposable resources were removed
by the guarded runner. Captures and reproducible commands are in
`docs/budget-ui/bui-07b/`. The focused extension
uses all four line kinds plus a reserve configured as a goal to assert exact group
membership and no missing/duplicate amount fields. It checks edit/review forms at
320, 390, 768, 1024 and 1440px in both themes, with axe and overflow checks, while
retaining the original dirty-close, browser navigation, refresh, unknown receipt,
normal-save and goal-panel regression assertions.

The separate full lifecycle run passed **472 checks** on
`halcyon-budget-m2-0ead5d3eca9a4bc1`, across the existing 91 migrations. It includes
real frequency Save/cancel/Undo, initial/full overrides, transition dates, invalid
money and gap acknowledgements, dated account policy effects, stale input
retention, compatible Undo and durable outcome lookup. Exact fixture cleanup passed.
These results are separate totals from the focused run.

Full/focused/browser TypeScript, 559 unit tests (14 existing skips), changed script
syntax and the production build pass. The existing large-chunk build advisory
remains. The final build includes the goal-versus-reserve group classification.
No command acceptance or financial assertion was weakened.

Next: **BUI-07c — rollover and lifecycle form presentation**. R01–R05 and broader
M7 human/release gates remain independently open. No personal rollout is implied.

Post-run Docker label audit confirmed zero containers, volumes and networks for
both completed test projects and the retired BUI-07a preview. A new retained
fictional preview uses `halcyon-budget-m2-f74f7102d1084cb8` / runner 63823 at
`http://127.0.0.1:57300/budget`. Sample/fresh-setup real password sign-in passed.
Private runtime credentials remain outside repository docs. Stop this exact
verified runner before conflicting fixture runs.

The in-app browser is signed into the new fictional sample with the grouped
frequency form open. No amount was edited or saved during this final inspection.
Runtime screenshot: `/private/tmp/halcyon-bui07b-ready.png`.
