---
aliases:
  - Budget Bills Reserves and Goals
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: m4-engineering-complete
project: Halcyon
created: 2026-10-21
updated: 2026-10-21
related:
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[BUDGET_M0_CONTRACTS]]"
  - "[[BUDGET_M3_MANUAL_WORKSPACE]]"
  - "[[BUDGET_GUIDANCE_AND_GOALS]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# Budget M4 — bills, reserves and savings goals

## Status and authority

The owner authorized M4 and subsequently requested closure of its remaining items on 21 October
2026. **M4 is engineering-complete:** manual bills/reserves/goals, the production recurring adapter,
bank-to-investment evidence, remaining presentation controls and the expanded interaction checks
are implemented and verified on a disposable stack. **187 combined SQL/Edge/browser checks passed
across 73 migrations; 470 unit tests passed with 14 existing skips.** Focused Budget TypeScript and
production build passed. The earlier manual-core checkpoint below is retained as history, not an
open gate. M5 is the next implementation phase, once authorized.

Frozen public scope **BUDGET-V1-2026-10-20** is unchanged. This record is not personal migration,
flag enablement, public rollout, financial advice or independent usability approval. No personal
database read, reset, migration or fixture work was performed.

## Implemented user experience

The authenticated Budget page adds **Bills and things you’re saving for**, with optional actions
to save for something, add a bill, create a set-aside fund or plan a transfer. Existing simple M3
allowances can be finished without creating a second reserve line.

### Bills

- A user explicitly confirms a name, amount per payment, anchor date and cadence. Supported
  cadences: once, weekly, fortnightly, monthly, quarterly and annual.
- Calendar schedules retain the desired day through short months; weeks and fortnights advance
  actual local dates. A five-occurrence month allocates five payments, not a monthly equivalent.
  Non-bill contribution allocations also count actual dates in the budget window.
- Current and next-full-period amounts are computed separately. Changed prices/dates do not silently
  alter a saved plan. The form reviews impact on current and future resource gaps before save.
- Each bill displays due dates, expected amount and explicitly matched charge amount. Claims retain
  schedule revision and due-date identity. Replacing a schedule does not silently rematch old charges.
- Optional links to an existing managed recurring override are contextual. Its amount/cadence or
  stopped-state change raises a before/after proposal. **Review bill update** pre-fills an editable
  review; only saving changes Budget. Nothing cancels the merchant or edits the Expenses override.
- These controls retain the approved D03 **manual-confirmation fallback**. The completed server
  history detector and reviewed suggestions are described in the closure section below.

### Goals and reserves

- Named goal/fund, target or unknown price, estimated-cost label, optional money-needed date,
  regular contribution amount/cadence/anchor and explicit dated opening earmark.
- Unknown-price goals are drafts with no fabricated target/date or new allocation. Zero/paused
  contributions do not invent a finish date. A date-led amount counts actual contribution dates,
  including the current saved window where applicable; users explicitly choose to use it.
- **Planned this period**, **Set aside in your budget**, **Transfers matched** and **You’ve confirmed**
  remain separate. A conditional timing explanation and labelled target track do not guarantee cash
  affordability. Missing coverage qualifies progress; unavailable source accounts suppress derived
  reserve/remaining figures instead of replacing them with zero.
- Pause preserves current reserve intent and stops future contributions. Target/price/date/amount
  edits are reviewed. One-off current allocation additions remain available in My plan's period-only
  editor; changing item schedules reviews the current and continuing plan explicitly.
- A matched partial purchase consumes the existing reserve once. Linked refunds restore the matched
  reserve on their booking date, up to the remaining purchase amount. Explicit purchase completion
  preserves achievement and stops future refill. Refunds never automatically resume contributions.
- Optional existing Planning-goal links preserve context only. No Planning event/scenario write is
  made, and a purchase goal is not a second B06 contribution.

### User control and matching

- Match recorded expense/split, purchase, refund, funding transfer or explicit exclusion. Native
  selectors show dates, descriptions and remaining claimable amount. Details use stable cursor
  pagination (50 entries/page plus `has_more` and complete SQL count), not capped ledger aggregates.
