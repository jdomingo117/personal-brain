---
aliases:
  - Budget UI UX Direction
  - Budget Wireframes
tags:
  - halcyon
  - projects/fin-app
  - budgeting
  - design
type: design-proposal
status: concept-approved
project: Halcyon
created: 2026-10-19
updated: 2026-10-20
related:
  - "[[BUDGET_FEATURE_SPEC]]"
  - "[[Halcyon_DesignSystem]]"
  - "[[LEGIBILITY_AND_DENSITY_PLAN]]"
---

# Budget — UI/UX direction and wireframes

**20 October 2026 · Concept approved; Budget V1 scope frozen. Earlier wireframes are structural references.**

The current period-aware, assisted-setup concept is the approved design direction. Scope is
[BUDGET_SCOPE_BASELINE.md](BUDGET_SCOPE_BASELINE.md); engineering handoff and release gates are in
[BUDGET_IMPLEMENTATION_PLAN.md](BUDGET_IMPLEMENTATION_PLAN.md). Production is not implemented.

This document translates [BUDGET_FEATURE_SPEC.md](BUDGET_FEATURE_SPEC.md) into information
hierarchy, screen structure and interaction. It does not change the feature's accounting rules.
Numbers are fictional examples. The accompanying inline wireframes compare three structures and
demonstrate local allocation edits; they are not connected to application data.

**Agreed refinement:** subsequent concepts use the plain-language and guided-input requirements
in [BUDGET_GUIDANCE_AND_GOALS.md](BUDGET_GUIDANCE_AND_GOALS.md), sections 1–4. The earlier
interactive wireframe retains older structural labels and is not the final copy reference.
Its sections 5–9 now define the agreed personal purchase-goal experience, supported by research.

The connected desktop/phone concept is now available at `/budget-concept.html`; see
[BUDGET_CONCEPT_REVIEW.md](BUDGET_CONCEPT_REVIEW.md) for the review route, examples, checks and
deliberate prototype boundaries. This document remains the structural rationale.

### Implemented concept iteration — monthly and fortnightly

The workspace is period-aware, not monthly-only. Existing monthly drawings illustrate one supported
frequency; feature spec v1.3 section 3.1 supersedes their monthly-only assumptions. The live concept
now implements the following desktop/phone flows for owner review, not production accounting:

1. Setup offers **Monthly** / **Every two weeks**, an editable fortnightly start date and range preview.
2. Rename **This month** to **Overview**. Show frequency and exact dates near period navigation;
   use **This budget** / **This and future budgets** in edit previews.
3. Show a real 14-day example with dated income, bills due versus later-bill reserves, and goal
   contributions labelled **every two weeks**. Keep calculation explanations and undo available.
4. Add **How often you budget** to settings with future-effective change previews. Show both
   directions, including a short transition period where monthly alignment requires it; inspect
   dates, reserves, bills, goal amounts and gaps before confirming. Preserve the live period/history.
5. Validate dates and meaning with users, not just whether a frequency selector can be clicked.

Longer-term progress is accepted backlog item **BG-L01**, deferred until after Budget V1; it is
not an extra concept requirement, approved tab or V1 expansion. The concept exit checklist lives
in [BUDGET_CONCEPT_REVIEW.md](BUDGET_CONCEPT_REVIEW.md).

## 1. Recommended direction

**20 October comprehension refinement:** the live concept now implements feature spec v1.4
section 4.3: adjacent headline meanings, an optional five-step guide, a setup-complete next-steps
screen, solid confirmed/patterned planned goal progress, grouped frequency review and an explicit
period-end choice preview. These refine the existing workspace; earlier wireframes remain
structural references rather than the final copy/interaction source. Owner comprehension review
is complete; independent beginner validation remains pending. See `BUDGET_CONCEPT_REVIEW.md`.

