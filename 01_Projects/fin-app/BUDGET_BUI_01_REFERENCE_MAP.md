---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: complete
project: Halcyon
created: 2026-10-25
updated: 2026-10-25
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
---

# BUI-01 — reference, action and data map

Engineering mapping complete, 25 October 2026. No production UI, financial command,
database, feature exposure or personal data changed. The owner authorized proceeding
after the handoff review. Decisions below are implementation defaults under that
authorization; they are not a new owner visual-acceptance result.

Next: **BUI-02 — scoped foundations**, using the exit/navigation policy below.
BUI-03 must prove nullable/canonical field mapping before the new hero consumes it.
R01–R05 remain open. Source inspection establishes mappings, not passing production
journeys; the proof column names the verification required when each flow moves.

## 1. Captured reference and scope

Reference assets and reproducible capture script live in
[`docs/budget-ui/bui-01/`](docs/budget-ui/bui-01/).
The script uses a fresh Chromium context for every viewport/theme, the fictional
`/budget-concept.html` route and reduced motion. It crops the content scroller or
dialog, excluding the review toolbar and fictional application shell. No production
route, authentication or database fixture is used. Scenario changes only affect the
concept's disposable browser-context localStorage.

| Reference | Captures / meaning |
| --- | --- |
| Healthy overview | 320, 390, 768, 1024 and 1440px; light/dark; 1100px viewport height |
| Lower content, calculation task, My plan, September history | 390 and 1440px; light/dark |
| Explicit Phone preview | Concept's 430px stage inside a 1440px viewport; light/dark |
| Qualified states | 1440px light/dark: missing coverage, funding gap, changed September history, limits off |

There are 36 PNGs plus `references/measurements.json`. Healthy snapshots assert
$290 everyday remaining and capture $200 still to plan. Funding-gap fixture changes
expected income to $5,500, leaving a $300 plan gap. Changed-history fixture enables
reviewed/late-import flags in the concept. These are reference examples, not live data.
The concept cannot establish production interrupted-save, manual no-bank, stale-read
or permission behavior. Those are mapped in section 4; do not fabricate captures of them.

Source composition measurements: page max-width 1320px; desktop content grid uses
a 318px aside and 26px gap; hero has a 1.6fr/1fr split with a 48px gap; title scales
36–46px; amount scales 48–68px; task panel is at most 560px. Actual computed geometry
at each viewport is in the JSON, before cropping. Production must use the existing
shell and content-container thresholds rather than copying the concept rail/header.
The Phone preview is an additional reference, not a substitute for actual narrow widths.

## 2. Complete production action inventory and destinations

Sources: `views/Budget.tsx`, `contexts/BudgetContext.tsx`, `components/BudgetItems.tsx`,
`BudgetLifecycle.tsx`, `BudgetAttention.tsx`, `BudgetAssistance.tsx`, `BudgetFrequency.tsx`,
`BudgetAccountPolicy.tsx`, `BudgetRollover.tsx`, `BudgetControls.tsx` and their libraries.
Rows group equivalent dynamic controls; line, claim, category and issue IDs remain stable.
All Save actions retain their existing request constructors and owner/version guards.

