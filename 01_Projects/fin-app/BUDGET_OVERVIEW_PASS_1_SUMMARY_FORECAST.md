---
tags: [halcyon, budgeting, overview, implementation]
type: implementation-checkpoint
status: complete-ready-for-pass-2
project: Halcyon
created: 2026-10-28
updated: 2026-10-28
related:
  - "[[BUDGET_OVERVIEW_SIMPLIFICATION_STUDY]]"
  - "[[BUDGET_R01_SPENDING_FORECAST]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
---

# Overview simplification — pass 1: current summary and forecast

The owner confirmed that the mockup's dominant amount leads, remaining/projected/pending amounts feel distinct and next actions are obvious. The owner then explicitly authorized **the first production pass only**, with a handback before pass two.

## Delivered

`BudgetHero.tsx` now embeds the existing forecast immediately below the current everyday summary, inside the single Budget overview region. `BudgetAttention.tsx` no longer mounts a duplicate forecast in the lower checks area. Its controller and priority ordering are unchanged: reversing the removed import/mount and one placement-dependent sentence reproduces its exact R01 source hash. Reversing the single Hero import/mount likewise reproduces that component's R01 hash.

`BudgetForecast.tsx` leads with **Estimated finish** and its exact server-derived amount. A direct over/below allowance comparison replaces the flexible status headline. Sub-threshold overages retain a short threshold qualifier; recorded overspending is still explicitly identified. A labelled comparison graphic shows solid recorded spending, hatched estimated additional spending and the allowance marker. Text alternatives identify all amounts and exclude pending charges. Positive pending charges retain one separate line and their conditional overage qualifier; zero pending charges no longer add a paragraph.

Source dates, three-month method, rounding/history policy, fixed-bill occurrence breakdown, reserve/contribution distinctions and detailed qualifications remain in **How this estimate works**. The existing hero retains its bank-balance qualification and all current income/funding-gap controls. Bills, goals, category tools, the attention queue, editing/review/Undo controllers and page navigation remain in their prior layout for pass two.

The new `budgetForecastComparison.ts` helper derives only display percentages from validated server amounts. It does not recompute a forecast, balance, threshold or pending effect. Its padded scale avoids multiplying monetary values. Unknown evidence never becomes a zero bar; known zero can render. Negative/signed or unsupported comparisons keep the numerical result with an explicit no-bar explanation. A future estimate is hatched/provisional and does not label a zero as observed activity. Existing source/version/period/date, coverage, integrity and safe-cent guards run before display and suppress stale figures and graphics.

## Verification and limits

- **595 unit tests pass**, with 14 existing skips. Six new cases cover common-scale geometry, real zero versus unknown, future provisional activity, negative/unsupported values, incomplete/past evidence and maximum-safe-cent ratios.
- Full app TypeScript, focused Budget TypeScript, browser TypeScript, modified script syntax and production build pass. The existing build chunk-size advisory remains.
- `test-budget-overview-pass1.mjs` authenticates normally to the positively identified retained fictional preview. It verifies the real eligible workspace result, then uses **response-only view variants** for ordinary, overspend, missing-history and funding-gap presentation. Five states × 320/390/1440px × light/dark yield **30 passing hero/forecast WCAG/overflow cases**. These variants are UI/guard proof, not new financial-engine fixtures.
- Seven additional boundary/guard cases cover signed amounts, known zero, provisional future, large exact cents, old calculation date, wrong source and failed refresh. Keyboard disclosure, fixed-date explanation and Overview/My plan navigation pass. The actual network monitor records **zero Budget write requests** and no browser runtime errors.
- All Supabase migrations/functions and canonical forecast/attention libraries match the R01 source manifest. No schema, SQL, financial calculation, API contract or financial mutation controller change was made. No new database run or persistent migration was needed for this presentation-only pass. R01 engine/lifecycle results remain historical evidence, not claimed as new runs.
- The R01 forecast interaction assertion now locates the forecast inside the hero, and the earlier attention matrix locates the relocated region at page scope. The original financial assertions remain; those durable harnesses were syntax-checked but were not rerun as database suites in this pass.

Evidence: `docs/budget-ui/overview-pass1/verification.json`, 30 state/width/theme captures, the actual `owner-preview.png`, source manifest and scope proof. The read-only harness takes the private temporary `manual-preview.json` path as its argument; no credentials are copied to project documentation.

## Preview and next step

The real page is `http://127.0.0.1:57300/budget`, in the existing fictional R01 account. The separate study remains at `/budget-overview-study.html` for comparison. The retained stack is `halcyon-budget-m2-8a23491eb36a470c`, with the existing runner and ports; it was not replaced or cleaned. No personal database, deployment, commit or feature exposure was touched.

**Ready for pass two.** Next: simplify canonical attention presentation and compact bills/goals using existing controllers; consider ordinary income/unallocated density without hiding funding gaps. Then pass three refreshes the assembled production states and workflows before owner review and resumed M7 human/operational gates. The first pass intentionally does not present the whole page as the finished redesign. Release remains No-Go.
