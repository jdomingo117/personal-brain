---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: complete
project: Halcyon
created: 2026-10-25
updated: 2026-10-25
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_01_REFERENCE_MAP]]"
---

# BUI-02 — scoped foundations and goal-task pilot

**BUI-02 Complete — 25 October 2026. Next: BUI-03 display adapter.**
The authenticated production goal editor uses the new panel. Other presentation
sections remain for their scheduled bursts; this is not full redesign completion.

## Implementation and adoption decision

Use a native modal dialog for the Budget task primitive. No shadcn initialization,
registry file, package/lockfile change, global token replacement, new font or app-shell
change is required for this burst. The concept already establishes a native-dialog
presentation, and the platform supplies modal inertness and top-layer rendering.
The pilot uses no `useDialogFocus`, Radix focus trap or second modal around it.
Tab wrapping belongs to this panel's keyboard handler; the dialog owns modality.

`BudgetTaskPanel.tsx` portals to `document.body`, outside animated/masked `Screen`.
It uses an opaque `--color-surface`, existing theme/control tokens, a 560px desktop
width and full viewport width below 700px. The header stays outside the independently
scrolling body; focused controls scroll inside that body. Budget-only spacing tokens
are defined on `.budget-workspace` and `.budget-panel`. No entrance motion is added.

Only goal create/edit uses the new host. It composes the existing private `ItemForm`
inside `BudgetItems.tsx`; no hidden duplicate form is mounted and no financial
controller is rewritten. Other item/match/move/limit tasks retain their existing host
until their own bursts. The date-based amount button marks the draft dirty even when
its calculated change does not emit a native input event.

## Exit, navigation and recovery

- Pristine close/Escape/outside click exits directly and restores the opener, with a
  Budget-heading fallback if the opener disappears.
- Dirty exits display one in-panel decision. Stay preserves mounted form state and
  restores focus; Leave explicitly discards local input. Escape from that decision
  returns to the form. No stacked confirmation dialog or automatic save is introduced.
- In-app route requests and saved-period changes use the registered task guard.
  Browser back/forward restores the current history entry before asking, then replays
  the original traversal only after Leave. Saved-period pushes retain router state
  and increment its history index.
- The guard installs at the stable `BudgetProvider` boundary; identity-specific
  `BudgetSession` remounts supply their current guard without reinstalling navigation
  listeners. Unregistered legacy tasks keep their existing behavior.
- Financial Save blocks close and navigation. Unknown outcomes retain the provider's
  original request/checkpoint and can be checked inside the panel or from the existing
  page recovery strip after closing. Pending goal outcomes also guard route changes
  after panel close/reload. An explicitly accepted cross-document exit can still
  return to Budget to recover; the guard never traps the owner on another route.
  Recover uses the existing operation lookup/same-key retry.
- Native unload warnings remain browser controlled. No new localStorage financial
  draft persistence is added. Source/plan refresh retains input while the existing
  form invalidates its impact review and acknowledgement.

The BrowserRouter adapter is contained in `useBudgetNavigationGuard.ts`. It uses
the existing router navigator and indexed same-document history, with teardown
restoring patched methods. Changes to routing/history in later bursts must retain
its browser regression cases. Cross-document exits use native unload protection.

## Verification record

The focused authenticated harness is
`app/scripts/test-budget-task-panel.mjs`, invoked only through the existing guarded
fresh disposable provisioner:

```sh
SUPABASE_CLI=/absolute/path/to/installed/supabase node scripts/test-budget-durable.mjs --task-panel-only --workspace
```

Run from `app/`. The option reuses the normal provisioning, exact target identity,
empty-database proof, migration replay, real Auth/Edge boundary and scoped cleanup.
It does not accept an existing target or bypass fixture safety. SQL is used only
for disposable setup and independent financial assertions; tested saves/recovery/
Undo use the authenticated UI and real endpoints.