- A confirmed/automatic, unambiguous AUD bank transfer pair is one funding source. Either account
  leg cannot be claimed again; cent-exact divisions can fund different lines only within the shared
  source capacity. Funding proves an existing allocation; it never creates a second reserve credit.
- Dated manual confirmations are labelled user evidence, not verified bank transfers. One stable
  confirmation can be divided only within its recorded capacity. The UI warns against reconfirming
  an already matched amount; software cannot prove that two independent manual assertions refer
  to the same physical cash, so it makes no such guarantee.
- Existing matches are inspectable/reversible. Source deletion, pending/kind/split changes or broken
  transfer evidence leave immutable identity/history and expose changed evidence rather than
  blocking Ledger corrections or silently matching a new transaction by amount.
- **Move an allowance** transfers unused new allocation atomically between explicit source/destination
  lines, current period only. A separate explicit choice releases existing reserve rights, preserving
  equal signed debit/credit legs and showing reduced protection. No bank movement or new income is
  created. Compatible undo appends compensation, never deletes source history.
- Optional whole-category, global-subcategory and tenant-custom-subcategory limits partition the
  everyday pool. The UI offers explicit replacement of overlapping scopes. The server rejects
  overlaps, foreign/custom mismatches, duplicate identities and totals above the pool. Removing a
  partition returns its allowance and activity to Other, preserving the parent total and signed
  category overage. Released reserve rights are shown separately from new allocation.
- Latest compatible undo is discoverable after reload; it is owner-only and guarded by both source
  and plan versions. Later changes cannot be erased by replaying an older undo.

## Durable model and commands

Six additive M4 migrations (73 total in this repository), applied only to disposable projects:

| Migration | Responsibility |
| --- | --- |
| `20261021000000_budget_items_and_evidence.sql` | Six append-only tables; canonical parent/split activity, valid bank-pair/manual evidence, live-claim validation and dated occurrence generator |
| `20261021010000_budget_item_commands.sql` | Extend the existing owner/receipt/source-gate boundary; save items, claims/confirmations/reversals, allocation/reserve moves, limits and guarded compensation |
| `20261021020000_budget_item_reads.sql` | Consistent item facts, reconciliation, due occurrences, evidence, taxonomy scopes, contextual links, latest compatible undo and stable source pagination |
| `20261021030000_budget_investment_evidence.sql` | Confirmed investment purchase proof, shared bank-debit capacity and investment source invalidation |
| `20261021040000_budget_recurring_evidence.sql` | Complete counted, bounded parent-history evidence with tenant/source/plan guards |
| `20261021050000_budget_item_presentation.sql` | Stable detector context, one optional featured goal and preservation of period-only additions during metadata edits |

New tables: `budget_item_revisions`, `budget_manual_funding`, `budget_source_claims`,
`budget_claim_reversals`, `budget_limit_revisions`, `budget_reserve_moves`. All have tenant-member
read RLS, zero anonymous grants and no authenticated mutation privileges. Actor anonymization is
allowed; financial revision updates are rejected. Composite Budget relations enforce ownership.
No source transaction/account FK can prevent import undo or reverse the source-row/gate lock order.
Original source identity and fingerprint are retained instead.

`budget_command_m2` retains the original command implementation behind the extended wrapper.
Existing request receipts are still checked before mutable versions or feature exposure. New
commands share the tenant source gate, owner check, expected plan/source/method, transaction,
durable receipt and no-new-write-disabled contract. Strict Edge Zod schemas are in `budgetApi.ts`;
SQL independently revalidates item, account, taxonomy, source, capacity and ownership facts.

No claim depends on a browser pre-read being current. Server reads occur after acquiring the gate;
concurrent claim/undo/reallocation conflicts either commit one complete result or roll back. Amount
checks include derived reserves and remaining values **before commit**, preventing a saved state
that only overflows on the next read. Request retries preserve exact payload/key via M3 recovery.

Source totals still follow `transactions_analytic` kind/transfer semantics and split child
replacement. The adapter reads custom-subcategory identity from the canonical parent table because
the existing analytical view predates that column; it does not replace the shared view. Assigned
spending leaves the everyday pool once; excluded spending and unassigned credits remain explicit.
Funding is not an expense. Refund restores do not count as new earned income.