| ID / current controls | Destination / burst | Command or authority preserved | Required migration proof |
| --- | --- | --- | --- |
| A01 Retry membership, refresh saved data, continue history preparation | Header data/status action and conspicuous preparation strip / 04,06b | `refreshMembership`, `refresh`; no mutation | Failure retry, count-only progress, old figures qualified |
| A02 Check saved result | Persistent status strip and task recovery link / 02,04 | `recover()` and original sessionStorage request ID | Reload/interruption recovers same receipt; competing writes blocked |
| A03 Previous/next/current saved budget, period dropdown, URL back/forward | Header / 04 | `selectPeriod`, `budgetPeriod`; saved inventory only | Guard all entry routes; latest/past/future and reload |
| A04 Overview/My plan and saved future allowances | Three-view navigation / 04,08a | Local view only | No save on tab changes, no provider remount; future amounts labelled |
| A05 Adjust plan; expected income, one-off cash, allocation edits; period/current-and-future scope; review/acknowledge/save/leave | My plan task / 08a | `revise`; `fromSnapshot`, `setupSummary` | Exact intent/receipt and both gap scopes; saved history restrictions |
| A06 Help build / enter amounts / continue draft / partial-draft warning | Empty-state setup entries / 09a,09b | `blankSetup`, `readSavedSetup`; explicit replace warning | No active hero without plan; protected existing draft |
| A07 Setup rhythm, timezone, dates/anchor, activity/destination accounts, income/cash, name/add/remove allowances, opening reserves, review/save/leave | Manual setup steps / 09a | `save_draft`, stable line IDs, 60-character names | No-bank, zero income, both rhythms; saving never activates |
| A08 Review saved draft, manual conversion, gap acknowledgement, activate | Setup review / 09a | `activate`, expected draft version | Separate explicit activation, stale source rejection |
| A09 Assistance history scope/dates, recent-change and scope confirmations; inspect method/regular costs; one-change and goal inputs; use/manual/recheck/cancel | Assistance task / 09b | Existing assistance query/controller and manual conversion | R02–R05 dependencies; preserve unrelated draft intent |
| A10 Add goal/add bill; finish configuring existing allowance; edit item; feature/unfeature; target/unknown price/date-based amount; cadence, status, Planning/recurring links, opening earmark; review/save | Goals or commitment detail task / 02,05b,06a | `save_item`; `goalEstimate`, `dateLedAmount`; existing IDs | Initial goal pilot; pause/purchase/unknown/archive and current/future gaps |
| A11 Inspect bill occurrences, recurring evidence/detected proposal, review detected/managed update | Commitments discovery/detail / 05b | Saved schedule remains authoritative; proposal reviewed via `save_item` | Detection bounded/unavailable/dismissed, real dates, explicit acceptance |
| A12 Match activity, load more/select source, manual funding confirmation, purpose/partial amount/refund link/occurrence, inspect/reverse claims | Allowance/goal evidence task / 05b,06a | Existing match submit path, `reverse_claim`, source capacity/revision | No duplicate claims; purchase/refund/funding distinctions and paging |
| A13 Move allowance, release reserve rights, source/target/amount review | Everyday or reserve task / 05a | `move_allocation`, `release_reserve` | Balanced cents, signed effects, no cash movement |
| A14 Category limits, taxonomy/child scope, add/remove/review/save | Everyday detail / 05a | `set_limits`; existing rollover-policy restriction | Removing limit returns authority to Other; child gap remains visible |
| A15 Latest item Undo | Relevant task receipt / 05a,05b,06a | `undo` with original operation ID | Compatible latest operation only; reload and invalidation |
| A16 Review results; original/latest/recorded comparison; Ledger link; carry/fresh/incomplete choice; save/reopen/Undo review | Look back / 08b | `save_review`, `reopen_review`, `undo`; immutable payload | Late corrections preserve original; signed carry and protected balances |
| A17 Plan next, edit next allowances/income, review/gap/save/leave | Look back next-budget task / 08b | `open_next_period`; `nextBudgetDraft` | Contiguous dates, paused/frequency restrictions, navigate from receipt |
| A18 Frequency initial/full amounts, preserved categories, gap/coverage review; schedule, inspect, apply, cancel and Undo | Settings → frequency / 07a,07b | Existing frequency commands/hash and effective date | Both directions, bridge/full distinction, application creates history |
| A19 Account role/date-scope choices, preview/impact/coverage acceptance, save/leave/Undo | Settings → accounts / 07a,07b | `previewAccountScope`, `set_account_scope`, `undo` | Exact scope/hash, deleted accounts, complete before/after chain |
| A20 Next categories add/remove, bulk carry/retain, per-balance destination, preview/accept/save/leave/Undo | Settings → rollover / 07a,07c | `previewRollover`, `set_rollover`, `undo` | Signed removal/transfer/release, protected balances, keyboard tables |
| A21 Pause/resume, archive line, reserve destination/disposition, preview/accept/save/leave/Undo | Settings → lifecycle; contextual line shortcut / 07a,07c | `previewControl`, `set_control`, `undo` | Resume uncovered windows, signed archive effects, preparation/recovery |
| A22 Priority/all checks, inspect allowance, Ledger/accounts links, adjust plan | Overview checks + all-checks task / 06b | Existing priority/order and issue routing | Hidden groups still inspectable; gaps visible after snooze |
| A23 Review check, acknowledge/snooze/date, latest-check review, leave, show again, Undo preference | Check review / 06b | `set_attention`, separate version/hash, `undo` | Material reopening, stale choices retained, no financial-version change |
| A24 Actual totals, scope dates/roles, pending/credits/excluded amounts and calculation copy | About figures/calculation/data tasks / 04,06b | Canonical snapshot/detail fields, no ledger aggregation | Meaning available next to hero; unknown differs from zero |