Final focused run: **62 isolated checks across 91 migrations** in
`halcyon-budget-m2-3e79b9cd2518496c`, API `127.0.0.1:57421`, DB
`127.0.0.1:57422/postgres`, frontend `127.0.0.1:57300`. The 62 is the complete
focused-run total, including its assistance prerequisite checks, not a count to
add to older broad milestone results. Runtime errors: zero. The runner verified
fixture user/account/transaction cleanup and removal of its exact labelled project.

The new task proof covers: unchanged legacy bill host; one native goal modal;
Tab/Escape and opener focus; dirty close/outside click/route request; browser
back/forward Stay/Leave with URL restoration; saved-period selection and indexed
history; source refresh retaining inputs and invalidating review; in-flight blocking;
complete original `save_item` configuration and expected source/plan/period;
unknown-result checkpoint and reload; page recovery with no duplicate Save;
cross-document return to recovery; existing-goal edit and in-panel recovery; guarded
Undo restoring $25 contribution after a $30 edit while everyday stays $2,000.

**12 fresh axe scans** pass: goal editor and dirty decision at 320/390/1440px in
light/dark. All six geometry checks pass, including full-width phones, 560px desktop,
independent body scroll, no horizontal overflow and an unwrapped Close control.
`docs/budget-ui/bui-02/captures/` contains **13 production fixture PNGs**. Engineering
inspection sampled desktop light, phone dark and 320px; the initially wrapped Close
label was corrected and recaptured. These scans supplement rather than replace the
historical M7.2 full-state audit; no human accessibility result is claimed.

Static checks: full app and focused Budget TypeScript, browser TypeScript, changed
runner syntax checks, unit suite (**516 pass / 14 existing skips**) and production
build pass. The existing main-chunk advisory remains. No package changes were made
by this burst. Earlier package/lockfile and other unrelated working changes remain.

Earlier failed runs found a native Tab boundary issue and a browser-history guard
ordering issue; their assertions remain in the harness. One fixture was corrected
to have an unselected account so Accounts navigation does not redirect to onboarding.
The budget itself remains a manual/no-activity plan. Another fixture was corrected
to navigate an actual completed prior period rather than open an unfinished period.

The previously retained manual preview `halcyon-budget-m2-55969f559171448a` had no
live runner/frontend and occupied the dedicated database/API ports. It was stopped
by exact project ID with backup preserved before provisioning fresh test projects.
It is no longer a live manual-review endpoint. The personal `fin-app` stack was not
queried, migrated or stopped. No credentials are recorded in this checkpoint.

## Scope and handback

No migration, financial calculation change, personal Budget exposure or rollout.
R01–R05 and M7 release/human gates remain open. Existing unrelated workspace changes
are preserved. Owner visual acceptance is scheduled after BUI-04/06b/11, not claimed
by engineering screenshot inspection here.

Next after this gate: **BUI-03 — display adapter**, including canonical Other/nullability,
carry/rights and independent availability/coverage/freshness/provisional dimensions.

## Delivery checkpoint

Burst / status: BUI-02 — Complete.

Behavior and visual change: Budget-scoped native task host and unsaved exit step;
existing goal create/edit pilot; consistent task/period/route guard and durable
recovery access. Existing financial forms/request construction retained.

Files changed: `BudgetTaskPanel.tsx`, `useBudgetNavigationGuard.ts`, `BudgetItems.tsx`,
`BudgetContext.tsx`, `budget.css`; focused runner and two provisioner dispatch points;
this record, capture assets and current handoff/index/orientation documents.

Commands / target / actual results: focused 62-check run above; type/unit/build,
runner syntax and scoped diff whitespace checks pass. No wider lifecycle rerun
is claimed for this presentation burst.

Visual captures and review decision: 13 authenticated fixture captures; engineering
review complete for the pilot; owner overview/fidelity gates remain scheduled.

Known failures or unchanged release findings: R01–R05 and broader M7 gates open;
BrowserRouter integration is localized but must be reverified if routing is changed.
Legacy tasks deliberately retain their old host/guards until their own migration.

Exact next burst: BUI-03 only. Prove display semantics behind the existing view;
correct nullable wire types and canonical Other mapping without a migration or
source-feed aggregation. Read BUI-01 section 3 before writing the adapter.
