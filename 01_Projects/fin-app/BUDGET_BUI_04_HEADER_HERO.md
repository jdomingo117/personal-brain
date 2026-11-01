---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: complete
project: Halcyon
created: 2026-10-25
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_03_PRESENTATION_ADAPTER]]"
  - "[[BUDGET_BUI_02_TASK_PANEL]]"
---

# BUI-04 — compact header, period navigation and everyday/income hero

**Complete — engineering verified 25 October 2026; owner visual sign-off 26 October 2026.**
Next engineering burst: BUI-05a everyday rows.

## Composition and authority

`components/budget/BudgetPageHeader.tsx` provides the Budget title, one saved-period
selector, previous/next/current actions, Overview / My plan / Look back navigation,
Budget settings entry and refresh. Exact inclusive dates, rhythm, timezone and
current/past/future labels remain readable below the controls. Monthly options use
a compact month/year; fortnight and bridge options retain exact date ranges. The
selected full range is never truncated. Compact phone labels retain meaningful
accessible names; no control becomes a hover-only or gesture-only action.

`components/budget/BudgetHero.tsx` consumes BUI-03 values directly: authoritative
everyday remaining, spent/planned, expected versus received income, signed unallocated
capacity and a separately labelled continuing-template gap. One-off cash stays
separate. Overspending and funding gaps retain their signs. Only the decorative
progress fill clamps; true amounts remain text. Missing observations are unavailable,
not zero. “This is not your bank balance” stays next to the everyday meaning.

The selected lifecycle `as_of`, timezone and shared `remainingDays()` helper supply
“days left after today”; transition metadata is now carried through the adapter.
No fixed concept clock, monthly/2 arithmetic or new forecast is introduced.

Healthy Overview leads with dates and money. Critical membership, read/preparation,
write-outcome, role and paused-write notices remain above affected content. A paused
budget also has an actionable strip. Ordinary provisional/current state is quietly
qualified beside the hero; missing/stale/partial evidence uses warning treatment.

The hero has an inline calculation disclosure and links that focus/scroll to retained
evidence and guidance. Settings focuses the existing lifecycle section. My plan
retains the saved allocation view/editor. Look back provides an entry to the existing
immutable review/comparison/carry controls for completed periods; BUI-08b owns its
full visual composition. All existing lower controls, checks, items and forms remain
mounted/reachable during ordinary view changes. No duplicate hidden lifecycle forms.

## Period guards and command preservation

Period controls moved out of `BudgetLifecycle` into the header. The existing
`budget-before-period-navigation` event still runs attention and inline lifecycle
exit decisions. Lifecycle's former local navigation confirmation is now its event
listener; the provider then applies BUI-02's goal-task/pending guard and indexed URL
transition. The new hero plan-edit entry also respects the retained inline-preview
exit decision before opening the existing editor.

No period inventory, source/plan/method version, command constructor, Save/Undo,
request checkpoint or receipt lookup changes. Browser back/forward, reload and
`budgetPeriod` remain provider-owned. Pending writes keep their recovery strip and
cannot switch periods. The plan editor keeps period controls/view switches disabled.
Tabs are local view state and issue no save. Unmigrated inline tasks retain their
existing guard behavior; BUI-07 owns their full task-host extraction.

Existing M5/temporal browser selectors were updated to find period controls in the
header rather than inside the review region. Their value, width, confirmation,
history and financial assertions were retained. BUI-02's programmatic navigation
tests now use the controls' stable accessible labels because arrows/Refresh are
intentionally compact visible labels.

## Visual decisions and reference adaptations

- Budget uses a local quiet surface/accent wash inside the existing application
  shell, with a 1320px maximum and a named content container. App header/rail/footer,
  fonts, default theme and other routes are unchanged.
- The hero is an editorial section with a divider; income is alongside it when the
  content container is wide enough and below it on narrower layouts. No equal-tile
  hero, count-up or entrance choreography was added.
- Existing brand tokens/Archivo/Hanken and tabular money are used. Heading scales
  36–46px, desktop amount 48–68px; narrow-container amount scales 40–56px so real
  values wrap. Native buttons/select and the existing view-switch pattern suffice;
  no dependency, registry or global token initialization.
- Phone copy was tightened after capture inspection: Current, Settings and Refresh
  stay compact without losing accessible names. The calculation link's accessible
  name includes its visible “How it works” text; a fresh axe finding caught and
  corrected the earlier mismatch.
- The production date clock and shell widths differ from the fictional concept.
  Days remaining therefore follow the server, and the phone rail leaves less content
  width than the concept's standalone Phone preview. At 320px the income values begin
  in the initial viewport, with the remaining income explanation below the fold.
- The lower overview still uses its existing detail cards. Category/commitment/goal/
  check composition follows BUI-05/06; this checkpoint does not claim the whole page
  already matches the finished concept.

## Verification and visual review gate

The focused command (from `app/`) is:

```sh
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --hero-only --workspace
```

It provisions a fresh guarded disposable project, replays the unchanged migration
chain and signs in real fixture users. It tests the matched $6,000 income / $1,800
everyday / $1,510 used / $290 remaining / $200 unallocated example. SQL supplies
only disposable fixtures and independent proof; tested UI commands/recovery use the
real authenticated Edge boundary.

The focused suite reuses BUI-02's task-panel/recovery tests with a BUI-04 capture
directory, preserving the original BUI-02 reference artifacts. It checks:

- Five actual widths (320/390/768/1024/1440), both themes, no horizontal overflow,
  dates/headline before settings and the income summary beginning in the first viewport.
- Ten full-workspace axe scans plus twelve goal-panel/dirty-decision scans.
- Exact saved period IDs through selection/back/forward/reload/current; no command
  or financial revision on view switches; real plan editor and retained detail links.
- Canonical $340 remainder after a $50 rights release; signed overspend with a
  100%-clamped meter; separate signed current/future funding gaps; stale/unavailable,
  manual/future and empty states; extreme cents wrapping at 320px.
- Goal draft exits/focus, browser-history and period guards, source-refresh retention,
  interrupted response, original request after reload, page/in-panel receipt recovery,
  return from another document and compatible Undo.

Final focused run: **121 isolated checks across 91 migrations** in
`halcyon-budget-m2-9ea2f0641b754dfd`, including the header/hero matrix and reused
task/recovery journey. Full existing lifecycle run: **472 isolated checks across
91 migrations** in `halcyon-budget-m2-b11dc1ac993a4a86`. These are separate,
non-additive totals. Both use API `127.0.0.1:57421`, DB `127.0.0.1:57422/postgres`
and frontend `127.0.0.1:57300`, with initially empty targets, captured fixture cleanup
and exact-project resource removal. No browser runtime errors.

Fresh **22 axe scans** pass (ten full workspace width/theme states plus twelve
goal/dirty-decision states). Header and hero have no horizontal overflow in the
matrix; desktop arrows share a row, phone income starts within the tested 1100px
viewport, and extreme values wrap at 320px. `geometry.json` retains measured positions.
There are **31 PNGs**: 18 overview/state/detail captures and 13 task/recovery captures.
Desktop light, phone dark, phone money detail and unavailable 320px output were
visually inspected. The desktop period-group width and phone text density were
corrected during this engineering review; final captures include those corrections.

Static checks: full app, focused Budget and browser TypeScript; **559 unit passes /
14 existing skips**; changed `.mjs` syntax checks; production build and scoped diff
whitespace checks pass. The existing bundle-size advisory remains. No dependency,
lockfile, flag or schema change was made by this burst. Earlier unrelated working
changes are preserved. No broader human/performance/rollout sign-off is inferred.

**Owner visual checkpoint accepted — 26 October 2026.** After the authenticated
preview walkthrough, the owner stated: “All visual tests pass my visual tests at this point.”
This explicitly closes the current BUI-04 visual gate with no changes requested.
Specific device, zoom and assistive-technology results were not separately reported;
final M7 accessibility/comprehension and release gates retain their existing scope.

## Scope and next burst

No financial schema/kernel/command-body change, new forecast, personal migration,
feature exposure or app-wide redesign. R01–R05 and broader M7 gates remain open.
Existing unrelated working changes are preserved.

Next engineering slice: **BUI-05a — everyday rows**, retaining every canonical
category/Other value and task entry. The owner header/hero visual gate is accepted.

## Delivery checkpoint

Burst / status: **BUI-04 — Complete; owner visual review accepted 26 October 2026.**

Behavior and visual change: compact selected-period header and three local views;
concept-like everyday/income hero; inline calculation and retained-section links;
Budget-local quiet page plane. Signed, unavailable, manual, provisional, stale and
future states stay explicit. Lifecycle controls now follow the overview.

Files changed: new `components/budget/BudgetPageHeader.tsx` / `BudgetHero.tsx`;
`views/Budget.tsx`, `budget.css`, `BudgetLifecycle.tsx`; adapter period transition
metadata; header/hero harness and guarded dispatch; intentional header selector
updates in task/M5/temporal runners; checkpoint, resume/index and capture documents.

Commands / target / actual results: 121 focused and 472 lifecycle checks, separate
targets above; 22 axe scans/31 captures; unit/types/syntax/build/diff checks pass;
both exact project labels have no residual containers, volumes or networks.

Visual captures and review decision: engineering inspection complete; owner visual
sign-off received 26 October 2026, with no changes requested. Primary assets: desktop light overview, phone dark overview and
phone money-detail view under `docs/budget-ui/bui-04/captures/`.

Known failures or unchanged release findings: R01–R05 and later M7 gates open;
lower overview composition is still scheduled work. Native zoom/human assistive
validation is not supplied by these scans. Existing bundle advisory remains.

Exact next burst: **BUI-05a**. Build compact everyday/category/Other rows around the
adapter and existing inspectors/move/limit tasks. Owner hero-feedback gate accepted.

## Owner walkthrough environment — 25 October 2026

At the owner's request a retained disposable review preview was launched at
`http://127.0.0.1:57300/budget`, project `halcyon-budget-m2-7e361640947a4e3b`.
`preview-budget-manual.mjs` now seeds the matched $6,000 expected / $3,000 received /
$1,800 everyday plan / $1,510 spent / $290 remaining / $200 unallocated example and
retains a separate fresh-setup login. Real password login and these headline values
were verified. `--manual-preview` passes the provisioner's existing scoped SQL helpers;
there is no new external target or guard bypass. Runner syntax/whitespace checks pass.
Credentials remain only in private runtime session details. The live URL lasts while
the retained runner is running; it is not a deployment or permanent hosted link.
The walkthrough was followed by explicit owner visual approval on 26 October 2026,
recorded above. Final M7 comprehension validation remains open.
