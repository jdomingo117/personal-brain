---
aliases:
  - Taxonomy and Ledger Plan
tags:
  - halcyon
  - projects/fin-app
  - finance
  - taxonomy
  - ledger
type: plan
status: active
project: Halcyon
related:
  - "[[INDEX]]"
  - "[[MVP_SCOPE]]"
  - "[[Halcyon_DesignSystem]]"
---

# Halcyon — Taxonomy and Editable Ledger Plan

## Purpose

Make categorisation useful, trustworthy and repairable over time. The product
will retain a two-level reporting structure (category → subcategory), while
separating it from transaction mechanics and user-defined dimensions. The
ledger becomes the primary place to inspect, correct and teach the system.

Phases 1–5 are implemented. Further taxonomy expansion remains subject to a
new explicit contract rather than being implied by this completed plan.

## Review outcome

### Keep

- Two reporting levels: category and subcategory.
- A curated default taxonomy, validated server-side.
- The distinction between `Other` (reviewed miscellaneous spending) and
  `Uncategorized` (unknown and requiring attention).
- Classification provenance (`user`, `bank`, `ai`, `seed`) and the existing
  merchant-rule cache.
- Excluding genuine transfers and investment movements from consumption
  analytics.
- Explicit classification precedence: transaction correction → user merchant
  rule → bank category → non-user cache → AI.

### Change

- Make the ledger editable after import/sync; completed in Phase 1 while the
  compact embedded ledgers remain read-only previews.
- Surface `needs_review`, source and retained confidence in the UI; completed
  in Phase 1 through the first-class ledger and transaction drawer.
- Ensure user rules genuinely outrank both bank and AI classifications on
  future imports.
- Add both one-transaction edits and deliberate reusable-rule edits. A blanket
  merchant rule is unsafe for marketplaces and payment processors.
- Treat subscriptions/recurrence, essentialness and personal context as tags
  or attributes, rather than forcing them into the spending taxonomy.
- Separate transaction kind (`expense`, `income`, `transfer`, `investment`,
  `adjustment`, `refund`, `reimbursement`) from reporting category; completed
  in Phase 4.
- Expand and normalise the vocabulary using observed ledger data before any
  broad historical migration.

## Design principles

1. **One job per field.** `kind` controls accounting/analytics behaviour;
   category/subcategory explain purpose; tags add cross-cutting context.
2. **Human corrections win.** A sync or AI pass must never silently undo a
   transaction-level correction or user rule.
3. **Safe scope is explicit.** Every category edit makes clear whether it
   affects only this transaction, a selected set, or matching transactions in
   the past and future.
4. **Historical reports are auditable.** Category changes create an audit
   event and can be undone; no silent bulk rewrite.
5. **The taxonomy remains coherent.** Custom subcategories and tags are safer
   early extensions than unrestricted custom top-level categories.
6. **Corrections are low-friction.** The normal path should take a few taps,
   including on mobile.

## Canonical taxonomy — implemented in Phase 3

The audited ledger distribution informed this deliberately purpose-based
two-level vocabulary:

| Category | Initial subcategories |
|---|---|
| Food & drink | Groceries, Dining & takeaway, Coffee, Alcohol & pubs |
| Home | Rent, Rates, Maintenance, Home insurance, Furnishings |
| Transport | Fuel, Public transport, Rideshare, Parking & tolls, Registration, Servicing, Car insurance |
| Bills & utilities | Electricity & gas, Water, Internet, Mobile |
| Shopping | Clothing, Electronics, Household, Gifts, General retail |
| Health & wellbeing | Medical, Dental, Pharmacy, Allied health, Fitness, Personal care |
| Lifestyle | Streaming, Software & digital services, Memberships, Events, Hobbies, Gaming, Recreation |
| Travel | Flights, Accommodation, Local transport, Activities, General travel |
| Family & pets | Childcare, School, Children, Pet care, Veterinary |
| Education | Courses, Books, Student costs |
| Financial & admin | Bank fees, Government charges, Tax, Accounting, Legal |
| Giving | Charity, Donations |
| Other | Cash withdrawal, Miscellaneous |

