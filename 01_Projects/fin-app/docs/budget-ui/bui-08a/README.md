# BUI-08a My plan evidence

See [[BUDGET_BUI_08A_MY_PLAN]] for scope, target identities and final results.

`captures/` contains 20 images: current allocations and expanded continuing plan
at 320, 390, 768, 1024 and 1440px in both themes. The mixed fixture includes a long
name, distinct current/future allocations, one-off cash and an existing reserve.
68 focused checks and 20 axe scans passed; this is fictional automated evidence,
not human M7 accessibility/comprehension acceptance.

From `app/`, set `SUPABASE_CLI` to the installed CLI and run:

```sh
node scripts/test-budget-durable.mjs --plan-only --workspace
node scripts/test-budget-durable.mjs --items --lifecycle --workspace
```

Each command provisions a fresh guarded disposable target. Never point fixtures at
personal API 54321. Stop the exact retained preview runner before conflicting runs;
never reuse preview fixture identities for automated tests.
