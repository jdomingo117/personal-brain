---
aliases:
  - Budget Phase 1 Source Contracts
tags:
  - halcyon
  - budgeting
  - architecture
type: engineering-contract
status: m0-contract-stage-complete
project: Halcyon
created: 2026-10-20
updated: 2026-10-20
related:
  - "[[BUDGET_SCOPE_BASELINE]]"
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# Budget M0 — source, storage and transaction contracts

**20 October 2026 · First engineering phase (M0), not M1 or a production release.**

Completes the first-phase contract investigation authorized after the technical plan. Frozen product scope
remains **BUDGET-V1-2026-10-20**. The contracts below resolve the design choices D01–D08; the
verification register distinguishes source inspection, isolated experiments and later implementation proofs.
No migration, production endpoint, authenticated Budget route or personal-data change is included.

Subsequent progress: M1 and M2 now have their own implementation records. In particular,
`BUDGET_M2_DURABLE_BOUNDARY.md` records the nullable live-account ownership-trigger refinement
and actual isolated source/command concurrency proofs; use the technical plan for the current
milestone rather than treating this original M0 exit register as an up-to-date release checklist.

## 1. Evidence and verification status

Source inspection includes the complete migration filenames in order for analytical-view
replacements, the latest classification/split functions, DataContext, recurring detection and
writeback, ingestion/provider paths, auth middleware and relevant source mutation handlers.
This is not a full live schema/data audit. A separately identified, explicitly read-only local
legacy/count check is recorded in §6; all fixture writes ran on disposable databases only.

The reproducible experiment is:

```sh
cd app
node scripts/prove-budget-contracts.mjs
```

Requires Node >=22.18 and the locally cached PostgreSQL image named in the runner. It creates one
UUID-labelled, network-disabled container with no published ports or host mounts. Data lives in
ephemeral `/tmp`; the runner checks its label before removing only its container and anonymous
image volumes. No Supabase URL, key, personal volume or default database is accepted.

It loads the **latest `transactions_analytic` projection extracted from the migration chain**
(currently `20260825000000_transaction_kind_attributes.sql`) onto reduced source relations, then
tests a candidate reporting adapter. Reduced tables intentionally omit production auth, foreign
keys, triggers, bytea/UUID identity types and RLS. This is an SQL semantics/performance experiment,
**not a full migration replay, RLS test or permission to migrate**.

Recorded result: **15 checks passed**, including 1,008 combinations of kind, signed amount,
kind source, pending state, durable decision and suggested link; exact split replacement and
custom/global identities; continuous/gapped/zero-activity/revoked/unknown coverage; a 100,000-row
aggregate; and two-session revision-gate, rollback and delete checks.

Benchmark environment: Docker PostgreSQL 17.11.0.004, 64MB shared buffers, one synthetic tenant
with 100,000 September transactions, sparse transfer evidence, no concurrent workload. The final
run measured **399.734ms execution / 1.202ms planning** for the month and **14.389ms execution**
for one day. `EXPLAIN (ANALYZE, BUFFERS)` showed the candidate tenant/account/date index and
decision lookup indexes. An initial under-indexed fixture took 7,270.283ms: it lacked existing
decision lookup index shapes, so it is not a production baseline. These are single-run experimental
observations, not p95 latency, full historical/carry cost, production plans or a performance SLA.

A second runner, `app/scripts/prove-budget-full-schema.mjs`, creates a fresh, uniquely labelled
Supabase database on port **56422**, copying migrations only (no environment secrets), rejects
non-empty initial auth data, applies/counts all **64 existing migrations**, and runs fictional
fixtures inside a rolled-back transaction. The full-schema run passed UUID/bytea identities,
taxonomy-trigger classification, a complete **10,000-row** aggregate, real split-RPC replacement
without duplicate expense, and the existing analytical view's foreign-identity RLS exclusion.
Only this run's project-labelled containers, volumes and network are removed afterward. It does
not apply any proposed Budget migration or prove new Budget-table policies.

