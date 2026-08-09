# Halcyon Application Index

This index serves as a mental map of the system's architecture and current state for development purposes.

## Architecture Overview
The application is a modern finance tracker built with a React frontend and a Supabase backend.
- **Frontend:** React, TypeScript, Vite, TailwindCSS (located in `app/`).
- **Backend:** Supabase Local Development Environment (located in `supabase/`).
- **Data Engine:** Powered by Supabase Edge Functions for secure API handling and complex operations.

## Directory Map

### `app/` (Frontend)
- `src/`
  - `components/` - React UI Components.
    - `Shell.tsx` - Main application layout and routing.
    - `CSVUploader.tsx` / `UploadHistory.tsx` - Data ingestion components. (`CSVPreviewTable.tsx` was retired when the staging table replaced the read-only preview — see `app/src/components/ingest/`.) On a provider-connected account, `CSVUploader` renders in "historical import" mode: no balance step, no reconciliation anchor — the provider owns the balance from its `cutover_date` forward.
    - `InvestmentCSVUploader.tsx` - Adapter-driven managed-investment import review and unit reconciliation. Vanguard Personal Investor is the first adapter; the account/instrument/activity model is not Vanguard-specific, and only the final four account digits leave the browser.
    - `InvestmentAccountActivity.tsx` / `InvestmentTaxAwareness.tsx` - Invest-account detail surface: verified NAV/date, units, contribution-neutral return, value-vs-contributions history, activity ledger with linked cash-account state, Australian financial-year summaries, disposal flags, protected AMMA workflow status, and record-summary CSV export. Tax copy explicitly avoids presenting the summary as tax or CGT advice.
    - `InvestmentCashLinker.tsx` - Cross-ledger funding review inside Transfer review: confirm/reject suggestions, inspect or undo automatic purchase/redemption matches, and preserve cash distributions as income.
    - `ConnectBankModal.tsx` - Up Bank connect flow: token → map every returned Up account at once → one shared chunked backfill → success. Each account gets its own new/existing-account choice and a "History to import" preset (All history / 12mo / 90d / 30d / custom for a new account, defaulting to All history via the account's real `created_at`; "No overlap"/recommended plus the same presets for an existing account). Calling `refreshData()` mid-flow would unmount this modal (see `contexts/DataContext.tsx` note below), so it's deferred to the modal's own close.
    - `EditAccountModal.tsx` - Identifiers + danger zone, plus (when the account is connected) a bank-connection card: status chip, last-synced, "Sync now", "Extend history" (calls `extend-provider-history` then re-runs the same backfill loop as `ConnectBankModal`), "Disconnect" (`keep_transactions` choice, default keep), collapsible recent `sync_runs` history.
    - `Controls.tsx` - Reusable UI components (Buttons, Inputs).
  - `contexts/` - React Contexts.
    - `DataContext.tsx` - Global state management and Supabase fetch layer. Its initial `loadState` (`loading`/`ready`/`error`) and non-blocking `isRefreshing` state let the route-level `ViewDataBoundary` render a matching skeleton/error state without unmounting an already-visible page on mutation refresh. Onboarding redirects only after a successful empty-account response; required profile/account/transaction failures render a retry state instead. Optional enrichment failures retain safe defaults. It fires background syncs, deduped per session, for stale bank connections and managed-fund NAVs, and reads the SQL `net_worth_monthly` series that combines cash and investment valuation history.
  - `lib/` - Utilities and Clients.
    - `supabaseClient.ts` - Frontend client initialized with Anon Key.
    - `categoryColor.ts` - `catColor(name)` → the `--cat-N` token for a category, by taxonomy index. Single source of truth: this was duplicated verbatim in `ExpenseFlowCard.tsx` and `concept/pacingData.ts`, both hardcoding `% 7`. An unknown name returns the neutral `--cat-unknown` rather than silently impersonating a real category (the old `((i + 7) % 7) + 1` form mapped `-1` onto `--cat-7`).
    - `categorizePending.ts` - Loops `categorize-pending` until `done`, called after every provider sync.
  - `data.ts` - System types, mock structures, and core constants.

### `supabase/` (Backend)
- `functions/` - Deno-based Edge Functions.
  - `_shared/withAuth.ts` - **The request pipeline every function uses.** Origin check → JWT verify → rate limit → tenant/role resolution → Zod validation → handler → audit. Add new functions through this, not by hand.
  - `_shared/rateLimit.ts` - Sliding-window limiter (Upstash, with in-isolate fallback) and the named `LIMITS` table.
  - `_shared/cors.ts` - Origin allowlist driven by `ALLOWED_ORIGINS`. Never `*`.
  - `auth-session/` - HttpOnly refresh-token broker (login/refresh/logout). The only function with `verify_jwt = false`; it does its own origin, rate-limit and lockout checks.
  - `_shared/taxonomy.ts` - **Authoritative** category vocabulary. Validates all AI output; a drift from `app/src/data.ts` is a data-integrity bug.
  - `_shared/dedupe.ts` - Server-side content hashing (mirrors `app/src/lib/csv/dedupe.ts`).
  - `analyze-csv/` - Gemini 2.5 column mapping, incl. detecting the bank's own Category columns. Reply is Zod-validated and every returned column must exist in the submitted header.
  - `import-investment-activities/` / `delete-investment-upload-batch/` - Validated, audited, idempotent managed-investment ledger writes. Server-side hashes preserve genuine repeated rows while skipping re-imports; balances switch to valuation ownership and cannot be restated by ordinary account edits.
  - `sync-investment-prices/` / `sync-investment-prices-cron/` - Authenticated on-demand/stale refresh plus exact-service-bearer scheduled refresh. The provider adapter retains real publication dates, replays a correction window, preserves the last good valuation on failure, and serializes concurrent runs per instrument. See the cron function's README for scheduling.
  - `update-investment-tax-record/` - RLS-proven, service-role-pinned and audited AMMA workflow status mutation. Authenticated browser clients have read-only table grants and cannot bypass this boundary.
  - `decide-investment-cash-link/` - Validated/audited confirm or reject boundary for one cross-ledger funding match; the service-only RPC records content identity so the verdict survives source deletion and re-import.
  - `categorize-merchants/` - The **CSV** categorisation path: resolves merchants for rows the caller has staged but not yet committed, and returns the answers for the caller to apply. Thin wrapper over `_shared/categorize.ts`.
  - `categorize-pending/` - The **provider** categorisation path: sweeps rows already in the ledger that have never been through the tiers (`category_source IS NULL`), resolves their merchants, and writes categories back via the `apply_merchant_categories` RPC. Exists because `sync-provider` deliberately never calls Gemini (Law 5) and `upCategoryMap` only covers what Up's own category ids label — everything else arrived Uncategorized with nothing to pick it up. Chunked at PostgREST's `max_rows` (1000) with the same `done`/`progress` contract as `sync-provider`; the client loops via `app/src/lib/categorizePending.ts`, called after every sync.
  - `_shared/categorize.ts` - The tier resolution core both paths share (user rule → cache → Gemini, batched ~50/call, enum-constrained, cached back as `source='ai'`). Shared so the same merchant can never categorise differently depending on whether it arrived by CSV or API. Guards the reserved `Transfer > Reconciliation` subcategory against AI assignment — `transfer_candidates` excludes it by name, so an AI-assigned Reconciliation would silently drop a real transaction out of transfer matching.
  - `apply-merchant-rule/` - Records a user correction as a permanent `source='user'` rule and back-fills existing rows.
  - `delete-account/` - Cascading account deletion (requires tenant `admin`).
  - `delete-user-account/` - Schedules user deletion after a 30-day grace period (requires `owner`).
  - `upsert-account/` / `upsert-transactions/` / `upsert-profile/` / `delete-upload-batch/` - DB write operations. `upsert-profile` manages CSV static profiles; `update-callsign`, `manage-account-identifier`, `record-user-session`, `revoke-other-session-records`, and `restore-user-account` cover their respective application writes with the same `withAuth` + Zod + audit boundary. `upsert-transactions` computes dedupe hashes **and the `transfer_candidate` flag** server-side and returns `{inserted, skipped, needsReview}`.
  - `link-transfers/` - Rescans a date window (padded ±`WINDOW_DAYS`), calls `_shared/transferMatch.ts` to score/pair candidate legs, persists via the `replace_transfer_links` RPC, writes back inferred `account_identifiers` for auto-linked pairs. Body: `{scope:'window',from,to}` or `{scope:'all'}`.
  - `decide-transfer/` - Records a user verdict (`confirmed`/`rejected`/`external`) on either an existing `transfer_links` row (`{link_id, verdict}`) or a single unmatched leg with no counterpart (`{txn_id, verdict}`, `external`/`rejected` only — `confirmed` needs a pairing to assert). Durable via `transfer_decisions`, content-keyed so it survives delete-and-reimport.
  - `_shared/transferMatch.ts` - Mirrors `app/src/lib/transfers/{classify,match}.ts` (O(N) bucketed transfer-candidate scoring). See `supabase/CLAUDE.md` for the mirror-pattern discipline.
  - `_shared/crypto.ts` - AES-256-GCM for third-party API tokens (SRD Law 4), keyed by `PROVIDER_TOKEN_KEYS` (version → base64 key), AAD-bound to `tenantId:provider:connectionId` so a ciphertext can't be copied into another tenant's row and decrypt.
  - `_shared/upClient.ts` - Up Bank REST client: retry/backoff, rate-limit backoff, account/transaction fetch, pagination cursor helpers.
  - `_shared/upCategoryMap.ts` - Up category id → Halcyon taxonomy, same discipline as `bankCategoryMap.ts` (unmapped falls to AI, never a catch-all).
  - `_shared/runLinkTransfers.ts` / `_shared/runInvestmentCashLinks.ts` - Bank-to-bank and cross-ledger linking orchestration. Provider sync invokes both in-process after committing a batch; investment import invokes the cash matcher after genuine new activities. Both paginate beyond PostgREST's row cap.
  - `_shared/investmentCashMatch.ts` - Exact-value, four-day, bounded purchase/redemption matcher mirrored by `app/src/lib/investments/cashMatch.ts`; DRP/distributions/non-cash adjustments never enter its candidate set.
  - `connect-provider/` - Validates a Personal Access Token live against Up (`/util/ping`) before storing anything, encrypts it, upserts `provider_connections`/`private.provider_credentials`. Owner-only.
  - `map-provider-accounts/` - Links one Up account to one Halcyon account (existing or new), sets `cutover_date` (CSV owns history before it, API owns forward). Does **not** write the reconciliation anchor — see `sync-provider/` below for why that moved.
  - `sync-provider/` - Chunked, resumable backfill/incremental sync (~45s budget per call, cursor persisted after each committed page). Handles pending (HELD) transaction refresh, never clobbers a user's own category correction, revokes+deletes the credential on a 401, and runs `runLinkTransfers` over the dates it touched before returning. Refreshes `accounts.balance` from Up every successful run (fetched once via `listUpAccounts`, reused across every account_connection on the call — was previously only ever set once, at connect time, and went stale). The **reconciliation anchor** is computed here too, exactly once, the instant a per-account backfill actually finishes (`backfill_done` flips false→true within the call) — `balance_now - sum(everything already in the ledger)`, which is only correct computed *after* backfill lands, not before: computing it beforehand (the old design) double-counts every transaction between `cutover_date` and "now" once cutover isn't pinned to today. `extend-provider-history/`'s whole trick is resetting `backfill_done`/`backfill_cursor` and letting this same reconciliation re-run.
  - `disconnect-provider/` - Removes a connection; `keep_transactions` (default true, explicit) decides whether the provider's rows stay.
  - `extend-provider-history/` - Moves an already-connected account's `cutover_date` earlier (owner-only), same overlap-floor check as `map-provider-accounts`. Doesn't touch the anchor itself or fetch anything from Up — just resets backfill state so the next `sync-provider` call walks the newly-exposed range and reconciles at the end, same as a fresh connect.
  - `rotate-provider-keys/` - Re-encrypts every tenant's stored credential under the newest `PROVIDER_TOKEN_KEYS` version. Platform-admin only (JWT `app_metadata.admin`), not tenant-scoped — it reaches across every tenant's credentials by design.
- `migrations/` - SQL schema definitions.
  - `20260804000000_auth_hardening.sql` - Tenancy, session registry, brute-force state, audit log, membership-based RLS, and the grant assertions.
  - `20260804010000_ingestion_engine.sql` - `merchant_rules` cache, transaction dedupe columns + unique index, `apply_merchant_rule`.
  - `20260806000000_transfer_linker.sql` + three follow-ups (`_rejection_unblock`, `_decision_outranks_category`, `_decide_transfer_leg`) - `account_identifiers`, `transfer_links`, `transfer_decisions` tables; `transactions_analytic` view (`is_transfer`/`transfer_state`, `security_invoker=true`); RPCs `transfer_candidates`, `account_identifier_map`, `transfer_match_exclusions`, `replace_transfer_links`, `decide_transfer`, `decide_transfer_leg`. `DataContext` now reads `transactions_analytic`, not `transactions`, directly.
  - `20260807000000_provider_connections.sql` - `private` schema (RLS + zero grants to `anon`/`authenticated`, listed in `config.toml`'s `[api] schemas` only because PostgREST needs it there for `service_role` to reach it at all — grants are the actual boundary). `provider_connections`/`private.provider_credentials`/`account_connections`/`sync_runs` tables; `transactions` gains `provider`/`external_id`/`pending`/`provider_posted_at`/`provider_transfer_account_id`; `transfer_candidates` excludes `pending` rows.
  - `20260808000000_provider_transfer_linking.sql` - `transfer_candidates` also returns `provider`/`provider_transfer_account_id`, so `link-transfers` can resolve Up's own `transferAccount` signal into a Halcyon account id and treat it as ground truth (bypasses the fuzzy scorer entirely when it resolves).
  - `20260809000000_apply_merchant_categories.sql` - `apply_merchant_categories(tenant, jsonb)` RPC: bulk category write-back for `categorize-pending`, one UPDATE instead of thousands of PostgREST round trips (Law 2). `SECURITY INVOKER` so RLS still applies, and refuses to overwrite a `category_source='user'` row regardless of what the caller passes.
  - `20260818000000_investment_foundation.sql` through `20260818017000_restore_investment_balance_cache.sql` - Generic instrument/holding/activity/price/valuation/sync/tax-record tables; safe set-based NAV rebuild; concurrency guard; performance and mixed-net-worth views; Australian financial-year activity summaries. Price sync composes the same account-scoped valuation function used after genuine activity imports; a zero-row duplicate does not call it or touch cached balance/date. The final migration repairs caches already zeroed by the original bug from their untouched latest valuation snapshot. Global reference prices/catalogue are readable but not publishable by tenant clients; all tenant tables are membership-RLS scoped.
  - `20260818018000_investment_cash_reconciliation.sql` - `investment_cash_links` plus durable content-keyed decisions, service-only atomic replace/decide RPCs, RLS/grant assertions and `transactions_analytic` integration. Suggested/auto/confirmed funding legs are transfers; the newest human verdict wins.
- `config.toml` - Ports, auth settings (15-min JWT, OAuth providers), per-function JWT policy.

### `app/src/lib/csv/` (Ingestion library)
Pure, UI-free, unit-tested. Both the staging preview and the server share this logic.
- `normalizeMerchant.ts` - The cache key. Stability is valued over prettiness: over-normalising would MERGE DISTINCT MERCHANTS, which is worse than a slightly ugly key.
- `parseDate.ts` - Returns `null` on failure, **never today's date**. Builds local dates (no UTC day-shift).
- `parseAmount.ts` - String-based cents conversion (no `parseFloat * 100` drift). Handles `.13`, `(12.34)`, European separators.
- `bankCategoryMap.ts` - Tier 1 translation of bank categories. Unmapped values return `null` and defer to AI rather than being dumped in a catch-all.
- `dedupe.ts` / `pipeline.ts` - Content hashing and the staging orchestration (`stageRows`, `applyAssignments`, `toTransactionPayload`, `buildAnchor`).

### `app/src/lib/investments/` (Managed-investment ingestion)
Pure decimal-safe adapters and tests. `vanguard.ts` recognizes Vanguard Personal Investor exports and maps purchases, redemptions and DRP rows into the generic activity vocabulary; `decimal.ts` avoids floating-point drift in units and prices; `vanguardPrices.ts` validates normalized official price fixtures. Adding another platform or instrument is an adapter/catalogue addition, not a new account schema.

The end-to-end feature contract, operating checks, duplicate-import invariant and shipped
bank-to-investment reconciliation are documented in `MANAGED_INVESTMENTS.md`.

### `app/src/lib/transfers/` (Transfer matching)
Pure, UI-free, unit-tested — mirrored server-side by `supabase/functions/_shared/transferMatch.ts`.
- `classify.ts` - Extracts transfer signals (reciprocal masks, embedded dates, lexicon hits, direction cues, institution names) from `original_description`.
- `match.ts` - O(N) bucketed candidate generation by absolute amount, then weighted scoring, then greedy mutual-best assignment into `auto`/`suggested` pairs. Bucket sizes above `MAX_BUCKET` are skipped and reported, never partially scored.
- `constants.ts` - Weights, thresholds (`AUTO_THRESHOLD`, `SUGGESTED_THRESHOLD`), `MATCHER_VERSION` (bumping this invalidates stale `auto`/`suggested` links on next rescan without touching user decisions).

### `app/src/components/OskoLinker.tsx`
The transfer review panel (SRD "Same-Day Osko Linker"), mounted in `views/Ingestion.tsx`. Three
surfaces: suggested pairs needing a decision, a collapsed "linked automatically" list with undo,
and a collapsed "possible transfers — not matched" list for candidate legs with no counterpart
(reviewed via `decide-transfer`'s `{txn_id, verdict}` path). Nothing here rewrites a transaction's
category — a decision is durable state layered on top (`transfer_decisions`), which is what lets a
rejection or an unmatched-leg verdict survive a delete-and-reimport.

### Tests
`npm test` (vitest, in `app/`) - 180 unit/corpus/pipeline tests over the real files in `Sample datasets/`, including managed-investment decimal/parser/price/cash-matcher fixtures and transfer-matcher corpus tests. Environment-dependent tests are skipped unless their keys are set.

`app/scripts/` integration harnesses — local stack up, `SUPABASE_ANON_KEY` set, plus
`npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local`:
- `test-rls-isolation.mjs` - Two users, two tenants; drives B's JWT at every one of A's rows. Covers `account_identifiers`/`transfer_links`/`transfer_decisions` and the transfer-linker RPCs.
- `test-edge-auth.mjs` - Middleware: auth, CORS, validation, tenant-injection, rate limits, audit.
- `test-token-broker.mjs` - Cookie attributes, rotation, lockout, user-enumeration parity.
- `test-analyze-csv.mjs` - Column-mapping quality per bank format, incl. the papaparse-shape regression guard.
- `test-ingestion.mjs` - Deduplication: re-import, genuine same-day repeats, partial overlap, tenant isolation.
- `test-categorization.mjs` - Taxonomy containment, categorisation quality, cache cost, user-rule precedence.
- `test-transfers.mjs` - Detection, analytics exclusion, idempotency, the reject-then-find-the-real-pair regression, unmatched single-leg decisions, tenant isolation.
- `test-investments.mjs` - 70 live-stack checks over the real anonymized Vanguard corpus: exact units/cents; bank-first cross-ledger funding; all four funding pairs; analytics, DRP and distribution semantics; durable decisions; direct-write denial; tenant isolation; unpriced/priced re-import dedupe; valuation ownership; price history; performance; mixed net worth; Australian FY and protected/audited AMMA workflows.
- `supabase/functions/_shared/cors_test.ts` - `deno test` unit tests for the origin allowlist.

## Current State Notes
- **Authentication:** Supabase Auth (GoTrue) is the credential store and token issuer — email/password, magic link, and OAuth2/OIDC for Google and GitHub. Access tokens are stateless JWTs with a **15-minute** expiry; refresh tokens are DB-backed and rotated. Sign-in state lives in `contexts/AuthContext.tsx` (session, user, tenantId, role, isAdmin); `DataContext` consumes it rather than receiving a session prop.
- **Routing:** Real URLs via `react-router-dom`, with `RequireAuth` / `RequireOnboarded` / `RequireAnon` / `RequireAdmin` guards in `components/Guards.tsx`. `useView()` still works and is backed by the router, so `go('dashboard')` calls are unchanged. Auth callbacks live at `/auth/callback` and `/auth/reset`.
- **Tenancy:** Every financial table is keyed on `tenant_id`, and RLS is membership-based (`is_tenant_member` / `has_tenant_role`), not `auth.uid() = user_id`. Today each user owns exactly one personal tenant, auto-provisioned by the signup trigger — the multi-tenant shape is in place ahead of any org UI.
- **Browser data-access boundary:** frontend code reads application data through RLS and invokes Edge Functions for every application-database mutation; `app/src/lib/writeBoundary.test.ts` statically rejects direct PostgREST mutations and `supabase.rpc()` calls. `supabase.auth.*` remains client-side only for GoTrue identity/session lifecycle, not application tables.
- **Guardrails that will fail a migration:** the final migration asserts that every `public` table has RLS enabled, that `anon` holds no grants, that no role holds `TRUNCATE` (which RLS does *not* filter), and that `service_role` retains `INSERT` everywhere. Adding a table without RLS breaks `db reset` by design.
- **Not yet wired:** the SPA still uses supabase-js localStorage sessions; the `auth-session` broker is deployed and tested but not yet the app's login path. Refresh-token *reuse detection* (family revocation) is unconfirmed — see the note in `auth-session/index.ts`.
- **CSV Ingestion:** One engine (`components/CSVUploader.tsx`), hosted both inside an account and full-page at `/ingestion` with an account selector. Five steps: drop → map → stage → reconcile → commit. `views/Ingestion.tsx` no longer parses anything itself; its old implementation wrote to `accounts[0]` with no batch id and has been retired.
- **The taxonomy is 8 expense categories and its ORDER IS LOAD-BEARING.** `--cat-N` is assigned by array index (`app/src/lib/categoryColor.ts`), not by name, so appending a category is safe but **reordering silently reassigns every chart colour**. A 9th needs a new `--cat-9` in both themes or it wraps onto `--cat-1` and becomes indistinguishable from Food. `Income`/`Transfer`/`Investing` sit outside the expense set (no hue, excluded from spending analytics) — `Investing` because buying assets isn't consumption. `Other` and `Uncategorized` are deliberately different things: `Other > Misc` is "reviewed, genuinely miscellaneous" and counts as spending; `Uncategorized` is "nothing could determine this" and stays in the review queue. Defined twice with no compiler link — `supabase/functions/_shared/taxonomy.ts` (authoritative) and `app/src/data.ts` — so a drift between them is a data-integrity bug.
- **Two categorisation entry points, one engine.** CSV rows are categorised *before* commit (`categorize-merchants`, called from the staging step); provider rows are categorised *after*, by the out-of-band `categorize-pending` sweep that runs on the client after every sync. Both go through `_shared/categorize.ts`. A row that has never been through the tiers is identifiable by `category_source IS NULL` — that is the sweep's work queue, and the reason `category_source` is stamped even when the answer comes back `Uncategorized` (it records "asked and unanswerable", so the next sweep doesn't pay for the same merchant again).
- **Categorisation is merchant-keyed, four tiers, cheapest first:** user rules → the bank's own Category column → the `merchant_rules` cache → Gemini for the remainder, batched ~50 per call. A 3000-row file asks about ~200 merchants once; the next import of that bank costs **zero** AI calls. Every AI answer is cached (including failures, so no merchant is ever asked about twice), and a user correction writes a `source='user'` rule that outranks the AI permanently.
- **The AI cannot invent a category.** Output is enum-constrained in the Gemini `responseSchema`, then re-validated server-side against `_shared/taxonomy.ts`; anything unrecognised becomes `Uncategorized` + `needs_review`. This protects the 7-hue `--cat-*` cycle, the `ExpenseFlowCard` colour mapping, and the budget joins.
- **Deduplication:** `(account_id, dedupe_hash, occurrence)` is unique. `occurrence` is the ordinal **within an import batch, always counted from 0** — counting from the account's existing total would mean a re-import never collides. Re-importing a statement therefore reports "0 imported, N skipped" and leaves the balance and anchor row untouched; two genuinely identical same-day purchases still both import.
- **Bad data is quarantined, not guessed.** An unparseable date or amount blocks that row and is shown in the staging table; it is never dated "today" or coerced to $0.00, which is what the old importer did silently.
- **Secrets:** `analyze-csv` and `categorize-merchants` need `GEMINI_API_KEY` in `supabase/.env.local` (pass `--env-file supabase/.env.local` to `functions serve`, or they fail with "GEMINI_API_KEY is not configured"). Capped at 20 and 60 calls/hour/user respectively.
- **Money convention:** every `balance`/`amount` column is integer **cents**, end to end — DB, `DataContext`, and every analytics lib (`lib/pacing.ts`, `lib/recurring.ts`, `lib/stats.ts`, `lib/cadence.ts`). Conversion to dollars happens in exactly two places: `fmt()`/`fmtCents()` in `data.ts`. Add a new money display by calling one of those — never format a raw amount inline, that pattern is how this bug happened five separate times (see `CONTEXT.md`'s 2026-08-05 entry). `app/src/lib/csv/*` money helpers (`CSVUploader.tsx`, `ingest/StagingTable.tsx`) are the one deliberate exception, for the pre-commit staging preview.
- **Fixed 2026-08-07 — Dashboard/HeroCard audit, six issues closed in one pass (all found in the same
  audit that fixed the 30-day income/expense windows above):** Asset Allocation now buckets `Savings`
  into Cash alongside `Liquid` (was only `Liquid`/`Invest` — `Debt`/`Credit Card`/`Loan` are
  liabilities and deliberately still excluded from the donut, not bucketed as $0). Holdings renders
  every linked account instead of a hardcoded `slice(0, 6)` that disagreed with its own "N linked"
  tag. The three fabricated percentage badges (income "+4.2%", expense "-1.8%", net-worth "+0%", all
  hardcoded strings) are now real vs-prior-30-days and vs-start-of-month computations, with
  arrow/color following the sign dynamically — `HeroCard` gained a `monthChangePct?` prop for the
  net-worth one, reusing `Dashboard.tsx`'s existing `netWorthTrend` loop rather than a second
  calculation. "Recent activity"'s tag and row count now share one `RECENT_ACTIVITY_COUNT` constant
  instead of silently disagreeing (tag said 5, rendered 10). Budget Capacity no longer fabricates a
  $500 fallback for categories with no real budget row — since there's no budgets-management UI
  anywhere in the app yet, every category was hitting this fallback, i.e. 100% invented, not an edge
  case; the tile now shows only real budget rows and an honest empty state ("No budgets set yet")
  when there are none. Net worth trend's month-by-month delta now excludes `pending` (HELD)
  transactions, matching every other aggregate in the app.
- **Fixed 2026-08-07 — the Expenses → Recurring hub tab was completely non-functional for every real
  user.** `buildRecurring()` read `data.transactions` — a hardcoded, permanently-empty mock array left
  over from before the app moved to live Supabase data — instead of `useData()`, so the tab always
  showed the empty state regardless of real ledger content. Signature changed to
  `buildRecurring(transactions, accounts, today?)`, both required (no silent fallback to nothing
  possible again); `RecurringHub.tsx` now passes live data through. Bundled in the same fix: the
  detection loop never excluded `isTransfer`/`pending` rows, so a recurring internal sweep (e.g. a
  fortnightly savings transfer) could get detected as a recurring *expense commitment* — now excluded,
  matching every other spend aggregate in the app. The "Funding accounts breakdown" card and each
  directory row also hardcoded three fictional account names (`Operations Checking`/`Sapphire Credit
  Line`/`Auto Loan // Vehicle`) for their color/label mapping — replaced with a `fundingAccountGlow`
  resolved from the real `accounts` list at build time. Two accuracy additions landed alongside the
  rewiring: step-change detection (`Series.priceChange`) reclassifies a subscription that changed
  price once as `'fixed'` with the change annotated, instead of the whole series reading as noisy
  `'variable'`; and a "renews in Nd" callout when an active series' `nextExpected` falls within 14
  days. `recurring.ts` had zero test coverage before this — new `recurring.test.ts` covers cadence
  detection, the `MIN_OBSERVATIONS` guard, erratic-amount rejection, the transfer/pending exclusion,
  dormancy, the step-change classifier, and funding-account glow resolution. Verified against the real
  account: 8 real active commitments detected (was 0), funding accounts show `AMEX CC`/`SG CC` (was
  the fake 3-account list), and multiple real "renews in Nd" badges render correctly.
- **Added 2026-08-07 — Recurring Hub Phase 2: AI early-detection layer for likely-recurring
  merchants.** The deterministic detector needs `MIN_OBSERVATIONS = 3` charges before it can call
  anything recurring, so a brand-new subscription is invisible for two billing cycles. New
  `merchant_recurrence_hints` cache table (mirrors `merchant_rules`' shape/RLS exactly) +
  `_shared/recurrenceHints.ts` (mirrors `categorize.ts`'s Gemini batching/caching discipline) +
  `detect-recurrence-hints` edge function classify merchants with only 1-2 charges by name/category
  archetype (streaming, insurer, gym, SaaS) — out-of-band only, same Law 5 posture as
  `categorize-pending`, triggered from the same three call sites (`ConnectBankModal`,
  `EditAccountModal`'s extend-history, `CSVUploader`'s post-commit) via new
  `lib/detectRecurrenceHints.ts`. Unlike `categorize-pending`, this function never mutates the rows
  it reads, so its poll loop needed an explicit keyset cursor (`after_id`/`next_after_id`) rather
  than relying on the query shrinking by itself — an infinite same-page loop was caught and fixed
  before shipping. `buildRecurring()` takes a 4th optional `hints` param and produces a new
  `Recurring.candidates: RecurringCandidate[]` array — deliberately never merged into
  `series`/`active`/`dormant` or any of `monthlyCommitment`/`annualBurn`/`pressure`, so an AI guess
  can never enter a total the user is planning around. `RecurringDirectory.tsx` renders candidates in
  a visually distinct dashed-border block ("Possible new commitments · AI hint", "likely $cadence"
  language) below the confirmed sections. Read-only for this pass — no accept/dismiss/promote action;
  that's real scope for a future round. Verified against the real account: 27 real candidates
  surfaced (Google Cloud, Anthropic Claude, Claude.ai Subscription, etc.), `$569/mo` confirmed total
  unchanged by their presence.
- **Fixed 2026-08-07 — Part F: the unmatched-transfer review queue was 2,298 rows, 74% of which
  (1,692) could never clear — Up's "Round Up" savings sweep.** `original_description` is always the
  exact literal `"Round Up"`, a structurally one-sided transaction with no counterpart to ever pair
  against, but `isTransferCandidateText()` (`_shared/transferMatch.ts` + `lib/transfers/classify.ts`)
  flagged it a candidate anyway via the `category === 'Transfer'` rule (Up sets `transferAccountId`
  on it). Not a money bug — these rows were already excluded from income/expense analytics via
  `category='Transfer'` regardless of match state — but pure queue noise with no way to clear it. Now
  excluded by exact-string match before the `category` check, plus a one-time backfill migration
  (`20260816000000_exclude_round_up_candidates.sql`) flipping the existing 1,692 rows. Confirmed on
  the real account: `transfer_state='unmatched'` count 2,298 → 606, `is_transfer` unchanged (still
  `true`) for all of them. For the remaining genuinely-diverse ~606 (real one-off external transfers:
  "Internet Withdrawal", "Eftpos Debit", "Up Account - Funds transfer", PayID, P2P names, etc.),
  `OskoLinker.tsx`'s unmatched-leg list — previously flat, capped at 100, one-row-at-a-time — now
  groups by `normalizeMerchant()` key with the same bulk-action shape as the suggested-pairs queue.
  New `decide_transfer_legs_batch()` RPC (`20260817000000_decide_transfer_legs_batch.sql`) mirrors
  `decide_transfers_batch()` exactly, just wrapping `decide_transfer_leg()` instead of
  `decide_transfer()`; new `txn_ids` branch on `decide-transfer`'s request schema routes to it,
  verdict restricted to `rejected`/`external` (a lone leg has no counterpart to "confirm"). Query cap
  raised 100 → 500 with an exact count surfaced ("Showing the most recent N of M") so a genuine
  backlog beyond one page is visible, not silently truncated. Verified against the real account: 606
  unmatched legs now render as ~30 merchant groups (Internet Withdrawal ×125, Eftpos Debit ×81, Up
  Account - Funds transfer ×63, etc.) instead of a flat 100-row list.
- **Fixed 2026-08-07 — Income/Expenses always showed $0 for real data.** Two independent bugs stacked: (1) `period.ts`'s `txnIso()` assumed a legacy compact `"MM.DD"` date string and mangled any real ISO `t.date` into a garbage string, silently dropping every transaction from month-bucket/range filters (`Income.tsx`, `Expenses.tsx`, `pacing.ts`, `ExpenseTrendCard.tsx`, `recurring.ts` all called it on real `Txn.date`, which is always full ISO — `txnIso` has been deleted, callers now compare `t.date` directly). (2) `Income.tsx`/`Expenses.tsx`'s account-scope filter compared `accounts` (an array of account **ids**, from `dbAccounts.map(a => a.id)`) against `t.account` (the account **name**, per `DataContext.tsx`) — never matched, so every transaction was excluded regardless of date. Filters now check `t.account_id` against `accounts`. `views/Accounts.tsx` was never affected — it already compared `t.date`/`t.account_id` directly.
- **Batch confirm (`OskoLinker.tsx`):** the `suggested` queue groups by unordered account pair (client-side, mirroring `pairHistoryKey`'s convention) with a group-level Confirm/Not a transfer/This is my own account, operating on that group's current checkbox selection — every non-ambiguous link is selected by default (opt-out, not opt-in), ambiguous links are never auto-selected and stay in the existing full-detail `LinkCard` review flow. One click invokes `decide-transfer` once with `{ link_ids: [...], verdict }` (capped at 200) rather than looping the single-link path N times — routed server-side to `decide_transfers_batch()` (`supabase/migrations/20260814000000_decide_transfers_batch.sql`), a thin loop over the existing per-link `decide_transfer()` inside one transaction, so one bad id rolls back the whole batch instead of partially applying.
- **Fixed 2026-08-07 — a full transfer rescan silently truncated the candidate pool at 1,000 rows.**
  `transfer_candidates()` has no `ORDER BY`, and `_shared/runLinkTransfers.ts` fetched it with a
  single unbounded call — PostgREST's default `max_rows` (1,000) truncated the response with no
  error. For a tenant with more transfer-candidate rows than that (confirmed on real data: 3,162),
  which of the 3,162 survived the cut was arbitrary, so any pair whose leg didn't land in that slice
  could never be scored, let alone matched — regardless of how good the matcher's scoring is. Fixed
  by paginating via `.range()` in a loop (`fetchAllCandidates()`) until a page comes back short.
  Confirmed on the real account: a full rescan went from `created: 0` to `created: 377` (`auto: 186`,
  `suggested: 191`) after the fix, with zero other code changes. Also closed a narrower, related gap
  the same day: `classify.ts`'s `LEXICON_RE` didn't recognise Up Bank's own generic "Transfer to
  Spending" / "Transfer from Savings" wording (only compound phrases like "internal transfer"), so a
  real, existing pair scored 0.45 — just under `SUGGESTED_THRESHOLD` — until the phrase was added.
- **Provider (Up Bank) sync:** one connection per tenant, one Halcyon account per connection (`account_connections.account_id` is unique). `pending` (HELD) rows are stored and shown (italic, "HELD" tag in `Ledger.tsx`) but excluded from every spending/income aggregate and from transfer matching until settled — `Account.connectionId` (set from `account_connections`) is what every connected-account code path branches on, both client (`CSVUploader`'s historical mode, the ledger's provider glyph) and server (`delete-upload-batch`/`upsert-account` refuse to recompute or overwrite a provider-owned balance). Up's own `transferAccount` relationship outranks the fuzzy transfer matcher entirely when it resolves — see `_shared/transferMatch.ts`'s `resolvedTransferAccountId`.
- **Transfer detection:** `transactions_analytic.is_transfer` precedence is durable decision → cached link state → `category = 'Transfer'` heuristic — a human "Not a transfer" verdict always outranks a stale category guess. A `rejected` link is deleted from the cache on rescan (not kept, which used to permanently block that leg from ever matching its real counterpart — see the 2026-08-05 entry below); the durable record in `transfer_decisions` is what actually prevents re-suggestion. `suggested` pairs (score 0.55–0.8, not yet reviewed) are now ALSO excluded from analytics — only `unmatched` (transfer-shaped, no counterpart found at all) still counts as ordinary spending by default, since a suggested pair has at least found a plausible counterpart while an unmatched leg hasn't. A skipped amount bucket (>`MAX_BUCKET` same-value legs) is persisted to `transfer_match_overflow` and surfaced as a banner in `OskoLinker.tsx`, rather than silently vanishing. `Shell.tsx`'s Ingestion nav item carries a badge counting `suggested`/`unmatched` transaction rows (computed client-side from `DataContext`, free — no new query), worded as "N transactions need transfer review" since it counts rows, not links, and so won't numerically match OskoLinker's own "N transfers need review" (which counts pairs).
- **Recurring-pair + timestamp matching (`app/src/lib/transfers/pairCadence.ts`, mirrored in `_shared/transferMatch.ts`):** once an account pair has ≥3 confirmed/auto transfers at a consistent cadence (reusing `recurring.ts`'s gap/conformance/CV approach, sourced via the `transfer_pair_history()` SQL function keyed on the unordered account pair), a later candidate landing on that cadence and within ±15% of the established amount gets a capped `+0.15` score bonus (`PAIR_CADENCE_BONUS`) — enough to lift a near-auto pair over `AUTO_THRESHOLD` without a click. Separately, `transactions.provider_posted_at` (a `timestamptz`, populated for every Up-sourced row since 20260807000000 but never previously read by the matcher) now feeds a `scoreTime` ambiguity tie-breaker (`TIME_BONUS_MAX = 0.1`) — two same-day, same-amount Up-sourced candidates split apart by whichever pair's timestamps are closer. Both bonuses are additive on top of the weighted score, never folded into `WEIGHTS` (which assumes full signal coverage); both are exactly 0 for the common case (no pair history yet; CSV-only legs, which never carry a timestamp), so existing behaviour is unchanged when neither applies.

---
*Note to AI Agents: Keep this index concise and update it when structural or architectural changes are made.*