`workspace` appends a dedicated `budget_details` read guarded against the snapshot's exact plan and
source versions. A change between the two reads fails the workspace refresh, retaining the last
verified view. It never mixes unrelated reads under an unqualified “fresh” status. Server JSON
aggregates are complete; page limits apply only to source inspection.

## Frontend/design handoff

- `components/BudgetItems.tsx`: goal/bill/fund/transfer cards, native target track, item/review tasks,
  recorded activity matching, category scopes, movement/release and latest compatible undo.
- `lib/budgetItems.ts`: typed read contracts, exact dated allocation preview, date-led contribution
  calculation and existing M1 conditional goal timing. No concept fixtures, fake clock, AI or capped
  `DataContext` ledger aggregate is used.
- `BudgetContext` provides paginated source reads with version comparison and preserves the existing
  command checkpoint/recovery boundary. No browser RPC or application-table mutation is introduced.
- Task panel is portalled to the document root to avoid the animated screen's clipping mask. It is
  at most **560px**, full-width on phone, viewport-height, with **20px** padding and a fixed header
  above a separately scrolling body. Native inputs/actions are at least **44px**.
- Existing Archivo/Hanken, glass/input/hair/track/accent-ink/warn/neg tokens are reused. No hardcoded
  new colour, hover-only meaning, fabricated progress percentage, new chart engine or novelty motion.
  The native labelled progress track has theme-aware browser-specific fill styles.
- Modal initial focus, Tab/Shift-Tab trap, Escape, dirty-close confirmation and opener/fallback
  restoration reuse the shared focus hook. Its disabled-control filter now also respects inherited
  disabled fieldsets. Native labels retain concise accessible names; help text is adjacent content.
- Failed saves preserve form state; unknown results do not offer a pretend cancellation. The user
  can close the task, check the retained original request, and return to the verified saved plan.
  Empty/manual/no-price/zero/incomplete/deleted-source/read-only states explain what is missing.

## Initial manual-core verification (historical checkpoint)

`npm run test:budget:items` runs the guarded disposable provisioner with M4 SQL/Edge checks and
the real signed-in desktop/tablet/phone regression suite. No personal environment file is copied;
API 57421 / DB 57422 / non-reused browser 57300 are independently identified. Fixture cleanup uses
captured IDs and exact generated project labels. Earlier failed disposable runs were also removed.

Final combined run: **154 isolated integration/browser checks passed**, replaying **70 migrations**
in `halcyon-budget-m2-ea03100b4bb24e78` (the provisioner retains its M2 prefix). It includes the M2/M3
regressions plus five-weekly-date allocation, next-window counts, reserve/purchase/refund identity,
bank/manual capacity divisions, concurrent confirmations, balanced release/undo, signed limits and
limit removal, compatible goal pause/purchase undo, deletion invalidation without source FKs,
cross-tenant denial, unknown-price drafts and whole-command derived-overflow rollback. The real phone
flow creates a goal, confirms savings without a second reserve credit, reloads and exposes compatible
undo. Cleanup removed only its captured fixtures and generated project resources.

**459 unit tests passed, 14 existing skips**, including 12 new dated schedule/goal-preview tests.
Focused workspace TypeScript and production build passed. The known unrelated full-app
StrategicProjections metric mismatch and large-chunk warning remain. A phone goal capture was
inspected; this is engineering QA, not a full visual/accessibility or independent usability sign-off.

**Gates identified at the initial checkpoint — closed by the additions and verification below:**

1. Extract the D03 production recurring-detector kernel and query complete bounded historical parent
   evidence, including annual/dormant/price-change parity and explicit limits. Current managed-source
   proposals/manual confirmation are useful but are not proof of this adapter.
2. Extend funding evidence to confirmed bank-to-investment activity, with corresponding source
   invalidation/ambiguity/capacity tests. Current bank-pair and user-confirmation evidence must not be
   relabelled as investment verification.
3. Extend browser verification of the newer bill/proposal, category/custom-subcategory replacement,
   reserve-release, purchase/refund and latest-undo controls, including keyboard/dirty/error cases.
   Existing SQL checks are not a substitute for these rendered flows or independent usability.
