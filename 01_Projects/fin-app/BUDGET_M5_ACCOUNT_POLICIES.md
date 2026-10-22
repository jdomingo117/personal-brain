---
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: account-scope-implemented-policy-gate-partial
project: Halcyon
created: 2026-10-21
updated: 2026-10-21
related:
  - "[[BUDGET_M5_LIFECYCLE_CONTROL]]"
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[BUDGET_M0_CONTRACTS]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# Budget M5 — effective-dated account policy

Continuation: [BUDGET_M5_CATEGORY_ROLLOVER.md](BUDGET_M5_CATEGORY_ROLLOVER.md) now implements
the category/Other signed rollover and carry-disposition slice. The verification and remaining-work
statements below describe the earlier account-scope checkpoint; consult the current implementation
plan for the live M5 backlog. General bill/reserve/goal archive remains separate work.

## Scope and authority

The owner requested the remaining M5 effective-dated policy work. This continuation implements
**account scope**, the first part of that gate: explicit dates, full server-calculated before/after
effects, authoritative preview validation, atomic save and compatible undo. It does not mark the
entire policy gate or M5 complete. Category/Other signed rollover, reserve/line disposition and
archive flows remain separate unfinished contracts; existing boundary review carry is unchanged.

The frozen BUDGET-V1-2026-10-20 scope is unchanged. No M6 advancement, public exposure, personal
database query/migration or deployment is authorized by this implementation.

## User control contract

**Which accounts your budget uses** distinguishes activity accounts from named savings destinations.
Account balances are not imported as new income or reserve credit. Activity and destination roles
are independent and may name the same owned AUD account without duplicating the source movement.
No connected account is mandatory; manual plans remain available and explicitly qualified.

The owner selects a complete account set for each role and one date scope:

| Choice | Effective interval | Preserved intent |
| --- | --- | --- |
| Future budgets only (default) | `[selected end, onward)` | Current/past activity scope remains unchanged |
| Only this budget | `[selected start, selected end)` | Previously saved future account choices resume at the end boundary |
| This and future budgets | `[selected start, onward)` | Earlier dates remain unchanged; any saved future account choices are explicitly replaced |

Only the latest in-progress or future saved period can initiate the edit. Historical periods stay
read-only; no arbitrary date or whole-history reset is exposed. Monthly/fortnightly/bridge windows
use their saved exact dates, not inferred month labels or elapsed-hour arithmetic.

A pending frequency change must be cancelled before account editing, then re-reviewed against the
new dated membership. Conversely, a frequency change scheduled after an account policy uses those
same dated memberships. There is no hidden rebase, auto-merge or silent invalidation of pending intent.

## Preview, save and evidence

- **Review account effects** is an owner-only, version-bound read workflow. SQL evaluates all saved
  periods and one exact next window from the existing continuing template, before and after the
  proposed account choices. No capped ledger array or client aggregate is substituted for SQL.
- The next window is explicitly hypothetical/provisional. Its allocations do not repeat one-off
  drawdown or opening reserves. It does not create a saved period or predict a bank balance.
- Source facts include complete earned income, gross/credited/net expense and pending effects,
  every allowance/reserve/funding result, category partition facts, exclusions/unassigned credits,
  match validity, source availability, coverage, carry and changed-review status. Reviewed snapshots
  are not rewritten, and planned allocations/templates remain unchanged.
- Removing an account can invalidate a matched expense and its linked refund. Original claims,
  immutable source identities and reversals remain in history. Invalid evidence supplies no live
  capacity, reserve usage or achievement. An unmatched credit remains separate rather than being
  guessed into everyday money. Explicit manually confirmed funding is not bank-verified evidence.
- SQL uses rollback-only subtransactions for hypothetical membership and next-period changes.
  The preview leaves no periods, revisions, memberships, plan versions, operations or policy events
  behind. Ordinary workspace reads do not create periods. Errors roll back the whole preview.
- The server hashes canonical effect results, intent and opaque source/plan versions. Save recomputes
  the preview under the tenant source gate; a hash supplied by the browser is never trusted as an
  authority. Changing roles, dates, source evidence or plan invalidates the prior confirmation.
- Save requires explicit impact acceptance and, when any affected result is incomplete/unavailable,
  a separate qualification. Unknown is not zero, complete history or verified savings.
- The operational membership projection is split at exact half-open boundaries. Non-overlap is
  enforced by SQL exclusion constraint; selected IDs are distinct, same-tenant owned AUD accounts.
  No source account FK or source row lock is acquired after the source gate.
- One source/plan-guarded transaction updates that projection, increments plan version, validates
  the full saved/next-window effects and appends policy/operation records. History insertion failure
  rolls back memberships and version too. Concurrent previews can exist; only one same-version
  save wins. Exact request replay returns the same receipt before exposure/version checks.
- Undo restores the exact prior dated membership projection and appends compensation; it does not
  delete the policy, a review, source transaction or receipt. The undo impact record reverses the
  before/after direction. Later source/plan changes or another compensation reject undo.
