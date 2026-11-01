---
tags: [halcyon, budgeting, design, overview]
type: design-study
status: production-passes-verified-owner-accepted
project: Halcyon
created: 2026-10-28
updated: 2026-10-28
related:
  - "[[BUDGET_R01_SPENDING_FORECAST]]"
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
---

# A quieter Budget Overview — study 01

The owner reported that the R01 walkthrough checks pass, but the page contains too much text and points in too many directions. The owner agreed to a bounded hierarchy/visualisation pass, beginning with desktop and phone mockups before implementation. This study is that review deliverable. The production Budget, calculations, financial API, saved workflows and account data are unchanged. Human accessibility/comprehension walkthroughs should resume against the agreed presentation after affected verification.

## Review it

Open `http://127.0.0.1:57300/budget-overview-study.html`. The separate study entry runs on the existing preview server, outside the shipping SPA route. The review controls above the product switch five fictional scenarios, Desktop/Phone (390px), and light/dark themes. The current Budget remains available at `/budget` in its original tab. The top review toolbar is not part of the proposed product.

Buttons open local illustrative detail dialogs; they do not reproduce the complete production tasks and cannot save or move money. The page makes no financial API calls and requires no sign-in. It contains no actual financial data. It must not be promoted to the shipping entry as-is.

## Content hierarchy

| Layer | Visible by default | Conditional or on request |
| --- | --- | --- |
| Context | Saved period, remaining days, Overview/My plan/Look back | Period/account controls remain in their existing hosts; this study does not redesign those forms |
| Where am I? | One dominant everyday remaining amount, recorded spending, allowance and progress bar | Activity details through one quiet link; keep “not your bank balance” next to the amount |
| Where am I heading? | Estimated finish amount, direct over/under allowance difference and one comparison graphic | Method, source dates, coverage/rounding and fixed-occurrence details behind disclosure; never draw a zero forecast when unknown |
| What needs a decision? | One highest-priority issue with one main action | All other checks stay reachable and counted; a compact critical funding message appears before the allowance on phone |
| Bills | Compact named rows, dates, matched/expected state and amounts | Evidence, occurrence schedules and actions through View all/existing tasks |
| Goals | Named goal, plan reserve/target progress and next planned contribution | Recorded funding versus plan-only balance and timing assumptions remain available, explicitly distinct |
| Income and allocations | Quiet My plan / Income & allocations entry | Promote funding gaps when relevant; ordinary income/unallocated summaries belong in My plan |
| Guidance | Short essential qualifiers beside figures | General budgeting education and detailed accounting explanations on request |

Desktop places the current allowance and forecast in one primary column, with the priority decision alongside. Compact bills and goals form the next row. Phone stacks the same information. A compact funding-gap message appears before the allowance on phone so the positive amount does not conceal an underfunded total plan. The full decision block retains the same visual, keyboard and screen-reader sequence; CSS does not reorder it. Calm and insufficient-history states use a quiet link rather than an unnecessary primary button.

## Visual and wording contract

- Recorded spending is the solid segment. Estimated additional spending is hatched. A labelled marker shows the allowance. Text alternatives state all three figures; colour is never the only distinction.
- The comparison is an amount scale, not a fabricated daily time series. It shows neither a confidence interval nor a predicted transaction schedule.
- Pending is separate from both settled spending and the historical-rate projection. The priority pending check compares pending charges with the current allowance remainder.
- Replace the visible forecast status headline with an amount-based description such as “Estimated finish $110 / $10 over allowance.” A sub-threshold excess explicitly states the warning threshold. This is a proposed presentation change; backend status/materiality remains unchanged.
- Keep insufficient evidence visible. Known recorded spending and allocation remain usable, but no zero/healthy projection is invented.
- Preserve reserve versus actual funding, plan allowance versus bank cash, expected versus unpaid, and financial shortfall versus projected excess distinctions.
- A production adapter must use canonical selected-period facts, source/freshness guards, exact-cent formatting, and the existing attention priority/order/review controller. The fictional pending example has both bills matched, so it does not hide a higher-priority imminent unmatched bill. Additional critical issues must remain discoverable and must not be suppressed by “one main action.”

## Five fictional state checks

All figures are AUD. The shared everyday allowance is $100; planned bills are $130 and the goal contribution is $100.

| Example | Recorded spending / remainder | Finish estimate | Priority presentation |
| --- | --- | --- | --- |
| Ordinary | $40 / $60 | $85; $15 below | Quiet “Nothing needs a decision today,” qualified by available evidence |
| Pending | $20 / $80 | $110; $10 above, below $25 warning threshold | $90 pending; possible $10 excess if it settles; one review action |
| Projected overspending | $60 / $40 | $145; $45 above | Review allowance; estimated excess is not settled overspending |
| Insufficient history | $20 / $80 | Unavailable | Two covered months are insufficient; manual allowance remains usable |
| Funding gap | $20 / $80 | $90; $10 below | Expected income $280 versus $330 allocated; $50 funding gap remains independent of the spending estimate |

The goal example is $600 of a $1,200 target in the plan, with $400 recorded funding and $200 plan-only. It is not a confirmed cash balance. Bill summaries show explicitly matched rent and internet; detailed wording retains that an unmatched charge would not establish unpaid status.

## Evidence and scope

`app/budget-overview-study.html` is the self-contained review prototype. `app/scripts/test-budget-overview-study.mjs` checks five states × three widths (320, 390, 1440) × two themes: 30 axe WCAG/overflow/state cases, priority-dialog open/Escape/focus return, a 390px phone stage, keyboard disclosure and My plan detail. Verification checks zero financial API requests, zero unexpected external requests and no browser runtime errors. Google font requests are allowed. This verifies the mockup only, not production financial behavior or observed assistive-technology use.

`docs/budget-ui/overview-simplification/` contains the screenshots, verification manifest and actual owner-tab desktop capture. Run the study harness while the existing standalone preview is available: `node app/scripts/test-budget-overview-study.mjs`. No database provisioning, migration, fixtures, cleanup or production build change is required for this study.

## Next decision

Review the reading order and visible density on desktop and phone, including all five examples. The useful question is whether remaining, projected and pending figures can be explained without opening details, and whether the next action is obvious. Owner feedback is pending; no production redesign acceptance is inferred. Once agreed, translate this hierarchy into the existing Budget components, preserve all controllers/guards, refresh affected regression/accessibility evidence, and resume M7 human and operational gates. Release remains No-Go.

## Owner direction and first implementation pass

The owner confirmed the dominant amount, distinct figures and obvious next actions, then authorized pass one with a handback before pass two. [[BUDGET_OVERVIEW_PASS_1_SUMMARY_FORECAST]] records its completion. The study remains an illustrative whole-page direction; production attention/bills/goals simplification has not started.

## Second implementation pass

The owner authorized phase two. [[BUDGET_OVERVIEW_PASS_2_ATTENTION_COMMITMENTS_GOALS]] records its completed production attention/commitment/goal presentation and retained state/financial controls. Pass three assembled verification and owner comparison are next; the study is still an illustrative whole-page reference, not financial proof.

## Assembled verification

[[BUDGET_OVERVIEW_PASS_3_VERIFICATION]] records the fresh production/workflow and visual matrices for both passes, including the phone funding-gap placement. Engineering verification and the real production owner comparison are complete. On 28 October 2026 the owner answered yes to all three clarity questions. Resume [[BUDGET_M7_HUMAN_VALIDATION]]; human and operational release gates remain open.
