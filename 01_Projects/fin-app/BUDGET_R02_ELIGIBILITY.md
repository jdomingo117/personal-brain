---
tags: [halcyon, budgeting, engineering, verification]
type: correctness-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_09A_MANUAL_SETUP]]"
---

# R02 — independent calendar and fortnight eligibility

G03 requires at least three complete comparable calendar months within the latest
six complete months, with six covered anchor-aligned 14-day windows additionally
required for fortnightly suggestions. Six fortnights cannot stand in for the month gate.

The unchanged schema reproduced the defect through the real Edge query: coverage
from 15 May to 7 August 2026 yields six full aligned fortnights but only June and
July as complete calendar months. The old endpoint incorrectly returned eligible.
The red proof passed 20 checks on `halcyon-budget-m2-a4c628f0ad3e4c18` (91 migrations).
The initial port-race target `halcyon-budget-m2-c8b4939747b949cb` was cleaned; the
retiring preview finished releasing its ports before the successful red run.

## Change

Forward migration `20261026000000_budget_assistance_calendar_gate.sql` replaces
only the assistance query function. The month window follows the existing monthly
request-relative date rule: the six complete calendar months before the month
containing the selected start date. Each month needs complete unrevoked coverage
for every selected tenant-owned AUD account. Adjacent/overlapping coverage uses
the existing range-union semantics. Out-of-window months and the selected partial
month do not satisfy the count.

The response exposes `calendar_month_count` and its complete month ranges. Eligibility
requires the month gate and the existing frequency-window gate, scope and integrity
checks. Calendar evidence is also included in the fingerprint. Existing canonical
sums, recurring schedules, cents medians, anchor alignment, observed limited data,
method identity and financial commands are unchanged. The function retains its
service-only ACL, fixed search path, lock and statement timeouts. No existing plan,
draft or review is rewritten. No migration was applied to the personal stack.

The client checks both gates before using a full draft, what-if or history-based
goal outcome. Legacy fortnightly responses without month proof fail closed; legacy
monthly period counts already prove their unchanged calendar gate. The UI explains
the independent month count, exposes dates, and keeps limited observations/confirmed
bill evidence and the manual path without full-draft or outcome actions.

## Verification

Green proof: **34 checks** on `halcyon-budget-m2-b3057f287fb8416d` (92 migrations),
including the real limited-history browser flow. Vectors cover 2 months/6 fortnights,
exactly 3/6, 3/5 after a one-day anchor offset, one-day missing calendar coverage,
revoked/adjacent coverage, every selected account, out-of-window months, monthly
compatibility, empty scope and no plans/drafts written by eligibility queries.
Normal M6 assistance scope/integrity/grant/median/activation regressions also pass.
Exact fixture cleanup passed. The separate full lifecycle regression passed **472
checks across all 92 migrations** on `halcyon-budget-m2-53f4b24481ce4343`.
The initial broader run on `halcyon-budget-m2-39f39c3042a54eec` stopped at an
unrelated frequency-form blank-input assertion. The rerun explicitly verifies the
blank DOM value and native invalidity before Review; blank rejection, funding-gap
acknowledgement and the remaining frequency/lifecycle checks pass. No frequency
production behavior changed. Both targets were cleaned by exact identity.

Three new client tests cover independent gates, missing/malformed fortnight proof,
monthly compatibility, and refusing full draft/what-if/goal outcome helpers below
the gates while retaining observations. Full/focused/browser TypeScript, 568 unit
tests (14 existing skips), script syntax and production build pass. The existing
large-chunk build advisory remains.

This closes the bounded R02 eligibility finding in this workspace; it does
not close R03 unused-room/outcome readiness, R04 input confirmation/preservation,
R05 signed estimator vectors, R01 forecast or human/release gates. UI completion
remains 14 of 17 bursts. Recommended next engineering: **R03 readiness correction**.

## Retained owner preview

Disposable project `halcyon-budget-m2-05e2f96af5094efa` was retained at the R02 checkpoint on
`http://127.0.0.1:57300/budget` (API 57421). All four fictional accounts passed
normal password sign-in and their sample/setup/review/eligibility controls. The
existing in-app tab was signed into the eligibility account, reloaded to load the
current bundle, and left visibly showing six complete two-week windows, only two
complete calendar months, no full-draft/outcome actions, and the manual route.
Screenshot: `/private/tmp/halcyon-r02-ready.png`. Runtime credentials are in the
guarded runner's mode-0600 `manual-preview.json`; no credentials are stored here.
This retained preview is separate from every completed test target and must never
be reused for a destructive test run.

The R02 preview was subsequently stopped and exactly cleaned for R03 validation.
See [[BUDGET_R03_READINESS]] for the replacement retained preview and current status.