Run it with `SUPABASE_CLI=/absolute/path/to/supabase node app/scripts/prove-budget-full-schema.mjs`
from the repository root, or with `supabase` on PATH. The CLI may require permission to update its
own telemetry settings outside the workspace; do not change HOME or target the personal database
to work around this. An initial run exposed CLI project-ID truncation; those exact verified test
resources were removed and the runner now uses a unique ID below that limit.

The existing classification/allocation/recurring unit suites also pass: **27 tests across 3 files**.

### Exit register

| Decision | Contract | Evidence now | Downstream implementation/release verification |
| --- | --- | --- | --- |
| D01 canonical activity | §2 | Current projection + helper parity; full-schema identities/triggers/split RPC and complete aggregate | M2/M3: actual adapter function, competing decision timestamps, investment links and tenant/account ownership fixtures |
| D02 coverage | §3 | Ingestion/provider source audit; continuous/gapped/revoked/unknown interval proof; explicit confirmation fallback chosen | M2/M6: persistent coverage provenance, revocation and multi-account gate fixtures |
| D03 recurring | §4 | Current detector/override inspected; server extraction, complete evidence and manual confirmation contract chosen; existing recurring tests pass | M4: server kernel/adapter parity, complete evidence pagination and occurrence identity proof |
| D04 revisions/locking | §5 | Source mutation inventory and reviewed gate/MVCC order; actual two-session, rollback/delete experiment | M2: real import/undo, split, transfer and cascading-account-delete concurrency with installed invalidation triggers |
| D05 schema/legacy/bounds | §6–7 | Additive normalized/ownership constraints, money/API bounds, preserved legacy consumers and read-only count inspection | M2: final DDL/grant tests; repeat migration preflight and backup before any personal forward migration |
| D06 clock/transitions | §8 | Date, timezone, bridge and continuing-template contracts chosen | M1 calendar/property vectors; M2/M5 transition constraints and concurrency |
| D07 performance | §9 | Reproducible 100k synthetic dataset, full-schema 10k source proof, query plans, index requirements and measurement budgets established | M2/M7: full-schema 100k/1m, real adapter/carry-chain benchmarks and repeated percentile measurements |
| D08 drafts/outcomes/exposure | §7, §10 | Durable request/draft/API and disabled-by-default exposure contracts chosen | M2: retention, retry, owner/tenant and operation-outcome tests; M3/M7 exposure/rollback checks |

**M0's contract/readiness stage is complete; M1 is next.** The evidence supports beginning the
pure calculation foundation, not calling persistence, server adapters or a live release ready.
The downstream gates above remain mandatory and unpassed. This does not waive the plan's M2–M7
requirements or authorize personal-data migration. Existing-source RLS is not new-Budget RLS proof.

## 2. D01 — canonical activity adapter

### Scope and identity

- Every read resolves tenant from authenticated membership, validates all requested accounts belong
  to it and rejects unsupported currency. No client-provided tenant or merchant label is authority.
- Eligible activity accounts: explicitly selected tenant-owned AUD accounts with canonical ledger
  activity. Do not drop loan interest/fees or investment-account fees simply because of account
  type; kind and assignment determine treatment. Investment valuation changes are not ledger
  spending. A contribution destination may be a tenant-owned AUD savings, investment or debt
  account as appropriate to its purpose. Selecting it as a
  destination does not silently select its activity. Both transfer legs may be looked up as funding
  evidence without adding destination activity to expense totals.
- Read `transactions_analytic`, not raw transactions plus a parallel transfer heuristic. Preserve
  original parent ID, account, booking date, dedupe identity, occurrence, kind source, pending state,
  effective transfer state and linked identities. Never use merchant text as a transaction ID.
- Query `[start_date,end_date)` using the ledger booking `date`. A provider timestamp supports
  evidence freshness; do not re-date transactions from it and change account reports.
