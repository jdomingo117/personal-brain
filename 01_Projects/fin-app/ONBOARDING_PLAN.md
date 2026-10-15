---
aliases:
  - Halcyon onboarding plan
  - Halcyon tutorial plan
tags:
  - halcyon
  - projects/fin-app
  - onboarding
  - ux
type: implementation-plan
status: deferred
project: Halcyon
updated: 2026-10-13
related:
  - "[[CURRENT_STATUS]]"
  - "[[MVP_SCOPE]]"
  - "[[Halcyon_DesignSystem]]"
  - "[[INDEX]]"
---

# Halcyon — Onboarding, tutorials and product education plan

## Status and resume rule

**Status: shelved until the core application is declared ready.**

This document records the recommended product direction and a detailed delivery
plan. It does not authorize implementation now. Resume this work only after the
readiness gates in this document have been reviewed against the then-current
application and explicitly accepted.

When work resumes, treat the product outcomes, teaching principles and layered
experience as the durable decisions. Treat proposed component names, storage
shapes, event names and phase boundaries as a starting point that must be
revalidated against the current code and schema.

## Outcome

Help a new user reach a financial picture that they understand and trust, then
teach advanced Halcyon workflows when the user has the context and data to use
them.

The onboarding system must:

- get the first useful financial data into Halcyon without forcing a tour of
  empty pages;
- explain the minimum concepts required to trust the resulting dashboard;
- teach consequential workflows through real, reversible actions;
- reveal advanced concepts only when they become relevant;
- remain dismissible, resumable and replayable;
- keep examples clearly isolated from real financial records;
- preserve keyboard, screen-reader and reduced-motion access; and
- measure activation without collecting sensitive financial content.

The target is not “the user has seen every feature.” The target is “the user
has completed the first trustworthy workflow and knows where to get help next.”

## Executive decision

Use a **hybrid onboarding system**, not one mandatory all-product tour.

```text
Short setup gateway
        |
        v
Resumable activation checklist ───────> first trustworthy dashboard
        |                                      |
        v                                      v
Contextual, state-aware lessons <──── persistent Learn centre
        |
        v
Optional advanced modules as relevant data and actions appear
```

The system has five layers:

1. **Setup gateway** — choose how to begin and establish the first account/data
   path.
2. **Activation checklist** — a persistent, state-derived path to useful data
   and a trustworthy dashboard.
3. **Contextual lessons** — small tutorials shown only when the feature, data
   and user intent make them relevant.
4. **Learn centre** — permanent, searchable and replayable access to every
   lesson.
5. **Optional overview** — a short animated explanation of Halcyon's overall
   model for users who want orientation before acting.

## Why this direction

### Product evidence

Halcyon's current two-step onboarding initializes a callsign and a zero-balance
account. The application considers onboarding complete once any account exists.
That is sufficient provisioning, but it does not teach data entry, dashboard
interpretation, classification, reconciliation, splits, recurring detection or
undo.

The product is also state-dependent:

- dashboard concepts are meaningful only after transactions exist;
- transfer reconciliation is meaningful only when candidate legs exist;
- a split is understandable when the user is looking at a suitable transaction;
- confirmed recurring series and AI hints require different explanations; and
- investment education is irrelevant to a user with no investment account.

A single linear tour would therefore teach too much too early and point at
empty or irrelevant surfaces.

### External patterns reviewed in October 2026

- **Monarch Money:** establishes accounts/data first and then provides a setup
  checklist. This supports a path-to-value rather than a page tour.
  <https://help.monarch.com/hc/en-us/articles/360048393272-Getting-Started>
- **YNAB:** uses a flexible checklist that can be completed over time, backed by
  longer-form education that can be revisited.
  <https://www.ynab.com/whats-new/set-up-ynab-at-your-own-pace>
  <https://www.ynab.com/guide/the-ultimate-get-started-guide>
- **Nielsen Norman Group:** recommends contextual help and progressive
  disclosure so information appears when the user is ready for it.
  <https://www.nngroup.com/articles/onboarding-tutorials/>
