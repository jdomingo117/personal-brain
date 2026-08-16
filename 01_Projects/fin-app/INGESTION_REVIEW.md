# Ingestion engine review and delivery order

Review date: 2026-08-09. This is the ordered implementation backlog from the backend and UX audit
of the CSV ingestion and transfer-review experience. The order is intentional: data-integrity
boundaries come before workflow and visual refinement.

## Recommended delivery order

1. **Connected-account ownership guard — complete (2026-08-09).** Pass connection and
   `cutover_date` state from `DataContext` through the Ingestion page to `CSVUploader`, so connected
   accounts always use historical-import mode with no manual balance step. The UI blocks rows on or
   after cutover and explains the provider-owned period. `upsert-transactions` independently reads
   `account_connections` and rejects overlapping CSV rows or reconciliation anchors, so the rule
   does not depend on browser state.
2. **Atomic import and correct reconciliation anchor — complete (2026-08-09).** The browser now
   submits real staged rows plus the declared balance to `upsert-transactions`; it never calculates
   or injects an anchor. `import_transactions_atomic()` locks the account, inserts rows surviving
   server-side dedupe, removes legacy/current manual anchors, calculates one replacement from the
   complete surviving ledger with PostgreSQL date arithmetic, and updates `accounts.balance` in one
   transaction. Any failure rolls back every write. The completion summary reports the actual
   adjustment/date returned by PostgreSQL. Live-stack tests cover a second partially-overlapping
   statement and rollback after a deliberately forced reconciliation overflow.
3. **Repair static-profile persistence — complete (2026-08-10).** Saved layouts now use a dedicated
   tenant-scoped SHA-256 header fingerprint while `name` remains a human file-derived label. The
   migration backfills fingerprints, normalizes legacy snake_case mapping keys and removes duplicate
   layouts before adding the unique constraint. Client and server fingerprint implementations have
   parity tests; `upsert-profile` accepts the complete camelCase mapping, rejects columns absent from
   the header, and upserts corrections rather than duplicating rows. The uploader reuses profiles
   without AI, keeps recognised layouts updated by default, and surfaces non-blocking save failures.
   Live-stack coverage verifies create/read/update, one-row uniqueness, validation and tenant isolation.
4. **Make upload undo transactional and SQL-aggregated — complete (2026-08-10).** Every CSV import
   now records an RLS-scoped `upload_batches` row with filename, source/imported/skipped/blocked and
   review counts, target balance, reconciliation details and durable undo status. Recent uploads read
   this metadata directly rather than reconstructing batches from the bounded global ledger response.
   `delete_upload_batch_atomic()` locks the account and batch, removes the batch, calculates the
   complete surviving ledger with SQL `SUM(amount)`, updates a manual balance and marks the batch
   undone in one transaction; connected balances remain provider-owned. Browser clients have read-only
   metadata grants. Live coverage uses 1,101 surviving rows to prove undo is not PostgREST-truncated,
   and verifies idempotency, immutable status and tenant isolation.
5. **Require an explicit target-account choice — complete (2026-08-10).** Ingestion now starts with
   a disabled “Choose an account…” placeholder rather than silently targeting the first database
   row. Every option shows the account name, type, available institution or masked identifier, and
   whether its balance is manual, bank-connected or valuation-managed; the selected account gets a
   readable detail card below the control. Both ordinary CSV and managed-investment uploaders lock
   the selector as soon as a file is successfully parsed, then release it only on cancel or completed
   import, so changing accounts can never discard staged work or retarget an in-flight commit. Unit
   coverage verifies initial/locked/unlocked selection state and account labels; browser validation
   exercised the real choose → file → locked → cancel → unlocked interaction.
6. **Separate statement import from the reconciliation inbox — complete (2026-08-10).** `/ingestion`
   now contains only choose account → file → mapping → row review → balance reconciliation → commit;
   it no longer mounts `OskoLinker` or fires reconciliation-inbox reads on every import visit. A new
   lazy `/transfers` route owns bank-to-bank and bank-to-investment review, with a return action to
   statement import. The existing pending-transaction badge moved from Ingestion to the dedicated
   Transfers rail destination, and both upload success states link directly to it. Route/boundary
   tests prevent the inbox from drifting back into Ingestion; real-browser checks covered both URLs,
   rail navigation and the return path. The 51-check live transfer harness is green after being
   updated to respect the atomic importer's one-account-per-request contract.
7. **Simplify ambiguous and overflow transfer review — complete (2026-08-10).** Repetitive amount
   buckets now collapse into one count/transaction summary with an accessible disclosure for exact
   amounts, instead of flooding the inbox with near-identical warnings. Ambiguous pairs are never
   bulk-selected; all-ambiguous groups offer `Review N ambiguous matches` instead of a disabled
   `Confirm 0`, and batch verdicts disappear whenever the current safe selection is empty. Paired
   verdicts now say `Confirm … internal transfer` or `Count … as regular activity`, making their
   income/spending effect explicit. The external-account verdict was removed from paired suggestions
   and is now reserved for unmatched legs, where transaction direction produces `Transfer to` or
   `Transfer from an untracked account`. Pure presentation tests cover ambiguity, selection,
   overflow totals and direction copy; the 201-test frontend suite, production build, signed-in
   browser route and 51-check live transfer harness are green.
8. **Finish ingestion accessibility and visual polish — complete (2026-08-10).** Light-theme muted
   text now clears WCAG AA at 4.87:1 (up from 2.89:1); faint, accent-ink and semantic positive,
   warning and negative text also clear 4.5:1 in both themes, protected by a token-level regression
   test. Workflow helpers are at least 13px, inputs/actions and table checkbox hit areas meet the
   44px target, filter state uses `aria-pressed`, disclosures expose `aria-expanded`, tables have
   captions, and asynchronous/errors use live status or alert semantics. A shared focus-visible
   outline no longer relies on colour-only border changes. Ingestion/reconciliation tiles use a more
   opaque `workflow-surface`, while their ambient wash and canvas are reduced to 38%/25%; the canvas
   also follows OS reduced-motion preferences as well as the app toggle. Warning colour remains on
   actionable ambiguity, blocked-row, overlap and review states rather than neutral guidance. The
   204-test frontend suite, production build, light/dark signed-in browser review, 15-check live
   ingestion harness and 51-check live transfer harness are green.

## Follow-up hardening discovered in the same review

- Align the 5,000-row transaction cap with the optional reconciliation row and chunk categorisation
  beyond 300 distinct merchants.
- Validate categories and parent/subcategory combinations against the authoritative server taxonomy
  in `upsert-transactions`.
- Add regression coverage for consecutive distinct imports, partial-overlap reconciliation,
  partial failure, connected-account cutover enforcement, and saved-profile persistence. The live
  integration suite is the appropriate place for database/RLS behaviour.
