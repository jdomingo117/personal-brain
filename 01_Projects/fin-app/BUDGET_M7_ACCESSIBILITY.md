---
tags:
  - halcyon
  - budgeting
  - accessibility
type: implementation-record
status: automated-audit-complete
project: Halcyon
created: 2026-10-22
updated: 2026-10-22
related:
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# M7.2 — automated accessibility and responsive audit

## Outcome and reproduction

M7.2's automated audit is complete. The final run passed **260 isolated SQL/Edge/browser
checks across 91 migrations**, including **64 rendered-state scans** with zero axe violations,
zero page/region horizontal overflow and no browser runtime errors. This is a focused run,
not a replacement for M6's 472-check broad regression or the final M7.7 candidate run.

Run `npm run test:budget:accessibility` from `app/`, with `SUPABASE_CLI` set to the installed
binary when it is not on PATH. The command provisions a new guarded project; it does not accept
an existing database target. `test-budget-accessibility.mjs` is dispatched by the existing
workspace runner through `--accessibility-only --workspace`. The durable runner keeps source,
RLS, fixture and cleanup guards intact. `@axe-core/playwright` is a development dependency.

Final target: `halcyon-budget-m2-200adb9efa7847a4`, API 57421, DB 57422. The harness verified
an empty target before fixtures, replayed 91 migrations and passed identity/account/transaction/
Budget-source-gate cleanup. It exited successfully and removed only that disposable project.
Earlier diagnostic attempts stopped on two new-test sequencing errors and then the real
keyboard-scroll defect; their exact disposable resources were also removed. The final run
supersedes those attempts. No personal stack query/migration or feature exposure occurred.

## Coverage

| Matrix | Rendered states |
| --- | --- |
| 320px light, monthly, reduced motion | Empty, manual editor, setup review, active overview, frequency/account/rollover/lifecycle forms and reviewed effects, goal dialog, failed refresh retaining prior workspace |
| 320px dark, fortnightly, reduced motion | Same states, including fortnightly-to-monthly preview |
| 1440px light, monthly, ordinary motion preference | Same states |
| 720px dark, fortnightly, reduced motion | Same states; reflow equivalent to 1440px at 200% browser zoom |
| 320px supplemental | Assisted scope, missing-selection error, covered evidence, optional what-if, dark evidence/what-if, limited-history fallback, historical review and dark historical comparison table |

Each scan uses axe's `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` tags on the Budget workspace
or the portal dialog, plus measured overflow and enabled-control target-height checks. Native
checkbox/radio targets are measured at their associated label. The 44px height is the project
touch-target policy; 44×44 is WCAG 2.1 AAA guidance, not an AA requirement. Width/spacing and
real touch interaction remain human review items.

Keyboard assertions use Enter to open setup and inline previews, verify entry into the frequency/
account form and restoration to each inline opener, exercise goal-dialog Tab/Shift+Tab boundaries
and Escape restoration, and use ArrowRight to scroll overflowing comparison regions. Ordinary
form controls are also used by the authenticated journeys. This is not a fully keyboard-only
end-to-end human session; native date-picker behavior is still an M7.3 check.

The audit inspects a failed workspace read with existing figures retained and the real missing-
account and limited-history assistance states. Prior unknown-write recovery tests remain in the
broad workspace suite; this matrix does not separately axe-scan every pending-write/history-
preparation permutation. M7.7 must rerun the relevant broad recovery tests on the final candidate.

## Findings and fixes

| Finding | Impact / criterion | Fix and evidence |
| --- | --- | --- |
| A01 — comparison scroll containers not keyboard reachable | Serious; WCAG 2.1.1. Axe failed on two account-effect table containers at 320px. The same wrapper pattern existed in other Budget comparisons. | Account, rollover, lifecycle and historical comparison wrappers now have `tabIndex=0`, a region role and an explicit label. They retain table captions/headers, gain visible focus, and narrow effect tables pass ArrowRight-scroll assertions. |
| A02 — inline account/frequency trigger disappears without explicit focus handoff | Keyboard position loss; WCAG 2.4.3. Found in source review. | Shared `useBudgetInlineFocus` moves focus into the inline form and restores its trigger on close. Real browser entry/return assertions pass in all four configurations. Existing rollover/lifecycle restoration also passes. |
| A03 — disclosure summaries omitted from explicit focus styling | Visible-focus coverage gap; WCAG 2.4.7. Found in source review. | Budget-scoped rules include `summary` and native controls; scroll regions also get the token-based 2px focus outline. Human focus visibility/obscuring inspection remains M7.3. |
| A04 — shared native-control size/boundary styling insufficiently explicit in Budget | Project touch-target and non-text-boundary coverage gap. | Budget workspace/dialog native controls use a 44px minimum height and the existing workflow border token; checkbox/radio labels have a minimum target height. Measured enabled-control heights pass throughout the matrix. |
| A05 — Framer-driven tile/press transforms not explicitly suppressed on Budget | Reduced-motion preference coverage gap; project motion policy, beyond an AA conformance claim. | Reduced-motion CSS removes Budget tile/button transforms and tile blur and immediately exposes tiles. Computed tile transforms are `none` in the three reduced-motion configurations. |