- Left-join allocations on tenant **and** parent ID. If children exist, return only those children,
  with typed `transaction` versus `allocation` identities. Keep global text subcategory ID separate
  from tenant custom UUID. Child replacement retains the parent's transfer/pending/source context,
  as `expandTransactionAllocations()` does today. Do not count both parent and children.

### Arithmetic and integrity

Resolve effective kind exactly as `classification.ts`: a derived transfer with reported state
`rejected` falls back to income/expense by direction; a user-pinned transfer remains transfer.
Apply the analytical `is_transfer` exclusion before operational cash-flow helpers, consistent with
`cashFlowSeries.ts` and account reporting, not merely the helper in isolation:

| Settled, non-transfer row | Earned income | Expense effect |
| --- | --- | --- |
| income | `max(amount,0)` | 0 |
| expense | 0 | `max(-amount,0)` |
| refund or reimbursement | 0 | `-max(amount,0)` |
| transfer, investment, adjustment | 0 | 0 |

Pending rows never enter those totals. Return pending signed effects and counts separately. Refunds
are negative expense effects, not fresh earned income. Cast amount to bigint **before** negation or
summing, including the PostgreSQL minimum signed int case. SQL aggregates all scoped rows; detail
pagination changes neither totals nor suggestion history.

The current analytical view can expose a link state ahead of a rejected decision through
`COALESCE`, and some dashboard callers do not apply the same transfer filter. Budget must not
silently “fix” shared history. Flag conflicting active link/decision evidence as integrity-limited,
block affected suggestions/matches and direct correction to Ledger. Shared reporting remediation
would need its own regression-reviewed change. The experiment proves current semantics, not that
every arbitrary combination is a healthy production state.

Return gross expenses, contra-expense credits, net expense effects, earned income, pending and
excluded-kind counts. Assignment reconciliation uses disjoint buckets:
`assigned_effect + excluded_effect + unassigned_effect = canonical_net_expense_effect`.
Unassigned credits are a labelled subset, not an extra fourth additive bucket. Reserve-funded
expenses belong to their reserve assignment, not to everyday spending again. Unknown allocation
integrity, missing source or ambiguous transfer cannot be treated as zero.

## 3. D02 — explicit coverage provenance

Use `account_activity_coverage` records with same-tenant account reference, half-open date range,
provenance (`user_confirmed`, `verified_statement`, `verified_provider`), immutable evidence
reference, confirmation actor/time, verified source revision and revocation reason/time.
Overlapping evidence can coexist. Union non-revoked ranges per account with PostgreSQL
`range_agg(daterange(...,'[)'))`; every selected activity account must cover the **whole** candidate
window. Adjacent ranges combine; one missing date blocks it. Destination-only accounts are not
secretly required for everyday-history coverage, but funding evidence has its own integrity checks.

Existing `upload_batches` counts/reconciliation and first/last transaction dates do not prove
coverage. Current provider `backfill_done`, watermark and sync time are useful diagnostics, but
do not prove a completed bounded coverage interval, account-local date conversion, absence of
overlap duplicates or the last covered date for a zero-activity account. Do not backfill verified
coverage from these fields alone. Initially accept explicit user-confirmed ranges, visibly labelled;
preserve the provider/statement evidence mechanism for adapters that actually prove those facts.

Source revision and coverage are different facts: every relevant edit invalidates previews;
an ordinary category correction does not automatically revoke date completeness. Import undo,
provider-history deletion, account remapping or user withdrawal revokes dependent range evidence.
A replacement source must be explicitly re-proven/reconfirmed, not silently inherit deleted proof.

Apply G01–G09 as approved: latest six **completed** local calendar months; at least three eligible
comparable months, six preferred; fortnightly additionally at least six complete anchor-aligned
14-day windows within that historical horizon. Exclude the current incomplete month/window and
any window with missing account coverage. Covered zero-activity windows remain valid zeros.
Recent-change/income/irregular-cost confirmations are versioned draft inputs, not inferred facts.
Missing or stale proof keeps manual setup available and returns structured account/date reasons.

