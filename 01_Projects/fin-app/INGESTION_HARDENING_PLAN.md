---
aliases:
  - Halcyon ingestion hardening plan
tags:
  - halcyon
  - projects/fin-app
  - ingestion
  - quality
type: implementation-plan
status: complete
project: Halcyon
updated: 2026-10-04
related:
  - "[[INGESTION_REVIEW]]"
  - "[[SYSTEM_INTEGRITY]]"
  - "[[TAXONOMY_AND_LEDGER_PLAN]]"
  - "[[CURRENT_STATUS]]"
---

# Halcyon — Ingestion hardening implementation plan

## Outcome

Make a large or imperfect CSV import fail safely, explainably and without
silently discarding completed categorisation work. The import contract must
remain atomic at the ledger boundary: an accepted batch either writes its
transactions, upload-batch record and optional reconciliation anchor together,
or writes none of them.

This is hardening of the current CSV workflow, not a new ingestion product.
It does not change provider sync, dedupe semantics, transfer-matching policy,
the taxonomy itself, or the user's existing financial data.

## What the audit established

Three items in the previous follow-up list are partly implemented already:

| Area | Existing protection | Remaining work |
|---|---|---|
| 300-merchant categorisation boundary | `CSVUploader` makes sequential requests of at most 300 merchants. | Centralise the chunk workflow, retain successful chunks if a later chunk fails, surface per-chunk progress/failure, and regression-test imports with more than 300 distinct merchants. |
| Base taxonomy validation | `upsert-transactions` resolves active global and tenant-custom category/subcategory pairs before the atomic RPC; the database trigger remains the final authority for rows written to `transactions`. | Complete: valid custom subcategories are canonicalized, while unknown, inactive, mismatched and cross-tenant pairs return 422 before persistence. |
| 5,000 row mutation boundary | Edge Function and SQL both limit submitted transaction rows to 5,000. | Set and enforce one user-facing *source-row* contract, including blocked/excluded source rows, and make the generated reconciliation row explicit in the contract and tests. |

The custom-subcategory gap is concrete: tenant custom subcategories are valid
in the database but do not exist in `_shared/taxonomy.ts`, so the current Zod
check rejects them before the database can validate and normalize them.

## Scope and contract decisions

### In scope

- A single shared, documented import-limit vocabulary in the client, Edge
  Function and SQL migration.
- Preflight taxonomy-pair validation for every distinct imported
  `(category, subcategory)` pair, including active tenant custom
  subcategories.
- Resilient categorisation chunk orchestration and transparent staging UI
  status.
- Integration, browser and golden-pass coverage for the affected boundaries.

### Explicitly out of scope

- Splitting one statement into several ledger upload batches.
- Changing the 5,000-row ceiling or rate-limit policy.
- Retrying Gemini requests automatically in a tight loop.
- Reclassifying historical transactions as part of import.
- Any migration, fixture run or reset against the personal Supabase stack.

### Contract to implement

| Name | Limit / rule | Reason |
|---|---:|---|
| `MAX_SOURCE_ROWS` | 5,000 rows in the parsed statement, before user exclusions or blocked-row filtering | The visible file limit must match the bounded atomic request, rather than permitting a 10,000-row source to reach a late server rejection. |
| `MAX_SUBMITTED_TRANSACTIONS` | 5,000 importable rows | Bounds payload size, hashing, dedupe and one atomic SQL insert. |
| `MAX_RECONCILIATION_ROWS` | 1 server-generated row per manual account import | The opening-balance offset is account state, not a source transaction; it does not consume source-row capacity and is never valid for a connected account. |
| `MAX_MERCHANTS_PER_REQUEST` | 300 | Preserves the Edge Function request/body and Gemini batching boundary. |
| categorisation failure | Preserve successful chunk results; unresolved failed chunks remain `Uncategorized` and `needsReview` | AI availability must not turn an otherwise valid statement into either a silent misclassification or a failed ledger import. |

`upload_batches.source_row_count` continues to mean physical CSV rows. Its
inserted, skipped and blocked counts retain their existing meanings; the
optional reconciliation amount/date remain separately recorded metadata, not a
source-row count.

## Implementation workflow

