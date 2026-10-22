---
aliases:
  - Budget Lifecycle and Control
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: engineering-complete
project: Halcyon
created: 2026-10-21
updated: 2026-10-22
related:
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[BUDGET_M4_BILLS_RESERVES_GOALS]]"
  - "[[BUDGET_M0_CONTRACTS]]"
  - "[[SYSTEM_INTEGRITY]]"
  - "[[BUDGET_M5_ACCOUNT_POLICIES]]"
---

# Budget M5 — lifecycle and control

## Authority and status

**M5 is engineering-complete.** [[BUDGET_M5_IMPACT_PREPARATION]] closes the final impact preparation/
atomic-save gate with migration 90. The final broad regression passed **451 isolated checks**, and
the strict mixed-history/recovery run passed **145 checks**, across all **90 migrations** (separate
run totals). Budget TypeScript, **511 unit tests/14 existing skips** and production build passed;
responsive captures and fixture/project cleanup were verified. Account, rollover, pause and signed
archive release Save/Undo fit the existing per-request SQL bound, with exact uncached parity and
interrupted-review resumption. All five engineering closure gates below are complete. M6 assisted
setup is next; M7 human/accessibility, hosted performance, migration/restore and rollout remain.

Prior continuation: [[BUDGET_M5_HISTORY_PERFORMANCE]] implements complete dense ten-year impact
preview/save/receipt/Undo scale through migrations 84–89. The larger mixed account/line/split/claim
preview matched retained financial/evidence kernels, but its accepted save still hit the unchanged
eight-second SQL bound. **At that checkpoint M5 remained open for mixed-history atomic-save
admission**. Migration 90 subsequently closed that gate as recorded above.
Full regression: **432 isolated checks across 89 migrations; 503 unit tests passed/14 skips;
focused Budget TypeScript/build passed**, responsive journeys and cleanup verified. The strict
mixed run separately proved timeout rollback of money, scope, audit and caches, then failed the
performance gate as intended; its post-save/Undo assertions cannot be credited as passed.

Prior continuation: [[BUDGET_M5_ATTENTION_CONTROLS]] implements the counted queue,
acknowledgement/snooze/show-again, independent attention history/version, materiality/evidence
reopening and compatible Undo without changing financial intent. **388 full isolated checks/80
migrations; 40 focused follow-up checks; 496 unit tests passed/14 skips; focused TypeScript/build
passed**, captures and cleanup verified. Wider temporal integration and performance/resumption remain.

Prior continuation: [[BUDGET_M5_BUDGET_LINE_CONTROLS]] implements budget pause/resume, explicit
uncovered-window/carry review and non-everyday archive with signed retained/released/transferred
reserve disposition. Current allocations/history and unrelated future allowances are preserved.
Verified: **360 isolated checks/79 migrations; 493 unit tests passed/14 skips; focused TypeScript/
build passed**, phone/desktop captures inspected and disposable cleanup verified. Attention,
wider temporal/goal integration and realistic performance/resumption remain open M5 gates.

Prior continuation: [BUDGET_M5_CATEGORY_ROLLOVER.md](BUDGET_M5_CATEGORY_ROLLOVER.md) records
prospective category/Other signed rollover, protected balances, explicit disposition and next-category
editing. Migration 78 integrates the dated partition with period/frequency adapters. Verified:
**322 isolated checks/78 migrations; 490 unit tests passed/14 skips; focused TypeScript/build
passed**, responsive captures and disposable cleanup verified. This closes the category slice,
not general line archive or the whole M5 milestone.

Prior continuation: [BUDGET_M5_ACCOUNT_POLICIES.md](BUDGET_M5_ACCOUNT_POLICIES.md) records
effective-dated **account scope** with rollback-only full-chain/next-window previews, fresh effect
hash validation, atomic save and compatible undo. This closes the account-edit implementation
slice, not the remaining category/Other rollover and disposition policy work or all of M5.