- **Intercom:** established product-tour patterns include targeted entry,
  multi-page actions, snooze/restart and testing against new, empty and
  content-rich accounts.
  <https://www.intercom.com/help/en/articles/2900885-product-tours-explained>
  <https://www.intercom.com/help/en/articles/2901112-test-your-product-tour>
- **Notion:** starter examples and safe experimentation reduce the cost of
  learning a flexible system. Halcyon's equivalent must be isolated example
  data, never fake records in a real ledger.
  <https://www.notion.com/help/start-with-a-template>
- **W3C:** non-essential interaction-triggered motion must be preventable;
  reduced-motion preferences and equivalent static communication are required.
  <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions>

## Readiness gates — do not start implementation before these pass

### Gate A — Product scope is stable

- The owner has explicitly declared the core application ready for onboarding
  work.
- The primary navigation and route purposes are stable.
- The first-user paths for manual accounts, statement import and provider
  connection are final enough to teach.
- The intended release scope for recurring write-back, projections, investment
  expansion and classification-review expansion is decided. Deferred features
  are not described as available.
- Terminology is settled across navigation, headings and actions. In particular,
  decide whether user-facing language should say account, ledger, connection,
  import, reconciliation, review and categorisation in each context.

### Gate B — The current UI work is integrated

- The active dashboard/expenses/ledger/recurring UI refinement is reviewed and
  committed.
- No known redesign is pending for the shell, navigation rail, dashboard,
  ingestion, Ledger or Transfers.
- Responsive layouts are stable at supported desktop and mobile widths.
- Empty, loading, error and populated states have deliberate layouts.

### Gate C — Release confidence is current

- Unit tests, strict TypeScript, browser-suite typecheck and production build
  pass.
- The full isolated golden pass succeeds against the current migration chain.
- A genuinely new-user journey succeeds from authentication through account
  setup and first data import/connection.
- The onboarding work has a positively identified disposable test environment;
  no onboarding fixture may target the persistent personal Supabase stack.
- The current production-bundle warning is assessed. The onboarding approach
  must not add a large runtime without an explicit performance decision.

### Gate D — Adjacent platform decisions are resolved

- Decide whether the SPA login path will adopt the existing `auth-session`
  broker before onboarding is built. Do not design authentication education
  against a soon-to-be-replaced session flow.
- Confirm supported tenant roles and which onboarding tasks each role may
  perform. A viewer must not be instructed to perform an owner-only action.
- Confirm the privacy disclosure for provider data, CSV content and AI-assisted
  categorisation.
- Confirm whether product-event measurement will be first-party only and define
  the data-retention policy before recording onboarding events.

### Gate E — Content ownership exists

- One owner is accountable for onboarding copy and tutorial accuracy.
- Each advanced module has a feature owner/reviewer.
- A content-version and retirement process is agreed so obsolete lessons do not
  survive feature changes.

Passing the gates means implementation may begin; it does not mean every phase
must ship at once.

## Experience principles

1. **Value before tour completion.** The user should obtain a useful result as
   part of onboarding, not after it.
2. **Teach concepts at the moment of use.** Do not explain splits, rules or
   reconciliation on a blank dashboard.
3. **Real actions beat “Next” buttons.** Selecting an account, reviewing a row
   or confirming a transfer should advance the relevant lesson.
4. **No irreversible training action.** Tutorials use normal previews, guarded
   mutations and undo. Destructive settings and account deletion are never
   tutorial tasks.
5. **Progress comes from product state.** Checklist completion is derived from
   real outcomes where possible, not only from a user clicking a checkbox.
6. **Never hide the real interface.** Onboarding may focus the UI but must not
   substitute a simplified interface that leaves users lost afterward.
7. **Always escapable and replayable.** Skip, snooze, dismiss, restart and
   “Learn this page” are first-class controls.
8. **Explain why, then how.** Financial workflows need a short reason before
   mechanics—for example, transfers are reconciled so they do not inflate both
   income and spending.
9. **Trust is a feature.** Explain data ownership, AI boundaries, previews and
   undo wherever they affect user confidence.