4. Reconcile the remaining B10 presentation controls (including optional featured goal) and M4
   acceptance traceability before advancing to M5. Human/assistive-technology, realistic performance,
   backup/migration and rollout sign-off remain M7 gates, not successes inferred from screenshots.

The following closure addresses these gates. It does not deploy to personal data or claim M5
lifecycle/carry/frequency workflows are implemented.

## Adapter and presentation closure — 21 October 2026

The owner subsequently authorized closing the four gates above. Implementation and final combined
verification are complete. The initial 154-check result above is the historical manual-core
checkpoint; the final result for these additions and regressions is 187 checks.

### D03 production recurring adapter

- `lib/recurringSignal.ts` is the pure detector used by Expenses and mirrored byte-for-byte in
  the Edge runtime, with identical `cadence.ts` and `stats.ts` vocabulary. It takes explicit dated
  charges and today; no UI/account decoration, wall clock, AI or financial-report total is imported.
- Existing thresholds remain: three observations, 60% gap conformance, unchanged cadence windows,
  amount CV below 0.4, fixed below 0.12 and dormancy beyond 1.5 cycles. A linear prefix/suffix
  Welford price-step scan replaces repeated segment copies. Existing Expenses tests and new
  server/client vectors cover monthly/annual, dormancy, price changes and calendar advancement.
- `20261021040000_budget_recurring_evidence.sql` adds service-only `budget_recurring_evidence`.
  Under the source gate it verifies tenant membership, plan and exact source/plan versions. It
  reads historical **parent** expenses from currently selected AUD activity accounts: ordinary
  detection uses 364 days back; only Annual uses the isolated 3×366-day history. Budget membership
  need not have existed when the older charge occurred. Pending/transfers/future rows are excluded;
  mixed-kind split parents are not treated as whole expense commitments, and children never become
  duplicate recurring bills.
- SQL returns complete group/observation counts. At most 100 stable account/merchant groups and
  256 observations per group enter detection. An over-limit merchant receives no sampled charge
  array and an explicit manual-confirmation state; group overflow states the complete count and
  manual fallback. These are work bounds, not evidence that all merchant histories were analysed
  or that representative performance targets have passed. Unsafe amounts also require manual input.
- `budgetRecurring.ts` runs normal detection first, then admits only Annual from the longer pass.
  Two annual payments remain a non-financial early signal. Durable account/merchant overlays are
  shown in the review; stopped/dismissed sources are not offered as active suggestions. First
  inclusion confirms amount and next due date. Later changes show saved/proposed terms and require
  review/save, with stable optional source context and no automatic Budget write.
- A detector timeout has an explicit manual-only fallback; stale source/plan errors still reject
  mixed-version refreshes. Core saved Budget remains usable if bounded suggestion work times out.

### Bank-to-investment evidence

- `20261021030000_budget_investment_evidence.sql` extends the funding adapter without adding a new
  balance. Only a **confirmed**, unambiguous link qualifies: settled negative bank debit, purchase
  activity, same-tenant AUD accounts and AUD instrument, exact purchase value plus brokerage,
  matching copied account/hash/occurrence identities, no split bank parent and no rejected or
  external decision. Suggested/automatic investment links and redemptions are not contribution proof.
- The identity remains `m:<bank-debit-id>`, shared with bank-pair evidence. Competing valid bank-pair
  and investment paths suppress the source rather than duplicate capacity. Divided claims exhaust
  the one capacity; no evidence match adds another reserve credit.
- Fingerprints retain both bank/activity identities, dates, purchase amounts, brokerage and adapter
  source version. Activity and instrument changes now invalidate Budget sources (19 instrumented
  source tables total). Instrument changes conservatively invalidate existing tenant gates. No new
  source-row FK or lock is introduced; deleting activity leaves immutable Budget claim history.

### B10 presentation and interaction handoff

- `20261021050000_budget_item_presentation.sql` extends strict item metadata for stable detector
  context and one optional featured goal. The owner selects it in the existing review panel; its
  card appears first and has a text label. Unfeature the current goal before selecting another.
  The server enforces this invariant; compatible undo restores it. No separate preference store,
  duplicate goal balance or Planning write is introduced.