The owner authorized M5 after M4 closed and subsequently requested the remaining work continue.
**M5 is in progress, not complete.** The latest continuation adds durable guided frequency changes
and server-side protection for earlier saved financial plans. The first slice
implements saved-period navigation, explicit next-period opening, immutable completed-period
reviews, boundary-specific everyday carry into Other, complete derived carry-chain recomputation
and guarded review undo. The remaining full-phase gates are listed below; this record neither
reduces frozen scope BUDGET-V1-2026-10-20 nor advances to M6.

## Continuation — guided future frequency changes

### Durable intent and boundary application

- **How often you budget** opens a guided change from the latest current/future saved period.
  The effective boundary is its existing end date. Monthly → fortnightly produces 14-date windows;
  fortnightly → monthly produces one short bridge only when needed, then calendar months.
- First/bridge income and every line allowance are reviewed separately from the continuing full
  template. Values start unchanged from saved future intent, not monthly/2 or automatic proration.
  A bridge cannot overwrite the full template. New allocations never include opening reserves,
  carry, funding matches or a repeated one-off drawdown as income.
- Saved bill/goal schedules retain their cadence and anchor. The preview names actual scheduled
  dates/counts in both windows, flags allowance/schedule differences as manual overrides and shows
  current reserve context and contribution dates through a saved deadline. Paused goals have no
  promised dates. These are conditional schedule facts, not a projected bank balance or a promise
  of purchase affordability. Income is explicitly entered per window; no automatic paycheck/date
  detector or new income-schedule engine is claimed by this slice.
- Existing category allowance amounts are explicitly kept in **both** new windows. They must fit
  each new everyday pool; otherwise saving fails atomically and the user must increase that pool
  or adjust categories before returning. Separately effective future category policy editing is
  still part of the open policy gate, not silently introduced by this workflow.
- Each window's funding gap needs its own acceptance. Known-only/incomplete activity needs a
  separate acknowledgement. The saved review captures source/plan versions and existing facts;
  this does not certify manual plans as complete bank history.
- `budget_frequency_changes` is append-only event history. Source/plan locking serializes commands
  to one logical pending intent. Scheduling does not create a period, replace the live template,
  alter matches or mutate current/past plans. A second pending intent or ordinary `open_next_period`
  cannot bypass it: apply or cancel the pending change first.
- The workspace reads a pending change after reload. Apply is enabled only at/after its boundary
  with unchanged source and plan versions; SQL independently enforces this and latest-period
  contiguity. Changed evidence/plan makes the saved intent require cancellation and fresh review,
  never a hidden rebase or silent application. There is no background scheduler in this slice.
- Apply atomically creates the first period, writes its activated/current plan, installs the
  separately reviewed continuing template and updates the plan frequency/anchor. Stable line IDs,
  reserve rights, source claims and reviews survive. The next ordinary opening follows the bridge
  with a full month, without skipped/overlapping dates or another opening-reserve credit.
- Cancel appends an event, leaving financial templates unchanged. Compatible schedule undo appends
  cancellation; compatible cancellation undo restores pending intent only before its boundary and
  only when the cancelled preview itself was fresh. Undo cannot launder an outdated preview into
  current authority. Applying creates durable period history, so delete-period undo is explicitly
  unavailable rather than deleting an activated period.
- Receipt lookup remains before exposure/version checks. Exact retries return the same result with
  writes disabled; conflicting keys and stale tabs cannot commit duplicate intent or application.

### Historical write protection

Earlier saved-period plan, item, limit, movement and assignment mutation requests now fail once a
later period exists, even if sent directly to the service command boundary. UI read-only is not the
security boundary. Reviews remain explicitly revisable; source corrections still belong in Ledger.
The latest period may match an older source transaction/refund without rewriting an earlier plan.
This guard does not replace the unfinished effective-date policy edit/disposition workflows.

### Implementation and interaction handoff