10. **Motion communicates change.** Animation shows flow, causality or state;
    it is not a reward layer over sensitive financial actions.

## Target user journeys

### Journey 1 — Provider connection

```text
Welcome/privacy
  → choose Connect bank
  → authenticate provider
  → map accounts and choose history
  → wait for/resume sync
  → review resulting balance and transaction count
  → resolve initial classification/transfer attention
  → understand the populated dashboard
```

The tutorial must explain read-only provider access, history/cutover ownership,
sync progress and what happens if the connection fails.

### Journey 2 — Statement import

```text
Welcome/privacy
  → choose Import statement
  → create/select the statement's account
  → choose file
  → map columns
  → inspect blocked, duplicate and review states
  → declare/reconcile balance when applicable
  → commit atomically
  → review upload history and next actions
```

The tutorial must not imply that AI categorisation is required for import or
that an accepted preview has already written to the ledger.

### Journey 3 — Manual start

```text
Welcome/privacy
  → choose Manual account
  → choose a plain-language account type
  → enter opening state through the final approved workflow
  → see the limited empty dashboard honestly
  → choose connect/import/add-activity as the next task
```

This path must not create a dead-end zero-balance account and then claim the
system is fully initialized.

### Journey 4 — Returning or migrated user

Users who already have accounts or transactions must not be sent through new
account setup. Instead:

- derive completed checklist steps from current product state;
- offer the optional overview and contextual modules;
- surface “What is new?” education only for materially changed features; and
- preserve previous dismissals unless the module's content version changes.

## Layer 1 — Setup gateway

Replace the current assumption that onboarding always means “create one manual
account” with a short branching gateway.

### Screen 1 — Welcome and trust

Communicate:

- what Halcyon helps the user accomplish;
- that connected data is used to build their private financial view;
- whether Halcyon can or cannot move money;
- how statement data and provider data are handled;
- where AI may assist and that suggested changes remain reviewable; and
- a link to complete privacy/security information.

Primary action: **Set up Halcyon**.  
Secondary action: **See a two-minute overview**.

### Screen 2 — Identity

Retain the callsign/display-name step only if it has clear user value. Rename
“Operator Initialization” if research shows the terminal metaphor obscures the
task. Do not let product voice make a simple field harder to understand.

### Screen 3 — Choose a starting path

Present three cards:

- **Connect a bank** — best for ongoing automatic updates; include provider
  availability and read-only language.
- **Import a statement** — best for supported CSV history or institutions not
  connected directly.
- **Create an account manually** — best for cash, manual tracking or beginning
  without credentials/files.

Each choice states prerequisites, expected duration and what can be changed
later. The user may back out and choose another path.

### Setup completion

The gateway completes after the first account/data path is valid, not after all
education. It hands off to the activation checklist with one obvious next task.

## Layer 2 — Activation checklist

### Goal

Guide the user to a trustworthy first dashboard without blocking exploration.

### Proposed tasks

| Task | Completion signal | Conditional behaviour |
|---|---|---|
| Add or connect an account | At least one valid account exists | Derive as complete for existing users |
| Bring in activity | Settled transaction/activity data exists | Adapt for provider, CSV, investment or manual path |
| Confirm the account state | Import reconciliation or provider sync reaches its approved completion state | Omit if the final product flow has no separate confirmation |
| Review classifications | User resolves a small relevant review set or no review is required | Never manufacture review work |
| Resolve movements | Transfer/investment-cash candidates are handled | Omit or mark not needed if no candidates exist |
| Read the dashboard | User opens the populated dashboard and completes its short interpretation lesson | Requires meaningful data |

### Checklist behaviour

- Show completed, current and available-next tasks.
- Allow users to leave and return without losing progress.
- Do not nag on every session. Define bounded reminder cadence before launch.
- Allow **Hide for now** and **Open setup guide** from the Learn centre.
- Deep-link each task to the relevant route and state.
- Re-evaluate product state after mutations and background syncs.
- Explain why a task is unavailable instead of presenting unexplained disabled
  controls.
- Celebrate completion quietly; do not use confetti for financial actions.

