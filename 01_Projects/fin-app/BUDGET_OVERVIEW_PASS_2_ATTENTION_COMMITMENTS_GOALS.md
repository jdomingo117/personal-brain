---
tags: [halcyon, budgeting, overview, implementation]
type: implementation-checkpoint
status: complete-ready-for-pass-3
project: Halcyon
created: 2026-10-28
updated: 2026-10-28
related:
  - "[[BUDGET_OVERVIEW_SIMPLIFICATION_STUDY]]"
  - "[[BUDGET_OVERVIEW_PASS_1_SUMMARY_FORECAST]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
---

# Overview simplification — pass 2: attention, commitments and goals

The owner authorized phase two after the first production pass. The approved study direction remains the basis: dominant current amount, separate amount-based forecast, one obvious next action and compact secondary lines. This pass is complete; assembled verification is the next bounded pass.

## Production changes

**One priority decision.** The existing Budget attention component now sits alongside the hero. It shows the first active issue in the existing server order, with one main action. All other active/reviewed/snoozed checks stay reachable through the counted all-checks view. An unnecessary all-checks button is omitted when the only check is already visible. Pending charges have a direct Ledger action; the existing allowance inspection stays available under Reminder options. Existing review, snooze, show-again, Undo, source-token checks and financial shortfall persistence remain. Projected/pending gaps remain excluded from real-money shortfall totals.

Reminder choices are behind a native disclosure, with their money-versus-reminder qualifier. The Overview/hero is kept mounted while switching My plan/Look back, so moving the attention component does not discard an unsaved review choice. Period changes still use the original reset/navigation guard. Ordinary income and allocation detail moves behind a named disclosure; current and continuing funding gaps remain visible in its summary even when closed.

**Compact commitments.** Saved bills, reserve funds and planned contributions keep their line identities and existing rendered detail/control tasks. Rows are shorter; empty groups no longer add three separate explanatory sections. Bill summaries can identify the next unmatched expected occurrence or show scheduled charges matched, using the existing validated occurrence facts and qualified presentation model. Unknown/stale/future actuals are not labelled matched. Expected never means unpaid. Everyday/category tools remain mounted behind a separate disclosure; Inspect allowance opens the relevant ancestors and focuses the original target.

**Compact goals.** Every goal, including the former featured card, now has a compact native disclosure with name, state, guarded plan reserve/target, plan-only progress and an explicit “not confirmed cash” qualifier. Detailed target/deadline/timing, distinct matched transfers/user confirmation, purchased/refunded history, linked Planning goal and original Adjust/Match actions stay inside the existing card. Changed matches, archived/paused/draft/purchase state and coverage/staleness qualifications remain visible. Summary target and reserve use `BudgetValue`, never raw unvalidated config amounts; progress requires safe, known, fresh target/reserve inputs. Purchase-recorded and unknown-target goals do not invent progress.

## Verification

- **595 unit tests pass, with 14 existing skips.** Full app, focused Budget and browser TypeScript, modified script syntax and production build pass. The existing build chunk-size advisory remains.
- `test-budget-overview-pass2.mjs` normally signs into two captured fictional accounts in the positively identified retained preview. The real pending issue is first in canonical order; inspection opens the retained allowance tools.
- The real review form survives Overview → My plan → Overview. Snooze/date controls remain reachable. A response-only attention-version change proves stale facts disable saving and require fresh review.
- A real reminder acknowledgement is saved through the UI/Edge and then undone through the UI. The final run makes exactly `set_attention` and `undo`; comparison of saved plan/period/revision/lines/actuals/future template/item facts/source/financial Undo proves **financial facts unchanged**, and the original active issue is restored. Preliminary successful verification cycles also restored their own preferences. No budget amount or financial account data was changed.
- The actual sample goal opens by keyboard and exposes separate funding measures. Original Adjust goal, Match activity and bill setup tasks open and close normally.
- **30 full-workspace WCAG/overflow cases** cover five presentations (genuine real sample, multiple ordered checks/reviewed gap, funding gap, unknown scope, changed matches) × 320/390/1440px × light/dark. Additional display checks cover paused, draft, purchase-recorded, unsafe target and failed refresh. All cases pass with no browser runtime errors.
- Display variants are explicitly intercepted query responses, not new engine fixtures or financial-engine proof. The unsafe target variant verifies an unavailable summary target and no progress. The multiple-check variant verifies the first server issue, all three accessible checks and a persistent reviewed monetary gap.
- No SQL/migration, canonical forecast calculation, presentation-money adapter, API schema or command implementation changed. The retained fictional stack was neither reset nor replaced. No personal database, deployment, public exposure or commit was touched.

Evidence is in `docs/budget-ui/overview-pass2/`: verification manifest, 30 captures, actual owner-tab capture and source manifest against pass one. The harness accepts only the private disposable `manual-preview.json` metadata path, applies the target guard and embeds no credentials.

The older attention/goal interaction harnesses have been adjusted to reveal reminder/goal disclosures and to expect one priority issue; the first-pass funding-gap assertion now follows the relocated income disclosure. Their financial assertions remain. Those legacy durable suites were syntax-checked, not rerun as full database suites here; the broader assembled regression belongs to pass three.

## Handoff

The real preview remains `http://127.0.0.1:57300/budget`, with the existing fictional R01 account and `halcyon-budget-m2-8a23491eb36a470c` runner. The study remains separate for comparison.

**Next: pass three, assembled production verification.** Refresh the affected candidate/state matrix and workflow regression for the combined first/second passes, explicitly opening on-demand income/goal/reminder details where relevant, and then perform the short owner comparison against the agreed study. Observed accessibility, independent beginner comprehension and operational/release gates remain separate; release remains No-Go. No pass-three work is implied by this checkpoint.
