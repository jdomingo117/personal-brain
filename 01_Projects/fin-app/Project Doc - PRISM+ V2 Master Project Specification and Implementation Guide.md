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

* Third-party API tokens (like Bank Developer Keys) must be symmetrically encrypted via Node.js native `crypto` (`AES-256-GCM`) before being saved to the database. The encryption key must rely on a persistent local filesystem lock-key (`data/.prism_key`) generated on first boot to survive session rotations.

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

**Goal:** Setup the Next.js app, configure Prisma, build the Master vs. Tenant SQLite logic, the LRU Cache, and NextAuth login.

* **Agent Prompt to copy/paste:**

> "We are starting Phase 1 of PRISM+ V2. Read the PRISM_V2_SPEC.md. I need you to scaffold the multi-tenant database infrastructure. Create the Prisma schema for `user_master.db` (User model) and a separate schema for the tenant `template.db`. Build the `src/lib/db.ts` file featuring a `PrismaLRUCache` to manage connections. Finally, set up NextAuth with a Credentials provider that hashes passwords and provisions a physical SQLite file for new users."

  
### Phase 2: Nothing OS UI Shell & Layout

**Goal:** Establish the global CSS, font configurations, and the main layout shell with a sidebar navigation.

* **Agent Prompt to copy/paste:**

> "We are on Phase 2 of PRISM+ V2. Read the spec regarding the 'Nothing OS' design system. Configure Tailwind, setup a monospace font for numbers, and strip out any default Next.js styling. Build the root `layout.tsx` and a minimal sidebar navigation component using 1px solid borders, sharp corners, flat black/slate backgrounds, and zero drop shadows. Ensure native Next.js routing is used."

  

### Phase 3: Accounts & Settings Hub

**Goal:** Build the tenant database schema for Accounts, the AES-256-GCM encryption utility, and the frontend CRUD pages.

* **Agent Prompt to copy/paste:**

> "We are on Phase 3 of PRISM+ V2. Extend the tenant Prisma schema to include an `Account` model (id, name, type, balance, encryptedToken, externalId). Build `src/lib/crypto.ts` utilizing `AES-256-GCM` with a filesystem lock-key (`data/.prism_key`). Build the `/accounts` page allowing users to create accounts and input Bank API tokens securely."

  

### Phase 4: The Ingestion Engine (CSV & API Crawler)

**Goal:** Build the staging buffer, generic CSV parser, Up Bank API fetcher (with Dual-Mode syncing), and linear deduplication.

* **Agent Prompt to copy/paste:**

> "We are on Phase 4 of PRISM+ V2. Add `Transaction` and `StagedTransaction` models to the tenant schema. Build the ingestion staging resolver enforcing Law 3 (O(N) Map deduplication). Create a generic CSV parser that uses regex to auto-detect columns. Create an Up Bank API client that encrypts/decrypts tokens and supports a 'Delta' mode (90-day limit) and a 'Deep' mode (3-year limit) for pagination."

  

### Phase 5: Transactions & AI Categorization

**Goal:** Build the transaction review ledger and integrate the Gemini API for batch categorization.

* **Agent Prompt to copy/paste:**

> "We are on Phase 5 of PRISM+ V2. Build the `/transactions` UI page using a flat, high-density data table (monospaced numbers). Build the backend API route that queries transactions. Then, integrate `@google/generative-ai` to accept a batch of uncategorized transaction descriptions and return standardized categories in a single LLM prompt execution."

  

### Phase 6: Investments, Managed Funds, & Tax Rules

**Goal:** Build the investment ledger, FIFO tax parcel logic, CGT math, and Gemini price scraping.

* **Agent Prompt to copy/paste:**

> "We are on Phase 6 of PRISM+ V2. Add `Investment` and `ManagedValuation` models. Build the logic to enforce FIFO (First-In, First-Out) tax parcel liquidation and AMIT cost-basis adjustments. Implement the 50% CGT discount rule for assets held >365 days. Build a cron-style API route that uses Gemini with Google Search Grounding to scrape and cache daily NAV unit prices for unlisted funds."

  

### Phase 7: Dashboards & Strategic Trajectory ("The Walk")

**Goal:** Build the visual analytics, cash flow velocity math, and Recharts components.

* **Agent Prompt to copy/paste:**

> "We are on Phase 7 of PRISM+ V2 (Final). Build the root `/` dashboard. Implement a backend route that calculates a 30-day liquidity pulse and a 12-month net worth reconstruction. Build 'The Walk' trajectory logic: calculate the past 90-day cash flow velocity and project it forward to a target goal. Use Recharts with stark, monochromatic lines and dot-matrix inspired grids."

  

---

  

## 5. Agent Operational Directives

* **Output targeted diffs:** Do not rewrite entire 300-line files if only 10 lines changed.

* **No UI Bloat:** Refuse any prompt that asks to add 3D elements, glassmorphism, or complex animations. Keep it flat, fast, and stark.

* **Update the Spec:** If you complete a phase or make a structural database change, quietly acknowledge it and suggest an update to the spec manifest.