The following non-expense categories remain separately reportable by purpose,
while first-class transaction kind independently controls accounting behavior:

- **Income:** Salary, Interest, Dividends & distributions, Benefits, Rental &
  business income, Refund, Reimbursement, Transfer In, Other.
- **Transfer:** Internal, Managed fund funding, Reconciliation.
- **Investing:** Auto-invest, Brokerage, Managed fund purchase, Managed fund
  funding, Distribution.
- **Uncategorized:** an explicit unresolved state with no subcategory.

Refund and reimbursement rows are contra-expense inflows rather than earned
income. Linked reversal/allocation modelling remains a later refinement.

## Target ledger experience

Create a first-class all-transactions Ledger destination. Embedded ledgers on
dashboard, account, income and expense views remain concise read-only previews
that deep-link to it.

The desktop ledger shows Date, Merchant/description, Account, Kind,
Category → Subcategory, Amount and Status. On mobile the same information is
presented as a two-line row. Selecting a row opens a transaction drawer with:

- original bank description, merchant, account, date and amount;
- editable category and dependent subcategory;
- kind/transfer status where safe to change;
- source, confidence and review state;
- recurring, subscription, spending-nature, reimbursable and tax-related
  attributes;
- categorisation history; and
- an optional split action (later phase).

When a user changes a category, present an explicit scope choice:

1. **Only this transaction** — the safe default for ambiguous merchants.
2. **Selected transactions** — for an intentional bulk correction.
3. **All matching past and future transactions** — creates/updates a reusable
   rule after showing the number of affected historical rows.

The Ledger also has saved filters/views for Needs review, Uncategorized,
Missing subcategory, AI categorised, Bank categorised and Manually categorised.

## Backend target state

The initial implementation works with the existing transaction columns. The
durable end state should introduce stable identifiers and history rather than
using display strings as the sole identity:

```text
transaction
  kind
  recurring, subscription, spending nature, reimbursable, tax-related
  per-field derivation/user/system precedence
  category_assignment / category_id / subcategory_id
  source, confidence, review state

category and subcategory
  stable id/slug, display name, active state, system/custom ownership

categorisation_rule
  scoped matcher + category/subcategory + priority + audit metadata

category_assignment_event
  before/after assignment, scope, actor, timestamp, undo reference

transaction_allocation (later)
  transaction_id, category/subcategory, integer-cent amount
```

Rule matching must be able to become more specific than merchant key alone:
direction, description pattern, account/provider context and transaction kind
are candidate constraints. This avoids incorrectly treating Amazon, PayPal,
Apple, Google and department stores as single-purpose merchants.

## Delivery phases

### Phase 0 — Contract and safety design

Document the approved vocabulary changes, transaction-kind semantics, edit
scopes, rule precedence, permissions, audit shape, UI states and migration
strategy. Add unit and integration test cases before data writes exist.

**Exit criteria:** a signed-off behaviour contract; no production data change.

### Phase 1 — Editable ledger and review queue — completed 2026-08-13

Build the all-transactions Ledger, transaction drawer, direct
category/subcategory edits, review-status filters and a validated/audited
single-transaction mutation endpoint. Expose source, confidence and
`needs_review` through `DataContext`.

**Delivered:** `/ledger` is a first-class, paginated all-transactions surface
with account/category/search filters and saved review lenses for unresolved,
uncategorized, missing-subcategory and source states. The transaction drawer
shows original description, account, amount, transfer state, provenance,
confidence when retained, review state and manual categorisation history.
Edits are explicitly transaction-only, validated against the authoritative
taxonomy, audit logged, and protected by an atomic before/after history row.
System reconciliation anchors are locked. Undo is guarded against stale state,
so an old edit cannot overwrite a newer correction.

**Exit criteria met:** a user can find unresolved transactions, correct one
without creating a rule, see that reports will change, and undo the latest
compatible correction. No taxonomy vocabulary or historic category was
automatically migrated.

