---
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: category-rollover-implemented-m5-gates-open
project: Halcyon
created: 2026-10-21
updated: 2026-10-21
related:
  - "[[BUDGET_M5_LIFECYCLE_CONTROL]]"
  - "[[BUDGET_M5_ACCOUNT_POLICIES]]"
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
---

# Budget M5 — category and Other signed rollover

## User contract

This slice implements the authorized category/Other signed rollover and explicit carry
disposition work. It stays within BUDGET-V1-2026-10-20. General bill/reserve/goal line archive,
budget pause/resume, attention controls and large-history performance remain separate M5 gates.

**Rollover and category settings** is an inline section in the existing lifecycle workspace.
The owner chooses what happens at the next exact saved budget boundary, then at each boundary
until another policy takes effect. The current and historical category partitions are preserved.
The latest saved budget can schedule rules even when it has ended; an earlier saved period cannot.
Changing a future policy explicitly replaces choices at that boundary and later dates.
Parent controls can roll all active balances forward or keep all active positive balances aside;
they set the child/Other rules prospectively and still require the same preview and confirmation.
Removed categories keep their explicitly chosen destinations when these shortcuts are used.

| Choice | Positive balance | Negative balance |
| --- | --- | --- |
| Roll the signed balance into this category | Adds to that category's next budget room | Reduces that category's next budget room |
| Keep positive money aside; shortfalls reduce Other | Protected from everyday spending; also preserves earlier protected money | Reduces Other, with the signed shortfall displayed separately; never labelled savings |
| Move the signed balance to another category | Credits the selected next category or Other | Debits the selected next category or Other |
| Start fresh; keep the signed variance in history | Releases the budget reservation | Records the shortfall as released variance rather than silently erasing it |

These are budget reservations, not bank movements, earned income, verified savings or proof of
affordability. Starting fresh does not repay debt or improve the bank balance. A retained rule
keeps new positive leftovers aside each boundary as well as preserving previously protected money.
It does not silently use that protected money to cover later category overspending. To use held
money, the owner changes its route explicitly to carry, transfer or release at a later boundary.

The optional **Categories in the next budget** disclosure supports complete next-period category
amounts, existing global/custom subcategory scopes, additions and removals. Limits partition the
future everyday allowance; they never increase it. Parent/child overlap is rejected. Removing a
category leaves an explicit balance rule for its stable identity, including any protected rights.
Future spending in a removed category becomes Other. Replacement scopes receive a new identity.
Server-owned identity/label snapshots keep a removed category recognisable after later periods open,
including when its amount is still protected. Historical identities cannot be remapped to a new scope.

Once an ongoing policy exists, the old current-only Category limits editor is disabled with a
handoff to these prospective controls. This prevents a legacy removal from silently remapping
carried rights. Completed-period review remains available; it records results without offering a
second whole-pool carry choice that would override or duplicate category rules.

## Accounting and temporal rules

- `budget_partition_chain` derives the complete saved chain through the selected period from
  canonical SQL actuals and the existing M4 residual category partition. Earlier reviews remain
  immutable; late source corrections recompute derived category/Other/held balances.
- At each policy boundary, a source's closing balance has exactly one route. All source balances
  are evaluated together before crediting destinations, so A→B and B→A cannot cascade or duplicate.
- New category allowance, signed opening carry, settled usage and closing remainder are separate
  fields. The everyday spendable remainder is the sum of category and Other remainders. Protected
  positive money is reported separately and is excluded from this spendable pool.
- An unchanged retained balance stays protected across later periods. A later explicit transfer
  restores it once; it cannot become recurring new income or a repeated one-off credit. A negative
  correction remains a visible obligation. Unknown history yields unavailable carry/protected
  amounts rather than inventing zero.
- Pending activity remains provisional source information; it is not settled carry. Unassigned
  credits remain separate. Existing explicitly matched everyday refunds follow the M4 residual
  accounting convention (Other); this slice does not invent category provenance for those credits.
- Until a policy first takes effect, existing fresh/whole-pool review behavior remains compatible.
  At an effective boundary the category routes take precedence. Reserves and purchase-goal funding
  retain their separate M4 lifetime accounting.
- Ordinary next-budget creation, hypothetical next-budget previews and monthly/fortnightly
  frequency adapters resolve the same dated category configuration. Both frequency templates must
  fit their new-resource pools. No monthly/2 arithmetic or change to original period dates.
- A pending frequency intent blocks policy editing; cancel it and review the new policy before
  re-scheduling. A policy saved first is used by the later frequency preview/application.
- Safe-cent checks cover every derived boundary, including protected and released amounts. No
  truncated source list, client transaction reducer or newest-period-only accounting is used.

## Durable boundary and security

Migration **78**, `20261022040000_budget_category_rollover.sql`, adds append-only
`budget_rollover_policies`, tenant-member SELECT RLS, zero browser mutation grants and service-only
helpers. Each immutable event stores the complete effective timeline and reviewed impact; undo
appends a compensating timeline rather than editing/deleting history.

`budget_preview_rollover` verifies owner, tenant, method, source and plan versions. It checks exact
partition identities, taxonomy scope ownership, overlap, amount capacity, complete routes, valid
targets and the latest saved period. Up to 50 next categories and 200 retained routing identities
are supported explicitly; over-bound inputs fail rather than being silently truncated.