Use **Monthly workspace**: a calm summary, a flexible-spending work area and a small attention
column. Keep the complete plan reachable on the same page. Prioritise the part of the plan that
users can change frequently without making fixed costs, reserves or savings disappear.

The design should work at three depths:

1. **Glance:** What remains, how long it covers, and whether something needs my attention.
2. **Decide:** Inspect a category or obligation and see a concrete trade-off.
3. **Control:** Edit an amount, assignment, target or future policy with scope and consequences.

The primary interaction is **select → inspect → preview → save → undo**. Users do not need to
enter a global editing mode to make one adjustment. Users who only want to read can do so without
being forced through a task queue.

## 2. The three structural options

| Direction | Strength | Cost | Recommendation |
| --- | --- | --- | --- |
| Monthly workspace | Balances a quick answer, full-plan context and targeted action | Requires clear distinction between summary, attention and details | Use as the default page |
| Allocation board | Makes purposes and allocation destinations tangible; good for building a plan | Card columns fragment comparisons and become long stacks on phones | Borrow its allocation editing clarity, not its permanent board layout |
| Guided check-in | Makes the next action obvious; useful for setup and monthly review | Hides context if used as the whole page; experienced users may feel managed | Use for assisted setup and completed-month review |

All three keep the same totals, source rules and controls. This is a comparison of hierarchy and
interaction, not three different budgeting methods.

## 3. Recommended desktop wireframe

```text
HALCYON                                             Existing app utilities
Existing rail  |  05 — Budget                         < October 2026 >
               |  Budget                             [Budget settings]
               |  [This month] [Plan] [Review]        4 accounts · AUD
               |
               |  LEFT FOR EVERYDAY SPENDING          YOUR INCOME
               |  $290 · 12 days left                  $6,000 expected this month
               |  $1,510 spent of $1,800               $3,000 received so far
               |  [How is this worked out?]           $200 still to plan [Choose a purpose]
               |
               |  Plan: Bills 2,500 · Upcoming costs 500 · Savings/debt 1,000
               |  Pending $45 · Updated 2m ago · [Data details]
               |
               |  YOUR MONTH                         NEEDS ATTENTION (2)
               |  Everyday spending [expanded]        Registration needs $220 more
               |  Purpose     Plan   Spent   Left     [Review target]
               |  Groceries     700    760    -60     Groceries: $60 over limit
               |  Dining        400    350     50     [Review category]
               |  Other         700    400    300     [View all attention]
               |  [Add category limit]                [View plan changes]
               |
               |  Bills & regular payments [collapsed] When a row is selected:
               |  $2,100 spent / $2,500 planned        this region becomes its
               |  Upcoming costs [collapsed]          DETAIL INSPECTOR
               |  $500 this month · $1,500 reserved    without replacing the plan.
               |  Savings & debt payments [collapsed]
               |  $600 recorded / $1,000 planned
```

The tabs are **local views of the same month**, not separate destinations:

- **This month:** operational view above. Current month is the initial destination.
- **Plan:** explicit resource/allocation editing; available for past/current/future months with
  effective-date rules. It exposes income, opening drawdown and the whole allocation equation.
- **Review:** comparison of original/revised plan and actuals. Current month is labelled
  *In progress*; completed months offer *Mark reviewed*. Future months explain that review is
  available after the month ends. Do not show a misleading completion button.

Changing month keeps the chosen local view if meaningful, while clear state labels distinguish
past/current/future. Setup is a separate first-use state, not a permanent fourth tab.

### 3.1 Header and context

- Preserve Halcyon's shell and index rail. Add Budget immediately after Expenses.
- Keep month navigation prominent; return-to-current appears only when viewing another month.
- Put persistent account membership/timezone/currency under **Budget settings** with a readable
  scope summary beside it. Account selection changes the saved budget: do not disguise it as an
  ephemeral analytics filter.
- Put scenario switching nowhere on this page; scenarios belong to existing Planning.
- Display exact month/timezone and account names in scope details; use compact readable context
  on the normal page. Explicit AUD appears in the summary and money editors.

