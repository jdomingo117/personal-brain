---
type: verification-record
status: verified-isolated
project: Halcyon
created: 2026-11-09
updated: 2026-11-09
related:
  - "[[BUDGET_M7_RELEASE_DECISION]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
---

# R09 — Confirm account history dates

Before starting a plan, the Budget owner can open **Review account history coverage** from the setup page. Assisted setup also offers **Confirm dates I know are complete** when dates are missing. With an active plan, the same task is under **Accounts & settings → Review account history coverage**. Choose an AUD account, enter the inclusive first and last complete dates, and explicitly confirm all activity is recorded for that range. The account list labels saved evidence **Confirmed by you**. Remove a confirmation if the dates are no longer reliable.

Migration `20261109000000_budget_history_coverage.sql` adds an owner-only read and extends the existing authenticated Budget command with `confirm_coverage` and `revoke_coverage`. It reuses the coverage table, service-only grants, write gate, tenant source lock and durable operation receipts. New evidence uses `user_confirmed`, never verified statement or provider provenance. The server validates account ownership and currency, rejects future, inverted, or oversized ranges, and converts the inclusive last date to an exclusive end by adding one day. Exact duplicate active ranges are rejected; an account can have up to 50 active owner confirmations, each up to ten years. An explicit withdrawal retains the original row with a revocation reason. The existing source-deletion/mapping invalidation applies as before.

Confirmation changes the evidence Budget may use, rather than changing any amount, transaction, plan allocation, account scope, saved review or forecast calculation. The source revision advances so old assistance and other source-bound previews cannot be reused. The existing manual fallback stays usable. The app does not infer completeness from transaction dates or write coverage from imported statements. Provider coverage was added on 10 November 2026; see the follow-up below.

## Verification

The final isolated run passed **422 assertions**, including **31 R09 checks**, **79 automated accessibility scans** across the combined scope, and 105 migrations. An ordinary imported account went from manual fallback to eligible assistance and an available forecast after confirmation in the mobile browser. Covered zero-spend months remained zero. Desktop withdrawal disabled both history features without changing the plan version or ledger. After a new confirmation, undoing the original import revoked the evidence and restored the fallback. The checks also passed for foreign accounts, viewer/member permissions, future dates, forged provenance, stale revisions and same-request receipt recovery.

The separate provider-disabled golden suite passed all **eight** ingestion and Ledger tests. The unit suite passed **609** tests with **14** existing skips; full, focused and browser TypeScript and the production build passed. All six isolated attempt projects were independently verified to have no remaining labelled containers, volumes or networks. The new source binding and sanitized test summaries are under `docs/budget-m7/r09/`; the original M7.7 evidence remains unchanged. This follow-up did not use Gemini.

The guarded `app/scripts/test-budget-coverage.mjs` exercises a normal account and import, the actual mobile assistance form, and withdrawal in desktop settings. It uses the real Budget Edge endpoints to create evidence. It does not seed the coverage table. Reproduce the combined run from `app/` in a fresh dependency installation:

```sh
node scripts/test-budget-durable.mjs --release-candidate --secondary-ports --candidate-alternate --forecast-only --candidate-only --workspace --assistance-backend --coverage-check
npm run test:golden:budget-candidate
```

The forecast regression's $25 test now uses a fixture where the allowance stays below $500 regardless of how many days remain, keeping that test independent of the separate 5% threshold. No production threshold changed.

### Reconciliation follow-up

Migration `20261109010000_preserve_budget_coverage_on_reconciliation.sql` uses the ledger's `adjustment` kind and `system` source to distinguish generated rows from settled activity. Replacing the generated row preserves confirmed history and still advances the Budget source revision. Undoing an import that removes a real purchase still revokes the affected confirmation.

The schema 106 candidate passed 426 isolated integration checks, including 35 R09 checks. The new test exercised two real imports with a generated adjustment inside the confirmed dates, verified the new balance and active coverage, and then undid the original purchase to prove revocation. The unit suite passed 609 tests with 14 existing skips. The disposable project `halcyon-budget-m2-21bdcbdd2cc14842` was removed and checked for leftover resources.

### Provider coverage follow-up — 10 November 2026

Migration `20261110020000_budget_provider_coverage.sql` lets a bank sync supply `verified_provider` evidence. A completed Up history walk returns every transaction posted from cutover until the walk began. That is either a fresh backfill or a verification walk over an already-backfilled account. `budget_provider_coverage_base` then records **[cutover, the walk's start day)** in Australia/Sydney dates, so the partial current day is never covered. `budget_provider_coverage_extend` moves the end forward after each complete incremental pass. It only does so when the pass fetched from no later than local midnight of the current end day, so a partial, failed or missed sync can never be bridged. When there is no base or a gap is found, `sync-provider` queues a resumable verification walk (`account_connections.coverage_walk_*`) after every account's normal pass. The walk **only inserts missing transactions**; it never rewrites existing rows, so categories and edits survive. Existing invalidation still revokes the range when settled activity is deleted, when the mapping is removed or changed, or when cutover changes. The next sync then re-walks. Owner confirmations are never superseded. Both functions are service-role only.

Isolated validation: 33 assertions passed on a schema-only copy in a throwaway container from the stack's own Postgres image. They covered no-base/unfinished-backfill refusal, base range and provenance, source-revision advance, walk consumption, gap refusal, same-day no-op, in-place extension, inverted/future/foreign-tenant rejection, browser-role denial, month coverage, held-versus-settled deletion, re-walk, supersede history, cutover revocation, inactive connections, and untouched owner confirmations. The personal database was backed up first to `backups/budget-m7/fin-app-pre-provider-coverage-20261110.*`. The backup was restore-verified with identical counts and ledger sum, then migrated forward (108 → 109). Post-migration counts and the ledger sum are unchanged. A real Up sync has not yet exercised the walk.

## Release scope

This is isolated engineering work. It does not apply the migration to the retained preview, personal or hosted data. M7.3 observed accessibility, M7.4 independent beginner comprehension, M7.5 hosted/cold/load qualification, and exact private target preflight remain open. [[BUDGET_M7_RELEASE_DECISION]] retains the No-Go for real-data rollout.