`20261022020000_budget_frequency_changes.sql` is the **76th migration**. It adds the member-readable,
non-client-writable frequency event table, immutable history, service-only command/details wrappers,
`schedule_frequency`, `cancel_frequency`, `apply_frequency` and guarded compensation. The prior
wrappers remain `budget_command_lifecycle` / `budget_details_lifecycle`. SQL owns all versions,
dates, identities, amount checks, limit capacity and commits; Edge uses strict bounded Zod schemas.

`BudgetFrequency.tsx` is embedded in the existing lifecycle panel, not another page/modal.
`budgetFrequency.ts` previews bounded plan inputs using the M1 calendar and checked-money helpers;
it does not fetch/reduce ledger transactions. The design-handoff skill guided this specification:

- Existing glass/lifecycle surface with `space-y-3/4/5`, `outcome-panel`, `body-copy` (15px),
  `detail-copy` (13px), `field-label`, `budget-input`, `hair`, `text-warn` and `text-neg` tokens.
  CSS in `app/src/index.css` remains canonical; no hardcoded colours or new animation library.
- First/full sections use two columns at `lg` (1024px), one column below it. At 390px they stay in
  normal document order within the existing rail/scroll canvas. Essential amounts wrap, not truncate.
  Native disclosures progressively reveal schedules/overrides and preserved category amounts.
- Inputs and buttons are at least 44px; every amount input has a visible label and accessible name.
  Native required/pattern/custom validity rejects blank, negative, fractional-cent and unsafe entry.
  Checkboxes separately name date/override review, incomplete evidence and each funding gap.
- Focus follows ordinary DOM order, with existing focus-visible tokens; there is no focus-trapped
  modal, swipe-only action or colour-only meaning. Error/stale copy uses alert semantics; saved
  operation feedback and interrupted-save recovery remain in the existing Budget context.
- Busy/loading/unknown outcomes disable new submissions. Source/plan refresh retains inputs for
  reference but invalidates the preview; close/reopen establishes a new review basis. Unload and
  period-control navigation warn about unsaved previews. Leaving locally makes no saved change.
- Saved pending amounts can be inspected after reload. Cancel/apply/undo require explicit
  confirmation and use the same exact-request recovery checkpoint, not optimistic local mutation.
- Failed totals/dates and missing plan identities fail closed with a close/refresh path. Large plans
  remain bounded by the existing line limit; independent beginner/assistive-technology review is M7.

`test-budget-frequency.mjs` extends the disposable lifecycle runner with concurrency, receipt,
limits/rollback, bridge/full-template, history and cross-period evidence checks.
`test-budget-m5-interactions.mjs` includes actual signed-in phone save/reload/cancel/undo and
invalid/gap/dirty-navigation checks. Its frequency journey uses a separate disposable user rather
than weakening rate limits after the rapid review/navigation journey.

No personal database is queried, migrated or used for fixtures. Client/server Budget flags remain
off by default. All migration and authenticated interaction checks use the guarded disposable stack.

### Continuation verification — final checkpoint

- **253 isolated SQL/Edge/browser checks passed across all 76 migrations** on
  `halcyon-budget-m2-bf4d450a05b84af1` (API 57421 / DB 57422). Includes M2–M4 regressions,
  simultaneous schedule/application races, disabled exact receipts, limit-capacity rollback,
  separate bridge/full amounts, preserved original plans, historical mutation denial and a linked
  refund across a fortnight, bridge and full month. Late matching changes review status, not its
  stored recorded totals. Small fixtures do not close the large-history performance gate.
- **482 unit tests passed, 14 existing skips**; focused Budget TypeScript and production build
  passed. Full-app TypeScript still reports only the existing unrelated
  `StrategicProjections.tsx:252` `PlanningMetric` / `ProjectionMetric` mismatch. The existing
  >500kB chunk warning remains. No unrelated type/build-warning fix was made.