## 4. D03 — server recurring evidence and occurrences

Do not send `buildRecurring()` output as authoritative Budget input. Its runtime imports/UI-oriented
account decoration, optional AI hints and default `TODAY` make a direct Deno import unsuitable.
Extract a pure deterministic detector kernel with explicit today and bounded evidence, mirror it
server-side with parity vectors, and leave presentation/hints in the existing Expenses adapter.
Preserve current thresholds, annual lookback (3×366 days), cadence tolerance, price-change and
dormancy rules; this is not authorization to redesign recurring detection.

Query complete parent-ledger expense evidence by account/normalized merchant, excluding pending,
transfers and future rows. SQL returns complete evidence counts and bounded dated observations;
if a merchant exceeds the proven detector input bound, expose “confirm this bill” rather than
sampling without disclosure or accepting a browser list. Keep split effects in budget actuals;
recurring identity remains the original bank parent, not one recurring bill per split child.

Overlay durable `recurring_series_overrides` by tenant/account/merchant key. Stopped/dismissed and
dormant/unconfirmed series do not become active bills automatically. Managed does not prove a live
contract; first Budget inclusion confirms amount, due schedule and funding line. Changed detected
terms become a proposal, never an automatic rewrite of user intent. Manual schedules always work.

Occurrence key: `(budget_line_id,schedule_revision_id,due_local_date,ordinal)`; weekly/14-day move
by dates, monthly/quarterly/annual use calendar months and clamp to month end without drifting the
original desired day (31 Jan → 28 Feb → 31 Mar). Generate actual due occurrences inside each
budget window, not monthly equivalents. Explicit partial/full matches consume their signed source
capacity once; unmatched remainder stays expected. Stopping a Budget line never cancels a merchant
subscription or changes the Expenses override. Match identity survives source deletion as audited
invalidated evidence, not an FK that prevents legitimate import undo.

## 5. D04 — source revisions and locking

Choose one monotonic bigint **source revision per tenant**, with earliest dirty local date. Begin
coarse, not a separate version per merchant/account. Account selection/frequency/template changes
also advance the appropriate Budget revision. Method version and exact scope/date definitions are
part of snapshot/proposal identity. Fingerprints never use `max(updated_at)` or counts alone.

Inventory for transactional invalidation (includes direct service-role writes and SQL RPCs):

| Sources | Current mutation entry points | Invalidation |
| --- | --- | --- |
| transactions / upload evidence | `upsert-transactions` → `import_transactions_atomic`; `delete-upload-batch` → `delete_upload_batch_atomic` | INSERT/UPDATE/DELETE; old/new dates/accounts, source coverage dependencies |
| provider activity and scope | `sync-provider`, `map-provider-accounts`, `extend-provider-history`, `disconnect-provider` | Upsert, pending replacement/delete, reconciliation anchor, mapping/cutover/deletion; distinguish coverage revocation from routine progress |
| classifications / merchant rules | `update-transaction-category`, `update-transaction-classification`, `apply-merchant-rule`, `manage-merchant-rule`, `review-categorization`, `categorize-pending`, categorization shared helpers | Resulting row changes + rule/policy metadata relevant to evidence; all bulk/undo paths |
| splits | `manage-transaction-split` → replace/undo allocation RPCs | Both allocation insert/delete and parent identity; use parent booking date |
| transfer decisions/links | `decide-transfer`, `link-transfers`, `_shared/runLinkTransfers.ts` | Both legs, stable decisions, auto/suggested/confirmed/external/rejected changes |
| investment cash links/decisions | `decide-investment-cash-link`, `_shared/runInvestmentCashLinks.ts`; investment import/delete | Cash-leg reporting exclusion and evidence; not NAV changes as spend |
| accounts / tenant lifecycle | `upsert-account`, `delete-account`, provider account changes; account/user cascades | Currency/type/existence; unknown affected date conservatively dirties from plan start |
| recurring / taxonomy / policy | `manage-recurring-series`, `detect-recurrence-hints`, `manage-taxonomy`, `manage-classification-policy` | Schedule/evidence/identity changes; do not let hints authorize bill amounts |
| Budget-owned facts | coverage revoke/confirm; account memberships; mappings; goals/revisions/matches/reviews | Source or plan revision as appropriate, never a client-only refresh |

