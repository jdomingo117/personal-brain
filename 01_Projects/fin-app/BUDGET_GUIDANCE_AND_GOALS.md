---
aliases:
  - Budget Guidance and Goals
  - Budget Plain Language and User Input
tags:
  - halcyon
  - projects/fin-app
  - budgeting
  - design
type: product-decision-record
status: agreed
project: Halcyon
created: 2026-10-19
updated: 2026-10-20
related:
  - "[[BUDGET_FEATURE_SPEC]]"
  - "[[BUDGET_UI_UX_WIREFRAMES]]"
  - "[[PLANNING_EXPERIENCE_PLAN]]"
---

# Budget — guidance, user input and personal purchase goals

**19 October 2026 · Agreed guidance and personal purchase-goal requirements.**

- **Agreed:** The owner accepted a beginner-friendly, guided experience with plain language,
  assisted inputs, estimates, help and progressive access to advanced controls. Sections 1–4 are
  requirements for subsequent concepts and implementation.
- **Agreed:** Make named purchase goals, such as a snowboard or flight, a prominent V1 use of
  Budget's existing named set-asides. The owner accepted the recommendation and requested its
  inclusion in the specification. Sections 5–9 are now requirements and concept-design inputs;
  the research evidence retains its stated limitations.

No application, database or existing inline wireframe is changed by this record. Earlier wireframes
are structural references; their older terminology is superseded by the agreed language below.

## 1. Agreed experience principle

Users should understand **what an amount means, what they can change and what happens next**
without knowing finance terminology. Preserve exact accounting rules internally. Teach the product
through understandable labels and explanations at the point of a decision, not a compulsory tutorial.

Tone is warm, direct and calm. Avoid judgment, pressure, unexplained acronyms, infantilising language,
false reassurance and promises of affordability. A budget adjustment is an ordinary decision.

## 2. Agreed language and explanation contract

| Technical concept | Preferred UI wording | Explanation when needed |
| --- | --- | --- |
| Flexible spending/pool | Everyday spending | Covers groceries, transport and other costs outside the bills and goals already in the plan; does not mean optional spending |
| Fixed commitments | Bills & regular payments | Payments you expect regularly, such as rent, phone and subscriptions |
| Non-monthly set-asides | Upcoming costs | Prepare a little at a time for costs such as registration or annual insurance |
| Unallocated | Still to plan | Part of your planned income/existing-money drawdown that you have not assigned a purpose |
| Move allocation | Move budget between categories | Changes the plan; does not transfer money between bank accounts |
| Projected finish | Expected spending by month end | An estimate based on the stated activity/history, not a prediction or limit |
| Funding gap | Your plan needs $X more | Explain expected income and any explicit use of existing money; do not mislabel an intentional drawdown as an income deficit |
| Acknowledge overspend | Keep my plan as it is | Keeps the signed difference visible without forcing an adjustment |
| Contribution | Amount planned / transfer recorded | Use purpose-specific language; make planned versus recorded explicit |
| Calculation drill-down | How is this worked out? | Opens exact inputs, source dates and assumptions |

The headline is **Left for everyday spending**, followed by *You've spent $1,510 of the $1,800
in your October plan*. It remains distinct from a bank balance. Pair expected/received income with
brief labels such as **Expected this month** and **Received so far**.

Use the same name everywhere for the same concept. Keep exact amounts available. Do not replace
money values with vague good/bad scores. Essential explanation must be visible or available through
a labelled control, never exclusively a hover tooltip.

### Example: help with an overspend

> You've spent $60 more on groceries than you planned.
> You still have $300 left in Other everyday spending.

Actions: **Use $60 from Other**, **Choose another category**, **Keep my plan as it is**.

Preview: *Groceries will have $0 left. Other will have $240 left. Your total everyday budget
stays the same.* Include a short clarification that this changes the budget, not bank balances.
Offer an exact amount editor and clear Undo. Never choose savings/reserves as the source silently.

## 3. Agreed user-input contract