## Layer 3 — Contextual lesson catalogue

### Priority 1 — Statement import

Trigger when the user intentionally starts their first import. Teach:

1. selecting the correct target account;
2. file support and source-row limits;
3. column mapping and saved layouts;
4. valid, blocked, excluded and duplicate rows;
5. bank/user/AI categorisation precedence at an appropriate level;
6. staging as a preview rather than a write;
7. manual balance reconciliation versus connected-account history ownership;
8. atomic commit and failure semantics;
9. durable upload history and undo; and
10. post-import classification/transfer review.

Advance through real workflow events. Do not place a tour overlay above a file
picker, modal or table if it makes the underlying control inaccessible.

### Priority 2 — Ledger review and correction

Split this into small lessons rather than one exhaustive tour:

- **Find and inspect:** filters, source/review states and transaction drawer.
- **Correct safely:** category/subcategory versus kind/attributes.
- **Work in a set:** selection across pages, the visible cap and clear scope.
- **Use the engine:** preview, protected rows, accepted suggestions and no cache
  learning during fresh review.
- **Rules:** one row versus a reusable merchant-wide decision.
- **Undo:** grouped guarded undo and why later changes may prevent it.

Trigger only when suitable rows exist or when launched manually.

### Priority 3 — Transfer reconciliation

Trigger when a transfer-review badge first becomes actionable. Explain:

```text
Account A  -$500  ───────>  Account B  +$500
                    one internal movement
                 not spending plus new income
```

Then guide the user through one real preview/decision. Cover suggested pairs,
ambiguous pairs, unmatched external movements and the difference between a
pair verdict and a single-leg verdict.

### Priority 4 — Dashboard interpretation

Trigger only when the dashboard has enough settled data. Teach:

- net worth versus cash flow;
- current period versus comparison period;
- settled versus pending activity;
- why confirmed/suggested internal movements are excluded where applicable;
- how category and account filters affect figures; and
- how observations link to focused Ledger, Income or Expenses views.

Teach concepts, not every card. A card-by-card tour will become obsolete and
encourage passive clicking.

### Priority 5 — Transaction splits

Trigger when the user invokes split on an eligible transaction. Animate one
statement row dividing into exact-cent allocations while the original bank row
remains intact. Teach:

- allocations must be non-zero and sum exactly to the parent amount;
- reporting uses allocations while the statement ledger preserves the parent;
- protected/pending rows cannot be split; and
- replace and undo semantics.

### Priority 6 — Recurring activity

Trigger when a confirmed series or candidate exists. Teach:

- confirmed deterministic series versus provisional AI hints;
- active versus dormant series;
- cadence and price-change interpretation;
- which values contribute to commitment totals; and
- any later accept/dismiss/write-back controls only after those controls ship.

### Priority 7 — Managed investments

Trigger only for an investment account. Teach:

- activity import versus ordinary bank-statement import;
- units, activity ledger, prices and valuation ownership;
- stale/unpriced states;
- bank-to-investment cash linking;
- performance and tax-awareness limitations; and
- that parcel-level tax outcomes must not be implied before they exist.

### Supporting modules

- Accounts and identifiers.
- Category vocabulary and custom subcategories.
- Classification attributes.
- Rules and review policy.
- Upload history and recovery.
- Provider connection status and history extension.
- Settings, motion, redaction and security/session controls.
- Privacy and AI boundaries.

## Layer 4 — Learn centre

Add a persistent Help/Learn entry point in the signed-in shell. Its information
architecture should initially be:

```text
Learn Halcyon
├── Continue setup
├── Quick overview
├── Getting data in
│   ├── Connect a bank
│   ├── Import a statement
│   └── Add a manual account
├── Understand your finances
│   ├── Dashboard
│   ├── Income and expenses
│   └── Recurring commitments
├── Keep the ledger trustworthy
│   ├── Review and correct
│   ├── Rules and AI suggestions
│   ├── Reconcile transfers
│   └── Split a transaction
├── Investments
├── Privacy and security
└── Restart this page's lesson
```

Requirements:

- show module duration and completion state;
- search titles and keywords when the catalogue becomes large enough;
- allow a completed lesson to be replayed;
- link directly to the relevant route and prerequisite state;
- explain when a lesson cannot currently be practised;
- support short written instructions even when animation is disabled; and
- distinguish product education from support/contact pathways.

## Layer 5 — Optional product overview

Create a two-minute, five-to-six-scene overview that can run without real data.
It should explain:

1. accounts are the sources of financial state;
2. transactions/activity enter through connection, import or manual workflows;
3. classification explains purpose while kind controls accounting behaviour;
4. review and reconciliation protect the accuracy of analytics;
5. Halcyon turns the trusted ledger into dashboard, income, expense, recurring
   and investment views; and
6. previews, audit history and undo keep important changes inspectable.

End with a concrete choice: connect, import or create manually. The overview is
orientation, not a prerequisite and not a tour of every navigation item.

## Example and Learn Mode design

### First release

Use an in-memory, non-persistent example model containing approximately:

- two plainly fictional accounts;
- eight to twelve transactions;
- one uncategorised row;
- one likely internal transfer pair;
- one split purchase;
- one refund or reimbursement;
- one confirmed recurring series; and
- one provisional recurrence hint.

Every example surface carries a persistent **Example data — nothing here will
be saved** label. Example actions never invoke production Edge Functions and
never enter `DataContext` as tenant records.

Use the existing anonymized sample corpus only if its licence/provenance and
privacy suitability are rechecked. Prefer a tiny purpose-written teaching set
whose expected outcomes are easy to verify.

### Later option

An isolated demo tenant could support a fuller sandbox, but it introduces
provisioning, lifecycle, cleanup, RLS, analytics and abuse concerns. Do not
build it until the static/in-memory approach has demonstrated a real need.

## Motion and media specification

### Preferred implementation

- Use Framer Motion for onboarding layout, focus/highlight transitions and
  UI-state explainers, consistent with the existing frontend boundary.
- Keep anime.js confined to chart internals through the existing chart-reveal
  firewall.
- Use animated SVG for explanatory diagrams.
- Use short, locally controlled WebM/MP4 only when replaying the real interface
  is substantially cheaper and remains maintainable.
- Do not add Rive, Lottie or a third-party tour runtime without measuring the
  bundle and documenting why native React/Framer primitives are insufficient.

### Candidate animations

- account → transaction → classification → chart;
- import: map → stage → review → atomic commit;
- two transfer legs joining and leaving income/spending totals;
- a transaction dividing into allocations that sum back to the parent;
- an AI suggestion appearing in preview before explicit acceptance;
- a user rule affecting future matching activity; and
- provider sync advancing through history without duplicating CSV-owned dates.

### Motion rules

- A typical explainer is silent and 8–15 seconds, followed by a real action.
- No essential instruction is communicated only through movement or colour.
- Honour both Halcyon's motion control and `prefers-reduced-motion`.
- Provide a static end-state diagram or step sequence when motion is reduced.
- Substantial autoplay can be paused/restarted; avoid indefinite large-area
  loops.
- Avoid parallax, zoom or sweeping motion in instructional overlays.
- Never celebrate account deletion, financial loss, security changes or a
  reconciliation verdict with confetti or playful reward motion.

## Accessibility contract

All onboarding UI must meet the same or stronger interaction contract as the
existing guarded Ledger dialogs.

- Every overlay or panel has a programmatic name and sensible reading order.
- Keyboard focus moves deliberately, stays within a true modal when necessary,
  and returns to the exact opener where possible.
- Escape dismisses non-essential instruction without triggering an action.
- Spotlight visuals do not make the underlying target impossible to reach by
  keyboard or screen reader.
- Step position is announced as text, such as “Step 2 of 4.”
- Live progress uses restrained `aria-live` announcements.
- Skip, Back, Next, Try it and Done have explicit labels and minimum touch
  targets.
- Completion is not based on hover, drag precision, colour or animation.
- Small screens may use a bottom sheet or inline lesson instead of a tooltip
  whose target is off-screen.
