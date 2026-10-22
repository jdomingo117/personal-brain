---
aliases:
  - Budget Suggestions and What If Proposal
tags:
  - halcyon
  - projects/fin-app
  - budgeting
type: feature-proposal
status: approved-scope-frozen
project: Halcyon
created: 2026-10-20
updated: 2026-10-20
related:
  - "[[BUDGET_FEATURE_SPEC]]"
  - "[[BUDGET_CONCEPT_REVIEW]]"
  - "[[BUDGET_GUIDANCE_AND_GOALS]]"
  - "[[PLANNING_EXPERIENCE_PLAN]]"
---

# Help me build a budget — suggestion and what-if proposal

**Approved S1 · 20 October 2026 · Concept approved; included in frozen Budget V1 scope.**

See [BUDGET_SCOPE_BASELINE.md](BUDGET_SCOPE_BASELINE.md) for the approval record and
[BUDGET_IMPLEMENTATION_PLAN.md](BUDGET_IMPLEMENTATION_PLAN.md) for production contracts and gates.
The review walkthrough remains below; production data integration and human usability are unverified.

The owner approved this proposal on 20 October 2026 and authorized concept implementation. It now
supplements the agreed feature baseline as specification v1.5: explicit history-based suggestion
rules and one bounded, optional what-if. The concept uses only fictional data and local state;
production data integration is not authorized by this approval. BG-L01 remains deferred.

## 1. Recommendation and boundary

Add **Help me build a budget** to guided setup, alongside **Enter my own amounts**. Produce an
explainable starting plan from sufficiently covered history, let users correct it, and optionally
preview one small change toward one goal. This addresses the beginner's question “What amounts
should I start with?” without introducing a separate page, chat interface or scenario manager.

Use a deterministic engine for all money, eligibility, dates and outcomes. AI is not needed for
the first concept or first implementation. A later optional language layer may explain validated
results, but must not invent amounts, decide priorities, execute changes or gate core functionality.

Observed spending is evidence, not a recommended lifestyle. A suggested plan can legitimately have
a funding gap; do not manufacture a balanced plan by quietly cutting essentials or increasing pay.

## 2. Evidence and limits

Sources checked 20 October 2026:

- [ASIC Moneysmart — Track your spending](https://moneysmart.gov.au/budgeting/track-your-spending):
  recommends examining several months, including occasional costs, and starting with small changes.
  Supports the history-plus-editable-change direction; does not establish an optimal history length.
- [ASIC Moneysmart — How to do a budget](https://moneysmart.gov.au/budgeting/how-to-do-a-budget):
  combines income, essential/irregular costs, goal amounts and review; describes testing savings
  amounts. Supports integrated what-if previews, not guaranteed financial improvement.
- [Monarch — Creating your budget](https://help.monarch.com/hc/en-us/articles/360048883631-Creating-Your-Budget-in-Monarch):
  describes editable initial estimates using six-month averages. Product precedent, not efficacy
  research or a reason to adopt its exact estimator.
- [CFPB — Consumer insights on managing spending](https://www.consumerfinance.gov/data-research/research-reports/consumer-insights-managing-spending/):
  qualitative/prototype work reports budgeting friction and interest in usable spending feedback.
  Interest does not prove this feature will change behaviour.

The three-month gate, six-month preferred window and use of medians below are conservative product
defaults to test. They are not scientifically validated minimums or prediction-confidence levels.

## 3. Small user journey

Keep this inside the existing setup/task drawer; stack the same steps on phone.

1. **Check the starting point.** Confirm included accounts, period frequency and history dates.
   Ask “Has your income or regular spending changed recently?” Offer Yes / No / Not sure; allow
   the user to identify a new job, move or other change without requiring sensitive free text.
2. **Review a suggested plan.** Reuse the existing income/cost/everyday review fields. Show one
   baseline and a compact evidence line such as “Based on 4 complete months, June–September”.
   **Why this amount?** opens source dates, observations and assumptions; no permanent charts.
3. **Optional: try one change.** Ask “Would you like to make more room for a goal?” Let the user
   choose one editable spending area and an amount, or skip. Show Current draft / With this change
   for the changed allowance, goal contribution, remaining plan capacity and goal timing.
4. **Review and use.** **Use this draft** populates setup, not an active budget. Existing review
   and **Start my budget** remain the explicit activation boundary. **Keep my amounts** discards
   suggestions. No change is saved to an existing active plan through this flow.

No chat window, financial-health score, three competing “optimal” plans, obligatory goal, sliders
as the only input, repeated onboarding tour or new top-level navigation. An ineligible user still
has an immediate manual route. Importing older statements can unlock suggestions without waiting
three months after signup. New users with no imported history can start a manual budget today.

## 4. Eligibility and data-quality gates

Evaluate gates per proposed component, then report the overall draft as Ready / Needs your input /
Not enough history. A failure in one component must not invent a value or hide the usable manual
plan. In the UI these are plain-language states, not scores or error codes.

| Gate | Rule | If it fails |
| --- | --- | --- |
| G01 — Scope and units | Confirm tenant-owned AUD accounts, local timezone, date window and cent units. Historical activity must match the selected scope. | Block affected suggestions until scope is corrected. Never sum foreign amounts as AUD. |
| G02 — Complete coverage | Every selected activity account needs statement/provider coverage evidence or explicit user confirmation for each included window. Transaction presence alone is insufficient. | Name missing account/date ranges. Exclude incomplete windows, not zero-fill them. User-confirmed coverage is labelled, not described as independently verified. |
| G03 — Minimum evidence | For a full history-derived draft, require at least 3 complete, comparable calendar months within the latest 6 complete months. Prefer all eligible months up to 6. For fortnightly everyday suggestions, additionally require at least 6 fully covered 14-day windows aligned to the selected anchor. | With less history show observed totals and confirmed bill suggestions only, labelled limited evidence; require user-entered/confirmed everyday and income amounts. No automatic full draft or history-based outcome estimate. |
| G04 — Integrity and classification | Complete canonical aggregates must reconcile expense/income effects, transfers, card repayments, splits, refunds and duplicate/replaced imports under the existing ledger rules. Pending rows are separate. | Unresolved duplicate or transfer/repayment ambiguity that could change totals blocks the affected estimate. Ordinary uncategorised expenses remain in the everyday pool, visibly included; do not drop them. No category-specific suggestion for an unreliable category. |
| G05 — Recent changes | User confirms history still represents their circumstances, or supplies changed income/bills and confirms which older evidence remains relevant. | Yes/Not sure suppresses affected automatic amounts until confirmed. No silent reliance on a previous salary or home. Other unaffected components can still be suggested. |
| G06 — Income | User confirms expected take-home amount and actual pay dates. Observed earned-income summaries may assist, excluding own-account transfers, refunds and one-off windfalls. | Variable/unknown income requires a user-chosen planning amount, including $0 if intentional. No inferred guaranteed income or automatic use of the highest recent pay. |
| G07 — Irregular costs | Show confirmed recurring costs, known deadlines, opening reserves and a prompt for missing annual/quarterly costs. Six months without a charge is not evidence no annual bill exists. | An unknown essential bill/amount stays an unresolved input or labelled user estimate. Do not call the plan complete or its future result dependable. Manual saving with an explicit known gap remains allowed. |
| G08 — Revisions | Store source-window/account fingerprint and method version with the draft. Recheck before using/activating it after imports, corrections, scope or frequency changes. | Mark stale, recalculate and show changed values; never overwrite user-edited fields without review. No partial apply. |
| G09 — Projection readiness | A what-if needs a valid reviewed draft, user-confirmed assumptions, positive goal contribution for timing, and no unresolved input needed for the displayed result. | Show the concrete allowance changes but suppress unsupported goal dates/outcomes and say what needs checking. A funding-gap result is still visible, not converted into success. |

Zero activity in a genuinely covered window is valid. A missing window is unknown. No opaque
“90% confidence” badge. If observed per-window everyday spend has
`(maximum − minimum) / max(median, 100 cents) > 1`, flag **Spending varies a lot**
and require explicit review of the everyday amount; this conservative variability flag is a
versioned product heuristic, not a statistical confidence interval. Do not erase high-spend windows.

## 5. Deterministic suggestion rules

| ID | Rule |
| --- | --- |
| S01 | Freeze and display an eligible historical window before calculation. Use only data covered by G01–G08; never use a truncated frontend transaction feed. |
| S02 | Show observed income by actual receipt dates, but use the user's confirmed expected income/schedule in the plan. This is an estimate, not an entitlement or a cash balance. |
| S03 | Confirm bills individually from reliable recurring records or manual input. Use the latest confirmed amount and real occurrence dates, not a monthly-average substitute for a bill due now. A paid occurrence must not remain outstanding. |
| S04 | Keep future bill/goal reserves separate. For a known target, propose `ceil(max(0, target − existing usable reserve) / remaining contribution dates before deadline)`. Never count a contribution already in the reserve again. No available dates means show the full shortfall, not divide by zero. |
| S05 | Suggest the median of eligible complete-period everyday totals. Monthly uses calendar months; fortnightly uses full anchor-aligned 14-day windows. Do not divide monthly totals by two. For an even sample, use the mean of the middle two totals and round to integer cents half-up; show the exact-cent result without discretionary padding. |
| S06 | Show historical minimum/maximum as observations, not a target range or forecast interval. Never auto-remove exceptional purchases. Offer explicit user reclassification as a one-time cost/reserve, retaining it in the observed total and reconciliation. |
| S07 | Start with one everyday pool. Category observations can explain it, but do not independently median each category and pretend those medians sum to the pool median. Optional limits are user choices inside the existing pool. |
| S08 | Preserve user-protected amounts and priorities. Do not auto-reduce rent, debt commitments, medical/other essential costs or existing goals to force balance. Do not impose a generic percentage budget as a personalised recommendation. |
| S09 | Calculate signed Still to plan after bills, reserve contributions, savings, everyday spending and purchase goals, each once. Existing protected reserves are not fresh income. If negative, show a gap and choices; never inflate income or quietly omit a cost. |
| S10 | For mid-period setup retain known actuals from the true period start. If a suggestion is below already-recorded spending, show the signed overage and let the user revise it; do not erase spending or imply future cuts undo past purchases. |
| S11 | Every suggested field carries provenance: observation/confirmed schedule/user estimate, source dates, method and manual edits. Accepting one suggestion must not overwrite unrelated user intent. |

## 6. One bounded what-if, not a scenario engine

The baseline is the reviewed draft, not a fictitious “ideal budget”. The user selects one spending
area they are willing to change and an exact-cent amount; default change is $0. Never infer that a
medical, food or transport expense is discretionary simply from a merchant/category name.

- A reduction moves the same allocation into one chosen goal or leaves it Still to plan, explicitly
  selected. It does not both fund the goal and increase unassigned capacity. Protect all other lines.
- Validate against the source allowance and settled usage for the relevant current period. Negative
  source allowance, exceeding unused room, or a missing source/goal blocks **Use this draft**.
  Users can instead plan a future-period change without pretending to reverse current spending.
- Compare two columns only: Current draft / With this change. Explain “If you keep to these amounts”
  and “No money moves until you do it yourself”. No guaranteed saving, affordability or success claim.
- Use actual remaining contribution dates and target/opening reserve accounting for goal estimates.
  With a paused/$0/unknown-price goal show no completion date. With a due-date gap show the gap.
- Cap the illustrative outcome horizon at 12 months; beyond it show “More than a year at this amount”
  rather than a precise distant completion date. No interest, investment return, inflation, variable
  future salary, probability of success or compounding assumptions in this feature.
- Changing a draft never counts as confirmed savings, modifies real transactions, transfers bank
  funds, creates a Planning event or saves a persistent named scenario. Long-term scenarios continue
  to belong to existing Planning; BG-L01 remains distinct.

Illustrative monthly example, assuming no purchases and equal monthly contribution dates:

| Item | Current draft | With this change |
| --- | --- | --- |
| Dining allowance | $300 | $250 |
| Snowboard target / savings already confirmed | $900 / $300 | Unchanged |
| Planned goal contribution | $100 | $150 |
| Further scheduled contributions to cover remaining $600 | 6 | 4 |
| Still to plan | Unchanged | Unchanged — the same $50 was reassigned |

This is an arithmetic illustration, not a prediction the user will spend less or have cash ready.

## 7. System contract and optional AI boundary

Logical pipeline: **scoped aggregate snapshot → eligibility → suggestion calculation → user edits →
isolated what-if calculation → review → existing activation/write boundary**.

Return a typed proposal with source fingerprint, method version, evidence dates, component-level
gate outcomes, values in cents, reason codes, assumptions and dependencies. Keep monetary logic pure
and shared with the production budget engine when implemented; do not fork a competing calculator.
Production reads remain tenant-scoped; accepting a draft never grants AI or the browser new mutation
authority. Saved writes retain existing validation, atomicity, revision and undo contracts.

The concept uses named fictional fixtures, not real account data or simulated live AI. AI is deferred.
If later added, send only necessary, authorised structured aggregates, not raw statements/merchant
free text by default. Treat source text as untrusted data. AI wording must quote engine-supplied
facts/IDs; validate all referenced numbers and fall back to templates on error/unavailability.
It may explain or ask clarifying questions, never originate money math or submit changes.

## 8. Implemented concept and acceptance checks

Implemented as an inline assisted path inside existing setup; reuses money fields, goal evidence
and final review. No new page, AI request, auth provider, real-account read or backend write.

Fictional fixtures: (a) four complete comparable months, (b) insufficient history, (c) an account
coverage gap, (d) recent income change, (e) a valid but underfunded plan, and (f) a fortnightly view
of the eligible dated history. Fixture selection stays in the outer review controls, not product UI.

- [x] SG01: Eligible monthly/fortnightly fixtures produce exact, reproducible, explainable values.
- [x] SG02: Insufficient/missing coverage never becomes zero; manual setup stays usable immediately.
- [x] SG03: Recent changes and unresolved integrity issues block applying unreviewed/affected suggestions; essential costs require explicit review.
- [x] SG04: Fixture transfers, repayments, split parents and refunds reconcile once; median/category sums and anchor
  boundaries have unit examples. Irregular purchases remain inspectable, not silently discarded.
- [x] SG05: No scenario modifies protected amounts, overspends a source or double-assigns money.
- [x] SG06: Goal dates follow actual schedules; paused/unknown/zero contribution and shortfall states
  cannot produce unsupported success/date claims. Planned versus saved stays visually separate.
- [x] SG07: **Use this draft** only fills setup. Cancel/manual mode/Back preserve user-entered intent;
  activation is still explicit and stale-source changes require review.
- [x] SG08: Native labelled controls reuse the existing keyboard/dialog boundary and support phone/light/dark without AI; human screen-reader validation is not implied.
- [ ] SG09: A beginner can explain what the suggestion used, change one amount, distinguish a what-if
  from guaranteed results, and identify that no money moved. Human comprehension is tested separately.

No production data integration or statistical/predictive AI is included in concept approval. Before
production, validate the data contracts and map these checks alongside existing AC01–AC49.

## 9. Review the approved concept

Approved scope: **engine-generated starting draft + transparent gates + one optional user-chosen
what-if, inside existing setup; no AI dependency or new page**. Any broader optimiser, autonomous
rebalancing or AI coaching remains a later proposal.

At `/budget-concept.html`, choose **Try setup → Help me build a budget**. Outer review scaffolding
offers **Suggestions** fixtures: Complete, Limited, Missing account activity, Recent income change,
Funding gap, Unresolved transfer and No history. Choose **Every two weeks** in setup to inspect
anchor-aligned calculations. These controls are not proposed product navigation.

The complete monthly fixture has June–September everyday totals $1,700 / $1,800 / $1,800 / $2,100,
yielding a median of $1,800. Without a purchase goal it leaves $300 still to plan. To reproduce
the goal comparison in the active period, choose **Other everyday spending**, redirect $50 to
**Something I want to save for**, and explicitly select **Try the snowboard example**. The goal
contribution changes $100 → $150, the everyday pool $1,800 → $1,750, and Still to plan remains
$200. The active example's dining spending already exceeds its proposed $300 allowance, so a
dining reduction is blocked now but can be explicitly scheduled for the next budget instead.

**Use this draft** populates setup's final review. Only **Start my budget** replaces the fictional
active example. Next-period choices preserve current allocations and carry explicit future
everyday/goal starting amounts. Suggested drafts retain a method/source fingerprint; changed
fixtures or anchors require review or an explicit conversion to manual estimates, retaining goal
intent. The fixed example date is 19 October 2026, not the viewer's current date.

Boundaries: source coverage, ownership and annual bills are named fictional evidence, not proofs
of production data readiness. The source adapter and canonical classification here are fixture
demonstrations; production must use authoritative ledger/recurring aggregates, coverage contracts,
tenant checks, conflict-safe writes and existing budget calculations. Local scenario input values
are not a learned spending model. No human comprehension result is claimed.
