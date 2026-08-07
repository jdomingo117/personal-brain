---
name: docs-audit
description: Reconcile Halcyon's agent-facing docs (CLAUDE.md, INDEX.md) against the actual current state of the codebase — finds structural additions the docs never caught up to, and either reports or fixes the gaps. Use when asked to audit/sync the docs, or periodically after a batch of feature work.
---

# Docs audit

This exists because the update-the-docs instruction in `CLAUDE.md` relies on discipline, and
discipline has already lapsed once: `INDEX.md`, `System requirements - SRD.md`, and `MVP_SCOPE.md`
described the transfer-linker as unbuilt "Phase 4" work for a while after it had actually shipped.
This skill is the automated version of the manual check that caught it — run it to catch the next
one instead of finding it by accident.

## What to do

1. **Inventory the structural surface.** List, don't summarize yet:
   - `supabase/functions/*/` (Edge Functions, excluding `_shared`)
   - `supabase/migrations/*.sql` (filenames + first-comment-block one-liner)
   - `app/src/components/*.tsx` and `app/src/components/*/` (subfolders)
   - `app/src/views/*.tsx`
   - `app/src/lib/*/` (subfolders — pure logic libraries)
   - `app/scripts/*.mjs` (integration test harnesses)

2. **Cross-check against the docs that claim to describe this surface:**
   - `INDEX.md` — does every item above appear somewhere in its directory map or notes? Flag
     anything present in the code but absent from `INDEX.md`.
   - `CLAUDE.md`'s "Recent changes" log — does it plausibly cover work from roughly the last
     10 entries' worth of time? (It's capped and rolling by design — an old gap here isn't a bug,
     but if the newest code isn't reflected at all, that's the same failure mode as before.)
   - `System requirements - SRD.md` and `MVP_SCOPE.md` — do either describe something as
     "deferred" / "Phase N, not built" that actually exists in the code now? This is the specific
     failure that happened with the transfer-linker (§ "Same-Day Osko Linker (*Phase 4*)" in the
     SRD, and the Phase 4 deferred-scope table in `MVP_SCOPE.md`).
   - `CONTEXT.md` §10 ("Intentional — do not fix these") and its "done vs. not" sections — flag
     any claim that's contradicted by what you find in the code, the way the old "Ingestion view
     is currently a simulator" line was contradicted by `Ingestion.tsx` itself.

3. **Don't just flag drift on the docs side — also check the reverse:** is there anything in
   `INDEX.md` or `CLAUDE.md` that no longer exists in the code (a deleted component, a retired
   pattern)? Stale-by-omission and stale-by-survival are both drift.

4. **Report findings as a short list**, grouped by doc, each with: what's missing/wrong, where it
   should go, and a one-line suggested fix. Don't editorialize beyond that.

5. **If asked to fix, not just report:** make the edits directly — `INDEX.md` additions go in the
   relevant existing section (Directory Map, Current State Notes) rather than a new bolted-on
   section; `CLAUDE.md`'s Recent changes log gets one line per gap found, oldest entries dropped to
   stay at the 10-entry cap; SRD/MVP_SCOPE status corrections are surgical (fix the stale claim,
   don't rewrite the surrounding section). Leave `CONTEXT.md` and `Halcyon_DesignSystem.md` alone
   unless explicitly asked to touch them — they're the human/Obsidian-facing docs, not the
   always-loaded agent surface this skill is scoped to.

## What this skill is not

It's not a linter and it doesn't run on its own — it's invoked (`/docs-audit`) after a batch of
work, or whenever you're not sure the docs are trustworthy. It does not replace the per-task
instruction in root `CLAUDE.md` to update `INDEX.md` before concluding structural work; it's the
safety net for when that per-task discipline lapses, not a substitute for it.