### 3.2 Summary hierarchy

Use one dominant figure: **Left for everyday spending**. Below it show spent/planned,
days remaining and a small forecast statement when valid. The daily equivalent is secondary and
optional; no “spend $24 today” framing.

Place planned/received income as a paired fact, not separate hero cards. Show unallocated capacity
as an actionable row. A funding gap replaces that row with a signed amount and an inspect/edit
action; it remains separate from category spending status.

The compact allocation summary is a labelled list/strip. Avoid an extra donut repeating the same
totals. Do not divide the whole page into six equal KPI cards: those values have different meanings
and priorities. A bar is useful for spent-versus-plan, but the numbers and words carry the answer.

Show pending and data quality near the summary. Missing required evidence replaces a confident
forecast/status with *Estimate unavailable* or *Check data*. It does not replace all saved values
with blank skeletons during refresh.

### 3.3 The plan work area

Four sections share a consistent expandable-row pattern, with different metrics:

| Section | Summary | Expanded content | Appropriate visual |
| --- | --- | --- | --- |
| Flexible | Spent / planned / remaining | Optional category partitions and Other | One spend track per row, with a visible overage label |
| Fixed | Spent / planned, remaining charges | Named bills, due dates, paid/expected state | Paid/expected labels, no linear daily pace |
| Set aside | New contribution and cumulative reserve, separately | Targets, reserve balances, deadlines, gaps | Reserved-versus-target track, labelled as budget reserve |
| Contributions | Recorded / planned | Savings/investment/debt purpose and linked goal | Recorded-versus-planned track, not an expense bar |

Flexible starts expanded; other sections start collapsed with useful summaries. Each can be opened
independently. Remember expansion locally; do not collapse an inspected line after refresh.

Use table headers for comparison. Row selection opens detail; an explicit amount edit action opens
the allocation editor. Make selected state clear with a quiet accent edge/background. Avoid editable
cells everywhere: reading and comparison should not feel like a live spreadsheet.

When actual spend exceeds a plan, retain a neutral full track and a distinct overage label/mark;
do not cap the visible numerical result or use a misleading full bar as the entire explanation.
Use colour for budget state, not a different saturated hue for every purpose.

## 4. Option wireframes

### Allocation board

```text
Budget                         October 2026        [Edit resources]
$6,000 planned · $3,000 received · $200 unallocated

[ Fixed commitments ] [ Set aside       ] [ Flexible        ]
[ $2,500 planned    ] [ $500 this month ] [ $290 remaining  ]
[ Rent             ] [ Registration    ] [ Groceries -$60  ]
[ Internet         ] [ Insurance       ] [ Dining +$50     ]
[ Due/paid states  ] [ Targets/gaps    ] [ Other +$300     ]

[ Contributions: $600 recorded / $1,000 planned             ]
[ Selected item → allocation edit + source/destination preview ]
```

This is tactile and makes purposes tangible, especially during initial allocation. However, every
column needs different denominators and actions. It consumes horizontal space, encourages nested
cards and makes remaining values harder to compare. Do not introduce drag-to-move money as the
primary interaction: numeric source/destination entry is more precise and accessible.

### Guided check-in

```text
Budget                         October 2026        [View full plan]
$290 flexible remaining · 12 days · 2 things to review

[ Registration ]   [ Groceries ]   [ Finish ]

Registration may be $220 short on 1 November.
$500 reserved · $100 more scheduled · $820 target
[ Increase contribution ] [ Change target ] [ Keep for now ]

Compact month allocation summary and saved-decision history
```

Use this flow for tasks with a clear endpoint. It suits first-use setup and monthly review. For
routine use it risks making the app feel like a sequence of obligations and hides other priorities.
Always provide access to the full plan; never require attention items to be resolved before leaving.

## 5. Detail inspector and action patterns

### 5.1 Inspection

