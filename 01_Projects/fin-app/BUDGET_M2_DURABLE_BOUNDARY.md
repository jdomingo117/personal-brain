---
aliases:
  - Budget Durable Boundary
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: m2-complete-isolated-only
project: Halcyon
created: 2026-10-20
updated: 2026-10-20
related:
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[BUDGET_M0_CONTRACTS]]"
  - "[[BUDGET_M1_FOUNDATION]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# Budget M2 — durable boundary

**20 October 2026 · Implemented and tested on disposable projects only. Not migrated to the
personal stack, exposed through a live Budget route, or approved for production release.**

Frozen product scope remains **BUDGET-V1-2026-10-20**. This phase supplies the transactional
foundation for M3's manual vertical slice and later bill/goal/lifecycle/suggestion workflows.

## 1. Persistence and migration boundary

Three additive migrations:

- `20261020000000_budget_durable_schema.sql`: tables, constraints, source invalidation and RLS/grants.
- `20261020010000_budget_durable_commands.sql`: ownership, ready-setup validation, immutable
  revision creation and atomic/idempotent command protocol.
- `20261020020000_budget_snapshot_history.sql`: consistent reads, append-only history enforcement
  and deferred template-pointer validation.

The old `public.budgets` table/read/export contract is untouched. The migration chain now contains
**67 migrations**. No personal database reset, migration, fixture or cleanup was performed.

| New table(s) | Durable responsibility |
| --- | --- |
| `budget_source_versions` | Transactional tenant revision, earliest dirty date and timestamp |
| `budget_drafts`, `budget_draft_revisions` | One resumable personal draft with immutable payload/source/method revisions |
| `budget_plans`, `budget_periods` | One active plan per tenant; stable period IDs, half-open local dates, monthly/14-day/bridge checks and no overlaps |
| `budget_revisions`, `budget_lines`, `budget_allocations` | Immutable period/template intent, stable purposes and exact-cent allocations; original activation pointer retained |
| `budget_account_memberships` | Explicit activity versus destination roles; effective dates and preserved source identity after deletion |
| `account_activity_coverage` | Bounded evidence, provenance, confirmation/revocation; no invented proof from transaction density |
| `budget_operations` | Canonical payload hash, request uniqueness, actor, before/after references, commit receipt and one compensating undo |

All 11 tables have RLS and deny anonymous access and authenticated direct writes. Plan records are
tenant-member readable; draft payload/history and operation receipts are owner-readable. SQL RPCs
are service-only. Every mutation also checks the actual SQL tenant membership for **owner**;
Edge permission checks alone are not the authority. New revisions/outcomes reject in-place updates,
apart from actor anonymization required by auth-user deletion. Ordinary undo archives/appends;
explicit whole-tenant privacy deletion may cascade as in the existing account lifecycle.

Within the Budget model, composite ownership references bind revisions/periods/lines/allocations
to their plan and tenant. Period revision pointers are bound to that exact period. Deferred
constraints also verify the plan pointer references a template, not a period revision.

### Live source references: deliberate refinement of M0

Account pointers use enforced same-tenant ownership triggers and preserved original UUIDs, **not
source foreign keys**. An ordinary FK would take an implicit source `KEY SHARE` lock after the
Budget gate, opposing an account-deletion transaction that already owns the source row and waits
for that gate. Plain MVCC ownership checks avoid this reversed order. Under the gate, source
deletion clears live account pointers and revokes coverage while retaining audited Budget identity.

The isolated suite exercises actual concurrent account deletion and activation. Both transactions
finish; subsequent reads report the missing scope and return unknown actuals, not a false zero.
Future expense/funding matches must use the same reviewed nullable/audited source-reference
principle and independently prove their single-claim rules in M4.

## 2. Authenticated API

`manage-budget` uses `withAuth`, owner minimum, strict Zod command schemas, 256KiB body bounds and
10 writes/minute/user. `query-budget` uses viewer minimum, strict read selectors and 30 reads/minute/
user. Both use the existing origin/JWT/tenant pipeline. No browser RPC or table-write exception.

Implemented commands:

- **save_draft**: optimistic draft version; preserves unfinished input and stale source/method
  provenance without changing an active plan.
- **activate**: atomically validates stored ready setup, scope/currency/dates/cent amounts and
  source/method/draft revision; creates plan, first period, lines, account scope and distinct
  initial/continuing-template revisions. A funding gap in either requires explicit acceptance.
  Opening cash drawdown is dated to the current period and is **zero in the continuing template**;
  reusing the same existing cash as recurring income is prohibited. Snapshots expose current and
  future-template resource gaps separately so M3 can explain the difference before saving.
- **revise**: complete allocation replacement for an existing period, either that period only or
  that period and the future template; immutable baseline is not overwritten.
- **undo**: latest compatible draft/activation/revision operation, appending a compensation;
  rejects repeated undo, later dependent revisions and changed source facts. Activation undo
  archives the plan while retaining its period/revision history.

Implemented reads: owner draft/resume, tenant-scoped plan/period snapshot and owner request-outcome
lookup. New commands include `request_id`, exact decimal-string revisions and `expected_method`.
The calculation method is currently `budget-foundation-v1` and is stored with draft/revision evidence.
The server derives tenant and actor from authentication, never from command payloads.

SQL first checks owner and duplicate request hash under the tenant gate. Same request/payload
returns the original committed receipt even after draft/source changes or write exposure is
disabled. Same key/different canonical payload conflicts. Only a new request reaches exposure,
freshness, ready-setup and money validation. Ready-setup validation is inside this transaction,
not an Edge pre-read that could race receipt recovery. Draft input is allowed to be unfinished;
activation strictly validates its supported fields and rejects unknown ready-setup properties.