The preview evaluates all saved windows and one clearly hypothetical next window before/after.
Temporary policy and period rows are rolled back. The server hashes canonical intent, dates,
versions and financial effects. `set_rollover` recomputes that preview under the tenant source
gate, requires impact acceptance plus separate incomplete-history acceptance, then atomically
appends policy/operation/receipt and advances the plan. A failed validation/history write rolls
back the whole command. Exact request replay precedes exposure/version checks. Compatible undo
restores the prior timeline; later dependent period/plan/source changes prevent it.

Strict Zod `preview_rollover`/`set_rollover` payloads pass through `withAuth` and the existing Edge
Functions. The browser never writes tables or invokes mutation RPCs. Source rows are not locked
after the tenant gate, and no new source FK reverses the established source-writer lock order.
Other financial writes validate the resulting next-window partition before committing.

## Responsive handoff

The design-handoff skill guided these implementation states:

- Existing `outcome-panel`, `body-copy`, `detail-copy`, `field-label`, input, hair and semantic
  tokens; native selects, checkboxes and existing Button. No new colour or animation system.
  Each rule has a visible explanation below the selector so narrow displays do not hide its meaning.
- Next-category editing stays in an optional native disclosure; everyday balance routing stays
  visible. Amounts/controls stack on phone; category entry uses three columns at `lg`/1024px.
- Preview shows saved windows and a next window opened by default, before/after spendable/held/
  released figures, every signed route and next partition opening/new/remaining figures. Semantic
  captioned tables scroll locally on narrow displays, without shrinking currency values.
  Route rows separate this period's balance from money already kept aside, including an explicit
  retained-money/shortfall breakdown. User-facing date ranges show their inclusive last day.
- Required explicit impact confirmation, plus missing-history confirmation where needed. No save
  until a fresh preview matches the exact intent and opaque version strings.
- Source/plan refresh invalidates preview/confirmation while retaining edits. Request-generation
  guards ignore stale/unmounted responses. Errors remain local with `role=alert`; real read work
  has `aria-busy` and meaningful status text. Unknown writes use the existing exact recovery key.
- Dirty period navigation/unload is guarded. Leaving the inline form returns keyboard focus to
  its trigger. Native controls preserve normal keyboard order, visible focus and 44px targets.
- Empty category lists still expose Other. Removed identities remain named in the rule list.
  Unavailable amounts say Unavailable, never zero. No new modal or swipe interaction.

## Verification and closure

Final verification:

- **322 isolated SQL/Edge/real-browser checks passed across all 78 migrations** on
  `halcyon-budget-m2-187e4ce8de314ac5`, API 57421 / DB 57422. Includes earlier M2–M5 regressions,
  exact child/Other signed carry, no parent duplication, removed-category protection and labels,
  later one-time restoration, retained money surviving a new shortfall, late corrections and
  immutable reviews, unavailable-source suppression, authoritative hash/acknowledgement checks,
  concurrent saves, disabled receipt replay, guarded compensation, failed final history-write
  rollback, tenant/owner isolation and category identity/target validation.
- Dated limits are exercised by real frequency scheduling with a smaller future category amount,
  and by actual boundary application against an explicitly seeded ended-period pending fixture.
  That fixture represents passage of time; it does not alter the production clock or claim the
  browser waited through a real boundary. Future category/allowance capacity failures roll back.
- Real authenticated phone/desktop journeys exercise the parent shortcuts, signed previews,
  required impact/incomplete-data acknowledgement, save/reload/undo, removal with a destination,
  confirmation invalidation, dirty navigation, restored trigger focus and no page overflow/runtime
  errors. The JSON field-order regression is covered by the pure preview-binding test and real
  server response. No browser mutation RPC or mocked application write is substituted.
- **490 unit tests passed, 14 existing skips**. Focused Budget TypeScript and production build
  pass. Full-app TypeScript retains only the known unrelated `StrategicProjections.tsx:252`
  `net_worth`/`netWorth` mismatch; the existing >500kB main-chunk warning remains.
- Inspected 390px phone/1440px desktop captures at `/tmp/halcyon-budget-rollover-phone.png` and
  `/tmp/halcyon-budget-rollover-desktop.png`. Controls use the existing tokens and local table
  scrolling; selected-rule explanations remain visible outside narrow native selects.
- Captured fixture identities/tenants were removed, and the runner verified zero remaining fixture
  accounts, transactions, plans and source gates. Only its identified generated project resources
  were removed. Earlier failed/intermediate targets were also cleaned; container/volume label
  checks were empty. No personal database query/migration or feature flag enablement occurred.

This closes the requested category/Other rollover and carry-disposition implementation slice.
General bill/reserve/goal line archive/disposition, budget pause/resume, attention acknowledgement/
snooze, wider temporal/goal integration and realistic full-chain performance/resumption remain
M5 work. Independent human/accessibility, backup/migration and rollout remain M7. Budget flags stay
off by default; this is not authorization for M6 advancement, personal migration or public rollout.

Subsequent continuation: [[BUDGET_M5_BUDGET_LINE_CONTROLS]] closes general line archive/disposition
and budget pause/resume with 360 isolated checks across 79 migrations. Attention, wider integration
and performance/resumption remain open M5 gates; use that newer checkpoint for the current resume point.
