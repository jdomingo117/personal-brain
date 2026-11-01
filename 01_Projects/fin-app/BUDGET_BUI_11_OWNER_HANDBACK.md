---
tags: [halcyon, budgeting, ui, handback, verification]
type: implementation-checkpoint
status: owner-presentation-accepted
project: Halcyon
created: 2026-10-27
updated: 2026-10-28
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_10_CANDIDATE_VERIFICATION]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
  - "[[CURRENT_STATUS]]"
---

# BUI-11 — owner visual review and engineering handback

## Decision and scope

The owner accepted the visual presentation on **27 October 2026**. The explicit
response to the BUI-11 review question was: **“Accept the visual presentation”.**
The question named Overview, My plan, Look back, Accounts & settings and one goal
task at `http://127.0.0.1:57300/budget`, with desktop/phone examples in the BUI-10
capture index. It explicitly excluded deployment and the missing forecast and
human accessibility/comprehension gates. No further visual change was requested.

**BUI-11 is complete: all 17 presentation bursts are delivered.** This records
owner acceptance of the presentation, not implementation of R01 or final release
acceptance. R01 must still close before final acceptance of affected checks/
guidance. R02–R05 are corrected. Release remains No-Go pending the remaining
engineering, human and operational gates below.

## Cleanup and control audit

The production route has one header/hero, one My plan view, one historical review
composition and one settings host. Settings routes frequency, accounts, rollover
and lifecycle to their existing controllers without duplicate inline copies.
Everyday, commitments, goals and checks use the presentation components introduced
by the preceding bursts. The existing controllers remain the financial authority.

Removed exactly two unused CSS rules for `.budget-lookback-intro` and its `h3`.
They styled the temporary Look back placeholder replaced by the real historical
view. No TS/TSX source references the selector, and restoring these two exact
rules reproduces the BUI-10 CSS SHA-256. All other **440 source/runner/migration/
package hashes** still match BUI-10. The before/after hashes and exact scope are
recorded in `docs/budget-ui/bui-11/cleanup-delta.json`.

The active `LegacyItemTask` and `.budget-task-backdrop` were deliberately retained:
they still serve bills, reserves, planned transfers, matching, moves and category
limits. Their older name does not make them obsolete. Goal tasks use the native
BudgetTaskPanel; settings, setup and assistance use their established native
hosts. No used form, focus owner, recovery action or controller was removed.

The concept remains a separate development review entry (`budget-concept.html`),
not a production comparison switch. The production build emits only `index.html`;
its route does not import the concept fixture/restart toolbar. There is still one
existing Budget feature flag; no permanent legacy/new toggle was introduced.

## Verification and evidence boundary

After the cleanup, **586 unit tests pass / 14 existing skips**, along with full,
focused Budget and browser TypeScript, production build and scoped whitespace
checks. The existing Vite bundle advisory remains. No new tests mirror the two
removed rules; source/hash proof establishes their exact lack of runtime use.

BUI-10 remains the fresh financial/browser baseline: **263 accessibility checks
across 64 states, 187 candidate checks across 70 state/width/theme scans, and 472
lifecycle checks**, run on separate fresh disposable targets across 95 migrations.
Its **134 passing axe scans and 144 captures** remain linked evidence, not new
BUI-11 live-test totals. Only the proven unused two-rule removal differs from its
441-file source manifest. No broader destructive database rerun was needed for
that cleanup.

The retained preview was positively identified as
`halcyon-budget-m2-f76a234b3e374c95`, runner PID 86115, API/DB 57421/57422.
Read-only inspection confirms the healthy overview still shows $290 remaining,
$1,510 spent against $1,800 planned, $6,000 expected, $3,000 received and $200
Still to plan, with the theme control in the header. The owner's page position
and session were left intact. Final accepted-view capture:
`/private/tmp/halcyon-bui11-ready.png`. No draft, budget revision or other write was made
in this inspection. No personal-stack inspection, fixture, migration or exposure
was performed. The preview has not been reused as a destructive test target.

## Owner review route

1. Open `http://127.0.0.1:57300/budget`. The existing tab is signed into a healthy
   fictional sample. Overview leads with dates and money; details disclose below.
2. My plan shows saved allocations and separate future allowances. Look back
   separates current, original/latest and immutable recorded review facts.
3. Accounts & settings opens the frequency/account/rollover/lifecycle host. A goal
   task opens on demand and retains the established save/close/recovery boundary.
4. The BUI-10 capture index provides desktop/phone, light/dark, missing-history,
   funding-gap, changed-history, failed-read and interrupted-save examples.

This route documents the accepted visual checkpoint, not a substitute for the
independent beginner and assistive-technology protocols.

## Engineering handback and next work

| Area | Handback state / next action |
| --- | --- |
| Presentation | 17/17 bursts delivered; owner visual acceptance recorded above |
| R02 eligibility / R03 readiness / R04 reviewed inputs / R05 signed estimator | Corrected; linked checkpoints and BUI-10 regression evidence retained |
| **R01 forecast** | **Exact next engineering task.** Implement the frozen section 9.4 method/presentation with eligible and unavailable cases; verify date-aware fixed costs and truthful basis. Do not reinterpret the current unavailable state as completed forecasting. |
| M7.3 human accessibility | Still pending: observed assistive technology, full keyboard-only tasks, native zoom, contextual focus/contrast and real touch |
| M7.4 independent comprehension | Still pending: beginner explanations of income/remaining/adjustments and goal/funding meanings |
| M7.5 capacity | Local/hosted workload and complete-history/query-plan evidence remains pending |
| M7.6 migration/restore | Persistent target authorization, backup/restore catalog and additive migration rehearsal remain pending |
| M7.7 final candidate/security | Separate ingestion/ledger golden regression, security/telemetry and operational packet remain pending; refresh affected proof after R01 |
| M7.8 release | No-Go until findings/gates close and the owner explicitly authorizes exposure |

R01 is a separate bounded follow-up; this BUI-11 request does not silently start
it or deploy the Budget feature. Human walkthroughs should use the stabilized
flows after any required R01 presentation changes. No working-tree changes were
staged or committed, and unrelated dirty files were preserved.

The retained preview stays available while its exact runner is alive. Before a
conflicting isolated test, positively identify and stop that runner and verify
only its exact resources are cleaned. Runtime credentials remain in its private
mode-0600 temporary `manual-preview.json`, outside project documentation.

## Subsequent R01 follow-up — 28 October 2026

The owner separately authorized R01 after this BUI-11 handback. [[BUDGET_R01_SPENDING_FORECAST]] records its engineering completion and affected proof. The earlier acceptance remains scoped to BUI-11; it does not automatically accept the new forecast presentation or close M7 human/release gates. The former BUI-10 preview `halcyon-budget-m2-f76a234b3e374c95` was positively identified, stopped and fully cleaned before R01 testing; the new R01 record identifies its replacement.
