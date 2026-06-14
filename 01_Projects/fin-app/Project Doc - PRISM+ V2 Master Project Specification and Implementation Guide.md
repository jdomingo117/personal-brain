---
tags:
  - Project
  - finance
  - projects/fin-app/project-doc
---
---
# PRISM+ V2: Master Project Specification & Implementation Guide

---

Welcome to the PRISM+ V2 Master Specification. This document outlines the architecture, design system, and step-by-step build order for a high-performance, multi-tenant personal wealth planning application.

This spec is designed to be read by AI coding agents. It contains all the context required to build the application from a completely blank repository.

---


## 1. Project Overview & Aesthetic System

PRISM+ is a secure financial staging, tracking, and forecasting application. It bridges the gap between raw bank data (CSV/API) and long-term strategic wealth pacing.

**The "Nothing OS" Design System:**

The UI must strictly adhere to an ultra-tactile, monochromatic, tech-forward aesthetic inspired by Nothing OS.

* **Colors:** Deep blacks, slate grays, and stark whites. No vibrant backgrounds. The only accent color permitted is a mechanical red (`#ff3b30`) used sparingly for pacing indicators, overdue alerts, and destructive actions.

* **Typography:** Sans-serif for standard text. Strict monospace fonts for ALL numeric data, dates, and financial figures.

* **Containers:** Flat design. No soft drop shadows, no glassmorphism, no gradient blurs. Use 1px solid borders (`border-slate-800` or `border-white/10`) to define cards.

* **Layout:** Standard 2D CSS Grid and Flexbox. Standard Next.js page routing. **Strictly banned:** 3D perspective transformations, complex spatial carousels, or single-page viewport hijacking.

  

---

## 2. Core Architectural Guardrails (The "Laws")

Agents writing code for this repository MUST obey these absolute technical laws:

### Law 1: Physical Tenant Isolation & Strict Connection Pooling

* **Isolation:** User data is NOT separated by a mere `userId` column in a shared database. We use physical SQLite file isolation.

* `data/user_master.db`: Contains ONLY user credentials, hashes, and roles.

* `data/user_{id}.db`: A dedicated SQLite file provisioned for each user upon registration.

* **Pooling:** You must NEVER instantiate a raw `PrismaClient` directly in an API route. You must build and use an LRU Cache Manager (`PrismaLRUCache`) capped at 50 connections that handles fetching, connecting, and gracefully evicting SQLite clients to prevent file descriptor exhaustion.

### Law 2: Database-Level Aggregations Only (Prisma Math)

* Whenever calculating total account balances, category distributions, or running totals, you must use Prisma native math aggregations (`_sum`, `_avg`, `_count`). Do not fetch thousands of transaction rows into server memory to run JavaScript `.reduce()` loops.

### Law 3: Absolute Ban on Nested O(N²) Loops

* When matching duplicate transactions, finding internal transfers, or staging bulk imports, nested loops are strictly prohibited. You must structure normalization logic using Javascript `Map` structures (e.g., grouping by ID or Amount) to execute deduplication in linear $O(N)$ time.

### Law 4: Secure Credential Storage

* Third-party API tokens (like Bank Developer Keys) must be symmetrically encrypted via Node.js native `crypto` (`AES-256-GCM`) before Íbeing saved to the database. The encryption key must rely on a persistent local filesystem lock-key (`data/.prism_key`) generated on first boot to survive session rotations.

---
## 3. Tech Stack

* **Framework:** Next.js (App Router paradigm) with React.

* **Database:** Prisma ORM, `@prisma/adapter-better-sqlite3`, `better-sqlite3`.

* **Authentication:** NextAuth.js (JWT strategy).

* **Styling:** Tailwind CSS.

* **Charts:** Recharts (styled minimally to match Nothing OS).

* **AI Integration:** `@google/generative-ai` (Gemini API for categorization and scraping).

---
## 4. Step-by-Step Implementation Plan & Agent Prompts