- Real signed-in browser checks verify first/full amounts, blank rejection, individual gap
  acceptance, incomplete-history acknowledgement, dirty navigation decline, saved pending reload,
  cancellation and guarded undo. New 390px phone and 1440px desktop form captures were inspected:
  `/tmp/halcyon-budget-frequency-form-phone.png` and
  `/tmp/halcyon-budget-frequency-form-desktop.png`; saved phone preview:
  `/tmp/halcyon-budget-frequency-phone.png`. No page overflow or runtime errors were found by the
  journeys. Independent human comprehension/assistive-technology approval is not claimed.
- The runner removed fixtures by captured IDs, verified zero remaining fixture identities,
  accounts, transactions, Budget plans and source gates, then removed only its generated resources.
  Follow-up container/volume project-label checks were empty. Earlier continuation runs were also
  cleaned; one browser failure exposed the rapid combined journey's read-rate limit, so the new
  frequency journey now has a separate fixture identity without relaxing product limits.
- No personal database query/migration, concept fixture import, flag enablement or deployment.

**Historical next-work note:** account/category/rollover policy and pause/archive/attention controls
were subsequently implemented in the newer records linked at the top. Wider temporal integration
and realistic full-chain performance/resumption verification remain open. M5 is not closed.

## Implemented first slice

### Saved dates and explicit period opening

- The default snapshot prefers the saved period containing today in the budget timezone, otherwise
  the latest past period. Selecting another saved period does not change that default.
- Previous/next saved-period controls, a labelled native selector and return-to-current action use
  `budgetPeriod` in the URL. Reload and browser back/forward restore the selection. The server
  revalidates the period's tenant/plan identity; an arbitrary UUID cannot expose another workspace.
- A completed latest period offers **Plan the next budget**. The preview names the exact contiguous
  monthly or 14-day dates, saved future income/allowances, per-line dated schedule amounts, new
  resource gap and existing reserve identity. Users explicitly review and open one period.
- No scheduler, automatic backdated periods or invented opening carry before activation. Reviews
  never gate access to the next period. An explicit one-off drawdown is not repeated, and neither
  opening reserves nor funding evidence acquire a second credit.
- Opening a period is a durable historical event, not a deletable draft; the preview says there is
  no delete-period undo. Compatible review changes can be undone. Frequency transitions and their
  cancellation/undo contracts remain an open M5 gate, not an unsupported extension of this action.
- The continuing template remains unchanged by this first-slice period-opening command. Actual
  schedule amounts are shown beside its copied allowances for explicit review; they do not silently
  replace manual overrides or equate monthly amounts with two fortnights.

### Recorded review versus latest facts

- Only ended periods may be marked reviewed or reopened. In-progress periods remain clearly named.
- The immutable review records activated/original plan, latest plan, source actuals, per-line facts,
  exclusions/unassigned credits, opening/closing everyday carry, source revision and missing-history
  acceptance. No ledger transaction is synthesized and no old allocation is overwritten.
- Missing/absent account coverage needs explicit **known activity only** acceptance. A reviewed
  manual plan does not become verified bank history. Unavailable source accounts block consequential
  carry choices and expose unknown amounts rather than zero.
- Changes to the source revision conservatively mark a review **Changed since review**, even where
  totals happen to remain equal. Latest facts and the stored reviewed figures remain separate.
  Reopening appends a state record; prior snapshots remain inspectable in immutable table history.
- Owner-only undo appends compensation and restores the prior review/carry choice. It resolves
  the original reviewed period, not the period currently displayed, and rejects later dependent
  plan/source changes. Request replay returns the original receipt before exposure/version checks.

### Signed carry accounting

- Default fixed/everyday reset and lifetime reserve behavior remain unchanged. This first control
  is a choice at **one period boundary**, not a hidden ongoing rollover policy.
- **Start fresh** explicitly carries zero; positive/negative prior variance remains in review.
  **Carry the everyday remainder into Other** carries the signed closing remainder, once. Child
  category carry is zero in this slice; the incoming amount belongs only to Other, not both parent
  and child. Full category/Other rollover policies remain to be implemented.
