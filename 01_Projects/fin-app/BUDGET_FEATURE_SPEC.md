---
aliases:
  - Budget Feature Specification
  - Budget Product Requirements
tags:
  - halcyon
  - projects/fin-app
  - budgeting
type: specification
status: approved-scope-frozen
project: Halcyon
created: 2026-10-19
updated: 2026-10-22
related:
  - "[[CURRENT_STATUS]]"
  - "[[INDEX]]"
  - "[[MVP_SCOPE]]"
  - "[[PLANNING_EXPERIENCE_PLAN]]"
  - "[[TAXONOMY_AND_LEDGER_PLAN]]"
  - "[[Halcyon_DesignSystem]]"
  - "[[BUDGET_UI_UX_WIREFRAMES]]"
---

# Budget — feature specification

**Version 1.5 · 20 October 2026 · Concept approved; initial Budget V1 scope frozen. Production implementation not started.**

Approval and inclusion/exclusion are recorded in [BUDGET_SCOPE_BASELINE.md](BUDGET_SCOPE_BASELINE.md),
baseline **BUDGET-V1-2026-10-20**. The technical build plan and AC/SG traceability are in
[BUDGET_IMPLEMENTATION_PLAN.md](BUDGET_IMPLEMENTATION_PLAN.md). New scope changes require an
explicit owner-visible decision; technical readiness and independent usability remain separate gates.

The owner accepted the research direction and requested a concrete specification before UI/UX
planning. This document makes the remaining product choices explicit. Requirements marked **V1**
form one complete first release; **Later** items are excluded from that release. The owner has
accepted the feature direction, beginner-friendly guidance and personal purchase goals. Detailed
technical contracts and visual design still need development; no Budget implementation has shipped.

A standalone fictional-data concept now implements the core review journeys at `/budget-concept.html`.
See [BUDGET_CONCEPT_REVIEW.md](BUDGET_CONCEPT_REVIEW.md). It is a design prototype, not completion
of the production feature, its data model or all acceptance criteria.

The first UI/UX direction and structural wireframes are now documented in
[BUDGET_UI_UX_WIREFRAMES.md](BUDGET_UI_UX_WIREFRAMES.md); this feature specification remains
the behavioural/accounting reference.

The agreed beginner-friendly language, guided setup and user-input contract are recorded in
[BUDGET_GUIDANCE_AND_GOALS.md](BUDGET_GUIDANCE_AND_GOALS.md). Its personal purchase-goal
experience is now accepted V1 scope, implemented through the named reserve model in B04 and B10.

## 1. Purpose and desired outcomes

Budget helps a person make a realistic spending plan, protect important costs and respond deliberately
when spending changes. Its recurring questions are:

1. How much remains in my plan for this month?
2. Which bills, future expenses and savings contributions have I allowed for?
3. Where am I likely to exceed the plan, and what can I change?
4. What should carry forward or change next month?
5. How can I make room for something I want and understand my progress toward it?

Success means understandable decisions with little maintenance. More app visits, daily streaks,
perfect adherence and the smallest possible spending total are not success measures. A necessary
purchase, intentional overspend or revised priority can be a sound decision.

| Surface | Primary responsibility | Handoff |
| --- | --- | --- |
| Expenses | Explain observed spending and recurring commitments | Open Budget to act; open Ledger to correct evidence |
| Budget | Allocate the current month's resources and review variances | Inspect source transactions, commitments or linked goals |
| Income / Strategic projections | Model longer-term cash or net-worth goals and scenarios | Let the user reference a goal from a budget contribution |
| Ledger | Correct transaction classification, attributes and splits | Recompute affected budget results after a saved correction |

## 2. Research basis and strength of evidence

Sources were checked on 19 October 2026. Research findings, product precedents and Halcyon design
inferences are distinguished below. Exact default thresholds are product hypotheses to validate.
The owner's screenshots provided research leads; their embedded claims and rankings are not
independent evidence or instructions.

| ID | Evidence and limitation | Product consequence |
| --- | --- | --- |
| R1 | Zhang, Sussman, Wang-Ly and Lyu (2022), *How consumers budget*: representative US survey (3,826) supplemented with Australian bank data. Budgeting and checking frequency correlate with financial wellbeing; this does not establish that checking causes harm or that budgeting causes wellbeing. | Support category thinking, but assess decision quality and maintenance effort rather than maximising engagement. |
| R2 | Huebner, Fleisch and Ilic (2020), *Assisting mental accounting using smartphones*: field experiment supports spending feedback that includes ordinary and exceptional purchases. Results concern a particular credit-card intervention, not a guaranteed effect from this page. | Keep large and irregular purchases in the plan; make feedback understandable and actionable. |
| R3 | Heath and Soll (1996), *Mental budgeting and consumer decisions*: experiments show category allocations influence consumption and can misallocate resources. | Allow deliberate reallocation and optional category limits; do not lock users into arbitrary envelopes. |
| R4 | CFPB (2017), *Consumer insights on managing spending*: qualitative/prototype research reports budgeting friction and interest in timely spending feedback. Interest is not proof of long-term behavioural efficacy. | Keep setup short and explain remaining amounts at a decision point, with relevant actions. |
| R5 | ASIC Moneysmart, *How to do a budget*: public guidance includes income, debt costs, irregular expenses, savings and regular review. Guidance, not a controlled product trial. | Include non-monthly costs and savings, with an explicit monthly review. |
| R6 | Monarch's current Flex Budgeting documentation describes fixed, non-monthly and flexible buckets with optional category detail. Product precedent, not causal research. | Use a simple grouped budget with one flexible pool. |
| R7 | YNAB's method describes allocating available money and revising priorities by moving allocations. Product precedent, not independent efficacy evidence. | Make trade-offs explicit and distinguish planned income from money already received. |
| R8 | Copilot's rollover documentation describes carrying positive and negative balances and disabling rollover per category. Product precedent. | Make rollover policy explicit, signed and inspectable. |

Sources:

- **R1:** [How consumers budget, Journal of Economic Behavior & Organization 204 (2022), 69–88](https://www.sciencedirect.com/science/article/pii/S0167268122003493).
- **R2:** [Published research record, ETH Zurich](https://www.research-collection.ethz.ch/entities/publication/455fdd91-1e6b-4fe9-8f1b-aa7b965047b9), DOI [10.1016/j.chb.2020.106504](https://doi.org/10.1016/j.chb.2020.106504).
- **R3:** [Mental Budgeting and Consumer Decisions, Journal of Consumer Research 23 (1996), 40–52](https://academic.oup.com/jcr/article-abstract/23/1/40/1892763).
- **R4:** [Consumer insights on managing spending, CFPB (2017)](https://files.consumerfinance.gov/f/documents/201702_cfpb_Consumer-Insights-on-Managing-Spending.pdf).
- **R5:** [How to do a budget, ASIC Moneysmart](https://moneysmart.gov.au/budgeting/how-to-do-a-budget).
- **R6:** [Using Flex Budgeting, Monarch](https://help.monarch.com/hc/en-us/articles/32125337244052-Using-Flex-Budgeting).
- **R7:** [The YNAB Method](https://www.ynab.com/ynab-method).
- **R8:** [Budget Rollovers, Copilot](https://help.copilot.money/en/articles/3790828-budget-rollovers).

### 2.1 Claims we will not encode as fact

- Exact remaining balances are not inherently harmful. Keep exact amounts available; contextualise
  them with dates, pending activity and estimates instead of concealing precision. [R4]
- Budget ranges are not established here as universally superior to exact allocations. Use exact
  cents for accounting and labelled ranges only as historical context or estimates.
- Observational associations between checking and distress do not establish a harmful dashboard
  effect. Offer relevant actions without forcing users to act. [R1]
- The exact hybrid method, setup sequence and alert thresholds below are architectural judgments
  informed by the evidence; they need usability validation in Halcyon.

## 3. Product decisions for V1

| Decision | Baseline |
| --- | --- |
| Destination | **Budget**, `/budget`, immediately after Expenses; renumber later rail destinations when implemented |
| Audience | A person seeking a low-maintenance plan, with optional detail for areas they want to control |
| Ownership | One active personal budget per tenant; no shared-household editing workflow in V1 |
| Period | Calendar month or anchored 14-day fortnight; saved budget timezone defaults to existing user timezone, Australia/Sydney if absent |
| Pay frequency | Separate from budget frequency; expected pay dates inform resources and can suggest an editable fortnightly anchor |
| Currency | AUD only for V1; validate account currency server-side and expose it in budget account selection |
| Method | Fixed commitments + non-monthly set-asides + one flexible pool, with a separate savings/contributions summary |
| Category detail | Optional limits partition the flexible pool; remaining capacity belongs to **Other flexible spending** |
| Funding discipline | No requirement to allocate every dollar; positive unallocated plan capacity is valid |
| Savings | Protected budget contributions, optionally referencing existing Planning goals; no automatic goal creation or forecast mutation |
| Personal purchase goals | Optional **Save for something** flow and **Things you're saving for** area; named one-time reserves with a target amount, optional date and affordable monthly plan |
| Actuals | Settled reporting activity; pending activity remains separate |
| Automation | Propose setup and updates, calculate results and identify exceptions; user approves saved allocations and policy changes |
| Notifications | In-page attention items only; external delivery deferred |
| Spending headline | **Left for everyday spending**, with spent/planned context; not an unconditional affordability claim |

Weekly/custom budgets, full zero-based cash envelopes and a reconciled **spendable now** engine
are Later. Monthly and fortnightly budgeting are both required V1 scope.

### 3.1 Agreed period contract — supersedes monthly-only assumptions

The original requirements and examples below were written for monthly budgeting. Unless explicitly
describing a calendar-month example, monthly/month-end/next-month accounting language now means
the selected **budget period / period end / next period**. This contract takes precedence over
older monthly-specific wording and wireframes; monthly examples retain their stated amounts.

- Setup asks **How often would you like to budget?** with **Monthly** and **Every two weeks**.
  Explain fortnightly as “A new budget every 14 days”, not twice a month. Ask for a fortnightly
  start date and preview the date range. Income schedules remain independent of this choice.
- Monthly periods retain calendar boundaries. Fortnightly boundaries advance by 14 local calendar
  dates from the anchor, across months, years and daylight-saving changes. Date windows are
  start-inclusive/end-exclusive; display the inclusive last date. Never overlap or omit dates.
- Default to the current period, with previous/next/current controls, exact date range, frequency,
  timezone, currency and days remaining. Rename the operational tab **Overview**. Edit scopes are
  **This budget** / **This and future budgets**, with explicit dates in previews.
- Starting partway through either period includes known activity from its actual start. Label
  missing coverage. Suggestions use comparable, sufficiently covered periods, name their source
  windows and never treat partial periods as complete or unknown activity as zero.
- Count income and recurring bills on actual scheduled dates, once per occurrence. A monthly bill
  does not become half a bill every fortnight. Distinguish **Bills due this budget** from money
  set aside for later bills. Offer an editable per-period reserve suggestion for later costs;
  payment consumes that reserve once, not a second everyday allocation. Show first-period and
  due-date funding gaps rather than assuming the user has already accumulated a reserve.
- Goal inputs say **each month** or **every two weeks**. Needed-by suggestions count actual
  remaining contribution dates before the deadline; never use monthly/2 or assume two fortnights
  per month. Keep opening reserves and already-counted contributions intact.
- Settings **How often you budget** opens a guided change, not an immediate toggle. Default it
  to the current period's end boundary and preserve the current period; V1 does not rewrite a
  live period. When switching to monthly away from month start, explicitly preview one transition
  period ending at the next calendar-month boundary, then full months. This system-generated
  bridge is not a custom-period builder.
- Preview exact old/new/transition dates, pay and bill occurrences, opening reserves/carry,
  allocations, goal contributions, override conflicts and gaps. Transition amounts require user
  review: never silently prorate fixed bills or goal contributions. Preserve past/current plans,
  source matches, reviews and audit history. Apply atomically with revision checks; cancellation
  changes nothing. Superseding a pending frequency change requires another explicit preview.
- Forecasts, rollover, assignment and review use actual period boundaries. Store stable period IDs,
  explicit bounds, frequency/anchor revisions and a transition flag, not a month-only identity.
  Cross-frequency trends use common calendar-date windows and complete data; never compare raw
  monthly and fortnightly totals as equal durations or sum carried balances as new savings.

The fictional-data concept now demonstrates both frequencies and guided changes in both directions
on desktop and phone. See the concept review for fixture values and boundaries: scheduled changes
are local previews, not a production period-closing/reconciliation engine or completion of AC44–AC49.

## 4. Vocabulary and accounting boundary

The terms below are the precise internal accounting vocabulary. User-facing labels follow the
agreed plain-language mapping in section 4.2; users do not need to learn these internal terms.

| Term | Meaning |
| --- | --- |
| Planned income | User-confirmed estimate of income expected within the month |
| Received income | Qualifying settled earned income already observed in the month's selected accounts |
| Opening drawdown | Explicit amount of existing cash the user intends to use for this month's new allocations; excludes existing set-aside balances |
| Allocation | Planned amount assigned to a purpose; it does not prove cash has moved or exists |
| Set aside / reserved | Budget accounting earmark carried across months; describe it as a budget reserve, not a verified bank balance |
| Spent | Settled gross expenses less attributable settled refunds/reimbursements |
| Remaining | Signed budget allocation plus opening carry minus applicable actual usage |
| Contribution planned / recorded | Savings/investment intent versus a specifically matched settled movement or explicit internal earmark |
| Projected finish | Deterministic estimate of total spend at month end, with method and assumptions visible |
| Typical spend | Historical observation; not a target or recommendation |
| Unallocated | Planned income plus opening drawdown less new allocations |
| Gap / overspend | A signed shortfall retained in the calculations even if acknowledged |

The budget allocates purposes across accounts. It is not another bank account or ledger. No budget
action moves real money, cancels a bill, changes a bank balance or creates a bank transaction.

### 4.1 Budget capacity versus affordability

**V1:** show planned and received income separately, named account scope, balance freshness where
available, and upcoming commitments. A positive budget remainder can coexist with low current cash.
Do not label a plan-derived remainder “safe to spend”, “available cash” or “cash-backed”. A daily
equivalent is explicitly **budget remaining per day**, never an instruction to spend that amount.

**Later:** a spendable-now estimate requires reconciled eligible liquid balances, cash reserves,
credit-card liabilities/repayments, pending holds and timing of future obligations. Pending amounts
may already affect provider available balances; subtracting them again can be wrong. Mixed balance
semantics or missing liabilities must suppress the estimate. V1 must not approximate this by simply
subtracting budget allocations from the sum of account balances.

### 4.2 Agreed guidance and user input

- Use **Everyday spending**, **Bills & regular payments**, **Upcoming costs**, **Still to plan** and
  **Move budget between categories** in ordinary UI. Describe shortfalls in a sentence with an amount.
- Explain an amount's meaning, available choice and consequence at the point of a decision. Label
  exact calculation access **How is this worked out?**; do not depend on hover help.
- Reuse observed information; offer editable, evidence-labelled suggestions; ask users for intent
  and priorities. Do not require manual re-entry of data already available.
- Offer **Help me choose**, **Use an estimate** and **Add it later** where appropriate. Unknown is
  never silently treated as zero. Mark estimates and preserve incomplete essential items.
- Organise setup around **What money are you planning with?**, **What does it need to cover?** and
  **What would you like left for everyday spending?**, while retaining all scope/review requirements.
- Allow one everyday-spending amount without category limits. Introduce advanced controls when
  relevant, with readable money fields, named periods and consequence previews.
- Use supportive, factual copy for overspend; retain signed results and user freedom to keep the
  plan. No shame, forced corrections or guarantees of affordability/goal completion.
- Follow [BUDGET_GUIDANCE_AND_GOALS.md](BUDGET_GUIDANCE_AND_GOALS.md) sections 1–4 for examples
  and agreed copy. The technical labels elsewhere in this brief do not override that UI contract.

### 4.3 Agreed comprehension refinements — 20 October 2026

These refine existing comprehension/evidence criteria AC30, AC33, AC35 and AC39; they do not add
a second budget engine or change monetary accounting.

- Explain both headline amounts beside their values. **Left for everyday spending** is the
  remaining everyday allowance, not a bank balance. **Still to plan** is expected income not yet
  assigned to a purpose, outside that everyday allowance; expected income may not have arrived.
  Negative results describe a shortfall rather than implying the plan is balanced.
- Offer optional, reopenable **How your budget works** guidance: choose dates → give money a
  purpose → follow spending → adjust → review. Use one concrete category-move example, explain
  that it does not move bank money, and preserve the setup draft when returning from guidance.
  The overview must remain understandable without opening the guide.
- Complete setup with **Your budget is ready** guidance describing what happens next and any
  retained shortfall. Users can go directly to the overview without taking a tutorial.
- Give confirmed goal savings and planned contributions separate text values and distinct solid/
  patterned progress treatments. A planned contribution must not visually fill confirmed savings.
  Remaining amounts after purchases must reconcile; confirmation is not a live balance check.
- Group frequency-change amount review into **Income & bills**, **Everyday spending**, and
  **Savings & goals**. Keep dates/details available, then show all amounts together before save.
  Explain what stays unchanged before asking users to review the new period.
- Demonstrate period-end **Start fresh** / **Carry it forward** choices with before/after allowance.
  Unused budget is not new income or automatically saved cash. Future-bill/goal reserves stay
  separate. Changed source activity requires review again. The concept saves an explicitly labelled
  example choice only; production period closing and carry application remain implementation work.

Automated interaction checks do not prove comprehension. Owner review and independent beginner
walkthroughs remain needed before describing the experience as usability-validated.

## 5. Required page contents and behaviour

These are information and interaction requirements, not a prescribed visual layout.

### B01 — Month and scope

- Open the current month by default. Provide previous/next month and return-to-current controls.
- Display the month's exact date range, timezone and AUD currency.
- Show the included activity accounts and the distinction between activity scope and savings
  destinations. Editing account scope previews affected spend, income and reserves before save.
- Past months show actual-versus-plan review. Future months show planned values and carried reserve
  estimates labelled provisional; no future actuals or completed review state.
- A draft resumes at its last saved step. A page refresh restores durable saved settings.
- Browser back/forward preserves the selected month and returns from source inspections sensibly.

### B02 — Plan summary

The page must expose:

- Planned income and received income, separately.
- New allocations to fixed costs, non-monthly reserves, flexible spending and savings/contributions.
- Opening drawdown and signed unallocated capacity or funding gap.
- Signed flexible budget remaining, elapsed/remaining days and optional daily budget equivalent.
- Projected flexible finish and gap to the flexible allocation, when sufficient evidence exists.
- Pending amounts, uncategorised spend and data freshness/completeness qualifiers.

All summary values must open an explanation of their inputs. No fabricated zero when a required
read fails. A negative remainder must be shown, not floored away.

### B03 — Fixed commitments

- List selected confirmed recurring commitments and user-entered monthly commitments.
- Show purpose, amount allowed for this month, expected occurrences/dates, actual charges and
  remaining expected charges. Include multiple occurrences when a weekly bill occurs five times.
- Distinguish detected source amounts from user-confirmed budget allocations.
- Link to Recurring Hub for schedule changes; a Budget allocation override changes Budget only.
- Confirmed annual/quarterly commitments normally belong to non-monthly set-asides.
- Detection candidates never silently enter the saved plan. Confirmed series must also be chosen
  during setup or subsequently added by the user.
- A source amount/schedule change raises an **Update proposed** item with before/after impact.
  Recompute actuals automatically, but preserve the saved allocation until accepted.
- If a series stops, retain incurred charges and history; propose releasing only future unused
  allocation. Do not delete the line automatically.

### B04 — Non-monthly set-asides

- Create a named reserve with target amount, optional due date, optional repeat frequency, monthly
  contribution, optional opening reserve and category/subcategory or commitment match.
- Show opening reserve, current allocation, matched spending, signed closing reserve and target gap.
- Suggest the contribution needed by the due date. Let the user override it and see the resulting gap.
- Explain a manual opening reserve as an earmark of existing resources; never infer one from a bank
  account balance. Show its effect on total budget reserves.
- Default rollover on. Date-free funds allow a fixed monthly contribution without a due-date forecast.
- A payment consumes the reserve once; it does not also consume flexible or fixed allocation.
- Savings for a future spending event belong here; an asset accumulation goal belongs in B06.
- A reserve can go negative when a real bill exceeds it. Make the shortfall actionable.
- On a repeating target's due month ending, propose the next due date; preserve the old target and
  actuals in history. An unpaid bill remains an attention item rather than being treated as paid.
- Named one-time purchase/experience reserves power the agreed **Save for something** experience
  in B10 and [BUDGET_GUIDANCE_AND_GOALS.md](BUDGET_GUIDANCE_AND_GOALS.md), sections 5–9.

### B05 — Flexible pool and optional category limits

- One total allocation covers all spending not assigned to fixed costs, reserves or explicit exclusions.
- Let users add/remove optional limits by existing stable category/subcategory identity.
- Treat each limit as a partition of the pool. **Other flexible spending** receives the remainder;
  it includes unconfigured categories and uncategorised expense activity.
- Parent-category and child-subcategory partitions cannot overlap. Offer to replace the existing
  partition rather than double counting the same activity.
- The sum of limit allocations cannot exceed the pool. Explain the gap and let the user increase
  the pool or reduce limits before saving.
- A transaction reduces its partition and the parent pool's displayed total; it is counted only once
  in the overall budget. Moving between child limits does not increase the pool.
- Removing a limit merges its allocation, carry and activity into Other flexible spending; it does
  not hide the spend or change the pool total.
- Provide category detail even for categories with no limit. Do not label unconfigured as over budget.

### B06 — Savings and contributions

- Allow named planned monthly savings/investment contributions and optional links to existing
  Planning goals. Show planned versus recorded separately from expense totals.
- A goal link provides name/context and navigation. Budget does not add a duplicate Planning event,
  alter a scenario or claim goal progress from an allocation alone.
- Record completion through explicitly matched settled transfer/investment activity, or a user
  confirmed internal earmark with an audit entry. An earmark is labelled separately from a transfer.
- Match by stable source transaction ID; one movement can satisfy at most one contribution unless
  explicitly divided into cent-exact contribution allocations that sum to that movement.
- Funding a savings destination inside the user's accounts is a contribution, not expense/income.
  Source and destination transfer legs represent one movement.
- Exclude destination balances from any separate “existing cash used this month” shortcut. A
  protected contribution released for spending changes the plan, with visible goal context.
- Archived/inaccessible goals retain readable historical labels and stop offering live navigation.

### B07 — Attention and next action

Show a counted queue, with a compact prioritised preview and access to all items. Sort by unfunded
due obligations, actual overspend, likely overspend, then evidence/setup issues. Stable ties use due
date then stable identity. Examples and actions:

| Item | Available actions |
| --- | --- |
| Reserve will miss a dated payment | Increase contribution; move allocation; change target/date; inspect |
| Flexible pool/partition exceeded | Move allocation; increase plan; acknowledge intentional overspend; inspect |
| Projected finish exceeds allocation | Inspect basis; move allocation; adjust plan; snooze |
| Commitment amount changed | Accept proposed allocation; keep existing plan; inspect source |
| Income received is below expected after its configured expected date | Revise income plan; inspect; snooze |
| Uncategorized or unassigned refund activity | Open scoped Ledger review; inspect budget effect |
| Stale/missing account evidence | Open account/import/refresh action appropriate to the source |

Actual signed gaps are always visible. Acknowledging or snoozing changes attention presentation,
not arithmetic, allocations or underlying evidence. An acknowledged item returns when its amount
or source evidence materially changes. Default materiality is specified in section 9.

M5 implementation: **A few things to check** initially shows three active checks, with access to
all reviewed/snoozed items. Owners can choose **I've reviewed this**, a bounded **Show this again
on** date, **Show this again now**, or compatible Undo. Reviewed monetary gaps remain in a signed
**These gaps still remain** summary; parent/category amounts are not summed. Reminder preferences
use a separate version and never edit the financial plan, source evidence or pending frequency intent.
They expire at the selected period's exclusive end and reopen for material worsening, date changes
or relevant evidence reinterpretation—not every refresh or unrelated import. Existing real plan,
Ledger, allowance and account/import controls handle corrections. Forecast/payday/detector-derived
reasons require their real calculation inputs/adapters and are not fabricated by the initial queue.
See [[BUDGET_M5_ATTENTION_CONTROLS]] for the durable and interaction contract.

### B08 — Inspection and correction

- Selecting a line exposes its calculation, source/assignment, matched transactions, pending rows,
  exclusions, recent allocation changes and relevant controls.
- Transaction details use existing Ledger correction workflows. Returning preserves budget context.
- Local editing lets the user inspect effects before Save; Cancel discards the draft.
- Refresh actuals after a successful correction/import. Show the refreshed result and any affected
  prior-month review. A failed refresh retains the last result with its timestamp and a retry action.
- Amount, category or transfer corrections may change budget actuals but never silently rewrite
  planned allocations.

### B09 — Monthly review

- Review a completed calendar month; current-month values are explicitly in progress.
- Reconcile original plan, subsequent changes and latest settled actuals.
- Include ordinary spending, exceptional spending, contributions and exclusions separately.
- Explain carry forward and any deliberately released reserve.
- Offer **Keep next month's plan**, **Adjust future plan**, and **Review transactions**.
- Review completion records the source revision/fingerprint and reviewed totals, not a new ledger.
- Late imports/refunds/corrections recompute current actuals, mark the review **Changed since review**
  and show the delta from the recorded review. Never pretend a completed review freezes bank truth.
- A review can be reopened. Completion is optional and never blocks next-month access.

### B10 — Personal purchase goals: Save for something

- Provide an optional **Save for something** entry point and **Things you're saving for** area.
  Support multiple named goals and one optionally featured goal without blocking ordinary budgeting.
- Use B04's reserve accounting for a purchase/experience such as a snowboard or flight. Classify
  its purpose separately from an expected bill; do not add a duplicate B06 monthly contribution.
- Ask what the user wants, approximate cost and whether anything is already put aside, then offer
  **Choose a date** or **Choose a regular amount**. Label estimates, allow date-free goals and save
  unknown-price goals as drafts without inventing a target/completion estimate.
- Ask when money is needed: for a flight, this is normally the planned booking date. Calculate
  dated amounts using actual contribution dates; amount-led estimates state how many contributions
  are required. With zero contribution, show a paused/unfunded plan rather than dividing by zero.
- Preview how a goal's monthly amount affects **Still to plan**, everyday spending and other goals
  before saving. Users choose any source or trade-off; no automatic reduction of essential costs.
- Keep **Planned this month**, **Set aside in your budget** and any **Savings confirmed** evidence
  distinct. Opening savings carry a source/confirmation date. A planned allocation is not a bank
  transfer; a matched transfer cannot add the same amount to reserve/progress a second time.
- Show a simple labelled progress track and an explainable timing estimate. A reserve reaching
  target means **Target covered in your plan**, never a guarantee of current cash affordability.
- Allow one-off additions, amount/date/price changes, pause/resume, explicit releases/reallocations,
  pin/unpin and recording a purchase, with preview, effective scope and guarded undo.
- A smaller contribution or missed month offers an updated estimate and choices without shame or
  streak penalties. Pausing preserves the reserve; resuming previews the revised schedule.
- Record a purchase through explicit expense/split assignment, count it once and preserve achievement
  history. A completed one-time goal does not auto-refill. Partial qualifying purchases and refunds
  retain the separate spent/reserve values and follow the lifecycle in the guidance record.
- Broad merchant/category matches must not absorb unrelated spending. Account transfers do not
  complete a purchase. Multiple goals cannot claim the same savings movement or reserve allocation.
- Existing Strategic Projections cash/net-worth goals remain separate; optional contextual linking
  never creates duplicate Planning events or changes a scenario.

## 6. Setup and first use

**Approved 20 October 2026:** [BUDGET_SUGGESTIONS_PROPOSAL.md](BUDGET_SUGGESTIONS_PROPOSAL.md)
is now part of this baseline. It defines **Help me build a budget**, explicit G01–G09 data-quality
gates, S01–S11 suggestion rules and SG01–SG09 validation checks, plus one optional user-chosen
what-if. The fictional concept implements the path within setup, not a separate page. AI is not
required. The detailed gates take precedence over older generic suggestion wording below.
Using a draft never activates a plan; the existing final-review/activation boundary remains.

Setup is a resumable draft with the following sequence:

1. **Choose scope:** currency/timezone, activity accounts and start month. Default to the current
   month and eligible AUD transaction/card accounts; let the user revise the proposed selection.
2. **Confirm resources:** proposed monthly income, expected pay dates and any deliberate opening
   cash drawdown. No income history still permits manual entry. Zero income is valid.
3. **Protect commitments:** confirm suggested recurring costs, add missing items and identify
   non-monthly reserves. Let the user skip individual suggestions.
4. **Choose priorities:** optional reserve/savings contributions and existing goal links.
5. **Set flexible amount:** suggest a historical value; allow one pool with no category limits.
6. **Review and activate:** show all allocations, signed unallocated amount, data gaps, included
   accounts and any starting reserve balances. Activation is one atomic save.

Suggestions use up to six **complete, sufficiently covered** months; never treat a missing month
as zero. Show the exact months used, sample count and historical median/min/max. With at least
three covered months use the median as the proposed flexible amount; show fewer months as limited
evidence and require manual confirmation. This is a chosen default, not a research-established optimum.

History is evidence, not a target. Always let users enter a realistic alternative. Do not remove
exceptional purchases silently from the observed total; explain their contribution and let the user
plan an explicit one-time allowance or reserve. No automatic recurring-income detector is required:
users can confirm schedule estimates manually in V1.

A sufficiently covered month requires coverage evidence for every included activity account from
statement/provider coverage metadata or the user's explicit confirmation. The first/last transaction
dates alone cannot prove coverage, and a zero-transaction month is not automatically missing. Show
user-confirmed coverage as such. Until complete aggregates and coverage evidence are available,
manual planning remains usable but history-based suggestions/forecasts stay limited or unavailable.

Starting mid-month uses the whole calendar month's known activity and full-month allocations.
Label missing earlier activity; do not pretend the budget starts today or silently prorate. A user
can save a zero-income or underallocated plan. A plan whose allocations exceed resources can also
be activated with an explicit **Save with funding gap** action and persistent signed gap.

Bank linking is optional. CSV/manual-account users can create a budget, see source dates and review
actuals. Without history, show a usable manual plan and honest empty actuals.

## 7. User control contract

The user owns intent; Halcyon owns repeatable calculation and proposals. The controls below are V1
requirements. No hidden auto-rebalance, auto-sweep, invisible exclusions or forced correction.

| Control | Scope/default | Behaviour before and after save |
| --- | --- | --- |
| Edit allocation/income | This month; explicit option **This and future months** | Preview deltas, resource gap and linked priorities; preserve past plans |
| Move allocation | Two selected lines in the same month | Equal debit/credit in one operation; total resources unchanged; show resulting remainders |
| Move within Flex | Selected child partitions, including Other | Parent flexible total unchanged |
| Move across groups | Fixed/reserve/savings/Flex | Show reduced protection or future target gap; destination and source both explicit |
| Change target/date | Selected reserve, effective this month | Show revised monthly contribution suggestion; never silently accept it |
| Add/remove limit | Flex only | Add partitions capacity; remove merges into Other without losing money/activity |
| Change rollover | Selected line from next month by default | Preview opening-balance effect; no historical reset |
| Change assignment/exclusion | Selected transaction/split, or category policy from stated effective month | Explain spend moved/removed; retain audit and excluded totals |
| Accept recurring update | Selected commitment and month scope | Preserve source; change only the explicitly accepted budget allocation |
| Acknowledge/snooze | One attention item | Keep gap visible; select end date or month end; reopen on material change |
| Match contribution | Named settled movement or internal earmark | Explain amount, source and duplicate-match rules |
| Recalculate suggestions | Draft only | Compare proposed values with saved ones; no write until accepted |
| Pause budget | Future automatic plan creation | Retain historical months/reserves; resuming requires explicit carry reconciliation |
| Archive budget/line | Future use | Preserve past records; positive/negative reserve must be transferred or explicitly released |
| Undo | Latest compatible operation | Restore all affected records atomically; reject conflicts and offer inspection |

Rules for control and interaction:

- Use editable numeric input with currency and period labels; sliders may supplement but never
  replace exact entry. Store cents; keep cents inspectable even if the overview rounds visually.
- Every multi-record action has a clear preview, named scope, Save/Cancel and truthful completion
  feedback. Routine single-line edits need no extra confirmation dialog.
- An allocation transfer cannot spend more than the source's nonnegative remaining allocation.
  Releasing a protected reserve is explicit and must identify any underfunded future obligation.
- Increasing an allocation without a source is a plan edit; expose the resulting unallocated
  balance/funding gap. Do not disguise it as a transfer.
- Moving allocations changes intent, not evidence. Correcting transaction classification changes
  evidence through Ledger, not through a disguised budget edit.
- A stale edit rejects rather than overwrites a newer plan version. Retain the local draft and
  explain how to reload/compare. A write timeout uses an operation ID to check outcome before retry.
- Unsaved changes are indicated; leaving an editor offers Keep editing/Discard, while saved drafts
  require no leave confirmation. Navigation never reports a request as cancelled merely because
  the page closed.

## 8. Classification and reconciliation rules

### 8.1 One assignment per reporting amount

Budget uses settled analytical rows after transaction splits. Each eligible row or split receives
exactly one primary assignment: Fixed, a named reserve, Flexible, or explicitly Excluded. A savings
movement is handled separately as a contribution. The split parent is not counted alongside children.

Assignment precedence:

1. A valid explicit budget assignment/exclusion for the transaction or split.
2. A linked recurring commitment with an explicit budget assignment.
3. A stable category/subcategory budget mapping effective in that month.
4. Flexible / Other, with an uncategorised attention state if applicable.

Conflicting active category/subcategory mappings are rejected at save. Ambiguous commitment matches
remain unresolved, fall back to category/Flex for totals, and expose the assignment issue. Category
labels and merchant display strings are never durable IDs. Assignments do not change taxonomy.

Category policy exclusions are deliberately optional, visible and effective dated. Excluded expenses
remain in an inspectable excluded-total reconciliation. They are excluded from both budget suggestion
history and budget actuals under the same policy; changes preview both effects.

### 8.2 Activity treatment

| Activity | Budget treatment |
| --- | --- |
| Settled expense | Positive spend in exactly one primary assignment |
| Refund/reimbursement received | Reduces expense, not earned income; route to explicit original purpose if known |
| Unattributed refund/reimbursement | Visible signed **Unassigned expense credits** reconciliation row; does not increase Flex capacity until assigned |
| Expected reimbursement / reimbursable attribute | Original spend counts normally until funds arrive; attribute alone creates no available money |
| Pending charge | Separate provisional amount by assignment; never settled spend or rollover |
| Internal transfer / card repayment | No expense/income; may fulfil a named contribution once if explicitly matched |
| Credit-card purchase | Counts when settled, regardless of later card repayment |
| Loan principal | Separate planned debt contribution; explicitly match the principal movement if identifiable |
| Loan interest/fees | Expense; split a combined payment where evidence permits; never invent principal/interest allocation |
| Investment purchase | Optional matched contribution, not consumer expense |
| Investment sale, valuation, reconciliation adjustment | Not earned income or spending capacity; deliberate drawdown remains a separate plan input |
| Uncategorized debit | Counts in Other flexible spending and appears in attention |
| Uncategorized credit | Existing income kind may count as received income, but mark provisional classification; never silently use it to increase saved planned income |

A refund arriving in a later month affects that receipt month by default. If it restores a reserve,
credit the same reserve once. Reassignment or a corrected ledger date recomputes affected periods
with an audit trail. Do not silently backdate cash receipts to make an earlier month look better.

Debt contributions belong in the savings/contributions resource allocation summary with a distinct
**Debt principal** label. The product must not imply that principal repayment is consumer spending
or that a matched card repayment is a second expense. Complex amortisation is Later.
Where the existing ledger classifies a combined loan payment as expense, count it as expense until
the user reviews its split/kind through Ledger. Budget cannot silently subtract an inferred principal
portion or also match the same amount as a contribution. Verified principal must use the canonical
non-expense movement classification before it can satisfy a debt contribution.

### 8.3 Ledger reconciliation

For any month/scope, expose this identity using signed cents:

```text
eligible net expense effect
  = fixed spend + reserve spend + flexible spend
    + excluded net expense + unassigned expense credits
```

Unassigned expense credits are negative. Contributions, income and pending activity reconcile in
their own tables. Use the existing effective-kind/transfer rules in `lib/classification.ts`, including
durable rejected-transfer decisions, rather than inferring accounting behaviour from category names.

## 9. Calculation contract and status behaviour

All arithmetic uses integer cents and ISO local dates. Date windows are start inclusive / next-month
start exclusive, interpreted in the saved budget timezone. Intermediate rates can be rational;
round each final monetary result once. Do not sum rounded display values.

### 9.1 Resources and allocations

```text
new resources = planned earned income + explicit opening drawdown
new allocations = fixed allocations + reserve contributions
                  + flexible allocation + savings/debt contribution plans
unallocated = new resources - new allocations

line remaining = opening carry + current allocation + net reallocations - actual usage
```

Opening carry belongs to its existing reserve/pool; it is not this month's earned income or new
allocation. Budget reserves are not verified cash assets. Future income estimates and carried plan
balances must never be described as received funds. Recorded contribution progress does not create
extra income or release planned savings allocation for spending.

Opening drawdown cannot reuse an existing opening reserve or recorded internal savings earmark.
An intentional reserve release is recorded separately as a reallocation; it never also increases
new resources. Releasing a reserve to unallocated capacity uses an explicit allocation movement so
that the amount can be assigned once, with equal source and destination changes.

For a reserve, actual usage is matched net expense. For a spending line it is assigned net spend.
For a contribution, show outstanding planned contribution separately from a spend remainder. For
internal earmarks, the contribution creates a protected cumulative earmark balance; a transfer to an
excluded savings destination fulfils the contribution without creating a second in-budget reserve.

### 9.2 Flex partitions and carry

```text
flexible new allocation = sum(category-limit new allocations) + Other new allocation
flexible opening carry = sum(category-limit carries) + Other carry
flexible remaining = sum(all child partition remainders)
```

There is no second parent rollover to add on top. Default Flex and fixed rollover off; reserve
rollover on. Optional Flex category rollover carries signed balance into that child only; Other can
also opt in. A Flex-level rollover toggle changes all child policies prospectively, with preview.
Overspend is not forgiven automatically: with rollover off, prior variance remains in that month's
review; with rollover on, the signed closing remainder becomes the next opening carry.

Turning rollover off never deletes accumulated reserve silently. Preview whether the existing carry
will move to another reserve, remain protected separately or be explicitly released; record the
choice. Rollovers represent budget rights/obligations, not new cash or income.

### 9.3 Due-date funding

For a dated reserve:

```text
gap = max(0, target - current reserve available)
suggested contribution = ceil(gap / remaining scheduled contributions before or on due date)
```

If this month's contribution is already included in reserve available, exclude that occurrence from
the denominator. Contributions default to month start; a user can choose a day-of-month for this
calculation. Clamp unavailable days to month end. With no remaining contribution dates, show the
full gap as due now; never divide by zero. Before a mid-month due date, only contributions dated
on/before that date count. Target coverage is explicitly a budget-reserve estimate.

### 9.4 Pacing and projected finish

- **Fixed:** use actual matched charges plus remaining scheduled occurrences; never linear daily
  pacing for rent or a bill already paid at month start. Match paid occurrences once. Unmatched
  expected charges stay labelled expected until resolved; do not quietly drop overdue bills.
- **Flexible:** initial model is month-to-date settled net flexible spend plus median daily **gross**
  flexible spend from the last three sufficiently covered complete months multiplied by remaining
  days. Historical refund spikes do not make expected daily spending negative. Include exceptional
  expenses unless explicitly mapped out under the same budget policy. Show the exact sample window.
- Today is included in actuals through the latest available data; remaining-day estimate starts
  tomorrow. Display data timestamp and pending amount separately.
- With fewer than three covered months, suppress flexible forecast/status and show remaining
  allocation plus **Not enough history to estimate finish**. Do not invent a confidence interval.
- **Reserves:** assess target coverage and due dates; annual insurance should not appear over pace
  simply because the annual payment happened this month.
- **Contributions:** use recorded versus planned, not an expense pace.
- **Future months:** forecasts are provisional plan estimates, never actuals.

Chosen V1 defaults, to validate in usability work:

- **Exceeded:** actual spend exceeds available allocation by at least one cent.
- **Likely to exceed:** projected spend exceeds allocation by more than
  `max(AUD 25, 5% of available allocation)`; requires adequate history and complete calculation inputs.
- **Within plan:** neither condition applies and evidence is adequate. No “all clear” status when
  critical data is missing; show **Check data** or **Estimate unavailable** instead.
- Pending overage can produce **Pending charges may exceed plan**, distinct from settled overspend.
- Acknowledged attention reopens when the same gap worsens by the materiality threshold above,
  a due date changes, or previously unresolved source evidence changes its interpretation.
- Upcoming reserve shortfall uses the actual funding schedule; raise attention when due this month
  or projected contributions will miss the target. No arbitrary linear reserve-spend warning.

“Within plan” never means “cash is available” or “this budget is affordable.” Funding gap, spend
status, contribution status and data completeness are separate dimensions that can coexist.

### 9.5 Worked examples

**Balanced monthly plan:** AUD 6,000 income, 2,500 fixed, 500 reserve contributions, 1,000 savings,
1,800 Flex leaves 200 unallocated. Flex limits of 700 groceries and 400 dining leave 700 in Other.
Spending 760/350/400 leaves -60/50/300 respectively and 290 in the parent pool. Moving 60 from
Other to groceries changes those allocations to 640/760 and remainders to 240/0; parent remains 290.

**Reserve payment:** opening registration reserve 600 + current contribution 100 - bill 650 = 50
closing reserve. The bill appears in observed spending; the budget also counts the month's 100 new
allocation. These are separate views of usage and intent; do not add 650 to the new-allocation total.

**Rollover:** opening carry -25 + allocation 100 - spend 50 = 25 closing. With rollover on next month
starts at +25. No extra 25 is added again at the parent level.

**Credit card:** a 120 grocery purchase uses 120 of grocery/Flex budget on settlement. A later 120
card repayment uses zero additional expense allocation. Neither event creates received income.

**Income timing:** 6,000 expected, 3,000 received, 290 Flex remaining: show all three facts. The
290 is a plan remainder, not a claim that 290 cash is currently free after all obligations.

## 10. Time, history and plan changes

- New months inherit the latest future-effective template, not an overwritten copy of history.
- A one-month exception does not become a recurring change unless explicitly selected.
- “This and future months” previews which future overrides it would replace; default preserves
  existing explicit future overrides. Replacing them requires a separately explicit choice.
- Preserve the activated plan and timestamped revisions; review can distinguish original plan,
  latest revised plan and actual result. Mid-month edits cannot erase the original variance story.
- Late source activity recomputes derived carry chains deterministically. Show impacted month count
  and changed-review flags. No automatic adjustment of saved monthly allocation values.
- Initial reserves must have an explicit opening date. No rollover before budget start.
- Plan timezone changes apply at a future month boundary; historical periods retain their timezone.
- Scope/mapping changes apply from a named month, with affected actuals/carry preview. Archiving an
  account does not remove its historical budget activity. New accounts are proposed, never silently
  added. Deleted/unavailable sources show a completeness issue rather than silently dropping totals.
- Pausing stops future plan generation. On resume, show uncovered months and reserve effects before
  activation; gaps must not be treated as zero-spend periods.
- Lifecycle implementation: operational pause preserves the visible active plan and stops explicit
  next-period/frequency generation, not real payments or canonical activity. Resume previews exact
  monthly/14-day uncovered windows, known spending/credits and matched reserve effects, with explicit
  carry and incomplete-history acknowledgement; it creates no gap periods or contributions.
- Archiving a non-everyday allowance preserves the selected current/future period's saved allocation
  and history while setting later refill to zero. Reserve/goal disposition explicitly retains or moves
  the exact signed balance to Other or another active reserve. Fixed bills/transfers have no lifetime
  reserve to release. Later corrections remain visible; disposition is not an automatic future sweep.
  Compatible latest-change Undo is supported; arbitrary unarchive is not part of this initial slice.
  See [[BUDGET_M5_BUDGET_LINE_CONTROLS]] for durable and interaction contracts.

## 11. System states and accessible interaction

| State | Required experience |
| --- | --- |
| No budget | Explain value; start assisted setup or manual plan |
| Draft | Resume/edit/discard draft without affecting active actuals |
| No history | Manual planning, zero observed rows, no fabricated suggestions or forecasts |
| Partial month/history | Name coverage gaps and suggestion/forecast limitations |
| Loading | Meaningful local progress; no provisional zero totals |
| Refreshing | Keep previous values with timestamp and local activity state |
| Required read failed | Show failed scope and retry; do not assert total remaining or Within plan |
| Source suggestion unavailable | Saved budget remains usable; mark missing enrichment |
| Save pending | Preserve draft, prevent duplicate submission, name operation |
| Save failed/conflicted | Retain draft, explain whether anything committed, retry/check outcome |
| No issues | Quiet empty attention state; normal controls remain available |
| Past/future month | Completed-month review versus explicitly provisional future plan |
| Negative income/capacity | Show signed gap, manual correction/control options; no percentage divide-by-zero |

All actions work with keyboard and touch, not hover alone. Use semantic controls, labelled money
fields, visible focus, logical focus order and existing dialog trap/restore conventions. Reordering
or moving allocations must have a non-drag alternative. Charts require equivalent values in text
or tables. Colour is supplementary; statuses have words. Mobile retains calculations, control scope
and undo. Honour reduced motion and announce save/error status without repeatedly reading all
amounts during refresh. UI/UX work must check these behaviours in light/dark and narrow viewports.

## 12. Architecture and durable records

This is a logical model; physical names and API payloads will be designed during technical planning.

| Record | Responsibility |
| --- | --- |
| Budget configuration | Tenant, currency, timezone, active/paused/archived state, effective-dated frequency/anchor and pending change |
| Account membership | Activity accounts and named contribution destinations, effective dates |
| Period / plan revision | Stable ID, explicit bounds, timezone, frequency revision, transition flag, baseline, current revision and future template/overrides |
| Income plan | Amount, independent income schedule/dates, estimate provenance, period overrides |
| Budget line | Fixed/reserve/Flex partition/contribution identity, source refs, target/cadence; reserve purpose distinguishes an upcoming cost from a personal purchase goal |
| Purchase-goal metadata | Reserve-line reference, name, target estimate flag, optional needed-by date, amount/date planning mode, status and optional featured/contextual Planning link; no duplicate allocation balance |
| Period allocation | Integer cents, period ID, provenance, explicit override semantics |
| Opening reserve / carry policy | Opening date/amount, effective-dated rollover, protected/released state |
| Assignment policy / override | Stable category, split, transaction or commitment reference and effective scope |
| Contribution match / earmark | Source movement or manual earmark, amount, destination/goal, reversal state |
| Budget operation events | Actor, operation ID, before/after revisions, reallocation legs, guarded undo |
| Attention acknowledgement | Reason identity, evidence revision, acknowledgement/snooze scope |
| Period review | Reviewed revision/input fingerprint, reconciled totals, completion and changed state |

Key engineering requirements:

- The legacy `budgets(category, amount_limit)` table is insufficient. Preserve existing rows through
  a reviewed migration path; offer them as draft category suggestions only after their tenancy,
  units and period assumptions are verified. Never invent a start month or historical carry.
- Use tenant RLS reads, validated/authenticated Edge Function writes and atomic service-only RPCs
  following existing repository conventions. Apply equivalent ownership scope to every linked ID.
- V1 mutation authority is the personal tenant owner; other members get no new budget write access
  implicitly. Household roles/collaboration require a later explicit product decision.
- Money calculations are deterministic; AI is not used for allocations, forecasts or write decisions.
- Aggregate complete source data server-side. The global frontend transaction list is not proof of
  complete monthly history. Budget needs bounded/paginated details plus complete aggregate queries,
  coverage metadata, effective-kind handling and split-aware reconciliation.
- Foreign account amounts must not be added as AUD. The frontend Account type currently omits
  currency even though the database stores it; extend the read contract before offering selection.
- Canonical source references use real transaction/split/series IDs or existing stable overlay keys.
  Analytical child identities must map back to durable allocation records.
- Store user intent, operation history and review snapshots; derive spend, carry and forecasts from
  versioned inputs. A cache, if needed, requires an input fingerprint and bounded invalidation.
- Matching contributions and recurring occurrences must be idempotent and cannot double count source
  legs, overlap split amounts or treat a prior matched charge as still expected.
- Track source revisions/coverage. Refreshing source data may revise actuals; changing budgets cannot
  mutate source account, transaction, recurring or Planning records.
- Guard multi-tab edits and undo with expected revisions. One reallocation commits both sides or
  neither. Operation IDs provide safe duplicate/retry detection.
- Schema and integration validation must use an explicitly isolated stack under
  [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md). This specification changes no live data.

## 13. Release scope and dependency gates

**Required for V1:** B01–B10, monthly/fortnightly periods and safe frequency changes under section 3.1, assisted/manual setup, personal purchase goals, exact-cent calculations, assignment and contribution
reconciliation, user control contract, history/rollover semantics, complete aggregate data, accessible
interactions and truthful states. A simplified visual presentation may reduce density, but cannot
remove the calculation/control requirements.

**Later:** weekly/custom periods; a reconciled spendable-now estimate; fully funded
zero-based envelopes; shared budgets; receipt/retailer ingestion; autonomous transfers; external
notifications; debt amortisation/repayment optimisation; FX conversion; custom group hierarchies;
probabilistic forecasts; automatic linkage into Planning scenario inputs; predictive AI advice.

Dependencies to resolve before implementation work is called ready:

1. Prove aggregate completeness, account currency, pending semantics and historical coverage sources.
2. Design effective-dated assignment, reserve and contribution contracts, including source matching.
3. Specify atomic write/revision/undo APIs and safe migration of legacy data.
4. Produce UI/UX concepts covering guided setup, ordinary month, a personal purchase goal and its
   monthly-plan impact, supportive goal adjustment, meaningful trade-off, reserve shortfall,
   category overage within a healthy pool, missing data and changed historical review.
5. Extend the concept with fortnightly setup, date-aware bills/goals and both frequency-change
   directions including a transition period; validate desktop/phone comprehension.
6. Map every acceptance case below to a technical or usability validation method.

These are implementation/design gates, not unresolved choices about whether the feature should exist.

## 14. Acceptance criteria

| ID | Scenario and observable result |
| --- | --- |
| AC01 | User with no linked bank/history creates a manual monthly plan and reopens it without losing values. |
| AC02 | Suggested plan names its historical months, excludes incomplete months and changes nothing before activation. |
| AC03 | Starting on the 19th includes known activity from month start; missing earlier coverage is visible. |
| AC04 | 6,000 resources and 5,800 allocations show 200 unallocated; adding 300 shows -100 funding gap and explicit save-with-gap. |
| AC05 | Flex 1,800 with limits 700/400 gives Other 700; partition and parent remainders reconcile exactly. |
| AC06 | Child actual overage appears even if parent Flex remains positive; moving 60 between children preserves the parent total. |
| AC07 | Removing a limit merges allocation/carry/activity into Other; no transaction or budget right disappears. |
| AC08 | A settled credit-card purchase counts once; its later repayment adds zero expense; pending remains separate. |
| AC09 | Split children sum to the source amount and get individual assignments; parent is not also counted. |
| AC10 | A five-occurrence month budgets five weekly payments; matching an occurrence removes that expected charge once. |
| AC11 | Changed recurring source creates a proposal; saved allocation changes only after acceptance. |
| AC12 | Reserve 600 + allocation 100 - payment 650 closes at 50; payment never also reduces Flex. |
| AC13 | Due-date calculation handles a mid-month deadline, already included contribution and zero remaining dates correctly. |
| AC14 | Signed -25 carry + 100 allocation - 50 usage produces +25 carry with no duplicated parent rollover. |
| AC15 | Rollover disabling/line archive previews disposition of existing positive or negative reserve; no silent deletion. |
| AC16 | A received reimbursement offsets expense, not earned income; expected reimbursement releases no money. |
| AC17 | Unassigned expense credit remains visible in reconciliation and cannot increase Flex before assignment. |
| AC18 | One transfer pair fulfils at most one contribution amount; allocation alone does not mark a goal funded. |
| AC19 | Funding a linked goal does not create a Planning event or modify its scenario; goal context remains navigable. |
| AC20 | Fixed bill paid on day one has no false linear-pacing warning; Flex forecast states its exact historical basis. |
| AC21 | Insufficient history suppresses forecast; missing required data suppresses an unqualified Within plan state. |
| AC22 | Acknowledging overspend preserves signed gap; material deterioration reopens attention. |
| AC23 | This-month edit preserves future template; future-effective edit previews existing override conflicts. |
| AC24 | Late import changes actuals/carry and marks completed review changed; original plan/reviewed totals remain inspectable. |
| AC25 | Cross-tenant IDs/direct browser writes are rejected; conflicting edits and duplicate operation retries cannot corrupt totals. |
| AC26 | Failed reallocation writes neither side; guarded undo restores both sides or rejects a conflict. |
| AC27 | AUD-only scope rejects foreign accounts and does not depend on a truncated frontend transaction feed. |
| AC28 | Timezone/month-end/leap-year boundaries, refund-heavy months, zero allocations and negative capacity retain exact cents. |
| AC29 | Keyboard/touch users can complete setup, inspect, edit, reallocate, cancel and undo with correct focus restoration. |
| AC30 | A user can explain planned income, received income and budget remaining as different quantities; no screen implies current affordability from plan alone. |
| AC31 | Sum of assigned, excluded and unassigned-credit expense effects equals canonical ledger expense effect for the same scope. |
| AC32 | Partial failure retains draft/last verified data, identifies affected scope and offers retry without claiming a write was cancelled. |
| AC33 | A beginner can explain the headline and an adjustment in their own words; user-facing labels follow section 4.2 without requiring accounting terminology. |
| AC34 | A user can accept/edit suggestions, request help, mark an estimate or defer an appropriate input; unknown costs are never silently saved as zero. |
| AC35 | Guided setup preserves all scope/review requirements and lets a user start with one everyday-spending amount without configuring category limits. |
| AC36 | A user creates a named purchase goal through either a target date or monthly amount; the snowboard example of 900 target minus 300 opening savings at 100/month gives six further contributions. |
| AC37 | Adding a 100 goal contribution to a plan with 200 still to plan leaves 100; no duplicate B06 contribution or Planning event is created. |
| AC38 | Unknown-price goals remain drafts; estimates are labelled; zero/paused contributions produce no unsupported completion date or division by zero. |
| AC39 | Planned, budget-set-aside and confirmed-savings values remain distinguishable; matched transfers/opening amounts cannot count twice or be claimed wholly by multiple goals. |
| AC40 | Amount/date changes, pause/resume and releasing goal funds preview the resulting plan/target gap; users can undo the latest compatible change. |
| AC41 | Explicitly matched purchases count as expense once, preserve achievement history and do not auto-refill the one-time goal; unrelated category spending stays outside the goal. |
| AC42 | Partial purchases/refunds reconcile reserve and net qualifying spend; transfers between accounts do not complete a purchase. |
| AC43 | A flight goal uses the money-needed/booking date, and a budget target reached is never described as proof that cash is available to buy. |
| AC44 | Monthly and anchored 14-day plans remain contiguous across month/year/leap-day/DST boundaries; fortnightly is never treated as twice monthly. |
| AC45 | Actual pay/bill dates determine occurrences, counted once; later-bill reserves and first-period funding gaps are explicit. |
| AC46 | Fortnightly goal suggestions count actual contribution dates, preserve reserves and never use monthly/2 conversions. |
| AC47 | Frequency changes preview dates, allocations, overrides, bills, reserves and gaps; preserve current/past records and source matches; cancellation is a no-op and conflicting writes cannot partially apply. |
| AC48 | Fortnightly-to-monthly changes away from month start preview a bridge period and require review of its amounts before calendar months resume without missing or overlapping activity. |
| AC49 | Both frequencies support desktop/phone setup, overview, inspection, scope and review; cross-frequency comparisons name equal calendar-date windows and coverage limitations. |

Calculation and reconciliation tests must cover exact examples plus realistic mixed-account fixtures.
Source matching, concurrency, tenant isolation and operation retries need integration verification.
Usability sessions must validate comprehension, not merely whether controls can be clicked.

## 15. Outcomes to measure and handoff to UI/UX

Measure completed activation, time to first usable plan, setup abandonment, recurring use across three
completed periods, monthly review completion, inclusion of irregular costs, unresolved exceptions,
and whether users can explain a budget remainder and a reallocation. Track intentional resolution
separately from actual reduction of overspend; acknowledgement alone is not improved finances.

Evaluate changes within a user's chosen goals and circumstances. Reduced spending is not always
better. Avoid causal claims about financial wellbeing from engagement metrics or observational use.
Product analytics should collect aggregate events without merchant descriptions or sensitive free text.

UI/UX planning can now choose hierarchy, layout and components against this behavioural contract.
Its first review should demonstrate: one-pool setup; a normal month; moving 60 to cover a category
overage; a non-monthly bill; a budget funding gap; an incomplete-data state; and a prior review changed
by a late import. Test that users can distinguish allocation, reserve, recorded contribution and
cash availability before refining visual treatments.

The concept must also show creating a purchase goal, its monthly-plan impact, an explainable
progress/timing view and a supportive adjustment. The feature scope is now sufficient to begin
concept design; detailed technical contracts remain implementation-planning work.

### 15.1 BG-L01 — Your progress (accepted backlog; after Budget V1)

The owner accepted adding this direction to the backlog. Status: **deferred, not scheduled, not a
Budget V1 or concept-completion dependency**. Aim: help people see the bigger picture and feel
satisfaction from their effort. Proposed entry is **Your progress** within **Look back**, rather
than another dashboard or a second Planning engine. Detailed metrics/layout still require design
and source validation; backlog acceptance does not authorize implementing them now.

Research checked 19 October 2026:

- [CFPB financial well-being framework](https://www.consumerfinance.gov/consumer-tools/educator-tools/financial-well-being-resources/)
  includes present control, capacity to absorb shocks, progress toward goals and freedom to enjoy
  life. It supports a broader outcome lens than minimum spending; it does not validate this UI.
- [CFPB savings-app study (2022)](https://www.consumerfinance.gov/data-research/research-reports/consumer-savings-app-strategies-and-savings-outcomes/)
  associates guaranteed saving rules with stronger savings outcomes than contingent rules in one
  app's observational data. This motivates showing consistent actual contributions and meaningful
  milestones, not claiming a progress display causes saving or wellbeing.

Proposed experience:

- A brief factual recap plus one simple trend for 3/6/12-month date windows. Separate observed
  history from **If you keep this plan** projections. Use common calendar windows across frequency
  changes; exclude unknown periods from comparisons and show coverage and scope changes.
- Show goal movement, net confirmed contributions after reversals/withdrawals, and meaningful
  completed purchases. Spending a goal's reserve on its intended purpose retains its achievement
  history; it is not a failure or negative-progress warning.
- Distinguish new contributions from opening savings, budget-only reservations, transfers between
  owned accounts, investment returns and valuation changes. Never total repeated reserve snapshots
  as cumulative saving or label unused budget as money saved.
- Later, where verified balances and liability data permit, show resilience (e.g. an explained
  essential-cost buffer) and actual debt principal movement. Do not infer either from allocations
  or repayments alone, or claim net-worth growth was caused by budgeting. Link to existing Planning
  for long-range scenarios rather than duplicating assumptions or forecast calculations.
- Let the user choose a featured goal/progress measure, inspect evidence, change the date window
  and hide the recap/celebration. No rankings, streaks, compulsory check-ins, invented wellbeing
  score, annualised partial-period claims or forced positive language during financial difficulty.
- Early-use state: **Your progress will build here** with current goal information, not a synthetic
  upward chart. Missing evidence means unavailable/limited, not zero or an achievement.

Delivery recommendation: retain existing goal progress and period reviews now; design a lightweight
multi-period recap after the frequency concept is reviewed. Wider resilience/debt/Planning summaries
follow only once their source and calculation contracts are reliable. Revisit after Budget V1 is
stable and has meaningful covered history. These are sequencing proposals, not additional V1
acceptance criteria or authorization to build them.