This project must be built in sequential phases. Do not skip ahead. Create a new Git branch/worktree for each phase.

### Phase 1: Foundation & Multi-Tenant Authentication

**Goal:** Setup the Next.js app, configure Prisma, build the Master vs. Tenant SQLite logic, the LRU Cache, and NextAuth login. Ensure the master database user schema supports a `role` field to allow role-based authorization (e.g. `ADMIN` or `USER`).

* **Agent Prompt to copy/paste:**

> "We are starting Phase 1 of PRISM+ V2. Read the PRISM_V2_SPEC.md. I need you to scaffold the multi-tenant database infrastructure. Create the Prisma schema for `user_master.db` (User model with an email, hashed password, and role field defaulting to 'USER') and a separate schema for the tenant `template.db`. Build the `src/lib/db.ts` file featuring a `PrismaLRUCache` to manage connections. Finally, set up NextAuth with a Credentials provider that hashes passwords, includes user roles in the JWT/session objects, and provisions a physical SQLite file for new users."

  
### Phase 2: Nothing OS UI Shell & Layout

**Goal:** Establish the global CSS, font configurations, and the main layout shell with a sidebar navigation.

* **Agent Prompt to copy/paste:**

> "We are on Phase 2 of PRISM+ V2. Read the spec regarding the 'Nothing OS' design system. Configure Tailwind, setup a monospace font for numbers, and strip out any default Next.js styling. Build the root `layout.tsx` and a minimal sidebar navigation component using 1px solid borders, sharp corners, flat black/slate backgrounds, and zero drop shadows. Ensure native Next.js routing is used."

  

### Phase 3: Accounts & Settings Hub

**Goal:** Build the tenant database schema for Accounts (with ingestion/connection type indicators), the AES-256-GCM encryption utility, the frontend CRUD pages for accounts, the Settings & Profile configuration page, and the hidden Admin Portal.

* **Agent Prompt to copy/paste:**

> "We are on Phase 3 of PRISM+ V2. Extend the tenant Prisma schema to include an `Account` model (id, name, type, balance, ingestionType [API/CSV], encryptedToken, externalId). Build `src/lib/crypto.ts` utilizing `AES-256-GCM` with a filesystem lock-key (`data/.prism_key`). Build the `/accounts` view allowing users to create/manage accounts, select connection/ingestion types, and input Bank API tokens securely. Build the `/settings` page for user profiles and config preferences. Finally, build a hidden `/admin` portal (accessible only to users with the role 'ADMIN') that displays system metrics (total users, active connections, total master/tenant database size) and a directory of users with their email addresses and role controls."

  

### Phase 4: The Ingestion Engine (CSV & API Crawler)

**Goal:** Build the staging buffer, generic CSV parser, Up Bank API fetcher (with Dual-Mode syncing), linear deduplication, the Ingestion Portal frontend, and the Same-Day Osko Linker transfer matching panel.

* **Agent Prompt to copy/paste:**

> "We are on Phase 4 of PRISM+ V2. Add `Transaction` and `StagedTransaction` models to the tenant schema. Build the `/ingestion` portal containing: an 'Import new export' widget with target account select and parser engine profile selector; a drag-and-drop zone for statement CSV files; a CTA to automate using bank APIs; and an action button to analyze the staging buffer. Implement Law 3 (O(N) Map deduplication) in the staging resolver. Build the 'Same-Day Osko Linker' reconciliation UI and backend helper that scans incoming staged transactions, automatically flags/pairs matching offset transfers (internal accounts transfer on the same day with matching absolute amounts), and allows the user to accept/reconcile the pairs in one click. Support both automated API sync and manual CSV parser configurations."

  

### Phase 5: Transactions & AI Categorization

**Goal:** Build the transaction review ledger with filters, inline actions (modify/remove), and integrate the Gemini API for batch categorization.

* **Agent Prompt to copy/paste:**