**Verification:** 236 frontend tests passed (12 environment-dependent tests
skipped), the production build passed, the dedicated live integration harness
passed 18/18 edit/undo/taxonomy/audit/tenant checks, the global RLS harness
passed 40/40, and the local Supabase schema linter reported no errors. Rendered
browser verification covered the review badge/filter, drawer, edit and undo on
desktop plus a 390×844 mobile viewport. That pass found and fixed the drawer's
animated-container clipping by portalling it at the document root; the final
browser pass reported no console errors.

### Phase 2 — Bulk edits and learning rules — completed 2026-08-13

Add selection, bulk correction, reusable rule creation and a visible impact
preview. Correct precedence so a user rule is evaluated before the bank tier
and AI tier for both CSV and provider imports.

**Delivered:** ledger rows now support individual/page selection and an
explicit selected-transactions correction dialog. Bulk changes are
taxonomy-validated, capped at 500 rows, written atomically with one grouped
operation identity and per-transaction before/after history, audit logged, and
guardedly undoable as a complete operation. Reconciliation anchors cannot enter
the operation.

The transaction drawer now offers the safe transaction-only default or an
explicit “all matching past and future” scope. The latter previews exact
database impact before confirmation, then atomically upserts a durable
`source='user'` merchant rule and updates matching history. `transactions` now
has a stable indexed `merchant_key`; history records `scope` and
`operation_id`. CSV staging sends banked merchants through the resolver so
user rules can outrank the bank without allowing AI/cache to do so. Provider
sync applies user rules synchronously before bank mappings and still preserves
the stronger transaction-specific manual correction.

**Exit criteria met:** all three scopes are explicit, a correction can remain
transaction-specific for ambiguous merchants, selected corrections are
deliberate and undoable, and reusable user rules survive later CSV imports and
provider syncs. No taxonomy vocabulary or historic category was automatically
migrated.

**Verification:** 237 frontend tests passed (12 environment-dependent tests
skipped), the production build passed, the Phase 1 regression harness remained
18/18, the dedicated Phase 2 live harness passed 15/15 merchant-identity,
bulk/undo, exact-preview, precedence and tenant-boundary checks, the global RLS
harness passed 40/40, and the local Supabase schema linter reported no errors.
Rendered browser verification exercised selection, impact preview, bulk apply,
bulk undo, merchant-rule creation and refreshed history on desktop, then the
bulk dialog at 390×844 with zero horizontal overflow. The responsive pass also
tightened the shared shell’s compact header/footer and grid sizing.

### Phase 3 — Taxonomy revision and safe migration — completed 2026-08-13

Analyse real usage of `Other`, `Uncategorized`, null subcategories and unmapped
bank/provider categories. Agree the final vocabulary, add stable category
identities, migrate mappings with a reversible/audited plan, and update all
charts, filters, budgets and AI prompts together.

**Exit criteria:** every legacy category has a documented destination or is
preserved as an archived reporting value; reporting reconciliation is verified.

**Delivered:** the former eight-category expense vocabulary is now the 13
categories documented above. The migration adds global, read-only category and
subcategory reference tables with stable slug identities, plus explicit alias
tables for every legacy category/subcategory destination. `transactions`,
`merchant_rules` and `budgets` retain display labels for reporting compatibility
and now also carry stable IDs maintained by database validation triggers.
Transaction edit history is migrated as well, preserving guarded undo semantics.

CSV mappings, Up mappings, Gemini prompts/schema, ledger controls, charts,
budgets, fixtures and category colours were updated as one release. Each expense
category has a distinct `--cat-1` through `--cat-13` token. `Other` is narrowed
to cash withdrawal or genuinely miscellaneous spending; unresolved values remain
`Uncategorized`; fees move to `Financial & admin`; travel is separate from daily
transport; and subscriptions remain purpose classifications under `Lifestyle`
rather than a top-level category.