**Owner:** project owner / implementer  
**Accountable:** project owner  
**Review cadence:** before merge, and whenever import limits or taxonomy rules change

```text
Plan + isolated baseline
        |
        v
Source-row preflight ──too large──> explain limit; write nothing
        |
        v
Stage + deterministic bank/profile rules
        |
        v
Categorise merchant chunks ──a chunk fails──> retain successes; mark that chunk for review
        |
        v
User reviews staging rows and category corrections
        |
        v
Tenant-aware taxonomy preflight ──invalid──> 422; write nothing
        |
        v
Atomic import RPC + optional one reconciliation anchor
        |
        v
Upload-history/audit verification → transfer rescan → release gate
```

### Standard operating procedure for each implementation phase

1. Work from an isolated Git branch/worktree and leave the current real-data
   checkout untouched except for deliberately committed code/docs.
2. Read `SYSTEM_INTEGRITY.md`; do not use the default local Supabase project
   for reset-based or fixture-based validation.
3. Add the failing unit/integration test first, then implement the smallest
   boundary change that makes it pass.
4. Run TypeScript and unit checks before any database-backed test.
5. Apply new migrations only forward to a positively identified isolated
   Supabase project. Capture its URL/project ID and assert fixture cleanup is
   scoped to created tenant/user IDs.
6. Run the phase acceptance tests and review the actual database counts,
   upload-batch metadata, audit event and account balance.
7. Run the full golden pass after all phases. It owns a temporary isolated
   project and must never be pointed at the personal API port.
8. Review the diff, update `INDEX.md`, `CURRENT_STATUS.md` and this plan with
   what actually shipped, then commit the self-contained slice.

## Phased implementation plan

### Phase 0 — Baseline and executable contract

**Goal:** make the intended limits and observed current behaviour unambiguous
before changing a write path.

- Introduce named constants for the client import/source limits and merchant
  chunk size. Deno and SQL retain their own equivalent values because they
  cannot import frontend TypeScript; add comments/tests that bind them to the
  same contract.
- Add tests that prove the current boundary behaviour, including the existing
  5,000 submitted-row acceptance and 5,001 rejection, and record whether the
  optional generated anchor changes source versus ledger counts.
- Decide and document exact copy for over-limit files. It must say the file
  was not staged or imported, and direct the user to export a smaller date
  range—never imply that rows were partially accepted.

**Exit criteria:** one documented contract; tests demonstrate no ambiguity
between source rows, submitted transactions and the server-generated anchor.

### Phase 1 — Source-row and reconciliation boundary

**Goal:** reject oversized inputs at the earliest trustworthy boundary while
preserving atomicity and accurate audit/history metadata.

**Status: complete — 2026-10-04.** The browser rejects an oversized source
before profile lookup or staging; `upsert-transactions` and the forward SQL
migration reject it again. The isolated golden pass proved 5,000 source rows
create 5,000 source transactions plus one separately recorded reconciliation
anchor, while a 5,001-row request returns 422 without changing the account.

- In `CSVUploader`, reject a parsed file with more than `MAX_SOURCE_ROWS`
  before profile lookup, AI mapping or staging. Keep the selected account and
  provide a clear recoverable error.
- In `upsert-transactions`, enforce `source_row_count <= MAX_SOURCE_ROWS`, not
  only `transactions.length <= 5,000`. Keep the same condition in a new
  forward SQL migration for `import_transactions_atomic`; never edit an
  applied migration.
- Validate count relationships without assuming every source row is submitted:
  users may exclude valid rows and blocked rows are deliberately omitted.
- Confirm a manual-account import with 5,000 submitted rows may still create
  exactly one reconciliation row, that it is recorded only in reconciliation
  metadata, and that connected accounts cannot create one.

**Acceptance tests:**

- 5,000 source/importable rows succeed with correct `upload_batches` counts.
- 5,001 source rows are rejected in the UI and as a direct Edge Function call;
  neither path creates transactions, upload batches, audit records or balance
  changes.
- 5,000 submitted rows plus a manual reconciliation produces one protected
  anchor and a correct final balance.
- The same request for a connected account is rejected and leaves all data
  unchanged.

### Phase 2 — Resilient >300-merchant categorisation

