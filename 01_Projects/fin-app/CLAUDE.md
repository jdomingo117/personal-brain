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
- **No data payload from the client touches the database without Zod validation** in an Edge
  Function first (`_shared/withAuth.ts`). Never validate only client-side.
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
- 2026-08-07 — Dashboard audit: fixed "30-day income/expense flow" (`Dashboard.tsx`) actually being
  all-time income and a last-30-*transactions* slice respectively, neither a real calendar window —
  both now filter on `t.date` against a proper trailing-30-day range. Six further Dashboard/HeroCard
  bugs found in the same audit (Asset Allocation's stale account-type list, Holdings' hardcoded
  6-row cap vs its own "N linked" tag, three hardcoded fake percentage badges, a mismatched "last 5"
  tag on a 10-row list, the $500 budget fallback, pending rows in the net-worth trend) logged in
  `INDEX.md`'s known-bugs entry, fixed the same day — see the next entry.
- 2026-08-07 — Closed all six Dashboard/HeroCard issues from the audit above: Asset Allocation now
  buckets `Savings` into Cash (was `Liquid`-only); Holdings renders all linked accounts instead of a
  hardcoded 6-row cap; the three fabricated percentage badges are now real vs-prior-30-days /
  vs-start-of-month computations (`HeroCard` gained a `monthChangePct?` prop, reusing
  `Dashboard.tsx`'s existing `netWorthTrend` loop); Recent Activity's tag and row count share one
  `RECENT_ACTIVITY_COUNT` constant; Budget Capacity drops the $500 fallback entirely (no
  budgets-management UI exists anywhere in the app, so every category was hitting it — 100%
  fabricated, not an edge case) in favour of an honest empty state; net worth trend now excludes
  `pending` transactions. Verified against the real account: Asset Allocation went from $0/NaN% to
  100% Cash/$132,116, Holdings from 6 to 8 accounts shown, badges from static +4.2%/-1.8%/+0% to
  real -33.9%/+23.4%/+3.1%.
- 2026-08-07 — Fixed the Recurring hub (Expenses tab) being completely non-functional for every real
  user: `buildRecurring()` read a hardcoded-empty mock array instead of `useData()`, so it always
  showed the empty state. Now `buildRecurring(transactions, accounts, today?)`, both required. Bundled:
  the detection loop now excludes `isTransfer`/`pending` rows (a recurring savings sweep is not an
  expense commitment); the fake 3-account funding breakdown (`Operations Checking`/`Sapphire Credit
  Line`/`Auto Loan // Vehicle`) is replaced with a `fundingAccountGlow` resolved from the real account
  list; added step-change detection (a subscription's one-time price rise now reads `'fixed'` with the
  change annotated, not noisy `'variable'`) and a "renews in Nd" callout inside 14 days. New
  `recurring.test.ts` — previously zero coverage. Verified on the real account: 8 active commitments
  detected (was 0), funding accounts show real names (`AMEX CC`/`SG CC`), renewal callouts render.
- 2026-08-07 — Recurring Hub Phase 2: AI early-detection layer for merchants with only 1-2 charges
  (below the deterministic detector's `MIN_OBSERVATIONS=3`). New `merchant_recurrence_hints` cache
  (mirrors `merchant_rules`) + `_shared/recurrenceHints.ts` (mirrors `categorize.ts`'s Gemini
  batching/caching) + `detect-recurrence-hints` edge function, triggered out-of-band from the same
  three call sites as `categorize-pending`. Needed its own keyset cursor (`after_id`) since, unlike
  `categorize-pending`, it never mutates the rows it reads — a same-page infinite loop was caught and
  fixed pre-ship. `buildRecurring()` produces a new `Recurring.candidates[]`, structurally separate
  from `series`/`active`/`dormant` so an AI guess can never enter `monthlyCommitment`/`annualBurn`.
  Read-only for this pass (no accept/dismiss). Verified on the real account: 27 real candidates
  surfaced (Google Cloud, Anthropic Claude, etc.), confirmed $569/mo total unchanged.
- 2026-08-07 — Part F: closed the unmatched-transfer review queue's biggest gap — Up's "Round Up"
  sweep (always literal `original_description="Round Up"`, structurally one-sided) was 74% of it
  (1,692 of 2,298 rows) and could never clear. Excluded at ingest (`isTransferCandidateText()` in
  both mirrors) + a backfill migration for the existing rows; not a money bug (already excluded from
  analytics via `category='Transfer'`), pure queue noise. For the real diverse remainder,
  `OskoLinker.tsx`'s unmatched-leg list is now merchant-grouped (was flat/capped at 100) with the
  same bulk-action shape as the suggested-pairs queue, backed by new `decide_transfer_legs_batch()`
  RPC + a `txn_ids` branch on `decide-transfer`. Verified on the real account: unmatched count
  2,298 → 606, `is_transfer` unchanged for the excluded rows, 606 legs now render as ~30 merchant
  groups instead of a flat 100-row list.
