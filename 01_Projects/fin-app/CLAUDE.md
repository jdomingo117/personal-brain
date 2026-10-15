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

- 2026-10-16 — Completed Phase 4 operation feedback: routine writes and known-shape tile reads now use named activity cues, while one durable provider-sync notice safely survives navigation.

- 2026-10-16 — Completed Phase 3 operation feedback: ingestion, investment, provider and transfer-review waits now show real checkpoints or explicit indeterminate stages without changing service behavior.

- 2026-10-16 — Completed Phase 2 operation feedback: Ledger categorisation previews now show real merchant-group progress, safe retry/close copy and inline apply/undo activity without changing mutation rules.

- 2026-10-16 — Completed Phase 1 of operation feedback: reusable truthful-status primitives, review fixtures and focused contract tests are live; production workflows remain unchanged.

- 2026-10-16 — Added an authenticated operation-status concept route and completed its shared, truthful loading/progress contract and workflow inventory; no production workflow behavior changed.

- 2026-10-05 — Backed up and forward-migrated the persistent local stack through the ingestion hardening migrations; identity/ledger counts are unchanged and direct browser transaction mutations are now denied.

- 2026-10-04 — Completed Phase 4 ingestion hardening: isolated golden coverage verifies overlap/reconciliation, rollback, connected cutover, profile persistence and direct-write denial; hung chunks recover safely, test-stack cleanup is project-scoped, and the full golden plus six-file Gate 2 gates are green.

- 2026-10-04 — Completed Phase 3 ingestion hardening: imports now canonicalize and validate global and active tenant custom taxonomy pairs before the atomic write; isolated golden coverage verifies custom, inactive, mismatched, unknown and cross-tenant cases plus denied direct browser writes.

- 2026-10-04 — Completed Phase 2 ingestion hardening: categorisation now keeps successful ≤300-merchant batches when another batch fails, continues independently and flags only unresolved affected rows for review; unit and disposable golden boundaries are green.

- 2026-10-04 — Completed Phase 1 ingestion hardening: a 5,000 source-row cap now fails closed in the browser, Edge Function and atomic SQL path; isolated golden coverage proves an exact-limit import plus one reconciliation anchor and a zero-write 5,001-row rejection.
