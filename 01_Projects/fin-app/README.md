# Halcyon

A personal finance webapp — light, editorial interface (frosted glass, mint accent, cinematic
letterbox) with a landing → dashboard structure. **Currently a polished frontend prototype on mock
data; backend not yet built.**

## → Start with [CONTEXT.md](CONTEXT.md)

It's the onboarding doc: current state, locked decisions, architecture, gotchas, and exactly where
to pick up. Then read the docs it points to.

## Run

```bash
cd app
npm install        # Node 20+
npm run dev        # → http://localhost:5300
npm run build      # → app/dist/
```

## Layout

```
CONTEXT.md                    ← read first (handoff / orientation)
MVP_SCOPE.md                  the thin-slice MVP + deferred phases (plan of record)
Halcyon_DesignSystem.md       definitive design system
System requirements - SRD.md  full product vision + security model (partly superseded — see CONTEXT §2)
MIGRATION_PLAN.md             historical (vanilla → React port)
app/                          the Vite + React + TS app (design source of truth: app/src/index.css)
```

## Stack

Vite 6 · React 18 (no StrictMode) · TypeScript · Tailwind v4 (`@theme`) · Framer Motion 11 ·
anime.js 3 (chart motion). Planned backend: **Supabase** (Auth + Postgres + RLS + Edge Functions).