Concept guide, category inspector and goal detail are presentation entry points around
these mapped facts/actions. They do not authorize new money commands. Every existing
action family above has a destination; runtime reachability is proved as each family moves.

## 3. Field map, gaps and chosen adaptations

| Display | Authoritative source | Qualification / implementation decision |
| --- | --- | --- |
| Period/rhythm/timezone | `snapshot.period`, lifecycle `state/as_of` | Exclusive end converted with `addDays(end,-1)`; shared local dates; never fixed concept clock |
| Everyday planned/used/left | Everyday `details.items` row: `planned_cents`, `used_cents`, `remaining_cents` | Left is authoritative, not planned minus used. Carry/rights can break simple arithmetic. Require detail/current-source/chain validity; unavailable never zero |
| Carry/rights explanation | Everyday `opening_carry_cents`, `reallocated_cents`; lifecycle/rollover | Separate from new allowance and income. Signed text survives visual meter clamp |
| Expected / cash once / still to plan | `revision.income_cents`, `revision.drawdown_cents`, `unallocated_cents` | Saved planning values remain useful without bank history. Cash once separate. Preserve signed gap and distinct future-template gap |
| Received/pending | `actuals.earned_income_cents`, `pending_signed_cents` | Require valid intersecting activity scope and available actuals. Incomplete history = known activity only; no-bank = unavailable observed activity |
| Category planned/used/left | `details.limits`: `amount_cents`, `used_cents`, `remaining_cents` | Stable limit ID plus taxonomy scope IDs; missing optional usage is unknown. Keep child shortfall even when pool positive |
| Other | `other_flexible_cents`, `other_flexible_used_cents`, `other_opening_carry_cents`; rollover `parts[id=other].remaining_cents` | Server also emits `other_flexible_remaining_cents` with rollover. Frontend `BudgetDetails` omits it. In BUI-03 type the server field/part explicitly and prove on/off cases; do not infer it by subtracting visible categories |
| Limits off | Canonical everyday item + current source inspection | Ship single-pool presentation. No authoritative full category-observation breakdown is exposed for the concept's no-limits list; no paginated-feed aggregation |
| Commitments | Bounded `items`, saved config and dated `occurrences` | Distinguish new allocation, reserve, matched occurrence and evidence. Bounded summaries can count/map server rows; never sum fetched ledger pages |
| Goal target/state/schedule | Config plus archive/control state and existing `goalEstimate` | Unknown target remains unknown; no copied concept completion dates; do not show estimate when reserve/date inputs or current evidence are unavailable |
| Goal reserve/purchases/evidence | `reserve_cents`, `net_purchases_cents`, `bank_confirmed_cents`, `user_confirmed_cents` | Separate labelled amounts. Reserve is planned budget authority, confirmations are evidence. No composite confirmed total/stack until uniqueness/overlap is proven; use separate tracks/text in 06a |
| History | Lifecycle `facts`, immutable `review.payload`, `changed_since_review` | Original/latest/recorded remain distinct; no invented historical series |
| Checks | Attention `items`, counts, versions and hashes | Existing priority first; every item reachable. Do not add overlapping gaps |
| Forecast | Attention declares unavailable | R01 remains separate prerequisite to final checks acceptance; no forecast graph/date invented |
| Freshness | Provider loading/error/preparation plus snapshot/source versions | `source_changed_since_plan` alone is not a stale-read flag; use actual read/review provenance. Old retained figures stay qualified and editing stays guarded |