- Presentation/context/target-only edits preserve existing current-period additions and the future
  template when contribution amount/state/cadence/anchor are unchanged. Browser impact preview
  follows the same rule; featuring a goal cannot silently reset an extra allowance.
- The optional bill-finding disclosure uses the existing glass surface, body/detail copy and native
  summary/button controls. It starts closed to keep the primary budgeting task quiet. Suggestions
  show account, observed charge count, rate/cadence, missing-history qualification and saved terms.
  Review reuses the 560px task panel/full-width phone panel, 20px padding, 44px controls and existing
  theme/focus/error tokens. No new animation or modal layer was introduced.
- `test-budget-m4-interactions.mjs`, called only by the guarded workspace harness, exercises real
  signed-in bill review/stale rejection, changed-term acceptance, keyboard dirty-close/restoration,
  featured goal, purchase/refund, reserve release/reload/undo and category/custom replacement.

### M4 acceptance traceability

| Requirement | Executable coverage / boundary |
| --- | --- |
| AC05–07 | M1 partition tests; M4 SQL signed overage/Other/removal; rendered category/custom replacement/removal. Carry-policy lifecycle remains M5. |
| AC09–12 | Canonical split activity/claims, actual weekly dates and occurrence revision identity; detector parity and explicit proposal review; reserve 600+100−650=50. |
| AC18–19 | Bank/manual/investment shared-capacity and source-change checks; separate planned/observed/confirmed values; no Planning event. |
| AC25–27, AC31–32 | Owner/tenant/RLS/grants, concurrent version/claim guards, atomic compensation, canonical reconciliation, stale/read/unknown-result recovery. |
| AC29 | Engineering keyboard/focus/dirty-close and responsive journeys. Independent assistive-technology and user acceptance remain M7. |
| AC36–40 | Dated target/amount previews, unknown/paused/zero cases, one allocation, feature/presentation control, immutable evidence and compatible undo. |
| AC41–43 | Partial purchases, linked refunds, explicit completion/no refill, unrelated spending separation and no cash-affordability guarantee. |
| AC44–46 | M1 real-date/month-end/14-day arithmetic and M4 actual occurrence/contribution previews. Production frequency migration/bridges remain M5. |

AC20–21 forecasting and assisted-plan provenance remain M6 where applicable; AC14–15/22–24/47–49
review/carry/frequency lifecycle remain M5/M7. Human comprehension AC30/33/SG09, realistic performance,
backup/restore rehearsal, persistent migration and rollout approval are not inferred from this work.

### Closure verification

- `npm run test:budget:items`: **187 checks passed**, including the M2/M3 regressions and new M4
  SQL/real Edge/real signed-in browser journeys. All **73 migrations** replayed on the positively
  identified disposable project `halcyon-budget-m2-7b9f4dc7990249b3` (API 57421 / DB 57422).
  Captured fixture identities/accounts/transactions were removed, tenant cascades left zero Budget
  plans/source gates, and the generated project containers/volumes were removed. Earlier failed
  disposable attempts were also cleaned by the same guarded runner; no personal stack was queried.
- `npm test`: **470 passed, 14 existing skips**. Existing Expenses detection tests remain green;
  new exact mirror guards and signal vectors prove browser/server parity.
- `tsc --noEmit -p tsconfig.budget-workspace.json` and `npm run build`: passed. Full-app TypeScript
  still reports the pre-existing `StrategicProjections.tsx:252` metric-name mismatch; the known
  >500kB chunk warning also remains. Neither is represented as fixed by M4.
- Inspected fictional-fixture captures `/tmp/halcyon-budget-m4-bills-desktop.png` (light desktop)
  and `/tmp/halcyon-budget-m4-interactions-phone.png` (dark 390px phone). Native selector labels were
  corrected to expose concise names rather than include option text. This is engineering visual/
  keyboard QA, not independent human or assistive-technology approval.

**Next:** M5 lifecycle/control—period reviews, signed carry, late-source recomputation, effective
scope/policy changes and frequency transitions/bridge/full templates. Await authorization; feature
flags remain off by default and no personal migration or public rollout is authorized.