On wide desktop, the right column starts with attention. Selecting a row or an attention item
**replaces that column with a detail inspector**. A clear *Back to attention* control restores it.
Keep the plan visible; do not open an inspector on top of another persistent side panel.

At widths where both columns cannot remain readable, use a modal sheet/drawer with the selected
line name, current month and an explicit close/back control. Preserve scroll and selected context.
On phones it becomes a full-width task screen with one vertical scroll region. Avoid nested
scroll panes, floating sheet layers or horizontally scrolling finance tables.

The inspector has two primary local views:

- **Details:** result, calculation, transactions/source, pending and exclusions.
- **Activity:** timestamped budget edits and source changes.

Show *Edit amount*, *Move allocation* and purpose-specific actions near the result. Rollover,
assignment, archive and source management belong in a clearly labelled *Manage* disclosure.
Keep common actions visible rather than placing everything under an unlabeled ellipsis.

### 5.2 Covering a category overage

```text
Groceries · October                               [Close]
$60 over limit
Planned $700 · Spent $760
[Move allocation] [Edit plan] [Keep overspend]

Move allocation
From: [Other flexible spending · $300 remaining  v]
To:   Groceries
Amount AUD [60.00]
Applies to: October only

                        Before       After
Groceries remaining       -$60          $0
Other remaining           $300        $240
Flexible total            $290        $290

[Cancel]                              [Move $60]
```

Prefill the exact gap, not an arbitrary amount. Suggest Other only if it has sufficient remaining
allocation; never silently draw from savings. Other viable sources are selectable and disclose
reduced protection. Keep the preview below the fields, updating before save.

After Save, update both rows, keep selection and announce *Moved $60 from Other to Groceries* with
Undo. A resolved attention item disappears from the queue, not from history. Keeping overspend
acknowledges it without making the signed gap vanish.

### 5.3 Edit amount and scope

- Exact currency field, current month and current saved amount.
- A two-choice control: **This month** / **This and future months**, defaulting to this month.
- If future overrides exist, show which are preserved; replacement requires an explicit choice.
- Show change to unallocated capacity and any funding gap immediately.
- Button names the actual operation, e.g. *Save October plan*. Enter must not bypass validation.
- On a stale-save conflict, retain the draft and offer to compare/reload rather than discarding it.

### 5.4 Reserve shortfall

Separate two questions: *How much has been reserved?* and *What contribution gets me to the target?*
Show target, due date, reserve available and scheduled contributions before the deadline. Offer
edit contribution, move allocation, or change target/date. A contribution proposal states its
effect on the month's unallocated capacity. “Add $220” is never described as moving real cash.

### 5.5 Contributions and source linking

Use **Record contribution** with a clear choice between matching an observed movement and recording
an internal earmark. Show the linked Planning goal as context with a navigation link. Do not use
*Goal funded* for an allocation or an unverified earmark. The source transaction detail remains
inspectable, and matching duplicate transfer legs is prevented by the feature's source rules.

## 6. First-use and review experiences

### Assisted setup

Use a focused workspace with a short progress list: **Resources → Commitments → Priorities → Review**.
Combine the brief's six logical steps into four visible screens without omitting them. Scope is
confirmed with Resources; flexible allocation is set alongside Priorities. A compact live summary
shows planned income, allocation and unallocated capacity through setup.

Proposals arrive prefilled, source labelled and individually removable. Allow *Start manually*;
preserve draft progress. Do not put dozens of empty categories on the first screen. Offer optional
category limits after the flexible pool has a value. Review shows incomplete coverage and a signed
funding gap before activation.

### Monthly review

Use the guided pattern: **Result → Changes → Next month**. Show original plan, revised plan and
actual as explicitly labelled comparison values. Explain largest variances before showing a long
table. Include exceptional purchases. Let users keep the plan or edit future allocations, then mark
the month reviewed. *Changed since review* names the subsequent delta and source update.

