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

- 2026-10-29 — [[BUDGET_M7_LIVE_CATEGORIZATION]] records owner-authorized live attempts blocked by Gemini HTTP402/depleted prepayment credits; explicit real-AI test corrected and browser types pass, both projects/temporary credentials cleaned. Owner restores credits then rerun; No-Go.

- 2026-10-29 — [[BUDGET_M7_CANDIDATE_OPERATIONS]] verifies M7.7 local candidate (560/391 assertions, eight provider-disabled golden tests, 78 WCAG scans, 609 unit passes) and adds privacy-safe telemetry/ops. Compatible dev-lock patch clears 17 npm findings; primary preview/install preserved, fourteen projects cleaned. Live-provider approval plus human/hosted/release gates remain, No-Go.

- 2026-10-29 — [[BUDGET_M7_MIGRATION_RECOVERY]] completes M7.6 locally: 164 assertions, two auth/application restores with original-user sign-in, exact table/sequence/cents parity and disable/re-enable preservation; 25 focused unit tests pass. Private backups retained, three isolated projects cleaned, preview/personal unchanged. Next M7.7; human/hosted/release gates open, No-Go.

- 2026-10-29 — [[BUDGET_M7_R06_OPTIMIZATION]] verifies schema104 local capacity admission with canonical financial/evidence and cache invalidation proof; 187/142/537 separate suites pass. Cold rebuild/hosted qualifications remain; preview/personal data unchanged, No-Go.

- 2026-10-29 — [[BUDGET_M7_CAPACITY]] measures 10k/100k/1m and restores history admission via migration 97 in disposable targets. R06 capacity remains open: 100k SQL target missed, 1m workspace timeout and assistance target miss. Exact cleanup verified; preview96 retained, hosted deferred by owner; No-Go.

- 2026-10-28 — [[BUDGET_OVERVIEW_COPY_REFINEMENT]] implements the three approved copy changes. Six width/theme axe/copy checks, future/stale guards, TypeScript/build pass; two presentation files changed, zero Budget writes. Human/operational gates remain open; No-Go.

- 2026-10-28 — Owner accepted all three real Overview clarity questions; [[BUDGET_M7_HUMAN_VALIDATION]] prepares observed accessibility and independent beginner sessions. Human tester no longer available; AI critique complete in `docs/budget-ui/human-validation/ai-critique.md`, with copy/disclosure recommendations; actual human observations pending. Production sources unchanged; release No-Go.

- 2026-10-28 — [[BUDGET_OVERVIEW_PASS_3_VERIFICATION]] engineering verified: 472 lifecycle/442 assembled checks, 131 passing accessibility scans, 70 candidate cases, 595 unit passes/14 skips and types/build. Qualified phone funding notice added; backend/calculations unchanged. New fictional preview c65dd04871874dcb / PID 80255 retained. Owner comparison and M7 human/operational gates remain pending; No-Go.

- 2026-10-28 — [[BUDGET_OVERVIEW_PASS_2_ATTENTION_COMMITMENTS_GOALS]] complete: one canonical priority beside hero, retained reminder controls and compact commitment/goal disclosures. Real fictional acknowledgement/Undo restores state and preserves financial facts; 30 workspace WCAG cases, 595 unit passes/14 skips and types/build pass. Backend unchanged; next pass three assembled verification.

- 2026-10-28 — [[BUDGET_OVERVIEW_PASS_1_SUMMARY_FORECAST]] complete: real hero/forecast combined, amount-based finish and guarded comparison graphic; backend/controllers unchanged. 595 unit passes/14 skips, 30 production WCAG/fit cases, seven boundary/guard cases, types/build and zero Budget writes. Ready for separately authorized pass two; no attention/bills/goals redesign yet.