- The full flow works at 200% zoom and with reduced motion.
- Tutorials are tested with empty, partial and dense data states.

## Content and voice rules

- Lead with the user's outcome, not Halcyon architecture.
- Prefer plain financial language; introduce internal vocabulary only when it
  helps the user make a decision.
- Keep overlay copy short: one concept, one action, one optional “Learn why.”
- Put detailed explanation in the Learn centre, not a tooltip.
- State whether an action is preview-only, writes data, affects future rules or
  is undoable.
- Avoid guarantees about returns, tax outcomes, categorisation correctness or
  provider availability.
- Use Australian spelling and the product's established tone without allowing
  the “terminal/operator” motif to obscure meaning.
- Review every lesson whenever its target feature or user-visible vocabulary
  changes.

## Proposed architecture — revalidate before implementation

### Frontend responsibilities

A future onboarding feature area may contain:

```text
app/src/onboarding/
├── definitions/       declarative modules, prerequisites and content versions
├── components/        checklist, lesson panel, spotlight and static diagrams
├── hooks/             progress, eligibility, target registration and events
├── examples/          isolated typed example data and interactions
├── state/             derived completion and session orchestration
└── tests/             pure eligibility/progress and rendered interaction tests
```

Names are illustrative. Keep feature content declarative where it genuinely
reduces drift, but do not build a generic workflow engine before two or three
real modules prove the shared abstraction.

### Stable target contract

Use semantic identifiers such as `data-guide="ledger-review-filter"` or an
equivalent typed registration API. Do not anchor lessons to Tailwind classes,
DOM child positions or visible copy.

Prefer inline or page-owned guidance. Use an anchored spotlight only when a
specific existing control is the subject. A lesson must fail gracefully if its
target is absent: return to the page introduction or mark the step unavailable,
never leave an orphaned overlay.

### Progress storage

Durable progress should be per user, not merely per tenant. A provisional data
shape is:

```text
user_onboarding_progress
  user_id
  tenant_id
  module_key
  content_version
  status             unseen | started | snoozed | completed | dismissed
  current_step_key
  first_shown_at
  last_shown_at
  completed_at
  completion_source  product_state | guided_action | explicit_skip
```

Before adopting this shape, decide:

- whether a module needs one current row or append-only event history;
- how progress behaves across tenants;
- whether tenant deletion cascades are appropriate;
- who may read/write the row under RLS;
- whether a local-only preference is sufficient for dismissals; and
- how content-version upgrades retain or reset completion.

Any persisted mutation must use the normal validated Edge Function boundary.
Do not introduce direct browser writes for onboarding convenience.

### Eligibility and completion

Each module defines:

- supported roles;
- required route;
- required product state;
- exclusion conditions;
- auto-presentation policy;
- snooze/reminder policy;
- completion event or derived state; and
- content version.

Keep durable user progress separate from current product truth. For example,
an account task remains product-state complete even if the user never viewed
its instructional step.

### Routing

- Checklist tasks deep-link through real routes and optional transient route
  state.
- Do not encode private transaction identifiers into shareable tutorial URLs.
- Reloading a route must not replay a dismissed lesson unexpectedly.
- Back/forward navigation must dismiss or restore lesson state predictably.

## Measurement and privacy

### Activation measures

- time to first valid account;
- time to first settled transaction/activity data;
- time to first trustworthy dashboard;
- completion/skip rates for each checklist task;
- import abandonment by workflow stage;
- first classification correction;
- first transfer decision;
- lesson start, completion, snooze, dismiss and replay; and
- error/recovery rates inside guided flows.

### Data minimisation

Never include these in onboarding analytics:

- balances or amounts;
- merchant or transaction descriptions;
- filenames or statement content;
- bank credentials or provider tokens;
- account names or identifiers;
- AI request/response content; or
- free-form profile text.

Record stable event/module keys, coarse path/state and timestamps only. Define
retention and deletion behaviour before launch. Product analytics must not be
smuggled into audit logs whose purpose and retention are different.

### Success criteria

Set numerical targets only after a baseline cohort exists. Directionally, a
successful release should:

- increase the share of new users who reach populated, understandable data;
- reduce abandonment during initial import/connection;
- reduce incorrect account selection and avoidable reconciliation confusion;
- increase successful first review/undo behaviour; and
- reduce repeated help-seeking for concepts covered by a lesson.

Tutorial completion alone is not a success metric.

## Delivery plan

### Phase 0 — Re-audit and contract

**Goal:** validate this shelved plan against the finished product.

- Re-read `CURRENT_STATUS.md`, `INDEX.md`, the design system and all affected
  views.
- Walk every supported new-user path with empty and populated accounts.
- Inventory final feature names, permissions, empty states and known gaps.
- Confirm the activation definition and first release scope.
- Confirm privacy copy, analytics policy and content ownership.
- Record baseline funnel behaviour if real users exist.
- Decide whether to build native components or use a vendor; include bundle,
  privacy, accessibility, selector durability and operating cost in the
  decision.

**Exit criteria:** all readiness gates pass; the owner approves a versioned
onboarding contract and the exact Phase 1 scope.

### Phase 1 — Foundations and Learn centre

**Goal:** establish durable infrastructure without auto-launching complex tours.

- Add the persistent Learn entry point and catalogue shell.
- Implement module definitions, eligibility and content versioning for a small
  real set.
- Implement progress persistence through the validated mutation boundary.
- Add semantic target registration only to Phase 2 targets.
- Add static reduced-motion content and common accessible lesson primitives.
- Add privacy-minimised product events if approved.
- Provide internal-only controls to reset/replay modules in test environments.

**Acceptance criteria:** progress survives sessions, remains per-user, respects
roles, can be reset in isolated tests, and no module starts unexpectedly.

### Phase 2 — Setup gateway and activation checklist

**Goal:** replace provisioning-only onboarding with the first-value journey.

- Implement Welcome/Trust, Identity and Choose a Path.
- Integrate provider, CSV and manual branches with their real production flows.
- Implement state-derived checklist tasks and conditional omission.
- Add resume, hide and replay behaviour.
- Add the first populated-dashboard interpretation module.
- Preserve returning-user and migrated-user behaviour.

**Acceptance criteria:** every supported path reaches a truthful next state;
users can stop/resume; existing users do not repeat setup; no fake transaction
is written; keyboard/reduced-motion journeys pass.

### Phase 3 — Consequential workflow lessons

**Goal:** teach the workflows most likely to affect trust and data quality.

Implement in this order:

1. statement import;
2. Ledger inspect/correct/undo;
3. transfer reconciliation; and
4. rules/AI review.

Each module ships independently with its own eligibility, content, interaction
tests and content-owner sign-off.

**Acceptance criteria:** lessons advance from real actions, fail gracefully when
targets/state change, and never bypass previews, permission checks or undo
contracts.

### Phase 4 — Examples, overview and advanced modules

**Goal:** broaden education after the activation core proves useful.

- Ship isolated in-memory Learn Mode.
- Ship the optional two-minute overview.
- Add splits, recurring and investments modules.
- Add richer animated SVG/UI explainers where usability evidence supports them.
- Add search to the Learn centre if catalogue size justifies it.

**Acceptance criteria:** example mode cannot mutate tenant data; every animation
has equivalent reduced-motion/static communication; advanced claims match the
implemented product exactly.

### Phase 5 — Evaluate and refine

**Goal:** improve observed outcomes rather than increasing tutorial volume.

- Run moderated usability sessions with unfamiliar users across the three
  starting paths.
- Review activation, abandonment, snooze, replay and recovery signals.
- Remove lessons that do not improve behaviour.
- Shorten copy and split overloaded modules.
- Validate small-screen, keyboard, screen-reader, zoom and reduced-motion use.
- Establish a release checklist requiring content review when guided features
  change.

**Exit criteria:** measured activation or comprehension improves without a rise
in frustration/dismissal indicators; ownership and regression coverage are in
place for ongoing maintenance.

## Test strategy

### Pure/unit tests