## 7. Phone wireframe and responsive rules

```text
Existing Halcyon header
Budget              < Oct 2026 >
[This month] [Plan] [Review]
4 accounts · AUD         [Settings]

Left for everyday spending
$290
$1,510 of $1,800 spent · 12 days
[How is this worked out?]
Income $6,000 expected / $3,000 received
$200 still to plan      [Choose a purpose]

[2 items need attention]  ← expands in place

Everyday spending
Groceries                    -$60
Plan $700 · Spent $760         [Review]
Dining                        $50
Other                        $300
[Add category limit]

Bills / Upcoming costs / Savings & debt
expandable summaries
```

Below a content width of roughly 900px, move attention above the plan and collapse it to a counted
summary when nothing is urgent. An unfunded due obligation remains visible; a zero-item attention
section becomes a quiet single line. The exact breakpoint follows readability, not device brand.

Phone rows expose name, remaining/result and one secondary planned/spent line. The same information
is available as on desktop, without preserving a cramped four-column table. At approximately 600px
and below, inspectors/tasks use full width. Maintain one scroll region. Keep task Save/Cancel at the
bottom; a sticky task footer is appropriate only if it does not obscure content or the keyboard.
Avoid a permanent mobile action bar on the overview.

## 8. Visual direction for later concepts

- Preserve Archivo headings, Hanken Grotesk numbers/body, index rail, cinematic letterbox and theme
  tokens. Follow the current legibility remediation rather than older tiny microcopy examples.
- One large editorial money figure; ordinary data remains 15–16px, supporting prose at least 14px,
  and controls have readable labels with 44px touch targets.
- Use quiet glass group surfaces over the app scene. Editors and task surfaces need higher opacity
  so amounts and field boundaries stay legible. The low-fidelity wireframes use neutral opaque
  surfaces to test structure; final material treatment belongs to concept design.
- Mint communicates selection and primary affordance. Amber marks forecast concern; red marks an
  actual gap, without painting an entire section red. Pair every colour with text.
- A single neutral track with simple directly labelled values beats multiple rings, mini charts,
  gradients and category rainbows. Use schedule status for bills and target coverage for reserves.
- Motion communicates continuity: selected row/inspector transition, changed value emphasis and
  local save status. No animated money transfers, looping shimmer or counting up on every refresh.
- Keep the remaining figure stable while an editor is a draft. The preview changes locally;
  authoritative totals change only after save. This avoids confusing a proposal with a committed plan.

## 9. Why these choices fit the evidence

The research register in the feature brief provides the source links and limits:

- **R1:** prefer useful, occasional visits; no streaks or forced daily tasks. This is a design
  interpretation, not a causal claim that frequent checking causes distress.
- **R2/R5:** include irregular and exceptional costs; put target shortfalls where users can act.
- **R3/R7:** category allocations can help organise choices, but moving allocations must be easy and
  transparent when priorities change.
- **R4:** expose exact remaining amounts with context and actionable inspection; do not hide money
  behind qualitative status labels.
- **R6/R8:** grouped budgeting and explicit rollover are useful product precedents; the chosen
  hierarchy, category partitions and inspector model are Halcyon design judgments.

## 10. Concept-design handoff and validation

### Agreed language and input refinement

The next concept must demonstrate the three understandable setup questions, editable historical
suggestions, **Help me choose**, marked estimates and **Add it later** where appropriate. Keep
unknown costs distinct from zero. Reuse observed values rather than asking users to type them again.

For an overage, explain *You've spent $60 more on groceries than you planned*, offer **Use $60 from
Other**, **Choose another category** and **Keep my plan as it is**, and show the resulting amounts
before saving. Clearly distinguish moving budget from moving real money. Use plain language in
normal controls and reveal detailed policies progressively. Technical terms in the structural
discussion above are for designers/developers, not a requirement to expose them to users.

