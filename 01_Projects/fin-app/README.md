---
aliases:
  - Halcyon
  - Project README
  - fin-app README
tags:
  - halcyon
  - projects/fin-app
  - finance
type: readme
status: current
project: Halcyon
up: "[[CONTEXT]]"
related:
  - "[[CONTEXT]]"
  - "[[MANAGED_INVESTMENTS]]"
  - "[[MVP_SCOPE]]"
  - "[[Halcyon_DesignSystem]]"
  - "[[System requirements - SRD]]"
  - "[[MIGRATION_PLAN]]"
  - "[[SYSTEM_INTEGRITY]]"
  - "[[app/README|App README]]"
---

# Halcyon

A personal finance webapp — light, editorial interface (frosted glass, mint accent, cinematic
letterbox) with a landing → dashboard structure. It runs against a real Supabase backend: Auth,
tenant-scoped Postgres/RLS, Edge Functions, CSV ingestion, provider synchronisation, merchant
categorisation, and transfer matching. `app/src/data.ts` now supplies shared types and formatters;
the application data itself comes from Supabase.

## → Start with [CONTEXT.md](CONTEXT.md)

It's the onboarding doc: current state, locked decisions, architecture, gotchas, and exactly where
to pick up. Then read the docs it points to.

## Run

```bash
# Terminal 1 — required for auth and all real application data
npx supabase start

# Terminal 2 — Edge Functions used for all application-database writes
npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local

# Terminal 3
cd app
npm install        # Node 20+
npm run dev        # → http://localhost:5300
npm run build      # → app/dist/
```

## Layout

```
CONTEXT.md                    ← read first (handoff / orientation)
MANAGED_INVESTMENTS.md        managed-fund implementation, operations, and known transfer gap
MVP_SCOPE.md                  the thin-slice MVP + deferred phases (plan of record)
Halcyon_DesignSystem.md       definitive design system
System requirements - SRD.md  full product vision + security model (reconciled to the build; missing a data model + API contract)
MIGRATION_PLAN.md             historical (vanilla → React port)
SYSTEM_INTEGRITY.md           mandatory database-safety, validation, backup and recovery runbook
app/                          the Vite + React + TS app (design source of truth: app/src/index.css)
```

## Data safety

The default local Supabase stack may contain the owner's real account and financial history. It is
not a disposable test database. Before migrations, live integration tests, fixture cleanup or any
database recovery, read [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md). In particular, do not use
`supabase db reset` against the default local project.

## Stack

Vite 6 · React 18 (no StrictMode) · TypeScript · Tailwind v4 (`@theme`) · Framer Motion 11 ·
anime.js 3 (chart motion) · **Supabase** (Auth + Postgres + tenant RLS + Deno Edge Functions).
