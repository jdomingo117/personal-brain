---
aliases:
  - Budget Concept Review
tags:
  - halcyon
  - projects/fin-app
  - budgeting
  - design
type: design-review
status: concept-approved
project: Halcyon
created: 2026-10-19
updated: 2026-10-20
related:
  - "[[BUDGET_FEATURE_SPEC]]"
  - "[[BUDGET_UI_UX_WIREFRAMES]]"
  - "[[BUDGET_GUIDANCE_AND_GOALS]]"
---

# Budget — interactive concept review

**Approved 20 October 2026:** the owner completed concept review and requested freezing the initial
scope and creating the technical plan. See [BUDGET_SCOPE_BASELINE.md](BUDGET_SCOPE_BASELINE.md)
and [BUDGET_IMPLEMENTATION_PLAN.md](BUDGET_IMPLEMENTATION_PLAN.md). This is design/product approval,
not production acceptance or independent usability validation. The walkthrough below is retained
as the implementation reference; no further broad concept-design phase is required.

The period-aware Budget workspace concept is implemented for design review at
**`/budget-concept.html`**, with fictional data and local state only. It is separate from the
authenticated app and does not mount Auth/Data providers, connect to a bank, request Supabase data
or change real accounts. It is not the production Budget feature.

## Frequency iteration — implemented for review

The concept now demonstrates monthly and fortnightly setup, an editable start-date anchor, the
**Overview** tab, exact period dates and days remaining. **Try fortnightly example** in the outer
review toolbar loads a separate fictional fixture with Undo; it is not the product frequency switch.
Use **How often you budget** near the dates, or settings → **Change budget frequency**, for the
actual guided future-effective flow. It preserves the current plan and saves a separate scheduled
preview with editable amounts, goal reserve/target impact, explicit review and shortfall confirmation.
Scheduled changes survive reload and can be reviewed, cancelled and undone.

Review these journeys on desktop and phone:

1. Monthly example → How often you budget: next fortnight is **1–14 November**; rent is a full
   **$2,100** on 1 November, not half a bill. Inspect and edit amounts, schedule, then see the next
   budget. October's $290 remaining and existing goals stay intact.
2. Try fortnightly example: **12–25 October**, pay **$3,000 on 12 October**, utilities **$120 on
   20 October**, everyday plan **$800**, spent **$390**, remaining **$410**, still to plan **$430**.
   Upcoming costs includes **$1,000 for later rent** plus **$100 registration**. The fictional
   rent reserve opens at $1,100; turning off that opening in the scenario reveals a $1,100 gap.
3. Fortnightly → monthly: review **26–31 October** as a transition budget, then calendar months
   from **1 November**. Its short-period amounts are not silently used as a full-month template.
4. Try setup → Every two weeks: date preview and editable amounts follow the selected anchor.
   Starting without the fixture's purchase goal leaves **$480 still to plan**. No historical goal
   is imported into the new budget.
5. Fortnightly snowboard: contributions are planned at each period's last date. A $900 target,
   $300 opening and deadline **8 November** yields **$300 on 25 October and 8 November**, not a
   monthly/2 estimate. Monthly examples keep contributions on the 25th.

Longer-term progress is accepted backlog item **BG-L01**, deferred until after Budget V1 and
excluded from concept completion.

## Final comprehension iteration — 20 October 2026

- The headline explains everyday allowance versus unassigned expected income directly beside
  the amounts. Neither is presented as verified cash; funding gaps retain explicit wording.
- **How your budget works** is available below the overview headline and within setup. It has
  five short steps and a $50 category-move example. Returning from setup guidance preserves the
  draft. Completing setup opens next-steps guidance with **Go to my overview** as a direct exit.
- Goal cards/details show solid confirmed-savings progress and patterned planned progress with
  separate amounts and text labels. Planned is explicitly not saved; confirmation is not a live
  bank balance check. Purchase activity reduces the relevant remaining amounts.
- Frequency amount review is grouped into Income & bills / Everyday spending / Savings & goals,
  with optional pay/bill-date detail and one final all-amount summary before confirmation.