Install database-level invalidation in M2, not just Edge refresh calls. For tables supporting transition
relations, collect affected tenant/date keys once per statement, in sorted tenant order. For cascades
and FK-driven effects, verify actual trigger firing and gate-row lifecycle against full schema.
Metadata without an activity date conservatively invalidates all affected periods. Multi-tenant
maintenance must pre-lock gates in sorted order or execute one tenant per transaction.

### Lock protocol (refines plan §7's source-lock proposal)

1. Source DML may already own ledger rows before its AFTER invalidation trigger reaches the gate.
   That trigger locks/bumps the tenant gate and dirty marker in the **same source transaction**.
   It must never acquire Budget plan/claim locks or recalculate carry while holding source rows.
2. Budget command takes tenant gate first, then plan, operation/claim resources in stable ID order.
   After waiting for the gate, read sources in a **subsequent SQL statement at READ COMMITTED**,
   validate source/plan revisions, ownership, signed capacity and the user's intent, then commit.
   Do not combine lock acquisition and source read into one pre-wait statement snapshot.
3. Budget commands **never lock or mutate source ledger rows**. Revalidation is protected by the
   transactional gate, and overlapping claims are protected by Budget-owned locks. Adding source
   `FOR UPDATE` after the gate reverses the existing writer order and can deadlock.
4. A source writer waiting at the gate can commit after a Budget command based on previous committed
   activity. It then advances revision, dirties derived results and invalidates dependent evidence.
   A subsequent read cannot label the old claim fresh. This is valid serialization, not proof that
   matched activity can never later change. Ledger correction and import undo remain permitted.
5. Snapshot construction also holds the gate for a bounded read transaction, reads in the next
   statement, and returns one consistent source/plan/method revision. No network/AI calls while locked.
   Set lock/statement timeouts; retry transient/deadlock failures with the same operation ID.

The two-session experiment verifies this **pattern**, not coverage of every real writer. Production
requires source trigger inventory, delete/rollback/bulk/cascade tests, interleaving at gate waits,
same-request races, changed matches and source changes during snapshot calculation. Until then no
atomic stale-preview safety claim. Membership revocation/owner checks must also be rechecked by
the SQL write boundary rather than rely only on Edge preflight.

## 6. D05 — schema and legacy review contract

Keep the plan's additive families; no replacement of `public.budgets` and no invented historical
allocations. New records use UUID primary IDs and tenant IDs. Referenced records expose unique
`(tenant_id,id)` pairs so composite FKs enforce ownership for plans, periods, lines, revisions and
accounts. Cross-table invariants run inside the atomic service-only command, with final SQL
constraints where expressible, not Zod alone.

