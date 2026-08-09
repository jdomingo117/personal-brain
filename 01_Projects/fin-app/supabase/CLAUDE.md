# Halcyon backend — agent notes

Supabase (Postgres + Auth + RLS + Deno Edge Functions). No Next.js, no other server layer —
Edge Functions are the only place a mutation is validated. Root orientation:
[../CLAUDE.md](../CLAUDE.md). Local stack: `npx supabase start` (from repo root), then
`npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local` in a separate shell.
`analyze-csv`/`categorize-merchants`/`transferMatch`'s categorisation path need `GEMINI_API_KEY` in
`supabase/.env.local` or they fail loudly rather than silently degrading.

## The Technical Laws

These are enforced by convention and review, not by a linter — treat them as hard constraints when
writing or refactoring anything in this directory.

- **Law 1 — the 4-pillar security matrix.** Every protected route/function is behind Supabase Auth.
  Every table has RLS keyed on tenant membership. Every Halcyon application-data payload is
  Zod-validated inside an Edge Function before touching the DB — never trust client-side validation
  alone. Browser code may read through RLS but must not mutate PostgREST tables or call database RPCs;
  `supabase.auth.*` is the explicit exception for GoTrue identity/session lifecycle. Auth and
  ingestion functions are rate-limited.
- **Law 2 — aggregates belong in SQL.** `sum()`/`avg()`/`count()` via SQL views, RPC, or PostgREST —
  never fetch thousands of rows to run a JS `.reduce()`.
- **Law 3 — no nested O(N²) loops.** Transaction dedup, transfer matching, bulk staging must be
  linear — bucket with a `Map`, not a nested scan. `app/src/lib/transfers/match.ts` and its mirror
  here (`_shared/transferMatch.ts`) are the reference implementation: O(N) bucketing by amount, a
  hard cap per bucket (`MAX_BUCKET`) so a pathological input degrades to "skip and report," not to
  quadratic work.
- **Law 4 — secure credential storage.** Third-party API tokens get AES-256-GCM via Web Crypto
  before hitting the DB. Implemented for Up Bank tokens: `_shared/crypto.ts`, stored in the
  `private` schema (RLS + zero grants, not just an encrypted column in `public`) — see
  [INDEX.md](INDEX.md).
- **Law 5 — Gemini never runs synchronously on the main request path.** Ingestion evaluates
  deterministic rules first (static profiles, bank category columns, the `merchant_rules` cache);
  Gemini is the last-resort fallback, always out-of-band.

## The `withAuth` pipeline (`_shared/withAuth.ts`)

Every Edge Function is built through this, not by hand — it replaced ~25 lines of copy-pasted
preamble that had the same `getUser()` bug fixed three separate times because there was no single
place to fix it. Order: preflight → origin check → method → body size → JWT verify → rate limit →
tenant/role resolution → Zod validation → your handler → audit log. Your handler receives `ctx` with
`ctx.db` (RLS-scoped client — every query through it is filtered by policy), `ctx.tenantId`,
`ctx.user`, `ctx.audit(action, extra)`. Reach for `ctx.admin()` (service-role, bypasses RLS) only
when the operation must legitimately cross a tenant boundary, and scope the query by hand when you
do.

## RLS and tenancy

Every financial table is keyed on `tenant_id`; policies use `is_tenant_member(tenant_id)` /
`has_tenant_role(tenant_id, role)`, never `auth.uid() = user_id` — this is a multi-tenant shape even
though today each user owns exactly one auto-provisioned personal tenant. When adding a table:
1. `ENABLE ROW LEVEL SECURITY`, then a policy per operation (SELECT/INSERT/UPDATE/DELETE) — see any
   migration from `20260804000000_auth_hardening.sql` onward for the pattern.
2. `REVOKE TRUNCATE, REFERENCES, TRIGGER` from every role that goes through PostgREST — RLS does
   **not** filter `TRUNCATE`, so a role holding it can erase a tenant's data regardless of policy.
3. If you add a **view**, it needs `WITH (security_invoker = true)` explicitly, or it runs with
   owner privileges and leaks every tenant's rows — a plain `SELECT * FROM other_table` inside a
   view silently bypasses RLS otherwise.

Every migration ends with a `DO $$ ... $$` assertion block that fails the migration itself if any
new table lacks RLS, if `anon` holds any grant, or if a view lacks `security_invoker`. Extend that
block rather than skip it — it's the thing that turns a missed policy into a loud `supabase db
reset` failure instead of a silent production leak. Test isolation directly with
`app/scripts/test-rls-isolation.mjs` rather than assuming the policy is right because it compiles.

## The client/server mirror pattern

Some logic needs to exist identically on both sides: the client computes a preview (e.g. which CSV
rows will be skipped as duplicates, or a tentative transfer match) but the **server's answer is the
one that's trusted and persisted** — the client's computed value is never sent or relied on for
authorization. Current mirrored pairs:
- `app/src/lib/csv/dedupe.ts` ↔ `_shared/dedupe.ts` (content-hash for duplicate detection)
- `app/src/lib/transfers/{classify,match}.ts` ↔ `_shared/transferMatch.ts` (transfer candidate
  scoring)
- `app/src/lib/investments/cashMatch.ts` ↔ `_shared/investmentCashMatch.ts` (bank-to-investment
  purchase/redemption scoring)

If you change one side, change the other — there's no shared import (Deno vs. the Vite build), so
this is a discipline, not a compiler guarantee. `_shared/transferMatch.ts`'s docblock deliberately
keeps only the comments needed to read it in isolation and defers full rationale to the client copy
— follow that pattern rather than duplicating the "why" in both places.

## Categorisation and the taxonomy

`_shared/taxonomy.ts` is the **authoritative** category vocabulary — it validates all AI output, and
a drift from `app/src/data.ts`'s copy is a data-integrity bug, not a style issue. Categorisation is
merchant-keyed and tiered, cheapest first: user correction (`merchant_rules`, `source='user'`,
outranks everything permanently) → the bank's own category column → the cached AI answer → Gemini
for the remainder, batched. The AI cannot invent a category — output is enum-constrained in the
Gemini schema, then re-validated server-side; anything unrecognised becomes `Uncategorized` +
`needs_review` rather than silently miscategorised.

## Money and dedupe conventions

`amount`/`balance` are integer cents everywhere in this schema — see root `CLAUDE.md`. Dedupe
identity is `(account_id, dedupe_hash, occurrence)`, unique; `occurrence` is the ordinal **within
one import batch, always counted from 0** — counting from the account's running total would mean a
re-import never collides with what's already there. See `_shared/dedupe.ts`'s docblock for the
double-import bug this exists to prevent.
