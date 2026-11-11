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
| Current resume point, operational data state, next-work options | [CURRENT_STATUS.md](CURRENT_STATUS.md) — **read this first** when resuming work |
| File-by-file system map, current known bugs | [INDEX.md](INDEX.md) — read before changing an unfamiliar architectural area |
| Full history, rationale, dated diary of past fixes | [CONTEXT.md](CONTEXT.md) — historical background, not the live backlog |
| Design tokens, components, motion spec | [Halcyon_DesignSystem.md](Halcyon_DesignSystem.md) — reference only, load when doing UI/visual work |
| Full product vision + security model | [System requirements - SRD.md](System%20requirements%20-%20SRD.md) |
| What's in scope now vs. deferred | [MVP_SCOPE.md](MVP_SCOPE.md) |
| Database safety, backups, validation and recovery | [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md) — **mandatory before any migration, live integration test, Supabase reset, fixture cleanup or recovery work** |

## Rules that apply everywhere

- **The default local database is persistent user data, never a disposable test target.** Do not
  run `supabase db reset`, discard its Docker volume, broadly delete fixtures, or restore over it.
  Read and follow [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md). Destructive database validation is
  permitted only on an explicitly isolated project with a positively verified target.

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

- 2026-11-12 — Merged Budget's two bill finders onto shared rules and wording; bill evidence now checks bill-like merchants first (migrations 20261112000000/010000).

- 2026-11-12 — Simplified the Budget overview: one plain line per goal, plain estimate/check wording, duplicate everyday breakdown removed.

- 2026-11-12 — Budget overview turns unplanned pay into a visible next step (bills, a goal, or keep as a buffer).

- 2026-11-12 — Budget overview names accounts whose imports or sync are behind instead of showing a confident $0 spent; the shell footer shows real bank-sync status.

- 2026-11-11 — Rewrote Budget assistance copy for beginners, with calculation detail moved into one "How we worked this out" disclosure.

- 2026-11-11 — Budget assistance keeps history-based amounts when circumstances changed, clearing only what the owner says changed.

- 2026-11-11 — Budget assistance amounts are one pre-filled review screen with suggested pay dates and a single final confirmation.

- 2026-11-11 — Budget assistance offers detected regular payments as bills (saved as pinned recurring series) and caps confirmations at the last import.

- 2026-11-11 — Budget assistance pre-selects spending accounts and flags unused ones via a new account-activity read (migration 20261111010000).

- 2026-11-11 — Fixed post-sync categorize-pending 42501: apply_merchant_categories is now service-role only via ctx.admin() and writes only unresolved rows (migration 20261111000000), applied to the local main DB after a verified backup.