Historical changes are captured per tenant in `taxonomy_migration_runs` and
row-level `taxonomy_migration_events`, including before/after distributions and
integer-cent totals. The service-only `revert_taxonomy_v2` function restores the
recorded legacy labels for one tenant/run. A follow-up migration installs a
budget-specific identity trigger after live validation found that budgets do not
have the transaction trigger's `subcategory` field.

**Exit criteria met:** all observed legacy values have explicit destinations;
no migrated transaction retains a legacy label or lacks its stable identity;
and every migration run reconciles to the same cent total before and after.

**Verification:** 242 frontend tests passed (12 environment-dependent tests
skipped), the production build passed, and the dedicated Phase 3 harness passed
16/16 taxonomy/reference/ID/validation/budget/RLS checks. Phase 1 and Phase 2
regressions remained 18/18 and 15/15; AI categorisation passed 25/25, ingestion
15/15, transfers 51/51 and global RLS 40/40. Database lint reported no schema
errors. Live migration inspection found zero missing IDs and zero remaining
legacy labels, with all runs preserving cents. A transaction-scoped rollback
rehearsal restored 3,692 changed transactions with zero mismatches, verified the
run marker, and rolled back the rehearsal so no data remained reverted. Browser
verification exercised the 17-category ledger filter, dependent subcategories,
save/history/undo and a no-overflow desktop layout; existing four-viewport
responsive regressions cover the 390px mobile contract.

### Phase 4 — Transaction kind and classification attributes — completed 2026-08-14

Promote kind from category convention to a first-class field. Add tags/
attributes such as recurring, subscription, essential/discretionary,
reimbursable and tax-related. Establish correct refund/reimbursement semantics.

**Delivered:** every transaction now has one validated first-class kind:
`expense`, `income`, `transfer`, `investment`, `adjustment`, `refund` or
`reimbursement`. Ingestion and provider sync derive a safe default, while
`kind_source` records whether the current value is derived, user-pinned or a
protected system value. Reconciliation anchors are system adjustments; real
account movement is transfer. Refunds and reimbursements reduce gross expense
without being counted as earned income. Transfer matching, investment cash
matching and cash-flow/report calculations now consume kind instead of category
text.

Transactions also carry recurring, subscription, spending-nature
(`essential`/`discretionary`), reimbursable and tax-related attributes.
Subscription is initially derived from the relevant Lifestyle subcategories,
and recurrence hints materialise the recurring attribute. Explicit user
changes are pinned independently, survive category changes, and can be undone;
derived fields continue to recalculate when category or amount changes.

The ledger exposes an all-kinds filter plus recurring, subscription,
reimbursable and tax-related lenses. Its transaction drawer provides a separate
Accounting & attributes editor, provenance, history and guarded undo. System
reconciliation adjustments stay locked. The mutation boundary is an
authenticated, Zod-validated, tenant-scoped Edge Function backed by service-only
atomic edit/undo RPCs and tenant-readable audit history.

**Exit criteria met:** analytics and operational matching no longer infer
behavior from category display text; spending purpose and subscription status
coexist; contra-expense inflows do not inflate earned income; manual overrides
are durable and auditable.

**Verification:** 248 frontend tests passed (12 environment-dependent tests
skipped), the production build passed, and the dedicated Phase 4 harness passed
23/23 derivation, override, undo, lock, direct-write and tenant-isolation checks.
Phase 1–3 regressions remained 18/18, 15/15 and 16/16; ingestion passed 15/15,
AI categorisation 25/25, transfers 51/51, investments 70/70 and global RLS
40/40 (273 live checks total). Database inspection reconciled 13,016 rows to
the unchanged -8,568,789-cent total with zero missing kinds, invalid derived
kinds or invalid derived subscription states, and no browser-executable
classification RPCs or insecure public views. The schema linter reported no
errors. Browser verification covered kind filtering, derived subscription
state, attribute save/undo, audit history, locked reconciliation adjustments
and a no-overflow desktop ledger/drawer; the existing four-viewport regression
suite covers the mobile layout contract. Validation also found and fixed a
shared-trigger regression on merchant rules and an authenticated-insert trigger
execution-context defect before completion.