Halcyon prepares evidence and suggestions. Users supply priorities, corrections and intent.

| Input type | Halcyon's role | User's role |
| --- | --- | --- |
| Observed income/spending/bills | Reuse available data with provenance/coverage | Confirm or correct rather than retype |
| Suggested amounts | Show history/sample and an editable proposed amount | Accept, change or skip |
| Personal priorities | Explain purpose, alternatives and plan effect | Choose what to spend on, prepare for or save toward |

- Ask one understandable question at a time, with a brief reason where needed.
- Support **Help me choose**, **Use an estimate** and **Add it later** where applicable.
- Unknown is not zero. Estimates remain marked; skipped essential costs stay visible as incomplete.
- Suggest only what evidence supports. Past spending is context, not what users ought to spend.
- Use exact currency fields with clear period/date labels, useful suggested values and live draft
  consequences. Do not require sliders, dragging or advanced financial choices.
- Never save a proposed amount or inferred priority without a clear user save/accept action.
- Keep the main page's committed totals stable during edits; update the local preview first.
- A positive **Still to plan** amount does not establish cash affordability. Compare alternatives
  within the budget and retain the feature brief's received-income/data-quality boundaries.
- Make progress useful with a single everyday budget. Category limits and rollover settings remain
  optional detail; users do not need to configure every category.

## 4. Agreed guided setup and concept scenarios

Three user-facing questions organise setup:

1. **What money are you planning with?** Confirm income, accounts and deliberate existing-money use.
2. **What does it need to cover?** Check bills, upcoming costs and saving priorities.
3. **What would you like left for everyday spending?** Confirm the total and optional category detail.

These questions group the existing requirements rather than removing scope confirmation, evidence,
review or atomic activation. Each may have short substeps. Preserve drafts and a running summary.

The next concept must show a beginner's first budget, an ordinary month and a guided adjustment.
Check whether users can explain a number and a change in their own words. Do not assess only whether
they find buttons. Internal terms may remain in architecture documents, not in unexplained UI copy.

## 5. Research on personal savings goals

Sources checked 19 October 2026:

| ID | Finding or guidance | Limitation and design implication |
| --- | --- | --- |
| G1 | Karlan, McConnell, Mullainathan and Zinman, *Getting to the Top of Mind: How Reminders Increase Saving* (working paper 2010; published 2016): three field experiments support reminders and the salience of specific future expenditure. | Goal-oriented savings accounts and reminders are not this app. Supports making a named purpose visible; does not prove any goal card or notification cadence works. |
| G2 | CFPB (2022), *Consumer Savings App Strategies and Savings Outcomes*: scheduled/payday saving rules were associated with stronger savings outcomes than contingent rules such as roundups in Qapital data. | Observational association, not random assignment. Prefer a deliberate recurring contribution as the core planning mechanism; no causal claim or automatic bank transfer implied. |
| G3 | ASIC Moneysmart, *How to start saving*: recommends a clear goal, a budget-based saving amount and tracking progress. | Public guidance. Supports linking a personal purpose to a realistic contribution and a forgiving adjustment process. |
| G4 | CFPB's *Savings plan* tool breaks a named target and time available into regular amounts. Moneysmart's calculator also includes a starting balance and amount/time trade-offs. | Planning tools, not proof of behavioural effects. Support both target-date and affordable-amount entry paths and explicit estimates. |

Sources:

- **G1:** [Original study and publication reference, NBER](https://www.nber.org/papers/w16205).
- **G2:** [Consumer Savings App Strategies and Savings Outcomes, CFPB](https://www.consumerfinance.gov/data-research/research-reports/consumer-savings-app-strategies-and-savings-outcomes/).
- **G3:** [How to start saving, ASIC Moneysmart](https://moneysmart.gov.au/saving/how-to-start-saving).
- **G4:** [Savings plan worksheet, CFPB](https://files.consumerfinance.gov/f/documents/cfpb_your-money-your-goals_savings_plan_tool_2018-11_ADA.pdf), [Savings goals calculator, Moneysmart](https://moneysmart.gov.au/saving/savings-goals-calculator).

These sources support a clear purpose, a recurring plan and visible progress. They do not establish
that gamification, a particular illustration, a forced date or daily check-ins improve outcomes.
External reminders remain outside V1; a quiet in-page reminder can keep a chosen purpose visible.

## 6. Agreed capability: Save for something

Provide a clear **Save for something** entry point and a small **Things you're saving for** area
within Budget. Start with one optionally featured goal; allow multiple goals through a compact list.
Goals are optional and must not block someone who needs to focus on bills or debt.

Two visible purposes use the same underlying reserve/allocation rules:

- **Upcoming costs:** expenses the user expects to need to pay, such as registration.
- **Things you're saving for:** desired purchases/experiences such as a snowboard or flight.

Choosing a purpose changes guidance/presentation, not the accounting engine. A purchase goal is a
named, normally one-time B04 reserve, not an additional B06 contribution for the same planned amount.
Longer-term account cash/net-worth goals remain in Strategic Projections. A purchase goal can link
to an existing Planning goal for context, but no duplicated forecast event or count of funds results.

### Guided inputs

1. **What are you saving for?** Name; examples only if useful. Optional icon later, no required image.
2. **About how much will it cost?** Exact amount or marked estimate. If unknown, save an unpriced
   goal draft and offer help later; do not invent a price or calculate an unsupported completion date.
3. **Have you already put anything aside?** Optional amount, source/confirmation and date. Explain
   that this is existing savings for this purpose, not income or a second monthly allocation.
4. **How would you like to plan it?**
   - **Choose a date:** calculate a contribution using actual scheduled dates before the purchase.
   - **Choose a regular amount:** estimate how many contributions/time may be needed.

Dates refer to when money is needed. For a flight, ask when the user expects to book, not just when
they fly. Permit a date-free goal. Contributions follow the selected monthly or fortnightly budget.
Say **each month** or **every two weeks** and count actual contribution dates for needed-by
calculations; never divide a monthly amount by two. Frequency changes preserve reserves and
preview revised contributions/timing; feature specification section 3.1 is authoritative.

Before save, show the contribution's effect on the monthly plan. Keep user control over amount,
date and source. Do not automatically cut other categories, select investments as a savings source
or promise a goal is affordable because the plan is balanced.

### Example

Snowboard estimated at **$900**; user confirms **$300** already put aside. At **$100/month**, the
remaining $600 takes **six further monthly contributions**, assuming none is withdrawn or spent.
If the user's plan currently has $200 still to plan, adding this contribution leaves $100.

Suggested language: *Put $100 a month toward your snowboard. At that amount, you'd reach the target
after six more monthly contributions.* Dates and completion estimates always show their basis.

## 7. Progress, truth and adjustment behaviour

Keep three quantities distinct in both records and copy:

- **Planned this month:** accepted future allocation/contribution; it is not saved progress.
- **Set aside in your budget:** current carried reserve after allocations, spending and releases;
  this is a plan earmark, not a verified bank balance.
- **Savings confirmed:** optional user-confirmed existing earmark or explicitly matched saving
  movements with source/date; show whether user-confirmed or bank-observed. Bank observation of a
  transfer does not prove the cash is still available after subsequent withdrawals.

Do not combine planned monthly allocations with confirmed savings as if they were two amounts
saved. Goal milestones distinguish **Target covered in your plan** from **You confirmed your savings**
and **Purchase recorded**. Never show *You can afford it now* from budget reserve alone.

Use a simple labelled progress track. Its default label is **Set aside in your budget** and its
explanation distinguishes confirmed starting savings from later planned earmarks. If explicit
savings tracking is shown, keep it separate; the source-account balance cannot be fully attributed
to multiple goals. Confirming a transfer updates evidence, not the reserve balance a second time.

Required controls: add a one-off amount, change monthly amount/date/estimated price, pause/resume,
move some budget elsewhere, pin/unpin, and record the purchase. Every monetary change previews
effects, has scope and is undoable. Lower contributions recalculate expected timing. Releasing goal
funds shows the resulting shortfall; a missed month offers a revised plan without guilt or streak loss.

Multiple goals share the same resource equation. One dollar cannot be assigned twice. Changing a
goal's priority never silently takes budget from another goal or from essential payments.

## 8. Purchase lifecycle and edge cases

- States: Draft → Saving → Target covered in plan → Purchase recorded → Archived; pause is available.
  Each state describes its evidence. Merely reaching a budget target does not prove cash readiness.
- Recording a purchase explicitly matches its expense/split to the reserve. Count expense once,
  keep the purchase goal's achievement history and do not automatically refill a completed one-time
  goal. Partial purchases retain progress rather than pretending nothing was achieved.
- For spending toward the named purpose, display remaining reserve and amount already spent as
  distinct values. Partial purchases are supported; goal coverage is reserve remaining plus net
  qualifying purchases against the same target; withdrawals/reallocations do not count as purchases.
- A refund reverses the associated net purchase amount and restores the reserve once. An explicit
  user choice determines whether to retain, revise or archive the goal after a returned purchase.
- Do not automatically capture every transaction in a broad category: one snowboard goal must not
  absorb all shopping. Prefer explicit transaction/split assignment and inspectable source matches.
- Moving savings to another account does not use the purchase reserve or complete a purchase.
- Flight price changes require a user-confirmed estimate update; no live-price integration is implied.

## 9. Required next concept coverage

Alongside the agreed guidance scenarios, show:

1. Create Snowboard with a target amount and choose a monthly amount instead of a deadline.
2. Preview how the goal changes **Still to plan** and everyday spending.
3. Inspect planned, budget-set-aside and confirmed savings without double counting.
4. Lower a contribution or move a date and see a supportive revised estimate.
5. Record a purchase without a second expense or an automatically refilling goal.

The existing brief supports named future-spending reserves. The accepted purchase-goal experience
makes that capability approachable and motivating with purchase-specific guidance. It is required
V1 scope under B10 of the feature specification. The first fictional-data concept now carries
these core journeys through desktop and phone layouts; see
[BUDGET_CONCEPT_REVIEW.md](BUDGET_CONCEPT_REVIEW.md) for owner review. Detailed production
data/API contracts follow during implementation planning.

## 10. Final comprehension pass — agreed and implemented in the concept, 20 October 2026

The owner approved the bounded comprehension refinement following expert review. Feature spec
v1.4 section 4.3 is the behavioural reference. The concept now includes adjacent explanations of
the two headline amounts, an optional five-step **How your budget works** guide with a $50 move
example, a setup-complete next-steps screen, separate confirmed/planned goal progress, grouped
frequency review and a worked period-end carry choice. None implies money was transferred.

The guide is available from setup and returns to its saved draft. After setup, the user can skip
further explanation and go directly to the overview. The overview help remains reopenable.
The carry example saves only a review preference with the source-spending snapshot; it does not
apply a real carry balance to the current plan. Late activity marks that preference for review.

Remaining validation is comprehension, not more feature ideation: ask a new user to explain the
headline, goal evidence, category move, future-effective switch and period-end choice in their
own words. No independent user-test result is claimed by implementation or browser-test success.

## 11. Approved history-assisted setup — 20 October 2026

The owner approved [BUDGET_SUGGESTIONS_PROPOSAL.md](BUDGET_SUGGESTIONS_PROPOSAL.md). The concept
now carries **Help me build a budget** through a short evidence check, editable draft and optional
one-change comparison. Follow its G01–G09 gates and S01–S11 rules; the feature baseline is v1.5.
Suggestions explain evidence, not ideal spending. A what-if is conditional, not money already saved.
Manual setup remains available immediately; **Use this draft** and **Start my budget** are distinct.
No goal is inferred from spending: users enter one or explicitly load the editable snowboard example.