**Goal:** make the existing chunk loop a durable workflow rather than an
all-or-nothing client-side implementation detail.

**Status: complete — 2026-10-04.** `categorizeChunks.ts` keeps every
successful bounded response, continues after a recoverable later failure and
returns only failed merchant keys. The staging buffer preserves deterministic
bank assignments and marks unresolved rows from failed chunks for review. Unit
tests cover 301/601 merchants, exact cumulative stats, continued processing
and partial failure; the isolated golden pass confirms the server still
rejects an oversized 301-merchant request.

- Extract chunking/orchestration from `CSVUploader` into a pure helper with
  `MAX_MERCHANTS_PER_REQUEST = 300`, deterministic ordering, cumulative stats
  and a progress callback. It must make no assumptions about React state.
- Apply each successful chunk immediately to the staged buffer or retain its
  result for an equivalent final merge. If another chunk fails, do not discard
  earlier successful assignments.
- Continue through independent chunks after a recoverable request failure.
  Failed-chunk merchants remain `Uncategorized`/`needsReview`; show their
  merchant/row count and a non-blocking “categorisation incomplete” status.
  The user can correct rows in staging and still import.
- Do not silently retry a failed AI request. A deliberate retry action may be
  added only if it observes `Retry-After` and the existing per-user rate
  limit; it is not required for this slice.
- Ensure categorisation progress announces current/total chunks accessibly and
  the staging table never presents a failed merchant as successfully resolved.

**Acceptance tests:**

- 301 and 601 distinct merchants produce 2 and 3 bounded requests,
  respectively, with exact aggregate stats.
- A second/late chunk failure preserves earlier assignments, marks only the
  failed merchants for review, permits import and records accurate
  `needs_review` counts.
- A bank classification and a user rule retain their existing precedence
  across chunk boundaries.
- No request exceeds 300 merchants; an integration test confirms the Edge
  Function still rejects 301 in one call.

### Phase 3 — Tenant-aware taxonomy validation

**Goal:** guarantee every persisted pair is valid for the importing tenant and
return a useful 422 before entering the import RPC.

**Status: complete — 2026-10-04.** The import Edge Function now resolves
active global and tenant custom pairs case-insensitively into canonical display
names before hashing or calling the atomic RPC. The staging table includes the
active tenant custom options so a resolved custom value remains visible and
editable. The Edge Function returns a controlled 422 for unknown, mismatched,
inactive or cross-tenant values while the SQL trigger remains the final
integrity guard. The isolated golden pass verified a custom subcategory
receives its durable custom identity, invalid values create no rows, and a
browser-role direct table write remains denied.

- Replace the static-only subcategory gate in `upsert-transactions` with a
  two-stage approach: static shape/top-level validation first, then a single
  tenant-scoped lookup over the distinct submitted pairs.
- Resolve global taxonomy pairs and active `tenant_subcategories` case-
  insensitively to their canonical display names. Reject unknown category,
  mismatched global pair, inactive custom subcategory, or a custom
  subcategory belonging to another tenant/category with a 422.
- Preserve the reserved-reconciliation rule in the Edge Function and keep the
  database trigger as the final defence. The preflight improves error shape;
  it must not weaken SQL enforcement or RLS.
- Update the client staging vocabulary only if needed to display existing
  tenant custom subcategories. Do not add client-side authority for their
  validity.

**Acceptance tests:**

- Valid global category/subcategory pair imports and receives the expected
  stable IDs.
- Invalid category and mismatched pair return 422 with zero partial writes.
- An active custom subcategory for the importing tenant imports, normalizes to
  its canonical display name, and receives `custom_subcategory_id`.
- The same custom label is rejected for another tenant and for the wrong
  parent category.
- Direct database/RPC bypass remains unavailable to authenticated browser
  roles; trigger/RLS checks still pass.

### Phase 4 — Full regression gate and release handoff

**Goal:** prove the composed path, document it, and create a stable next
feature baseline.