**Post-phase integrity repair — 2026-08-14:** a durable rejected-transfer
decision now outranks a stale *derived* transfer kind in reporting without
rewriting the statement ledger; negative legs return to expense and positive
legs return to income, while user-pinned transfer kinds remain authoritative.
The Expenses hero metrics also use inclusive UTC calendar-day counts and an
immediately preceding equal-length comparison window. This repaired the 3M
daily denominator (75 days, not one) and aligned totals, trend, flow, pacing,
Dashboard, Accounts and Income cash flow. Exact regression fixtures, strict
TypeScript, the full frontend suite/build, Phase 4 and Phase 5 live harnesses,
database reconciliation and authenticated browser verification all passed.

**Post-review bulk safety repair — 2026-08-14:** selected-set category editing
now models every category and subcategory field as either one shared value or
`Mixed — leave unchanged`. Opening the dialog performs no implicit edit: a
shared subcategory is shown as-is, a mixed one is omitted from the request, and
Apply remains disabled until the user makes an effective explicit change.
Changing category requires a deliberate compatible subcategory selection,
including an explicit `No subcategory` choice. The Edge Function and new
service-only partial-update RPC independently enforce the same contract; omitted
fields preserve each row's current value, while operation history and guarded
undo retain and restore heterogeneous prior values exactly.

**Verification:** six focused bulk-draft/payload regressions passed; the full
frontend suite passed 263 tests with 12 environment-dependent skips; strict
TypeScript and the production build passed. The expanded Phase 2 live harness
passed 21/21 atomic partial-update, heterogeneous undo, validation, tenant and
direct-RPC boundary checks, and schema lint reported no errors. Authenticated
browser verification covered mixed Coffee/Groceries defaults, disabled no-op
Apply, explicit subcategory-only correction, exact undo to the two distinct
prior values, shared Coffee defaults, and the mandatory category/subcategory
choice state.

**Post-review impact-preview repair — 2026-08-15:** the selected-set dialog now
shows the current category and subcategory distributions before any choice is
made. Once an effective explicit change exists, it reports the exact number of
category values, subcategory values and total ledger entries that will update;
the total mirrors the server's provenance/confidence/review-state write rule,
while a separate count identifies entries whose labels already match. Clearing
subcategories is named and counted rather than hidden behind a blank value.

The preview also runs the same derived-kind policy used by the database and the
same expense/earned-income helpers used by reporting. It lists kind transitions,
derived subscription changes and exact cent deltas, while preserving user-pinned
kind and subscription decisions. Apply remains disabled for shared no-op values,
mixed leave-unchanged values and incomplete category/subcategory pairs. The
dialog is height-bounded and scrollable so the added detail remains usable on a
compact viewport.

**Verification:** eleven focused bulk-semantics/impact regressions passed,
including current mixes, provenance-only rows, explicit clearing, derived
Expense → Transfer effects, exact expense deltas, subscriptions and pinned-kind
precedence. The full frontend suite passed 268 tests with 12 environment-dependent
skips; strict TypeScript and the production build passed. The Phase 2 live
harness remained 21/21. Authenticated browser verification showed Coffee (1) /
Dining & takeaway (1), a one-label/two-entry Manual correction, disabled no-op
Apply, explicit two-value clearing, and a two-row Expense → Transfer preview
that correctly predicted a $31.00 expense decrease; Apply updated exactly two
rows, and guarded undo restored both original categories, subcategories, kinds,
sources and review state.

**Post-review cross-page selection repair — 2026-08-15:** Ledger selection now
publishes an accessible live summary with the total selected count, the number
on the current page and the number elsewhere. Page selection controls include
their visible-row scope, global clearing includes the full selected count, and
IDs for transactions removed during refresh are pruned rather than remaining
as invisible selection state.

A completed bulk correction deliberately retains its selection while immediate
Undo is available. Once the correction succeeds, the close control and final
action explicitly become `Close bulk correction and clear selection` and
`Done and clear selection`; the success message also states that consequence.
Closing before a write leaves the selection intact, and undoing the write
returns the dialog to the normal `Done` behavior so the user can revise or
reuse the selected set.

