---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_08B_LOOK_BACK]]"
---

# BUI-09a — manual setup presentation

The owner authorized this phase and requested a whole-plan status at completion.
The existing inactive BudgetEditor now uses the native task surface with three
numbered sections and keyboard-operable jump navigation: rhythm/accounts, money
to plan with, and allowances. The existing fields, money/date helpers, validation,
future-gap acknowledgement and save_draft body remain intact. Active-plan revision
editing stays inline and retains its original command/scope behavior.

The shared panel adds opt-in open/retain-on-close behavior; existing task defaults
remain unchanged. Closing/Escape preserves the mounted form, including invalid
text, and shows a Continue setup entry. Browser Back retains the setup rather than
turning close into an implicit save. The session context retains valid intent;
the UI explicitly says to save a draft for reload persistence. Explicit Leave editor
or Discard unsaved setup still confirms discarding and preserves the last saved
draft. In-flight close remains blocked, and an unknown result retains its request.

Saved-draft review is a separate native task. Only its explicit Start this budget
action activates the reviewed saved draft. Saving a draft, reviewing, closing,
resuming and moving between sections never activate automatically. Recovery stays
inside the active task or the page after close. Source/draft changes still invalidate
review/acceptance. The setup task supplies refresh without reaching into its inert
background. Field names for rhythm, dates and timezone are explicit for accessibility.

No schema, financial calculation, date window, receipt, activation body or feature
exposure changed. Assistance presentation/correctness remains BUI-09b/R02–R05;
this phase does not claim to resolve those findings.

## Verification

Focused run: **193 checks**, **72 axe scans** and **73 captures** on fresh disposable
project `halcyon-budget-m2-5ce0dcd7dfde4eda`; exact fixture cleanup passed. Monthly
and fortnightly edit/review/saved-review states cover 320/390/768/1024/1440px in
both themes. Tests verify close/resume retaining invalid text, indexed browser
Back/Forward preserving intent, native section focus, no implicit writes, no-bank
zero income, future gaps with one-off cash, persisted drafts across reload, one-write
lost-response draft recovery and explicit activation recovery. Original goal-panel
focus, dirty exit, in-flight guards and same-request recovery run as regressions.

Full/focused/browser TypeScript, 565 unit tests (14 existing skips), changed script
syntax and build pass at the focused checkpoint. Full lifecycle regression passed **472 checks** across 91 migrations on separate
fresh target `halcyon-budget-m2-c1046599218747f1`; exact fixture cleanup passed.
It includes existing assisted/manual setup, draft activation, active revision,
source invalidation, receipts/recovery, history, items and settings. Earlier fixture attempts were cleaned: the first assumed
no-account users could navigate to Dashboard without onboarding; the corrected
indexed Budget navigation respects the no-bank path. The next exposed verbose
implicit form labels; concise explicit accessible names were added.

## Implementation position

After this phase, **14 of the handover's 17 UI bursts are engineering-complete**.
This is a phase count, not a claim about remaining effort or release readiness.
Remaining UI bursts are BUI-09b assistance, BUI-10 candidate automated/visual
verification and BUI-11 owner review/handback. The earlier BUI-04 and BUI-06b owner
visual checkpoints are accepted; final BUI-11 owner acceptance remains open.

Before BUI-09b can be finalized, the handover requires separate bounded correctness
work for R02 fortnightly eligibility, R03 what-if readiness/capacity, R04 input
confirmation/preservation, and R05 canonical signed suggestion edge cases. R01
forecast remains separately required before final affected-checks acceptance/release.
M7 human accessibility/comprehension and release gates remain open. No personal
rollout is authorized by these presentation results.

Recommended next engineering task: **R02 eligibility correction**, then the other
assistance correctness dependencies and BUI-09b. Preserve the 17 UI burst sequence;
these correctness tasks are additional dependencies, not silently completed UI work.

Post-run Docker label audit confirmed zero containers, volumes and networks for
all four completed test projects and the retired Look back preview. A fresh retained
preview uses `halcyon-budget-m2-18e5a35cc5754aa0` / runner 35933 at
`http://127.0.0.1:57300/budget`. Normal password sign-in checks pass for healthy,
fresh setup and recorded-review accounts. Runtime credentials remain private,
outside repository docs. Stop this exact verified runner before conflicting tests.

The in-app browser is signed into the fresh account with the setup task open.
No amounts were edited, draft saved or budget activated in final inspection.
Runtime screenshot: `/private/tmp/halcyon-bui09a-ready.png`. Earlier fixture
attempts `halcyon-budget-m2-6dcaab7c2e734845` and
`halcyon-budget-m2-4d381246aaad4e19` are included in the completed-resource audit.