- Opening carry −25 + new allocation 100 − known spending 50 produces closing +25. Carry is not
  earned income, a second allocation, cash affordability or verified savings.
- SQL recomputes from the first saved period through the selected period. Late activity changes
  the downstream carry chain, not reviewed payloads. No newest-period-only shortcut or capped
  transaction feed is used. Unreviewed/incomplete predecessor history remains provisional.
- Reserve releases into everyday spending belong to their effective period. Later periods receive
  that result through the chosen carry once; the historical release is not added again. Lifetime
  reserve debit/credit rights retain their existing cumulative meaning.
- Before a review/carry change commits, the newest saved period's derived values are checked for
  safe-cent overflow. A failure rolls back the entire review/period/receipt transaction.
- Moving unused new everyday allocation also respects a negative opening carry. Prior obligations
  cannot be treated as spare allowance merely because this period's new allocation is positive.

## Durable boundary

Two additive migrations (75 repository migrations in this slice):

| Migration | Responsibility |
| --- | --- |
| `20261022000000_budget_period_reviews.sql` | `budget_period_reviews`, RLS/immutable history, full-chain lifecycle facts, carry-qualified details and current-period default selection |
| `20261022010000_budget_lifecycle_commands.sql` | Correct period-effective everyday reserve releases; owner/receipt/source/version guarded review, reopen, compensation and next-period opening |

`budget_query_m4`, `budget_details_m4` and `budget_command_m4` retain existing behavior behind new
service-only wrappers. Existing M2–M4 receipts stay replayable. No source-table FK/row lock or browser
RPC/write is introduced. The new review table permits member reads and zero anonymous/authenticated
mutations; actor anonymization follows the existing immutable-history rule.

Strict Edge schemas add `save_review`, `reopen_review`, `open_next_period` and an optional workspace
period ID. SQL independently validates owner, tenant, plan/source/method, ended dates, contiguity,
complete allocation identities, inherited limit capacity, safe cents and explicit gap/coverage
acceptance. Conflicting concurrent opens cannot create two periods for the same boundary.

## Responsive and interaction handoff

- `BudgetLifecycle.tsx` uses existing `glass`, `outcome-panel`, body/detail, input/hair and semantic
  tokens; `p-5`/20px content spacing and 44px native/button targets. Controls wrap on phone and
  stay in normal reading order. No new animation, chart engine or visual-only accounting meaning.
- A native period selector and previous/next/current buttons precede the state explanation. The
  selector and navigation stack at narrow widths so the date range remains readable; wide desktop
  uses one row. The review's original/latest/recorded facts use semantic description lists with
  signed currency, plus an optional captioned allowance comparison table with its own narrow-width
  scroll container. Money is never visually truncated to fit the page.
- Review choices are labelled native radios and an explicit incomplete-history checkbox. The
  next-budget preview is an inline form, not another modal; amounts remain editable until review.
- Unsaved local previews warn on unload and ordinary period-control navigation. Source/plan
  refresh invalidates confirmation while preserving next-budget inputs. Pending/unknown writes
  retain the established exact request/recovery checkpoint and prevent duplicate/new submissions.
- Historical item/plan controls are read-only in the UI in this slice, with a Ledger correction
  handoff. This is not a claim that full historical effective-scope/policy editing is implemented.

## Verification

`npm run test:budget:lifecycle` provisions its own identified disposable stack and runs M2–M4
regressions, M5 SQL/Edge/concurrency checks and real signed-in desktop/phone journeys.

- **223 isolated SQL/Edge/browser checks passed** across all **75 migrations** on
  `halcyon-budget-m2-1490fe80fda74204`, API 57421 / DB 57422. This includes simultaneous period
  opening, exact receipt replay with writes disabled, signed carry, no duplicate reserve release,
  source correction/immutable review, reopening/compensation, early-review denial, foreign-period
  denial, missing-account suppression, qualified manual history and real responsive navigation.