| Family | Required SQL constraint / durable behavior |
| --- | --- |
| plans / draft | At most one active plan per tenant; one resumable owner draft per tenant; separate plan/source/draft revisions; draft has no active money effects |
| periods | CHECK start < end; exclusion constraint on `(plan_id,daterange(start,end,'[)'))`; contiguous/idempotent generation verified under plan lock; timezone/frequency revision immutable |
| revisions / allocations | Immutable revision header and unique line allocation per revision; current/activation pointers reference same plan/tenant; distinguish period, bridge and full-template revisions |
| lines / metadata / policies | Stable line ID plus effective-dated revisions; one reserve balance derivation, not duplicate goal balances; archived lines retain history; non-overlapping effective policy windows |
| assignments / source matches | Explicit source kind + stable source identity + original amount/version; nullable live reference with audited snapshot; no cascade erase and no RESTRICT blocking source deletion; matches cannot exceed signed source capacity |
| contributions / reserve legs | One operation with conserved debit/credit legs; planned allocation separate from confirmed evidence; one movement amount cannot fund multiple goals; refunds reverse their matched usage once |
| frequency changes | At most one pending change; same-plan old/new boundary, bridge revision and continuing full-template revision required where applicable; activation/cancellation atomic |
| reviews / attention | Immutable reviewed totals + source and plan revision; changed flag derived later; attention acknowledgment cannot clear signed money gaps |
| operations | UNIQUE tenant/request ID; canonical payload hash; action/actor/outcome/before/after references; one compatible compensation per operation; no request-outcome TTL in V1 |
| coverage / source gate | CHECK start < end; explicit evidence/provenance/revocation; gate monotonic and dirty date retained; no grant permitting browser mutation |

RLS: tenant members including viewers may read appropriate records; no anonymous grants. App writes
are service-only and require the verified **owner** in SQL, even if the broader app permits members
to edit Ledger. Views explicitly `security_invoker`; functions set search path, revoke PUBLIC/anon/
authenticated execution, and receive server-resolved tenant/actor. Assertions fail a migration for
missing RLS, accidental grants or invoker omissions. Operation history may outlive actor account
references under the existing deletion policy, but contains no stored secrets.

Legacy source audit found reads in `DataContext.tsx` and `AccountSecurity.tsx` export, plus table
creation/tenancy/taxonomy triggers and policies. No current Edge writer was found by repository
search; that does not prove external clients never wrote it. Amount is integer cents. Preserve
the old table/read/export contract and owner-entered data. Any later optional import is a labelled
draft suggestion with stable legacy row reference; never turn a category limit into a dated reserve.

The phase's read-only legacy inspection used counts/units/invalid references only, without
descriptions or full financial rows. Target was positively identified via Docker labels/workdir:
project **fin-app**, container **supabase_db_fin-app**, database **postgres**, host port **54322**
mapping to container 5432. SQL ran under `BEGIN READ ONLY` and verified
`transaction_read_only=on`. It found **zero legacy budget rows**, zero negative legacy limits,
missing tenants or taxonomy references, and zero non-AUD accounts. A zero tenant count in that
aggregate means zero tenants **represented by legacy budget rows**, not that the database has no
tenants. No personal fixtures, updates, migrations or cleanup were performed. Example count:
`SELECT count(*), count(DISTINCT tenant_id), count(*) FILTER (WHERE amount_limit < 0)
FROM public.budgets;` plus taxonomy/ownership/currency joins. Repeat target checks and take a
verified backup before any later personal migration; this read-only check is not migration approval.

## 7. Money and API contract

Amounts remain signed integer cents end to end. Accept only safe JSON integers with absolute value
at most `Number.MAX_SAFE_INTEGER`; apply smaller command-specific positive/nonnegative constraints
for targets, allocations and matching magnitudes. PostgreSQL uses bigint for new amount/aggregate
fields. Range-check every result before JSON conversion; arithmetic uses checked integer/BigInt
intermediates. An out-of-range aggregate is an explicit unsupported-value error, not a rounded
number or saturated total. Do not impose a silent $1m goal cap borrowed from a different endpoint.
Revision counters travel as validated decimal strings to avoid long-lived bigint precision loss.

Proposed query input (all operations through `withAuth`, viewer minimum for reads):

