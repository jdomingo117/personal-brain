---
tags: [halcyon, budgeting, ui, verification]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-27
updated: 2026-10-27
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_09A_MANUAL_SETUP]]"
  - "[[BUDGET_R05_SIGNED_ESTIMATOR]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
---

# BUI-09b — assistance presentation

## Result and scope

Assistance now uses the established native Budget task panel. Three numbered,
collapsible sections organize history evidence, editable amounts with one optional
change, and the final draft review. A compact section navigator opens and focuses
the requested section. Sections initially remain open so the user can compare and
revisit inputs without an extra wizard state or a new financial acceptance gate.
Controls stay mounted when a section is folded.

The history section names the selected accounts and normalized budget dates,
shows complete-period and independent calendar-month evidence, and retains signed
observations, range, variability, unassigned credits and excluded coverage.
Detailed dates, method, regular costs and excluded windows use native disclosures.
Missing history remains unknown. Negative historical medians remain observations;
only a nonnegative user-selected amount can enter the plan.

The second section preserves the R04 individual income/pay-date, bill and reserve
reviews and selective merge into protected edited/saved drafts. The existing
optional-change controller retains current gross-spending room, explicit future
intent, goal opening reserve, real contribution dates, deadline shortfalls and
conditional outcomes. Unsupported timing remains unavailable with its reason.

The final section separates expected income, the everyday amount after any
change, other existing planned allowances, the additional goal contribution and
signed Still to plan. A funding gap stays visible in the section summary even
when folded. The final acknowledgement and Use this draft remain separate from
Save setup draft and explicit activation in the existing manual editor.

Close/Escape retains the complete assistance controller in this session and offers
Continue history review. The native panel remains the only focus/inertness owner.
It accepts an optional return-focus target for the replaced setup trigger; other
tasks retain the established default. Rechecking clears old scope/review/goal
confirmations while preserving editable inputs. A refreshed changed/unavailable
source retains old evidence and choices, marks the review stale and disables use
until fresh history is reviewed. Explicit manual conversion remains available.

Production scope: `BudgetAssistance.tsx`, the Budget view host, Budget-local CSS,
and the optional focus-return hook in `BudgetTaskPanel.tsx`. No dependencies,
calculation libraries, command bodies, migrations or feature exposure change.
The established native panel was reused rather than adding another primitive or
focus trap. No personal database was inspected or migrated.

## Verification record

The final combined run passed **221 checks across 95 migrations** on
`halcyon-budget-m2-60177f12741d4a9e`. It includes 30 presentation WCAG scans and
30 captures (three section positions at five widths in both themes), plus 12
R03/R04/R05 modal scans. Source invalidation, native focus, browser Back/Forward,
protected inputs, canonical estimator and concurrent receipt proof pass. The
separate full lifecycle regression passed **472 checks** on
`halcyon-budget-m2-2185f08f6702439f`. Both exact disposable targets were cleaned.

**586 unit tests pass, with 14 existing skips.** Full/focused/browser TypeScript,
script syntax, production build and scoped whitespace checks pass. The existing
Vite bundle advisory remains. Captures were inspected, including phone dark final
review and the desktop-width task surface. These automated results do not imply
human accessibility, comprehension or final owner visual acceptance.

The new `test-budget-assistance-presentation.mjs` checks native modality, explicit
scope, editable intent, optional-change readiness, close/resume, browser navigation,
folded-section focus, changed-source invalidation, manual conversion and no writes
from previews. It audits evidence/one-change/review at 320, 390, 768, 1024 and 1440px
in both themes. Existing R02–R05 accessibility selectors now audit the actual modal
surface rather than the inert workspace behind it. The broad assistance focus
assertion similarly targets the new native task; financial assertions remain.

An initial browser attempt used an overly exact destination-select label and was
corrected. Subsequent focus checks exposed the replaced trigger's return target;
the explicit resume hook now uses the class forwarded by the existing Button.
The responsive matrix also exposed a desktop `col-span-2` inside the narrow
single-column goal form; its implicit extra column is now removed in the scoped
assistance style. The R04 recheck journey now explicitly confirms the new history
scope before its original financial checks. Each stopped attempt used a fresh
disposable project and exact cleanup.

Verified command scope (from `app/`, installed CLI supplied as `SUPABASE_CLI`):

- `node scripts/test-budget-durable.mjs --assistance-ui-only --workspace`
- `node scripts/test-budget-durable.mjs --items --lifecycle --workspace`

These commands provision unique guarded projects on API 57421/DB 57422 and must
never be pointed at personal app/API 5300/54321 or a retained review preview.

## Remaining work

The UI count is 15/17. Next is BUI-10 candidate
automated/visual verification, then BUI-11 owner review and handback. R02–R05 are
corrected. R01 forecast remains open before final acceptance of affected checks;
human accessibility/comprehension, capacity, persistent migration rehearsal,
security/candidate and rollout gates remain M7 work. Release remains No-Go.

## Exact cleanup audit

Container, volume and network label audits confirm that the retired R05 preview
`halcyon-budget-m2-880c033143ee46e5` and these stopped/final focused attempts are
clean: `halcyon-budget-m2-80d3667d1d2841a3`,
`halcyon-budget-m2-43e5efd12e424903`, `halcyon-budget-m2-809c604d9cff490e`,
`halcyon-budget-m2-b6e151da02eb4ec6`, `halcyon-budget-m2-31ca8bc20e83489d`,
and `halcyon-budget-m2-60177f12741d4a9e`. The full lifecycle target is
`halcyon-budget-m2-2185f08f6702439f`; its guarded runner and the final exact-label audit both confirm cleanup.
The retained review preview is provisioned separately from every test target.

## Retained review site

Historical preview: disposable project `halcyon-budget-m2-d142599a4ea34e92`, runner PID 59405,
served `http://127.0.0.1:57300/budget` (API/DB 57421/57422). All seven fictional
accounts passed normal password sign-in and their sample/setup/history/eligibility/
readiness/individual-input/signed-estimator controls. The user's existing in-app
tab was signed out of the retired session and signed into the new fictional
signed-estimator account through the normal login form.

The final review is left open with history and input sections folded but retained:
$100 expected income, $25 user-chosen everyday allowance, $0 other allowances and
$75 Still to plan. The underlying history remains −$0.51 median with −$8 current
unassigned credits. Use this draft is enabled; nothing was saved or activated.
Screenshot: `/private/tmp/halcyon-bui09b-ready.png`.

Credentials remain in the runner's mode-0600 temporary `manual-preview.json`, not
in documentation. Availability lasts while this exact runner remains alive. Stop
and verify cleanup before conflicting isolated tests; never reuse this preview
as a destructive target. Personal app/API 5300/54321 remain untouched.

The BUI-09b retained runner was positively identified, stopped and cleaned for BUI-10. Current evidence, replacement review site and next owner gate are recorded in [[BUDGET_BUI_10_CANDIDATE_VERIFICATION]].