- Authenticated fixtures were removed by captured IDs. The runner verified no remaining fixture
  identities/accounts/transactions or tenant Budget plans/source gates, then removed only its
  generated project resources. Follow-up container and volume label checks returned none. Earlier
  failed disposable attempts also used the guarded cleanup; no personal stack was queried.
- **475 unit tests passed, 14 existing skips**; focused Budget TypeScript and production build passed.
  Full-app TypeScript retains the known unrelated `StrategicProjections.tsx:252` metric-name mismatch;
  the existing >500kB build-chunk warning remains. These are not new M5 fixes or green full-app claims.
- Inspected `/tmp/halcyon-budget-m5-phone.png` (390px/dark) and
  `/tmp/halcyon-budget-m5-desktop.png` (1440px/light). The phone review exposed a cramped period
  selector; stacked full-width controls and a >=200px selector regression now protect readability.
  Browser checks cover original/latest allowance inspection, unsaved next-preview navigation,
  selected-period reload, late-edit deltas, reopen/undo, early-review absence and overflow.

This was engineering verification of the first slice. At that checkpoint M5 remained open;
the later records above provide the completed transition, control and performance evidence.
Independent user/assistive-technology approval remains M7.

## Completed M5 closure gates

The following engineering gates are closed by the phase records and final migration-90 regression.

1. Account scope preview/save/undo is implemented. Category/Other signed rollover, next-category
   editing and explicit retained/released/transferred disposition are implemented and verified in
   the new category record. General bill/reserve/goal archive and signed disposition are continued
   in [[BUDGET_M5_BUDGET_LINE_CONTROLS]] with budget pause/resume; see that record for verification.
2. Frequency commands/bridge/full-template/manual previews are now implemented as described above.
   Their combined integration with future effective scope/category policies, goal cadence/manual
   overrides, late claims/refunds and phone/desktop temporal journeys is recorded in
   [[BUDGET_M5_TEMPORAL_INTEGRATION]]. Passage-of-time application
   is tested from an explicitly seeded ended-boundary pending fixture, not by altering the production
   clock or claiming that a browser waited through a real boundary. Do not infer automatic pay-date
   scheduling or independent comprehension approval from the current checks.
3. Budget-level pause/resume and line archive lifecycle are continued in the new controls record.
   Attention acknowledgement/snooze and materiality rules are implemented in the newer attention
   record, with financial intent preserved. Unsupported forecast/payday/detector-dependent reasons
   still require real production inputs/adapters; do not infer M6 closure from the queue controls.
   Existing per-goal pause/resume is M4 behavior, distinct from whole-budget operational pause.
4. [[BUDGET_M5_HISTORY_PERFORMANCE]] implements protected workspace resumption and dense
   60-/120-period verification. Migrations 84–89 remove repeated carry/source/claim/allocation work.
   [[BUDGET_M5_IMPACT_PREPARATION]] adds complete before/after checkpoints and atomic acceptance
   in migration 90. The strict ten-year mixed corpus (three accounts, twelve lines, 240 split
   children and 240 linked claims on the 120,000-expense base) now passes account, rollover,
   pause and signed archive release preparation/Save/Undo. Uncached parity, actual-state proof,
   failed-write rollback, exact receipt replay and desktop/phone interruption/reload are verified.
   Capacity remains one complete projection per bounded request; no unbounded hosted SLA is claimed.
5. Cross-period claim/refund, both frequency directions, child-carry, effective scope, goal override/
   pause/Undo and browser traceability are extended in [[BUDGET_M5_TEMPORAL_INTEGRATION]], alongside
   the existing concurrency/disposition/attention suites. This is bounded engineering evidence,
   not exhaustive permutations or a claim that AC15/22–24/47–49 human/performance gates all passed.

Independent human/accessibility, backup/restore/persistent migration and public rollout remain M7.
No M5 engineering item remains on the current plan. M6 is the next implementation milestone when
requested; this closeout does not enable Budget or apply personal migrations.