**Complete — 2026-10-04.** The isolated golden suite covers sequential
partial-overlap imports, reconciliation-anchor replacement, atomic rollback,
connected-account cutover enforcement and saved-profile upsert persistence.
Its runner supports a separate isolated Gate 2 invocation and waits for the
function server before narrowly removing only containers labelled with its
generated project ID. Categorisation chunks now also time out after one minute
and take the same safe partial-failure path as a rejected request; a unit test
proves later chunks still run. The static gate, full isolated golden pass and
six-file Gate 2 representative-corpus run are green. Gate 2 processed 2,850
rows across 605 merchants; its fresh-review pass made no transaction writes or
merchant-cache changes and had zero actionable expectation findings. A forward
security migration also removes legacy direct browser transaction mutations,
leaving the validated Edge Function/RPC path as the ledger write boundary.

- The self-provisioned golden harness covers sequential imports,
  partial-overlap dedupe/reconciliation, rollback/zero-write failure,
  connected cutover, profile persistence, all count boundaries and
  custom-taxonomy cases.
- Focused Vitest coverage now includes a timeout-driven partial failure as
  well as chunk shape/order and rejected-request recovery. A browser-only
  injected timeout is intentionally unnecessary: the pure runner supplies the
  deterministic seam and the rendered flow exercises the real endpoint.
- `npm run test:gate2` runs the six-file representative CSV suite on the same
  safe, generated-stack lifecycle as `npm run test:golden`. The runner
  confirms project-labelled container removal after shutdown and leaves only
  its aggregate quality report outside the repository's disposable stack.
- Re-run the manual smoke path with a non-sensitive sample: choose account →
  saved profile → stage → categorise → correct a row → reconcile → commit →
  inspect upload history → undo in the isolated environment.

**Exit criteria:** all acceptance tests pass; no live test ran against the
personal stack; docs map the final limits and helper/function locations; a
commit contains code, migrations, tests and documentation together.

## Testing matrix

| Layer | Focus | Required evidence |
|---|---|---|
| Pure unit tests | source cap helper, chunk partitioning/order, cumulative stats, partial failure result, taxonomy-pair normalization inputs | `cd app && npm test` |
| Edge Function contract | 422 limits/taxonomy failures, one-account/batch rules, category source and audit payload | focused Deno/HTTP harness against an isolated stack |
| SQL integration | atomic rollback, 5,000 + one anchor, count metadata, stable/custom taxonomy IDs, connected cutover | extended `app/scripts/test-ingestion.mjs` against an isolated target |
| Browser | readable over-limit failure, chunk progress/failure status, staging corrections remain importable | Playwright plus `npm run test:browser:typecheck` |
| Representative data | five bank CSVs, mappings, dedupe, classifications and import quality | Gate 2 harness on an isolated stack |
| Release | migrations replay, real Edge Functions, rendered account/import/transfer/categorisation flow and fixture cleanup | `cd app && npm run test:golden` |

The minimum per-phase local command set is:

```bash
cd app
npm test
npm run build
npm run test:browser:typecheck
```

Database-backed commands run only after the target is positively identified as
isolated, as required by `SYSTEM_INTEGRITY.md`.

## Risks and controls

| Risk | Control |
|---|---|
| A limit change permits a partial import | Reject before commit; SQL remains the final cap; assert zero transactions/batches/audits on rejection. |
| A failed categorisation chunk overwrites good classifications | Preserve successful chunk results and classify failed merchants as unresolved, never as guessed values. |
| A custom taxonomy lookup leaks another tenant's label | Query custom subcategories through the RLS-scoped tenant context and test cross-tenant rejection. |
| Static taxonomy and database taxonomy drift | Treat database triggers as final authority; add explicit import tests for global and custom pairs. |
| Live validation damages personal data | Use only the isolated stack and golden-pass lifecycle; no resets or fixture cleanup on the personal stack. |
| Large work becomes a feature rewrite | Keep every phase independently deployable and do not introduce statement splitting, background jobs or new AI retry policy in this hardening slice. |

## Definition of done

Ingestion hardening is complete when a 5,000-row source file has one clear,
consistent outcome at every boundary; a 5,001-row file changes nothing; imports
with hundreds of merchants retain completed categorisation when a later chunk
fails; valid tenant custom subcategories import safely; invalid taxonomy pairs
are rejected before persistence; and the isolated integration, browser,
representative-data and golden-release checks are green.
