---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_07B_FREQUENCY_ACCOUNTS]]"
---

# BUI-07c — rollover and lifecycle form presentation

The owner authorized this phase after BUI-07b. The rollover and lifecycle
controllers remain mounted once in the native settings host; BUI-07a already
removed their inline page copies. No new dialog, dependency, schema, calculation
or command body was introduced. Original dirty navigation, exact preview hashes,
source/plan invalidation, acknowledgements, saved request recovery and Undo remain.

Rollover has a focused task heading, an optional next-budget category editor,
then explicit sections for balance destinations and signed effect review. Category
editing stacks within the panel width, including when the outer page is desktop.
Individual rules have clear dividers; parent shortcuts still change drafts only.
Removed category identities, shortfalls, Other, protected money, released signed
variance and provisional history remain visible. The preview keeps one destination
per balance and its original keyboard-scrollable comparison table.

Lifecycle separates choosing a change from reviewing before saving. Archive
balance choices have complete label hit areas and a visible selected state.
Archive meaning remains explicit: future allocations become zero, current history
is retained, shortfalls follow the selected disposition and bank money does not
move. Pause/resume descriptions, uncovered-date activity, separate carry acceptance,
continuing allocations and all signed before/after values are retained.

The host's history preparation and retry stay available during these forms.
Complete before/after impact checks also render their native count-based progress
inside each active form, beside its working status, so the modal does not hide
progress on the background page. The existing command preview continues to fail closed until complete;
no partial-history acceptance was added. The single native panel owns focus,
Escape, inertness, dirty exit and same-request recovery.

## Verification

Final focused verification passed **320 checks**, **112 axe scans**, **113 captures**
and **32 ArrowRight table-scroll checks** on disposable project
`halcyon-budget-m2-9488d6a3498246cf`. Exact fixture cleanup passed. The extension
retains original settings/goal recovery and rollover/lifecycle financial journeys,
then exercises nine form states at 320, 390, 768, 1024 and 1440px in both themes.
Viewport/theme restoration preserves the original phone journey assertions.

Both preparation tests hold the second request and verify the native “1 of 2”
progress inside the active form. Small plans normally use the <=12-period fast
path, so these two render checks route to the real `budget_review_impact` SQL
checkpoint function on the same isolated fixture. They preserve its actual durable
results/hash; they do not invent financial preview amounts. Normal API behavior
was checked by the initial 278-check run and the separate full regression.
The first added-progress attempt used the small-plan API fast path and correctly
found no intermediate state; the fixture was corrected before the final pass.
Its exact failed-test target `halcyon-budget-m2-1416112bb1a4407e` was cleaned.
The initial successful target was `halcyon-budget-m2-b48d4c9c393c400f`.

The separate full lifecycle regression passed **472 checks** on
`halcyon-budget-m2-8c4609b397514a34`, across 91 existing migrations, including the
final in-form progress rendering. Its exact fixture cleanup passed. It preserves
signed carry/protected balances, all archive dispositions, future allocations,
pause/resume, unchanged history, stale refresh, save/Undo and durable recovery.

559 unit tests passed with 14 existing skips. Full/focused/browser TypeScript,
changed script syntax, production build and diff whitespace checks pass. The
existing large-chunk build advisory remains. No financial command or schema changed.

Next: **BUI-08a — My plan allocation summary and edit entry**. R01–R05 and broader
M7 human/release gates remain independently open. No personal rollout is implied.

Post-run Docker label audit confirmed zero containers, volumes and networks for
all four completed test targets and the retired BUI-07b preview. The new review
preview remains intentionally retained; its identity is recorded in CURRENT_STATUS.

The retained review preview is `halcyon-budget-m2-b3e19bfef6644c49` / runner 76747
at `http://127.0.0.1:57300/budget`. Normal sample/fresh-setup password sign-in passed.
Credentials remain in private runtime storage, outside repository docs. Stop this
exact verified runner before conflicting test runs.

The in-app browser is signed into the fictional sample with the lifecycle form
open. No choices were edited or saved in the final manual inspection. Screenshot:
`/private/tmp/halcyon-bui07c-ready.png`.