Commit receipt includes request/operation ID, committed status, method/source revision and result.
Operation history is committed with the financial intent; the transport audit is additive. Keep
the same request ID after a timeout and look up/retry it. A timeout is not cancellation. No
dedupe/outcome TTL is introduced. Failures use sanitized validation/forbidden/not-found/conflict/
temporary-unavailable responses, without logging SQL row details or raw financial inputs.

`BUDGET_V1_ENABLED` is **false unless explicitly set to `true`**. Disabling it rejects new writes,
but preserves authenticated reads and replay/recovery of committed receipts. The suite restarts
the real isolated Edge service with the flag off and verifies this behavior. No flag was enabled
on the personal stack and no live page was added.

## 3. Source coherence and evidence

Statement-level old/new transition-table triggers cover 17 source/evidence tables: transactions,
allocations, accounts, upload batches, bank/investment transfer links and decisions, provider/account
connections, recurring overrides, merchant rules, tenant/global taxonomy, classification policy
and coverage. Source writes advance the tenant revision **in the same transaction**; rollback also
rolls it back. Deletes cannot evade freshness by removing a timestamp/count. Unknown metadata
dates conservatively dirty all existing plan history from `0001-01-01`; this is not authorization
to generate invented historical budgets.

Source transactions acquire the gate after their source rows. Budget commands/snapshots acquire
the gate first, then use subsequent READ COMMITTED statement snapshots and Budget-owned locks;
they do not lock or mutate ledger rows. Concurrency proofs use actual classification and account
deletion paths, not just the M0 pattern experiment. This is not a blanket claim that every future
admin/bulk/tenant-maintenance transaction is deadlock-free; those paths must preserve sorted tenant
gate order, and transient database failures still require request-outcome recovery.

Account/history deletion and provider remapping revoke dependent coverage. A transaction deletion
revokes only evidence covering that settled activity's date: pending-only removal and deletion
outside a covered window still advance freshness but do not falsely erase that window's proof.
Routine provider sync timestamps do not revoke an explicit range, although the coarse revision can still advance.
Reconfirmation creates new evidence rather than erasing a revoked proof. Category edits invalidate
source snapshots without falsely declaring the date range missing.

Snapshots aggregate complete SQL activity across selected effective account/date scope, replace
split parents and retain effective-kind/transfer/pending semantics. Results separate gross expense,
expense credits, net expense, earned income and signed pending activity. Bigint sums are checked
before JSON conversion. Revisions travel as strings. Coverage uses the union of non-revoked ranges,
not loaded-row counts. Missing/deleted/non-AUD scope returns incomplete/unknown actuals. Snapshot
`fresh` describes source completeness, not cash affordability, successful goal funding or a balanced
plan. Assigned-line actuals, carry chains and forecasts are not claimed by this M2 read contract.

## 4. Verification and reproducibility

From `app/`, with a local Supabase CLI on PATH or an explicit executable:

```sh
SUPABASE_CLI=/absolute/path/to/supabase npm run test:budget:durable
```

`scripts/test-budget-durable.mjs` creates a unique short project ID, copies only source/functions/
migrations (no personal environment/credentials), and uses **API 57421 / database 57422**. It checks
project labels and empty auth/tenant/account/transaction state, replays all 67 migrations and drives
real JWT-authenticated Edge calls. SQL-only adversarial probes run on that same verified disposable
target. Fake provider records contain no credentials and make no provider network requests.

**Final result: 94 integration checks passed against the complete 67-migration chain.**
The suite covers owner/member/viewer and tenant isolation, direct-write denial, draft reload,
malformed versions/cent amounts, currency and ID validation, identical/different-payload request
races, stale revisions/methods, immutable history, overlapping periods, injected second-allocation
failure, draft restoration, guarded undo, complete totals above API page limits, real import/undo/
classification/split/transfer invalidation, source/write races, concurrent account deletion,
manual zero-income/no-bank setup and write-disable recovery. It removes captured fixture identities/
tenants, verifies cleanup, then removes only its own project-labelled resources.
Final verification project: `halcyon-budget-m2-9bb4ce0d74ed4fcd`; its containers, volumes and network
were removed. Earlier failed/intermediate runs also cleaned up only their own generated projects.

Additional checks: the app's **422 unit tests pass (14 existing skips)**, focused Budget TypeScript
and production Vite build pass (existing chunk-size warning). Full app TypeScript still fails only
at the existing `StrategicProjections.tsx:252` metric-name mismatch; it was not changed. Edge modules
were exercised in the actual Supabase runtime; no separate native Deno typecheck is claimed.

## 5. Boundary and next milestone

This is M2's durable **foundation**, not the whole Budget release. The later workflow-specific
records/commands for recurring occurrences, single-claim funding/purchase matches, goal metadata,
reviews/carry, scheduled frequency changes, attention and suggestions remain in M4–M6. This is
dependency sequencing, not a removal of frozen features. Coverage persistence/invalidation exists;
the user-facing confirmation/provenance workflow still belongs to the later source/setup integration.

**M3 next:** private authenticated `/budget`, manual setup/save/reload, Overview/My plan, explicit
account selection, complete canonical actuals and truthful incomplete-data/retry states. The source
snapshot is not yet a complete assigned-line/carry engine, so M3 must not invent those values.
Persisted data must not come from concept localStorage. Broader performance, browser usability,
full feature acceptance, backup/restore rehearsal and production rollout remain M3–M7 gates.

Applying these migrations to the personal stack still requires exact-target preflight, a verified
restorable auth+application backup and separate approval. Rollback first disables new writes and
hides exposure while retaining saved data/outcomes; it does not drop tables or reset the database.