**Type correction required in BUI-03:** `BudgetItem.remaining_cents` is declared
`number`, while SQL wrappers/read consumers support unavailable balances. Do not
trust a non-null TypeScript annotation as availability proof. Audit the final SQL
wrapper chain and align the wire types for each nullable field, including Other.
SQL anchors: `20261022000000_budget_period_reviews.sql:77–80` (invalid-chain item
balances become null; Other remainder supplied even before category rollover),
`20261022040000_budget_category_rollover.sql` (`budget_details`, chain parts);
`20261022100000_budget_chain_prefix_reuse.sql` (nullable partition balances).
No migration is required for fields already supplied by the server.

Display contract decision: use orthogonal axes, for example known/unavailable value,
planned/recorded basis, complete/partial coverage, current/stale freshness and
final/provisional status. A planned figure can be known without observed activity;
a provisional figure can also be stale. Include reason codes and version/period
provenance. Missing properties/nulls must not become zero through `?? 0` formatting.

## 4. Mandatory state coverage for migrated entry points

| State | Required behavior / mapped actions |
| --- | --- |
| No plan / saved draft | A06–09; resume or explicitly replace, never show active example figures |
| No bank / incomplete scope history | A07/A24 remain useful; received/spent unavailable or known-activity-only; plan amounts remain labelled planning |
| Invalid scope / details missing | A01/A19 retry/correct; affected actuals and balances unavailable; no borrowed zero |
| Refresh failure / old snapshot | A01/A24 show retained figures as stale; pending acceptance must revalidate |
| Full history / impact preparation | A01/A19–21 count-only progress; no partial-money success; resumable checks |
| Past / changed review | A03/A16 read-only financial plan, original immutable review and latest correction; policy restrictions stay intact |
| Future / frequency pending | A03/A18 scheduled/provisional labels; no received-money claim; initial/full amounts separate |
| Paused / archived | A10/A21 preserve balances/history; expected real bills remain inspectable |
| Viewer / writes disabled | Readable information; mutation entry explains restriction; owner recovery still respects existing authorization |
| Dirty task / source changed | Retain choices, invalidate preview/acceptance, require fresh review; see section 5 |
| In-flight / unknown write | A02 conspicuous regardless of tab/panel, original request retained; no competing Save or implicit Undo |
| Negative / extreme / long / many | Signed figures and errors wrap; clamp only decorative fill; bounded list with all-items route; keyboard-scroll comparison tables |

## 5. Task exit, navigation and focus policy for BUI-02

One task host owns focus/portal and one local coordinator owns unsaved intent. Keep
`BudgetProvider` mounted. Preserve existing command construction until separately
proved. Do not nest a Radix focus trap with `useDialogFocus` or native `showModal()`.

| Condition | Close / Escape / outside click / task switch / period or route navigation |
| --- | --- |
| Read-only or pristine task | Close/navigate directly; restore opener focus or stable fallback; no Save |
| Edited unsaved task | Same leave confirmation for every exit. Stay retains exact input and focus. Leave explicitly discards unsaved local changes, preserving saved data. No automatic save |
| Temporary internal guide/review step | Keep the same task's draft/controller; back returns to exact input; no discard prompt for internal movement |
| Stale preview/source changed | Keep input; invalidate acceptance and preview; fresh review before Save. Closing still follows dirty policy |
| Preview computation | Cancel/ignore obsolete preview responses using generation identity; keep choices if staying; no financial mutation from preview |
| Financial Save in progress | Block task/period switches and destructive close. Preserve provider request/checkpoint. Browser unload warns where supported; reload recovers |
| Unknown Save result | Allow closing into persistent page recovery; do not clear request or imply cancellation. Route/period switches stay blocked until recovery resolves. Disable competing writes |
| Saved receipt | Preserve existing successful close/refresh behavior and operation-specific Undo; move focus to a meaningful result/trigger |