```ts
type BudgetQuery =
  | { action: 'snapshot'; period_id?: string }
  | { action: 'history'; before?: string; limit?: number }
  | { action: 'sources'; period_id: string; cursor?: string; limit?: number }
  | { action: 'coverage'; account_ids: string[]; start: string; end: string }
  | { action: 'preview'; intent: BudgetIntent; expected: Versions }
  | { action: 'suggest'; draft_id: string; expected: Versions }
  | { action: 'operation'; request_id: string }

type Versions = {
  plan: string | null; draft: string | null; source: string; method: string
}
```

Authoritative snapshot response contains plan/period IDs and timezone/bounds; `versions` and
`generated_at`; activity/destination account roles/currency; complete signed aggregate totals;
bounded line/goal values; coverage diagnostics/provenance; pending and integrity qualifications;
and `fresh | changed | incomplete | unavailable` state. Details have opaque scoped cursors,
`has_more` and complete SQL count, never “loaded rows” presented as total. Source corrections
always link back to Ledger rather than budget-specific transaction editing.

```ts
type BudgetCommand = {
  request_id: string;                 // UUID, retained across unknown-outcome retries
  action: BudgetAction;               // discriminated Zod schema, not arbitrary patch JSON
  expected: Versions;
  effective: { kind: 'period'; period_id: string }
    | { kind: 'period-and-future'; period_id: string }
    | { kind: 'future-template'; starts_on: string };
  input: unknown;                     // narrowed by action schema before any DB access
}
```

Server resolves tenant/actor and recomputes all consequential results. Preview carries a server
fingerprint of canonical intent, scope and versions, not trusted client totals. Commands include
save draft, activate, revise/move, manage line/goal, assign/match/reverse, accept recurring proposal,
review/carry, schedule/cancel frequency change, pause/resume, attention and compatible undo.
Each action declares which revision dependencies are mandatory; preview-dependent operations
cannot opt out of source validation by supplying null versions. Draft saves may retain stale
evidence, clearly marked stale, but cannot activate it unreviewed.

Outcome is `{request_id,operation_id,status:'committed',versions,result}`. Same key/payload replays
the saved outcome before attempting new version validation; same key/different canonical payload
returns 409. Check ownership on every outcome lookup. Validate/save atomically; SQL failures roll
back operation and financial legs together. Audit transport is not the commit receipt. Unknown
network outcome keeps request ID and dirty input and checks/retries it, never assumes cancellation.

Error body: stable code, plain-language message, affected field IDs, `retryable`, optional latest
versions/operation status. Distinguish invalid input/range (400/422), forbidden (403), invisible
resource (404), stale/capacity/idempotency/undo conflict (409), rate limit (429) and temporary
service/timeout (503). No foreign-row existence leak. No money or merchant/goal names in logs.

## 8. D06 — calendar and transition contract

- Store ISO Gregorian dates as `date`, audit instants as `timestamptz`, and a validated IANA timezone
  per frequency revision. Derive today from injected clock + plan timezone, never a build constant.
- Monthly `[first,next-first)`; fortnight `[anchor+14n,anchor+14(n+1))` over local dates, not elapsed
  milliseconds. Historical booking dates/timezones are not rewritten by settings changes.
- First activation may be mid-period: disclose known earlier activity and explicit opening intent;
  do not fabricate prior budgets/carry or silently prorate the user's confirmed amounts.
- Schedule changes only at current end boundary. Fortnight→monthly may need exactly one bridge
  ending on the next month start. Monthly→fortnight starts the anchored sequence at that boundary.
  If already aligned, no zero-length bridge. Reserve/line IDs survive.
- One frequency-change command stores separately reviewed initial/bridge and full continuing
  templates, including due bills, income dates, goals, gaps and overrides. Do not divide a month
  by two, equate fortnightly with twice-monthly, or copy a bridge amount into a full period.
- Original activated plan/review snapshots remain immutable. Recompute actuals/carry from earliest
  dirty date and label changed reviewed periods. Until a complete chain is ready, retain labelled
  last-verified results; never compute only the newest period and call it fresh.