> "We are on Phase 5 of PRISM+ V2. Build the `/transactions` UI page using a flat, high-density data table (monospaced numbers) paginated 10 at a time. The table must list: Date, Description, Category, Amount, and Actions (Modify/Remove). Implement action endpoints: Modify (updates description or re-categorizes a transaction) and Remove (soft-deletes/excludes a transaction). Integrate `@google/generative-ai` to accept a batch of uncategorized transactions and return standardized taxonomy category tags in a single prompt execution."

  

### Phase 6: Investments, Managed Funds, & Tax Rules

**Goal:** Build the investment ledger, FIFO tax parcel logic, CGT math, and Gemini price scraping.

* **Agent Prompt to copy/paste:**

> "We are on Phase 6 of PRISM+ V2. Add `Investment` and `ManagedValuation` models. Build the logic to enforce FIFO (First-In, First-Out) tax parcel liquidation and AMIT cost-basis adjustments. Implement the 50% CGT discount rule for assets held >365 days. Build a cron-style API route that uses Gemini with Google Search Grounding to scrape and cache daily NAV unit prices for unlisted funds."

  

### Phase 7: Dashboards & Strategic Trajectory ("The Walk")

**Goal:** Build the visual analytics, cash flow velocity math, Recharts components, and the full multi-section dashboard layout. This includes the Main Dashboard, the Account Detail section, the Income & Strategy tabbed views, and the Expense Analytics & Recurring Hub.

* **Agent Prompt to copy/paste:**

> "We are on Phase 7 of PRISM+ V2 (Final). Build the primary analytical sections:
1. **Main Dashboard (`/`):** Dynamic welcome header with current date; 3 Hero cards (Total Net Worth, 30-day Inflow, 30-day Outflow); Asset Allocation (donut chart + category progress bars showing value and percentage); Net Worth line graph (with 30-day, 3-month, 6-month, 1-year filters); Connected Accounts directory table (name, type, ingestion type, value); and Recent Transactions feed (limit 10).
2. **Account Detail view:** Context selector dropdown, summary header, 4 Hero cards (Balance, Inflow, Outflow, Net Cash Flow), chronological net balance trend line graph, category distribution donut chart, period filter bar (quick timeline switches, search, type, category, date pickers), and transaction ledger with modify/remove actions.
3. **Income & Strategy section:** Tab switcher between:
   - *Income Analyser:* Time filters, accounts checklist filter, 4 Hero cards (Inflow, Prorated average, Peak deposit, Coverage ratio), net income pacing line graph, and income source breakdown chart.
   - *Strategic Projections:* AI advisory hub card showing 3 tactical insights; Goals tracker card showing milestones, progress bar, target date, and AI-predicted horizon/day counter; and Projections Plot combining historical actuals, future project trajectory, and target line.
4. **Expenses section:** Tab switcher between:
   - *Analytics:* Accounts checklist, query filters (keyword search, category, sub-category, date range, min/max amount, quick selectors), 4 Hero cards (Total Outflow, Daily average, Heavyweight category, Top merchant), cumulative expenses line graph, daily spikes bar chart, hierarchical flow chart (Total > Category > Sub-category), category volatility & pacing indicators comparing spend vs. prior period with % saved/progress bars, top 10 merchants list, and expenses ledger.
   - *Recurring Hub:* Commitments summary (Monthly commitment, Annualized cash burn, Fixed pressure ratio, Active commitments count); recurring obligations table organized by category with totals/sub-totals, cadence, fixed/variable flag, last charged/next expected dates; 30-day matrix billing calendar highlighting fixed expense days weighted by amount; and AI smart-insights box.
Utilize Recharts styled minimally to match the monochromatic Nothing OS aesthetic."

  

---

  

## 5. Agent Operational Directives

* **Output targeted diffs:** Do not rewrite entire 300-line files if only 10 lines changed.

* **No UI Bloat:** Refuse any prompt that asks to add 3D elements, glassmorphism, or complex animations. Keep it flat, fast, and stark.

* **Update the Spec:** If you complete a phase or make a structural database change, quietly acknowledge it and suggest an update to the spec manifest.