**Verification:** two focused selection-summary regressions passed, including
current-page/elsewhere arithmetic and stale-ID exclusion. The full frontend
suite passed 270 tests with 12 environment-dependent skips; strict TypeScript
and the production build passed, and the Phase 2 live harness remained 21/21.
Authenticated browser verification used 57 transactions across two pages:
selecting two on page 1 and seven on page 2 displayed `9 selected · 7 on this
page · 2 elsewhere`; the nine-row preview and atomic correction agreed, Undo
remained available, and `Done and clear selection` removed the summary and
unchecked all seven visible page-2 rows. The temporary user, tenant, account and
57 transactions were removed after verification.

**Post-review all-matching selection repair — 2026-08-15:** the Ledger now
offers `Select all matching (N)` for the current filtered result. When more than
500 rows match, the action truthfully becomes `Select first 500 of N matching`
and the selected state repeats that boundary. `Bulk limit: 500 rows per
correction` remains visible beside the selection summary. Individual checkboxes,
page selection and all-matching replacement share the same pure cap; unchecked
rows disable at 500, while selected or partially selected current-page rows can
always be cleared so the user cannot become trapped at the boundary.

Live maximum-size testing exposed that the Edge Function's RLS visibility proof
sent all 500 UUIDs through one PostgREST `.in(...)` URL, exceeding the local
gateway URI limit even though Zod and SQL both correctly allowed 500. The proof
now reads bounded 75-ID chunks in parallel, combines the tenant-visible rows,
and still requires the exact requested count before invoking the atomic
service-only mutation. The API continues to reject 501 before any database
work.

**Verification:** four focused boundary regressions passed for all-matching
selection below/above 500, page fill to exactly 500 and partial-page recovery at
the cap. The full frontend suite passed 274 tests with 12 environment-dependent
skips; strict TypeScript and the production build passed. The expanded Phase 2
live harness passed 26/26, including an exact 500-row correction, exact atomic
undo and 501-row validation rejection. Authenticated browser verification used
507 matches across 11 pages: the UI selected rows 1–500, showed `500 selected ·
50 on this page · 450 elsewhere`, disabled rows 501–507, updated exactly 500
rows while leaving seven Bank/Coffee rows untouched, and restored all 507 to
Bank/Coffee through one guarded undo. The temporary user, tenant, account and
507 transactions were removed afterward.

**Post-review safe bulk accounting/attribute repair — 2026-08-15:** Ledger
selection now exposes a separate `Edit attributes (N)` action so category
corrections and accounting changes have independent previews, audit groups and
undo boundaries. Kind, recurring, subscription, spending nature,
reimbursable and tax-related are independently editable. Shared values are
shown as-is; mixed values start at `Mixed — leave unchanged`; boolean fields
offer Leave unchanged/Yes/No; and spending nature can be deliberately cleared.
Apply remains disabled until at least one value would actually change.

The impact preview lists the current distribution for all six fields, exact
per-field value changes, total affected rows, source-only manual-precedence
effects for kind/recurring/subscription, and exact expense/earned-income deltas.
Only submitted fields reach the database. The atomic service-only RPC uses an
explicit update flag for each field, preserving every omitted value and its
source across heterogeneous rows. Changed rows share one operation id; guarded
undo first verifies the complete after-state of every row, then restores all
prior kind/source/attribute/transfer-candidate values or restores nothing.
System reconciliation rows block the whole selection. The existing visible
500-row selection boundary is enforced again by Zod, chunked RLS visibility
proof and SQL.

