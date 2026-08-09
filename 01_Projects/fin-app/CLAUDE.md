# Halcyon — agent orientation

Personal finance webapp. Vite + React + TypeScript SPA in `app/`, Supabase (Postgres + Auth + RLS
+ Deno Edge Functions) backend in `supabase/`. No Next.js, no other server. Local dev stack via
`npx supabase start` (from repo root) + `npx supabase functions serve --no-verify-jwt --env-file
supabase/.env.local` (separate shell) + `cd app && npm run dev`.

This file is short on purpose — it orients and points, it doesn't explain. Read the linked doc
before touching that area; don't guess from this file alone.

## Where to look

| Need | Read |
|---|---|
| Frontend conventions, testing, animation rules | [app/CLAUDE.md](app/CLAUDE.md) — auto-loads when working in `app/` |
| Backend conventions, RLS/migration patterns, the "Laws" | [supabase/CLAUDE.md](supabase/CLAUDE.md) — auto-loads when working in `supabase/` |
| File-by-file system map, current known bugs | [INDEX.md](INDEX.md) — **read this first** for anything touching architecture or an unfamiliar area |
| Full history, rationale, dated diary of past fixes | [CONTEXT.md](CONTEXT.md) — the human/Obsidian handoff doc; more thorough than this file, less current-by-default |
| Design tokens, components, motion spec | [Halcyon_DesignSystem.md](Halcyon_DesignSystem.md) — reference only, load when doing UI/visual work |
| Full product vision + security model | [System requirements - SRD.md](System%20requirements%20-%20SRD.md) |
| What's in scope now vs. deferred | [MVP_SCOPE.md](MVP_SCOPE.md) |

## Rules that apply everywhere

- **Money is always integer cents**, end to end — DB columns, `DataContext`, every analytics lib.
  Convert to dollars in exactly one place per surface (`fmt()`/`fmtCents()` in `app/src/data.ts`).
  This bug has recurred *five times* from inline formatting — see `CONTEXT.md`'s 2026-08-05 entry.
- **Sign convention:** transaction `amount` is positive = inflow, negative = outflow. Never invert
  this per-view; if a view needs "spend" as a positive number, negate at display time only.
- **RLS is never optional.** Every table needs a policy keyed on tenant membership
  (`is_tenant_member`/`has_tenant_role`), not `auth.uid() = user_id` — this app is multi-tenant
  even though each user currently owns exactly one personal tenant. See `supabase/CLAUDE.md`.
- **Application-data mutations never go directly from the browser to PostgREST or an RPC.** They
  must use a Zod-validated Edge Function (`_shared/withAuth.ts`); direct reads remain RLS-scoped.
  The sole client-side mutation exception is `supabase.auth.*` for GoTrue identity/session lifecycle
  (sign-in, password/email changes, OAuth/OTP exchange, and sign-out), not Halcyon application data.
- **Aggregates in SQL, matching in O(N).** Don't `.reduce()` over thousands of fetched rows for a
  total; don't nest loops when matching/deduping — see `supabase/CLAUDE.md` Laws 2–3.

## Keeping docs current — read this before ending a task

If you added a table, migration, Edge Function, top-level component/view, or changed the schema:
**update [INDEX.md](INDEX.md)'s relevant section before concluding the task.** This is the one
step that has actually gone missing before — `INDEX.md` and two spec docs described the
transfer-linker as unbuilt "Phase 4" work for a while after it shipped, because the update
instruction used to live in a file (`.agents/rules/maintain_index.md`) nothing ever loaded. It
lives here now specifically so it's actually read.

Also append one line to **Recent changes** below (date + what shipped, one line, no detail — the
detail belongs in `INDEX.md` or `CONTEXT.md`). Keep this log capped at 10 entries; when adding an
11th, drop the oldest. It exists so an agent gets a cheap "what's new since I last worked here"
signal without re-reading `CONTEXT.md`'s full diary.

If you're not sure whether the docs are in sync with the code at all — not just after your own
task, but in general — run `/docs-audit`. It's the automated version of what a human had to do by
hand to find the transfer-linker gap.

