---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_06B_CHECKS_GUIDANCE]]"
---

# BUI-07a — one settings entry and task host

The owner accepted BUI-06b's visual checkpoint on 26 October 2026 and authorized
this phase. R01 forecast remains separately open.

The Budget header opens one native settings panel. A typed summary/frequency/
accounts/rollover/lifecycle route selects the existing controllers as intact
components. Each controller is mounted once, with its original write gates,
source/plan/preview hashes, money/date logic, saved pending state and Undo actions.
The page no longer repeats the four settings sections; historical review/carry
and next-period controls remain in `BudgetLifecycle`. The paused-budget link opens
the same settings host. Detailed form presentation remains for BUI-07b/BUI-07c.

The shared native panel owns focus, inertness, Escape, dirty exit and browser/period
navigation. Inline focus helpers move within that modal and do not create traps.
Summary routing restores focus to the originating settings entry; panel exit restores
the header opener. Existing form cancellation still confirms discarding choices.
Returning from an explicitly cancelled or saved form clears that task's dirty state.
Normal saves return to the summary; an unknown save stays recoverable and closes
only after receipt recovery. The default goal-panel completion behavior is unchanged.

The host provides Refresh settings data so a stale form can retain its choices while
checking fresh facts. Rollover's button-only draft actions carry semantic dirty markers;
no financial form logic was rewritten. The native Tab boundary includes summaries
as well as ordinary form controls. There is one mounted task host and no nested dialog.

## Verification

Final focused run: **91 isolated checks** on `halcyon-budget-m2-b9a58387f2264e7f`
passed, including one native modal, four entries/no write on opening, dirty close/
browser Back, explicit cancellation/focus restoration, source refresh retaining
account intent, one-write lost-response recovery, normal save returning to a clean
summary, button-only rollover dirty detection and existing goal-panel recovery.
**22 axe scans and 23 captures** cover summary widths/themes, phone rollover/lifecycle
forms and the original goal task suite. Captures are in `docs/budget-ui/bui-07a/`.

The full lifecycle run passed **472 checks** on `halcyon-budget-m2-bbd364c8d9c2476f`.
The refreshed accessibility matrix passed **263 checks across 64 audited states**
on `halcyon-budget-m2-22fff931c7f148d1`, including all four settings forms, reviewed
effects, narrow layouts, keyboard table scrolling and focus. These are separate
runs and totals. All exact test projects were cleaned by the guarded runner.
The final static checks include the explicit form focus priority and in-panel
refresh/history-preparation status added during verification.

559 unit tests/14 existing skips and full/focused/browser types, syntax/build passed
at the final checkpoint. No dependency, schema, financial command body, exposure
or personal data changed. Old settings flows are intentionally updated to enter
through the header, refresh within the panel and test native dirty-close cancellation;
all financial/save/Undo assertions remain.

Next engineering task: **BUI-07b — frequency and accounts form presentation**.

A fresh retained fictional preview is available at `http://127.0.0.1:57300/budget`
while project `halcyon-budget-m2-d12d3c834afa4a4a` / runner 52643 remains alive.
Sample and fresh-setup password sign-in checks passed. Runtime credentials stay
outside repository docs. Stop this exact runner before conflicting test runs.

Post-run Docker label audit confirmed zero containers, volumes and networks for
all five test targets (including the corrected initial lifecycle attempt) and the
retired BUI-06b preview. The new preview remains intentionally running. The in-app
browser is signed into its sample with Budget settings open; runtime screenshot:
`/private/tmp/halcyon-bui07a-ready.png`.