- Guide → **See a period-end example**, or September review → **Choose what carries forward**:
  compare starting fresh at $1,800 against carrying September's $80 for a $1,880 allowance. With
  the late $40 import, only $40 remains. Saving a choice persists an example review snapshot,
  supports Undo and leaves current allocations unchanged; late activity flags it for re-review.
  Incomplete coverage allows exploration but blocks saving that example choice.

This completes the approved comprehension implementation pass, not human usability validation.
Review the revised journeys together; independent beginners should explain the five key
relationships in their own words before we claim the experience is understood.

## Exit checklist — concept to production implementation

**20 October — assisted setup approved and implemented:** The owner approved
[BUDGET_SUGGESTIONS_PROPOSAL.md](BUDGET_SUGGESTIONS_PROPOSAL.md). Choose **Try setup → Help me
build a budget** for the history check, editable suggested draft and optional one-change comparison.
The outer **Suggestions** selector provides quality/coverage fixtures; it is review scaffolding.
No AI or real-data requests are made. The path stays inside setup, with no new product navigation.

Review routes:

1. Complete history → confirm scope/recent changes → inspect **Why these amounts?** → confirm
   income, bills and annual costs → Continue. Skip the optional change to see a baseline draft.
2. Try one change → Other everyday spending → $50 → Something I want to save for → explicitly
   **Try the snowboard example**. Compare 6 versus 4 scheduled contributions; no savings is recorded.
3. **Use this draft** shows final setup review without changing the active example. **Start my
   budget** then activates it. Current spending is retained; the example has $240 everyday remaining,
   $200 still to plan, and separate $300 confirmed / $150 planned goal amounts.
4. Dining has already spent more than its proposed allowance. Attempting a reduction is blocked;
   **Try this from the next budget instead** preserves current amounts and updates future everyday/
   goal starting values only. Compare current and future previews after activation.
5. Limited / Missing activity / Unresolved transfer / No history offer manual setup immediately.
   Recent income change leaves income blank for confirmation. Funding gap stays signed and explicit.
6. Close a prepared setup, change the outer fixture and resume. Stale suggestions cannot activate
   without fresh review or explicit conversion to manual estimates; goals and amounts are retained.

The complete fixture's monthly median is $1,800; fortnightly amounts come from fully covered,
anchor-aligned 14-day windows. Ownership, coverage and scheduled bills remain fictional evidence.
Production data readiness and independent beginner testing remain separate.

### Finish the concept

- [x] Add monthly/fortnightly setup, start-date/range preview and period-aware Overview/navigation.
- [x] Demonstrate real fortnightly pay/bill dates, later-bill reserves and goal contribution dates.
- [x] Demonstrate frequency changes in both directions, including the monthly-alignment bridge,
  first-period shortfall, cancel and resulting goal/plan impact, on desktop and phone.
- [x] Owner review completed for the concept, including setup, reallocation, goal creation/adjustment/purchase, current/future edit,
  incomplete-data and changed-review journeys together; record remaining copy/control feedback.
- [x] Make activation with a funding gap, reserve shortfall and end-of-period carry/rollover choices
  explicit enough to review (carry application remains an explicitly hypothetical preview).
- [ ] Complete production retry/conflict and empty/no-history interaction states during M2/M3/M7;
  this remains engineering handoff work, not a new concept-approval gate or permission to omit them.
- [x] Recheck responsive light/dark, keyboard/focus and readable amounts for changed flows; extend
  browser and date/money tests for fortnightly and transition boundaries. These checks validate
  interactions, not independent user comprehension or human assistive-technology testing.
- [x] Owner signs off hierarchy, plain language, control scope and key behaviours. No BG-L01 design
  or additional aesthetic exploration is required for this sign-off.

### Before production integration begins

- [x] Write a phased implementation plan and map AC01–AC49 plus SG01–SG09 to unit,
  integration/browser and usability checks: `BUDGET_IMPLEMENTATION_PLAN.md` sections 11–12.
- [ ] Verify complete ledger aggregates, coverage/currency and recurring/contribution source contracts;
  decide the safe unavailable-state when evidence is insufficient.