## Recent changes

- 2026-08-08 — Shipped order-independent bank-to-investment reconciliation: exact-value purchase/redemption links, durable review decisions, cash-flow analytics integration, transfer-review UI, activity-ledger provenance, and real-corpus/RLS regression coverage.

- 2026-08-08 — Fixed priced investment re-imports zeroing the cached account value: duplicate imports are now monetary no-ops, while genuine new activities revalue only their account from stored NAVs.

- 2026-08-08 — Shipped scalable managed-fund accounts: deterministic Vanguard activity import, official daily NAV history/sync, contribution-neutral valuation and mixed net-worth history, investment account UI, and Australian FY/AMMA record awareness.

- 2026-08-08 — Routed signed-in loading/error UX through `ViewDataBoundary`, retaining visible data for background refresh failures; Dashboard now directs a transaction-empty user to statement import. Accounts, Income, Expenses, Ingestion, and Settings are route-lazy-loaded while Landing/Dashboard remain eager to preserve the shared hero morph.

- 2026-08-08 — Reliability/write-boundary hardening: `DataContext` now differentiates required-load failure from an empty ledger and supplies a retry state instead of routing failed reads to onboarding; all remaining application-table writes for callsigns, account identifiers, session registry revocation, and deletion recovery now use Zod-validated, audited Edge Functions.

- 2026-08-06 — Fixed a real-money bug found while testing against a live Up account: the
  reconciliation anchor was computed *before* backfill ran, which double-counts once `cutover_date`
  isn't pinned to today (enabled by the History-to-import picker above). Anchor computation moved
  into `sync-provider`, now runs once right after backfill actually finishes; `accounts.balance`
  also refreshes every sync instead of only at connect. New `extend-provider-history` + an "Extend
  history" control in `EditAccountModal` let an already-connected account pull further back later.
- 2026-08-07 — Fixed Income/Expenses showing $0 for all real data: `period.ts`'s `txnIso()`
  mangled real ISO dates (deleted; callers use `t.date` directly), and the account-scope filter
  compared account ids against account names (now compares `t.account_id`). Removed the "Drop csv"
  uploader from the Accounts page (Ingestion is the sole upload surface); Accounts' Quick Timeframe
  Selectors now actually filter its KPIs/donut/ledger instead of only the ledger.
- 2026-08-07 — Transfer-matcher improvements: `suggested` pairs now excluded from analytics (were
  counted as income/expense until manually reviewed), a new `transfer_match_overflow` table +
  OskoLinker banner surface amount buckets the matcher skipped entirely (previously silent), a
  pending-review badge on the Ingestion nav item, recurring-account-pair cadence detection
  (`pairCadence.ts`) that auto-links a later instance of an established sweep, and
  `provider_posted_at` (already captured for Up rows, previously unused) wired in as an ambiguity
  tie-breaker between same-day/same-amount candidates.
- 2026-08-07 — Batch-confirm for the transfer review queue: `OskoLinker.tsx`'s `suggested` list
  groups by account pair with a group-level Confirm/Reject/External acting on the current checkbox
  selection (non-ambiguous links selected by default, ambiguous ones excluded and left to individual
  review). New `decide_transfers_batch()` RPC + a `link_ids` batch shape on `decide-transfer` do it
  in one round-trip/one rate-limit hit instead of looping the single-link path per item.
- 2026-08-07 — Fixed a full transfer rescan silently truncating its candidate pool at 1,000 rows
  (PostgREST's default `max_rows`, no `ORDER BY` on `transfer_candidates()` to make the truncation
  predictable) — `_shared/runLinkTransfers.ts` now paginates via `.range()`. Confirmed on the real
  account: `created: 0` → `created: 377` on a full rescan with no other change. Also added the
  missing "Transfer to Spending"/"Transfer from Savings" phrasing (Up's own generic Saver-sweep
  wording) to `LEXICON_RE`, which had been scoring a real pair 0.45 — just under
  `SUGGESTED_THRESHOLD` — because only compound phrases like "internal transfer" were recognised.
