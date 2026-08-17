---
aliases:
  - Halcyon System Integrity
tags:
  - halcyon
  - operations
  - data-safety
type: runbook
status: current
project: Halcyon
---

# Halcyon — System Integrity and Safe Validation

## Purpose

Halcyon's local Supabase database can contain a real user's authentication
identity and personal financial history. Treat it as persistent user data, not
as a disposable development fixture. Passing tests never justifies destroying
or replacing that data.

This runbook applies to humans, coding agents, scripts and CI-like validation
performed from this repository.

## Hard safety boundary

Do **not** run any of the following against the default local Supabase project
or any database whose ownership is uncertain:

- `supabase db reset` or `npx supabase db reset`;
- `supabase stop --no-backup`, destructive Docker volume removal, or container
  recreation that discards the database volume;
- `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE`, broad unscoped `DELETE`, or a
  restore over the existing database; or
- a test harness that creates, edits or deletes rows in a real tenant.

These operations require all three of the following before execution:

1. an explicitly isolated, disposable test project/database;
2. a positively verified project identifier and connection target; and
3. a command or harness that refuses to run unless the isolated target is
   present.

The default `app/.env` target (`http://127.0.0.1:54321`) is **not evidence of a
disposable database**. Localhost can and does hold the owner's real data.

If the target cannot be proven disposable, stop and use non-destructive
validation.

## Validation environments

| Environment | Allowed work | Data rule |
|---|---|---|
| Personal local stack | App use, read-only inspection, additive migrations after backup | Persistent and irreplaceable by default |
| Isolated test stack | Resets, fixture creation, destructive integration tests | Must use a distinct project ID, database volume and ports |
| Hosted production | Approved migrations and operational reads | Never a test target |

Automated browser and integration fixtures must use uniquely labelled test
users/tenants and clean up only records they created. Cleanup must be scoped by
captured IDs, not email patterns, timestamps or broad tenant queries.

Repository live-test harnesses enforce this boundary. They require an isolated
URL that is not the default port plus `HALCYON_TEST_TARGET_ID` and
`HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES=isolated-only`. Do not weaken or bypass
this guard to make a test convenient; provision the isolated stack instead.

## Required preflight for schema or live-data validation

Before applying a migration or running an integration/browser harness:

1. Resolve and display the exact Supabase URL, project ID, database host and
   database name without printing secrets.
2. Determine whether the target contains any users, tenants, accounts or
   transactions. The presence of rows makes it persistent unless the user has
   explicitly identified the environment as disposable.
3. Take a restorable Postgres backup of a persistent target and record its
   path, timestamp and target identity. A repository commit is not a database
   backup.
4. Prefer `supabase migration up` or an equivalent forward-only migration over
   reset/replay.
5. Run unit tests and static validation first. Run live integration tests only
   against an isolated target or with transactionally scoped fixtures.
6. After validation, verify auth-user, tenant, account and transaction counts,
   tenant isolation, ledger totals, expense/income metrics and fixture cleanup.

Any unexpected decrease in these counts is a failed integrity check. Stop;
do not attempt to hide it by reseeding or creating a replacement account.

## Backup and recovery expectations

A pre-migration backup must include both `auth` and application schemas. Verify
that the dump can be listed or restored into a separate recovery database.
Keep the most recent known-good backup outside transient Supabase/Docker
directories. Original CSVs and provider resynchronisation are useful secondary
recovery sources, but they do not replace authentication identities, manual
classifications, rules, splits, tags or audit history.

Recovery is always non-destructive first:

1. preserve the current database volume;
2. inspect current row counts and migration history;
3. locate backups/snapshots and alternative data sources;
4. restore candidates into a separate database;
5. reconcile identities and tenant ownership; and
6. switch or merge only after the recovered state is verified.

Do not create a replacement account until recovery has established whether the
original auth user or tenant can be restored. A same-email account receives a
new user ID and does not automatically own the old tenant.

## Categorisation integrity

Automated categorisation must never silently overwrite a transaction-level
manual correction or a user merchant rule. Any future “re-run categorisation”
feature must provide:

- an explicit scope (unresolved only, selected transactions, or another
  narrowly defined set);
- source/precedence rules showing which rows are eligible and which are
  protected;
- a dry-run impact preview with counts by current source and proposed result;
- a visible cap and confirmation before writes;
- an audit operation ID and guarded undo where practical; and
- before/after report-integrity checks.

The current `categorize-pending` workflow is **not** a general reclassification
feature. It only processes rows where `category = 'Uncategorized'` and
`category_source IS NULL`. It intentionally leaves bank, AI, seed, rule and
manual classifications unchanged.

## Incident note — 2026-08-17

During ledger validation, the default local Supabase database was reset without
first proving it was disposable or taking a backup. This could remove the
owner's auth identity and financial data. The reset-based validation practice
is retired. Account recreation and recovery are separate operations: recovery
must be investigated first, and destructive runtime repair is prohibited until
the current database volume has been preserved and inspected.

### Recovery status

- The local API, Auth service and Postgres container are healthy.
- The surviving `supabase_db_fin-app` volume contains zero auth users, tenants,
  accounts, transactions and merchant rules.
- No older Docker database volume, relevant local database dump or usable Time
  Machine snapshot was found.
- A pre-rebuild custom-format backup was created and its `pg_restore` catalog
  verified before identity reconstruction.
- Live integration and browser harnesses now fail closed on the personal local
  URL. They require a distinct isolated URL, explicit test-project identity and
  an `isolated-only` fixture acknowledgement.
- Account reconstruction must be performed through the normal sign-up flow so
  the owner, not a script or coding agent, chooses the password. Reimport and
  metric reconciliation follow only after the new identity and tenant pass
  integrity checks.

### Clean account checkpoint — 2026-08-17

The owner completed normal sign-up. Read-only verification found exactly one
auth user, profile, tenant and owner membership, with no orphaned user/profile,
default-tenant or membership references. The onboarding account is a zero-
balance AUD Liquid account with no transactions. All public tables retain RLS
and all public views retain invoker security. A post-account custom-format
backup was created, checksummed and verified with `pg_restore` before any
transaction import. Transaction-derived metrics therefore have a known clean
zero-row baseline for the next recovery phase.