The accessibility-review skill guided semantics, contrast, keyboard/focus, target size and zoom
coverage. Existing design tokens, dialog focus behavior and financial command boundaries are
retained; no monetary calculations or SQL migrations changed.

## Contrast and visual evidence

The existing unit guard reads shipping CSS and verifies semantic/helper text tokens against the
theme surface. Measured ratios on this revision:

| Token | Light | Dark | Normal-text AA threshold |
| --- | ---: | ---: | ---: |
| muted | 5.45 | 9.39 | 4.5 |
| faint | 4.89 | 7.79 | 4.5 |
| accent-ink | 4.98 | 9.64 | 4.5 |
| positive | 5.06 | 8.55 | 4.5 |
| warning | 5.31 | 7.48 | 4.5 |
| negative | 5.65 | 4.97 | 4.5 |

Axe also checks rendered text where its contrast analysis can resolve the background. Token
ratios do not prove every glass/canvas composite, UI border, browser-native control or focus
indicator passes; unresolved and visually dependent cases remain M7.3.

Captures `/tmp/halcyon-budget-a11y-320-light.png` and
`/tmp/halcyon-budget-a11y-320-dark.png` were visually inspected: the error and explanatory copy
wrap without page overflow. The narrow native saved-period selector elides its long value;
the complete selected date range is also presented in wrapping text directly above it. Desktop
and 720px captures are generated alongside them. These temporary synthetic-fixture captures
are engineering evidence and may be removed by OS cleanup.

## Verification limits and next chunk

Full app TypeScript, focused Budget TypeScript, browser-suite TypeScript, **516 unit tests
(14 existing skips)** and production build pass after the fixes. The Vite main-chunk advisory
remains. No axe rule was disabled and no violating node was excluded to obtain a green result.

This is Chromium automation and engineering visual inspection, not WCAG certification. M7.3
retains observed screen-reader operation, keyboard-only task completion, native browser zoom,
contrast/focus over glass backgrounds, real touch/spacing and assistive-technology review.
The 720px viewport establishes reflow evidence, not actual 200% browser magnification. The
shared shell is outside the axe inclusion region and needs contextual human review as well.
M7.4 retains independent beginner comprehension. R01–R05 remain open and release remains No-Go.

## Manual session availability — 25 October 2026

The normal app at port 5300 retains its private-preview gate; a direct `/budget` URL there is
not the prepared validation environment. `npm run preview:budget:manual` now starts a separately
labelled disposable project, enables Budget only in its dedicated Vite/Edge processes, and keeps
the preview at `http://127.0.0.1:57300/budget` running until stopped. It provides a sample active
budget with a named goal and a separate fresh-setup account. Real password sign-in, visible Budget
navigation, enabled sample/setup controls and goal-dialog opening passed browser smoke checks.
Fictional login details are generated per run and stored only in the temporary work directory.
The runner cleans up its captured fixtures and project after graceful stop. Closing a browser tab
does not stop the preview. This prepares the M7.3 session; it supplies no human validation result.

## Candidate refresh — 27 October 2026

[[BUDGET_BUI_10_CANDIDATE_VERIFICATION]] supersedes the old audit as the latest
changed-UI evidence without rewriting the historical 22 October record. Its final
95-migration accessibility run passed **263 checks / 64 states**. The separate
candidate matrix passed **187 checks / 70 state-width-theme scans**, giving 134
passing axe scans and 144 saved captures. Separate final lifecycle regression
passed 472; unit/types/build pass. See the candidate checkpoint for exact targets,
cleanup, source hashes and commands.

Native task audits now select only the open modal. Individual assistance inputs
are explicitly confirmed before its what-if scan. Engineering image inspection
found a phone floating-theme control overlapping Still to plan; the shared quick
toggle now sits in the Budget header, with no duplicate floating copy on this
route. Header geometry, real preference behavior and other-route floating behavior
are tested. No financial calculation, command, migration or exposure changed.

M7.3/M7.4 human accessibility/comprehension, native zoom and contextual shell/
focus/contrast checks remain pending. These refreshed automated results do not
constitute owner acceptance, screen-reader validation or certification.


## Current human session preparation — 28 October 2026

The simplified real Overview has owner acceptance. [[BUDGET_M7_HUMAN_VALIDATION]] supplies the observed keyboard, screen-reader, native zoom and touch protocol plus result template. No human accessibility result has been recorded. VoiceOver can be used locally by a human observer; agent accessibility-tree inspection and axe scans do not establish spoken output or screen-reader usability.