- Existing private reader bounds remain explicit: 100 selected accounts per role and 500 dated
  membership rows. An over-bound result is rejected, not committed and truncated. General scalable
  history/performance/resumption work remains a separate M5 gate.

## Durable implementation

Migration `20261022030000_budget_account_policies.sql` is migration **77**. It adds:

- append-only `budget_account_policies` with tenant-member SELECT and no anonymous/client writes;
- non-overlapping effective `budget_account_memberships` projection windows;
- service-only `budget_replace_account_scope`, `budget_scope_facts`, `budget_scope_impact` and
  `budget_preview_account_scope` helpers;
- `set_account_scope` and its compensation around `budget_command_frequency`;
- a latest-policy summary around `budget_details_frequency`.

`query-budget` exposes strict Zod `preview_account_scope`; SQL separately requires verified owner.
`manage-budget` adds strict `set_account_scope` with preview hash and two acceptances. Existing
withAuth role/tenant/rate/body guards, exact-request recovery and sanitized audit logging remain.
No direct browser PostgREST mutation/RPC is introduced. Default Budget flags remain off.

## Responsive interaction handoff

The design-handoff skill guided the interaction states and responsive specifications:

- `BudgetAccountPolicy.tsx` sits in the existing lifecycle surface, behind **Change budget accounts**.
  Native radios choose scope; labelled checkboxes choose each independent account role. There is
  no instant filter toggle that silently rewrites the financial scope.
- Existing `outcome-panel`, `body-copy` (15px), `detail-copy` (13px), `field-label`, `hair`, semantic
  warning/error and Button tokens apply. Sections use existing `space-y-3/4` and `gap-5`; account
  roles stack below `lg`/1024px and use two columns above. No new colour or animation system.
- Controls retain 44px targets, native keyboard behavior, visible labels/focus and logical DOM
  order. No modal focus trap, custom swipe or colour-only indication is needed. Unavailable or
  non-AUD selections can be removed but cannot be newly selected as eligible accounts.
- The form marks a real preview request `aria-busy`, announces meaningful status and exposes
  local errors as alerts. No invented progress/percentages. Preview sections retain semantic
  description lists and captioned tables with local horizontal scroll at narrow widths.
- Source/plan refresh invalidates preview/acceptances while retaining local account choices.
  Request-generation guards ignore stale/unmounted preview responses. Preview failures retain
  choices; a refresh failure keeps last verified workspace facts qualified.
- Busy/unknown writes use the established exact-body/key checkpoint and prevent replacement saves.
  Reload can recover the committed outcome. Unsaved previews warn on unload/period navigation;
  leaving locally changes no saved account data. Save/undo never moves money.
- Policy summary survives reload and names effective dates. Only the latest compatible saved
  account change offers Undo; the confirmation explains restoration rather than deletion.

`budgetAccountPolicy.ts` contains types and pure boundary/qualification/version helpers. It never
reduces source transactions. SQL and browser tests are in `test-budget-account-policies.mjs` and
`test-budget-account-policy-interactions.mjs`, invoked only through the guarded lifecycle runner.

## Closure boundary

Final verification:

- **284 isolated SQL/Edge/real-browser checks passed across all 77 migrations** on
  `halcyon-budget-m2-fee506dd460645d4`, API 57421 / DB 57422. This includes prior M2–M5 regressions,
  complete before/after income/spend/reserve effects, rollback-only previews, linked refund
  invalidation, exact scope windows, concurrent saves, disabled receipt replay, immutable policy
  records, reverse-direction undo history, failed-save rollback, foreign/non-AUD/duplicate IDs,
  owner-only previews, pending-frequency conflict and qualified manual planning.
- Actual signed-in browser checks cover current-only/future-only dates, pending and signed category
  effects, dirty navigation, required acknowledgements, save/reload/undo, unchanged allowances and
  stale-save input retention with preview invalidation. No runtime errors or phone page overflow.
- **486 unit tests passed, 14 existing skips**. Focused Budget TypeScript and production build pass.
  Full-app TypeScript retains the known unrelated `StrategicProjections.tsx:252` metric-name mismatch;
  the existing >500kB chunk warning remains. No unrelated type/chunk fix was made.
- Inspected 390px phone and 1440px desktop captures:
  `/tmp/halcyon-budget-account-policy-phone.png` and
  `/tmp/halcyon-budget-account-policy-desktop.png`. The existing tokenized inline/disclosure design
  remains intact. A final wording refinement removes implementation jargon from the form.
- The runner removed only captured fixture identities/tenants and verified zero remaining fixture
  accounts, transactions, Budget plans and source gates, then removed its exact generated project
  resources. Follow-up project-label container and volume checks were empty. Earlier test targets
  were also cleaned. No personal stack query/migration or flag enablement occurred.

This is engineering implementation of account scope, not independent human/accessibility approval.
The remaining policy work is category mapping/Other signed rollover, prospective policy change and
explicit retained/released/transferred carry dispositions. Budget pause/resume, archive/attention,
realistic complete-chain performance/resumption and wider temporal integration remain M5 gates.
Do not advance to M6 or enable the personal stack because this account slice is verified.