Outside-click does not bypass confirmation. Prefer an in-panel leave confirmation
with the same focus owner; do not stack modal dialogs. Native unload prompts are
browser controlled and cannot be promised on every device. Keep existing reload-safe
pending storage; do not add persistent financial-draft localStorage.

**Observed navigation gap:** provider `selectPeriod` blocks editing/pending/working/
loading, but its `popstate` listener directly sets selected period. Lifecycle buttons
add local prompts and a `budget-before-period-navigation` event used by attention.
Item dialogs keep separate local dirty state. These are not one policy today.
BUI-02 must introduce/test a coherent local coordination path for its pilot, including
browser back/forward and in-app exits; BUI-04/07 extend it as each entry migrates.
Do not silently widen provider navigation behavior for untouched flows without proof.

## 6. Dependency and review gates

- BUI-01 mapping accepts single-pool limits-off presentation and separate goal
  reserve/evidence text as engineering adaptations. Owner visual acceptance remains open.
- BUI-02 decides existing primitive versus selective shadcn source adoption and proves
  the goal pilot's exit/focus/recovery behavior before extracting additional tasks.
- BUI-03 proves canonical/nullable fields, carry/rights, Other, no-bank, stale and future
  semantics before BUI-04 consumes the adapter. No unsafe cast to force parity.
- After BUI-04, capture and request owner review of hero hierarchy/density; after BUI-06b,
  review the assembled overview. Keep unrelated bounded work moving while feedback is pending;
  do not call those visual gates accepted without a response.
- R01 forecast must be resolved before final acceptance of affected checks/guidance.
  BUI-06b may retain an explicitly unavailable forecast at an interim checkpoint.
- Resolve R02 eligibility, R03 what-if readiness, R04 input confirmation/preservation and
  R05 estimator edge semantics in separate bounded tasks before finalizing BUI-09b and
  before final candidate/human validation. Fixing those may require backend work outside
  the presentation-only boundary; existing requirements remain authoritative.
- BUI-10 fresh automated evidence and BUI-11 owner fidelity decision precede resumed
  final M7.3/M7.4 sessions. No UI completion closes the remaining M7 release gates.

## 7. Delivery checkpoint

Burst / status: **BUI-01 — Complete** (reference and source-mapping scope).

Behavior and visual change: none in production. Captured the concept; inventoried
24 action families; defined data/state mappings, accepted bounded adaptations and
task-exit policy; refined dependency/visual-review gates.

Files changed: this record; handoff/current-status/index/orientation references;
`docs/budget-ui/bui-01/capture-reference.mjs` and its generated reference assets.

Commands / target / actual results: capture runner passes with 36 PNGs, 10 healthy
viewport/theme measurements, zero page errors, zero data-service requests and zero
healthy-overview horizontal overflows. `node --check` on the runner and scoped
`git diff --check` pass. Representative desktop/mobile, changed-history and calculation
captures were visually inspected; this is not a fresh accessibility audit.
Reference runner targets only Vite `127.0.0.1:5314/budget-concept.html`; no Supabase
target used. Production test counts remain historical. No production tests required
for this documentation/capture-only burst.

Visual review decision: engineering reference inspection only; owner acceptance of
the implemented UI remains pending after BUI-04/06b/11.

Known failures / findings: R01–R05 unchanged; frontend nullable/Other type gaps and
navigation coordination are explicit prerequisites above, not claimed fixed.

Exact next burst: **BUI-02**. Read this record's sections 2, 5 and 6 plus handoff
sections 3/5/6/7 and current goal task. Decide primitive, extract only the goal pilot,
prove close/focus/navigation/recovery and capture 390/1440 light/dark (320 for geometry).