## 9. D07 — query design, bounds and benchmark requirements

Candidate index: `transactions(tenant_id,account_id,date,id)`, preserving the existing split
tenant/parent index and both transfer-decision lookup shapes. Query by tenant/account/date **before**
expanding reporting rows where the planner can push predicates; don't filter `kind='expense'`
upstream and accidentally remove refunds or rejected transfers. Inspect full-schema plans before
adding an overlapping index. No source-array fetch/reduce as the production aggregate path.

Proposed API protection budgets, subject to measured full-schema confirmation (not product caps):

- detail/history pages default 50, maximum 100; keyset cursor `(date,parent_id,source_kind,source_id)`
  binds to tenant/scope/source version, so deletion/reclassification yields stale-cursor response;
- source evidence streamed in bounded pages with a complete count/explicit overflow diagnosis;
- query/command request body limit 256KiB via middleware, bounded arrays before database access;
- 30 reads/minute/user and 10 consequential writes/minute/user initially; explicit costly
  suggestion limit 6/minute/user (request intent-specific limiter), no silent retry loops;
- database lock timeout 2s, query statement timeout 5s, Edge request budget 15s initially. These
  are fail-safe cancellation bounds, **not claimed performance**; if save outcome is unknown use
  the durable request protocol;
- engineering target for representative snapshots p95 <1s SQL / <2s end-to-end and suggestions
  <3s end-to-end, measured on a declared local reference environment before sign-off;
- do not silently cap total history, active goals/lines or carry-chain length to pass these budgets.
  Oversized valid plans require explicit pagination/partitioning and an agreed strategy, not lost data.

Full-schema benchmark matrix still required: 10k/100k/1m raw rows, multiple accounts, split-heavy,
transfer-heavy and refund-heavy periods, 6-month suggestions plus annual recurring lookback,
1/12/60 changed carry periods, concurrent import/read, tenant isolation and aggregate invariance
at 1/100/1000 detail page boundaries. Record warm/cold repetitions, p50/p95, EXPLAIN buffers and
hardware. A cache/job is not approved merely because a deliberately under-indexed query was slow.

## 10. D08 — durable draft, outcome and exposure

Authenticated setup draft belongs to tenant/owner, has optimistic revision and method/source
provenance and survives reload/session loss. Budget source errors never erase manually entered
amounts or goal/future intent. Saving a draft is not activating a plan. Use no concept localStorage
keys; loading prototype state into production is prohibited.

Store operation dedupe/outcome for plan lifetime in V1, including outcomes after period close.
Archival/privacy retention policy must preserve unknown-outcome recovery and cannot silently prune
keys while retries remain supported. Dirty drafts are explicit and exportable under the applicable
account data lifecycle; no invented auto-expiration requirement.

Use separate server `BUDGET_V1_ENABLED` and client `VITE_BUDGET_V1_ENABLED` exposure configuration,
disabled by default. Client flag hides navigation only; server flag rejects new Budget financial
writes but continues authenticated saved-outcome and existing-data reads so rollback cannot
make a committed write unknowable. Auth/owner/RLS remain enforced regardless of flag. Keep the
standalone fictional concept unchanged. No public flag rollout or production migration in M0.

## 11. Next executable work

1. Start M1 calculation types/calendar/allocations/reserve/goal vectors using these contracts.
   No Budget route or personal migration is required for that pure foundation.
2. In M2, translate the reviewed schema/API/gate contracts into isolated migrations/functions and
   prove grants, source invalidation, idempotency and real mutation-path interleavings. Do not
   substitute the small gate experiment for that installed-system proof.
3. In M4/M6, build server recurring/coverage/suggestion adapters and their parity fixtures. Reuse
   the full-schema runner's isolation approach; never point reduced-source fixtures at an existing DB.

No new product questions or scope expansion are needed. The remaining work is engineering proof,
not another concept-design round. The owner has authorized phase work, not live deployment.