- eligibility by product state and role;
- checklist completion derivation;
- content-version migration behaviour;
- snooze/reminder timing;
- route/target fallback;
- example-mode isolation; and
- analytics payload redaction.

### Component tests

- focus entry, trap where applicable and restoration;
- keyboard step navigation and Escape;
- missing target behaviour;
- live announcements;
- responsive tooltip/panel adaptation;
- reduced-motion rendering; and
- progress/resume UI.

### Browser tests

- brand-new provider path;
- brand-new CSV path;
- brand-new manual path;
- returning populated user;
- existing user with an incomplete checklist;
- member/viewer permission variants when supported;
- empty versus dense content;
- refresh, sign-out/sign-in and back/forward during a module;
- failed provider/import action and recovery;
- lesson dismiss, snooze, replay and content-version update; and
- example mode proving zero application-data writes.

### Release gate

Extend the isolated golden harness rather than using the persistent personal
database. At minimum, the golden path should prove:

- signup/session → setup gateway → first account/data path;
- checklist state derived from real writes;
- one contextual lesson driven by an actual guarded action;
- persistence after reload/sign-in;
- no browser errors or missing targets;
- exact cleanup of the fixture tenant/user; and
- no effect on existing ingestion, classification, transfer or undo contracts.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tutorials become stale after UI changes | Semantic targets, page-owned modules, content versions and feature-owner review |
| Too much instruction delays value | Mandatory gateway stays short; checklist and advanced lessons are optional/resumable |
| Popovers obscure complex controls | Prefer inline panels; test responsive and keyboard behaviour; use spotlights sparingly |
| Users confuse examples with real data | Persistent example label, isolated in-memory model, zero production mutations |
| Animation harms access or performance | Existing motion preference, `prefers-reduced-motion`, static equivalents, bundle budgets |
| Progress disagrees with real state | Derive task outcomes from product state; store education progress separately |
| Role-specific actions fail | Eligibility includes permissions; browser coverage for each supported role |
| Analytics capture financial content | Allowlisted event schema and tests rejecting sensitive properties |
| Third-party tour dependency affects privacy/bundle | Native-first evaluation and explicit architecture decision before adoption |
| Onboarding starts before product stabilises | Readiness gates and explicit owner approval are mandatory |

## Explicit non-goals

- Teaching general budgeting or providing personal financial advice.
- Explaining every chart, filter and setting during the first session.
- Using completion rewards to manipulate engagement.
- Building an unrestricted CMS or generic no-code tour builder.
- Writing sample records into a user's real tenant.
- Replacing good labels, empty states and helper copy with tutorials.
- Using onboarding to conceal an unfinished or inconsistent workflow.
- Shipping lessons for deferred features before those features exist.

## Decisions to make when the plan resumes

1. What exact event defines Halcyon's “first trustworthy dashboard”?
2. Which starting paths will the first public release support?
3. Is a callsign valuable enough to remain in mandatory setup?
4. What account-type language is clearest to non-expert users?
5. Which provider/privacy/AI disclosures require legal review?
6. Which tenant roles exist in the release and who can complete each task?
7. Will progress use a current-state row, append-only events or both?
8. What first-party product analytics, if any, are acceptable?
9. What motion and initial-load bundle budgets must onboarding meet?
10. Which three lessons ship first after the activation checklist?
11. Is in-memory Learn Mode sufficient, or is an isolated demo tenant justified?
12. Who owns tutorial content review whenever a feature changes?

## Definition of done for the onboarding programme

The programme is complete when:

- every supported new user can choose an appropriate setup path and resume it;
- the activation checklist reflects real product state and reaches a useful,
  understandable dashboard;
- consequential workflows have concise, contextual and replayable education;
- the Learn centre provides permanent access to current guidance;
- examples are isolated from real data;
- progress and measurement respect tenancy, permissions and privacy;
- keyboard, screen-reader, zoom and reduced-motion journeys are verified;
- unit, component, browser and isolated golden gates pass;
- feature changes have a defined tutorial-content review process; and
- observed users can complete the core journey without facilitator rescue.

The programme is not complete merely because every tutorial can be clicked
through.