- [ ] Specify period/anchor revisions, assignments, reserves/carry, source matching and atomic
  write/retry/conflict/undo APIs; review legacy budget migration and isolated-test safety.
- [ ] Define loading/error/empty states and reuse/extraction of concept components in the real shell.

Recommended build sequence after these gates: period/calculation model and durable contracts →
secured persistence plus manual setup/plan vertical slice → reconciled actuals and recurring bills →
goals/reallocation/carry/reviews → frequency transitions and full regression/release checks.
This is sequencing, not a reduction of V1 scope; both frequencies must be considered from the first
data-model step. No production implementation is authorized by this readiness assessment alone.

## Open and run

The review server uses [http://127.0.0.1:5314/budget-concept.html](http://127.0.0.1:5314/budget-concept.html).
From `app/`, restart it if needed:

```sh
npm run dev -- --port 5314 --host 127.0.0.1
```

The root entry is `app/budget-concept.html`, mounting `src/budget-concept-main.tsx` and
`src/concept/budget/BudgetConcept.tsx`. Styles use Halcyon's existing tokens, typefaces and shell
language. This standalone HTML is served by Vite for development review; the normal production
build does not add it as an application route or deploy it.

## What to review together

Start with the desktop monthly overview, then use **Phone preview** or resize the window. **Dark /
Light** controls affect this concept's own preference. The toolbar is review scaffolding outside
the proposed product. The example date stays at 19 October 2026 in both layouts.

| Journey | How to try it | What to assess |
| --- | --- | --- |
| Everyday overview | Open the page with its original fixture | Can you tell what the $290 means, and distinguish it from the $3,000 received? |
| First-time setup | **Try setup**; use Help me choose, change amounts, mark estimates and continue | Does the app ask understandable questions? Can you close and resume the draft? |
| A purchase goal | Plus beside **Things you're saving for**, then **Try the snowboard example** | Does $900 target / $300 existing / $100 a month feel clear and motivating? |
| Goal's effect on the month | Continue to goal review before adding it | Does Still to plan changing from $200 to $100 explain the trade-off? |
| Category overspend | **Find some room** under groceries; preview and move $60 | Can you see why Other changes but the $290 total does not? Try Undo. |
| Goal adjustment | **See my goal → Adjust my goal**; try $75/month or a needed-by date | Are revised timing and monthly-plan effects understandable before saving? |
| Existing savings and purchase | Goal details → Add existing savings, then Record a purchase | Can you distinguish a planned earmark, a user confirmation and a purchase? |
| Month scope | Change my plan → October only or October and future months; inspect November | Are the scope and preserved future starting amounts clear? |
| Missing evidence | **Incomplete data** in the lower review controls | Does the qualification explain uncertainty without erasing known values? |
| Completed review change | **Review changed by a late import** | Is the $40 change clear, and does marking reviewed retain the new actual total? |

## Example values and expected effects

- Expected monthly income: $6,000; received: $3,000.
- Bills $2,500; upcoming costs $400; longer-term savings $1,000; everyday plan $1,800.
- Existing flight goal plans another $100/month, leaving **$200 still to plan**.
- Everyday spend is $1,510: groceries $760, dining $350, Other $400. Remaining: **$290**.
- Groceries has a $700 limit; Other has a $700 plan. Moving $60 makes their remaining amounts
  $0 and $240, while everyday remaining stays $290.
- New Snowboard example: $900 estimated target, $300 already put aside, $100 monthly plan. It
  needs six more contributions, starting 25 October. After saving, still to plan is $100.
- Its budget reserve is $400, but the track now distinguishes $300 confirmed existing savings
  from $100 patterned planned progress. Neither is claimed as verified bank cash or a transfer.
- If Snowboard changes to $75/month, still to plan is $125 and the timing becomes eight further
  contributions. No other category is silently reduced.
- To complete the example after that change, confirm another $525 of existing savings: starting
  savings then total $825, plus $75 in this month's plan, enough budget to record a $900 purchase.
- A purchase reduces that goal's reserve, not everyday spending a second time. Completion preserves
  the current month's allocation and achievement; November excludes that completed one-time goal.

## Interaction and responsive choices

- Desktop category inspection replaces the secondary column with contextual details. Editing and
  goal tasks use one native modal drawer with a clear title and close/back controls.
- Phone category inspection and tasks use full-width surfaces. The overview reflows into readable
  rows; the goal area comes before the expandable bills/cost summaries on narrow screens.
- Native controls, visible focus, dynamic focus boundaries, Escape, unsaved-edit confirmation and
  restoration to the opener/fallback support keyboard use. Setup instead saves its local draft.
- Monetary saves update the shared fictional plan and expose Undo for the latest operation.
- October-only edits preserve November's starting income/everyday plan. Future-scoped edits update
  those values without changing the September review fixture.
- Main state and setup drafts use dedicated `halcyon-budget-*` local-storage keys. **Restart example**
  resets only this concept. No real-account state is read or changed.
- Reduced motion removes transitions. Light/dark colours follow existing project tokens.

## Deliberate prototype boundaries

The central flows are interactive; this is not a full implementation of all 49 feature criteria.
The source accounts and transactions are fictional summaries. Settings explain the account scope
rather than implement account CRUD; recording a purchase simulates explicit source matching.
Category limits use a small preset, not the full taxonomy editor. Source revision history, refunds,
cross-tenant security and real recurring/Planning integration remain production engineering work.

September is a completed-month review fixture and November a future-plan preview. October is the
editable active month. The concept does not claim verified affordability, execute bank transfers
or automatically fund a goal. Its inputs and dates are for reviewing behaviour and comprehension.

Frequency changes are scheduled against the fixed example date; the prototype does not advance
the clock and close/reconcile periods automatically. Scheduled opening reserves are provisional
snapshots, not verified future balances. The guided preview demonstrates one initial new period;
full-month template review after a short bridge, arbitrary future navigation and real recurring
source matching remain production work. The dated salary/rent/utility schedule is a deliberate
fictional fixture; the earlier monthly overview retains its original $6,000/$2,500 example totals.

The period-end preview stores an example choice and source total only. It does not close September,
apply a carry amount to October or create a savings movement. Its $1,800 next-period starting
amount is a labelled worked example, not an overwrite of the user's current/future template.

## Validation

- Unit suite: **361 passed, 14 environment-dependent skips**, including nineteen exact-money,
  reallocation, period/date and goal/purchase tests for the concept.
- Browser-only suite: **24 passed**. `npx playwright test --config playwright.budget-concept.config.ts` covers
  the connected journeys, no data-service requests, invalid input, undo, draft resume, month scope,
  keyboard focus and responsive light/dark states at 320, 390, 768, 1024 and 1440px, plus fortnightly
  setup, actual goal dates, both switch directions, bridge shortfalls, persistence/cancel/undo and
  frequency-task overflow on phone, optional-guide return, setup completion, distinct goal evidence,
  carry-choice persistence/undo/late-change qualification and narrow light/dark comprehension tasks.
  Seven assisted-setup journeys add coverage gates, goal trade-offs, current/future scope, explicit
  activation, recent changes/gaps, stale-source review/manual conversion and phone layouts.
- Focused TypeScript: `npx tsc --noEmit -p tsconfig.budget-concept.json`.
- Normal application production build and `git diff --check` pass. The repository-wide TypeScript
  check still reports the pre-existing `StrategicProjections.tsx:252` metric-type mismatch; the
  focused concept/frontend-browser check passes.
- Screens were visually inspected at desktop and phone size, including the dark goal card,
  contribution editor and before-save goal preview. Human assistive-technology review is not implied.

M0 contracts/readiness and M1 pure calculation foundation are now complete; see
`BUDGET_M0_CONTRACTS.md` and `BUDGET_M1_FOUNDATION.md` for the separate engineering evidence.
M2 durable boundaries are now implemented and isolated-tested; see `BUDGET_M2_DURABLE_BOUNDARY.md`.
M3 manual UI integration is next in the technical plan. Independent beginner comprehension checks
remain required before a usability-validated release; concept tests do not replace production tests.