**Verification:** six focused bulk-classification regressions passed for
shared/mixed state, partial payloads, explicit clearing, source-only pins and
reporting deltas. The full frontend suite passed 280 tests with 12
environment-dependent skips; strict TypeScript and the production build
passed. A clean database reset applied every migration, schema lint reported
no errors, and the expanded classification harness passed 39/39 live checks,
including heterogeneous partial preservation, grouped and stale atomic undo,
protected-row rollback, tenant isolation, audit/direct-RPC boundaries, exact
500-row update/undo and 501 rejection. Authenticated browser verification used
two mixed transactions: the dialog exposed the correct independent Mixed/common
states, kept no-op Apply disabled, predicted a $750.00 earned-income decrease,
updated exactly two rows, retained immediate undo and restored the original
Income/Refund plus every omitted attribute. Adding a reconciliation entry
showed the lock warning and kept Apply disabled after an explicit choice. The
temporary browser session and local test data were removed afterward.

**Post-review modal focus repair — 2026-08-15:** every Ledger modal now uses
one reusable keyboard-focus contract: transaction drawer, category correction,
accounting/attributes and rules/review policy. Opening places focus on the
labelled dialog container so its name and context are announced before an
action is implied. Tab then enters the first live control; forward Tab from the
last control and reverse Tab from the first wrap within the dialog. The control
list is recomputed on every key press, so disabled Apply buttons and conditional
Undo actions cannot create stale trap boundaries.

Closing by Escape, close button or backdrop restores the exact opener. When a
successful bulk action clears selection and therefore removes that opener, the
Ledger's page-selection control is the explicit fallback rather than the
document body. Restoration also distinguishes the transaction drawer's own
Framer Motion exit node from a genuinely new dialog, preventing both the
animated-exit focus loss found during browser testing and focus theft from a
subsequent modal.

**Verification:** five focused accessibility regressions passed: four for
initial/forward/reverse/empty focus wrapping and one ensuring every Ledger
modal remains wired to the shared contract. The full frontend suite passed
285 tests with 12 environment-dependent skips; strict TypeScript, the
production build and `git diff --check` passed. The 39/39 live classification
harness remained green, and a final clean database reset applied every
migration. Authenticated keyboard/browser verification covered all four Ledger
modal surfaces: initial dialog focus, first/last-control wrapping in both
directions, Escape restoration to each exact opener, animated drawer exit, and
successful `Done and clear selection` restoration to `Select page (9)`. The
browser session and temporary local test data were removed afterward.

**Post-review browser regression harness — 2026-08-15:** the manual browser
checks from repair items 1–6 now have a repeatable Playwright suite. Its six
cases cover the complete repair sequence:

1. Shared/Mixed category fields remain inert until an explicit value is chosen.
2. Current distributions, exact affected counts and Apply gating agree before write.
3. Cross-page selection reports current-page/elsewhere scope and global clear removes it.
4. `Select all matching` caps 507 results at 500, disables the seven overflow rows, then applies and atomically undoes exactly 500 category changes.
5. Mixed kind/attributes show independent leave-unchanged states, project exact `$21.00` expense and `$750.00` earned-income decreases, apply/undo as one operation, and block protected reconciliation rows.
6. Transaction, rules, category and attribute dialogs wrap focus in both directions and restore the exact opener or the completed-flow page-selection fallback.

The suite creates one unique tenant, account and schema-complete 512-row
fixture, signs in through the real login screen and performs every tested write
through the rendered app. Service credentials are confined to fixture
setup/teardown. Both successful teardown and partial seed failure delete any
created tenant/user. Playwright starts or reuses Vite, runs one Chromium worker,
and retains traces/screenshots only for failures. Vitest excludes `e2e/`, while
a separate strict TypeScript configuration checks the browser suite.

**Verification:** the suite passed 6/6 twice consecutively, then passed 6/6
again from a clean database in 43.4 seconds. The last cleanup audit found zero
`ledger-browser-*` users. The existing 285 frontend tests, main and browser
strict TypeScript checks, production build and `git diff --check` passed; the
39/39 live classification harness had already remained green through the same
repair. A clean database reset reapplied every migration. Production dependency
audit reported zero vulnerabilities; remaining advisories are confined to the
existing development Vite/PostCSS/Nanoid toolchain and currently have no
available fix.

### Phase 5 — Splits, customisation and intelligence refinement — completed 2026-08-14

Add optional split transactions, user-created subcategories, rule management,
confidence thresholds and suggestion/review policies. Consider custom top-level
categories only after reporting and chart behaviour are explicitly defined.