A purchase-goal flow is required in the concept and V1 feature scope. Its researched
inputs, progress distinctions and snowboard example are in
[BUDGET_GUIDANCE_AND_GOALS.md](BUDGET_GUIDANCE_AND_GOALS.md), sections 5–9.

### Agreed purchase-goal placement and interaction

- Add **Save for something** and a compact **Things you're saving for** area in the monthly workspace,
  visually distinct from expected bills/upcoming costs while sharing their reserve accounting.
- Feature at most one chosen goal with name, target, clearly labelled progress and this month's
  planned amount; expose other goals through a compact list. Goals remain optional for users.
- Goal creation asks purpose, approximate cost, existing savings and date-versus-regular-amount
  preference. Support estimates and an unpriced draft; do not force a deadline.
- Preview effects on **Still to plan** and everyday spending before saving. No silent reductions
  elsewhere. Show supportive revised timing when an amount or date changes.
- Inspect planned amounts, budget set-aside and confirmed savings with clear source labels. One
  progress track must not imply planned money is verified cash or count a transfer twice.
- Include recording a purchase and preserving achievement history; a one-time goal does not refill.
- Goal creation/inspection follows the existing contextual inspector/full-width phone task pattern.

### Concept review set

Build one coherent fictional-data concept using Monthly workspace as the base, with light/dark
desktop and phone states. The essential review journeys are:

1. A beginner confirms suggestions and creates a simple first budget, including help/estimate/defer.
2. An ordinary month shows everyday remaining, income context, bills, upcoming costs and a goal.
3. Create a Snowboard goal and preview its monthly-plan effect.
4. Cover a category overage with an explicit before/after preview and undo.
5. Adjust a goal amount/date, understand changed progress/timing and record a purchase.
6. Inspect missing evidence and a completed monthly review changed by late activity.

Use local simulated state for the concept; connection to production data/writes is later work.
Check the first five journeys in depth before polishing the remaining review states.

Recommend taking Monthly workspace into visual concepts, borrowing the board's clear allocation
destinations and the guided direction's short setup/review flow. Develop light/dark desktop and
phone concepts plus the detail/reallocation task before expanding to every edge state.

Validate these tasks with the next concepts:

1. In five seconds, identify flexible remaining and distinguish it from received income/current cash.
2. Explain why groceries can be over its limit while the total flexible pool remains positive.
3. Cover the $60 category gap without changing total Flex or accidentally reducing savings.
4. Find an upcoming reserve gap and understand the proposed contribution before accepting it.
5. Change only October's amount, then separately change a future recurring allocation.
6. Explain what is planned, reserved and recorded as a contribution.
7. Find missing data and understand why a forecast is unavailable.
8. Reopen a review changed by a late import and identify the delta.
9. Complete inspection, correction and undo with keyboard and at phone width.
10. Create a purchase goal, explain its monthly-plan impact and distinguish planned versus saved.
11. Adjust the goal supportively and record its purchase without a second expense or auto-refill.

The concept succeeds when users can explain the consequences of the controls, not simply locate
buttons. Wireframe geometry, breakpoint and secondary labels remain open to usability refinement;
the feature/accounting contract remains the reference.

## Approved concept iteration — assisted starting draft

Approved and implemented 20 October 2026; see [BUDGET_SUGGESTIONS_PROPOSAL.md](BUDGET_SUGGESTIONS_PROPOSAL.md). Setup entry:
**Help me build a budget**, alongside manual entry. Reuse existing fields and final activation;
one optional Current draft / With this change preview supports a user-chosen goal trade-off.
No new page, chat interface, persistent scenario manager or AI dependency. Display one concise
evidence line and open detailed provenance on demand. Phone uses the same stacked steps.
The path now uses three stages: Check history / Review draft / Try a change. The last is optional;
goal fields start blank, with an explicit example button for review. Applying fills final setup
review, never directly activates the budget. Fixture selection lives outside the product frame.