**Delivered:** transactions can now have two to fifty signed, integer-cent
allocations whose sum must exactly equal the immutable bank transaction. Each
allocation has its own kind, category, subcategory and optional note. Pending
transactions and protected reconciliation adjustments cannot be split. The
original row continues to drive the account ledger and balance; split children
replace it only in category/kind analytics, avoiding both double counting and
loss of statement fidelity. Replacement is atomic, audited, tenant-scoped and
guardedly undoable.

Tenant members can create household-wide custom subcategories beneath the 13
curated expense categories. Custom top-level categories and non-expense custom
subcategories remain prohibited because their reporting semantics are not
defined. Custom subcategories have their own foreign-key identity, coexist with
the global taxonomy IDs, and work in direct/bulk corrections, reusable merchant
rules, split allocations and expense reporting.

The ledger now has a Rules & review policy dialog. It lists and deletes durable
user merchant rules without rewriting already-classified history, and exposes a
conservative AI review threshold (60%, 75% or 90%) plus missing-subcategory
policy. AI confidence now persists through provider and CSV ingestion; the
selected tenant policy is applied consistently to new and legacy AI rows while
user/bank precedence remains unchanged.

The transaction drawer extends the existing correction pattern with inline
custom-subcategory creation and an exact-total split editor. Its live remainder
message, 44px controls, native selects, impact wording, protected states,
keyboard dismissal and guarded undo follow the established ledger design
system. Ledger rows identify split parents, while expense analytics render the
allocation purposes and exact child amounts.

**Exit criteria met:** mixed-purpose purchases, repayments and reimbursements
can be represented without changing the bank ledger or distorting category,
kind, income or outflow reporting; custom vocabulary and learning policy remain
bounded, auditable and tenant-safe.

**Verification:** 251 frontend tests passed (12 environment-dependent tests
skipped), including focused split-reporting expansion tests; the production
build passed. The Phase 5 live harness passed 30/30 exact-cents, custom-identity,
rule/policy, audit, direct-write denial and tenant-isolation checks. Phase 1–4,
ingestion, AI categorisation, transfers, investments and global RLS regressions
also remained green, for 303 live checks total. Schema lint reported no errors.
Inspection of 13,101 local transactions found zero invalid allocation sums,
custom/global identity conflicts, AI review-policy mismatches, unsafe Phase 5
function grants, tables without RLS or insecure views. Browser verification
covered the 90% policy, custom subcategory visibility, exact `$70/$30` split of
an immutable `$100` parent, split-aware expense analytics, guarded undo, Escape
dismissal and zero desktop horizontal overflow. Validation found and fixed the
need for explicit custom-identity foreign keys, a PL/pgSQL validator name
collision, confidence loss across ingestion, legacy AI policy backfill and a
static-lint-incompatible temporary staging table before completion.

## Non-negotiable safeguards

- Money remains integer cents end to end.
- Every application-data mutation remains a Zod-validated, authenticated,
  tenant-scoped Edge Function with audit logging.
- RLS remains the data boundary; browser clients do not directly write tables
  or RPCs.
- A manual correction is never overwritten by automated classification.
- Taxonomy data, filters, AI schema, bank mappings, colours, budgets and
  analytics change as one tested release.
- Reclassification actions must offer clear impact wording and undo where
  practical.

## Decisions deferred beyond this plan

1. Whether a future product needs private member-only classification alongside
   the implemented household/tenant custom subcategories.
2. Linked refund/reimbursement reversals and the exact treatment of loans and
   debt repayments.
3. Whether the focused Phase 4 attributes should grow into arbitrary user-defined tags.
4. Which older categorisation events need user-facing undo versus an
   audit-only record.

## Explicit non-goals through Phase 5

- No unrestricted custom top-level categories.
- No mandatory splits; unsplit statement rows remain the normal case.
- No arbitrary user-defined tag model beyond the focused Phase 4 attributes.
- No replacement of the current secure ingestion/sync architecture.
