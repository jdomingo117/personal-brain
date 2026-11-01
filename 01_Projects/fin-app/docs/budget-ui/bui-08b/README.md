# BUI-08b Look back evidence

See [[BUDGET_BUI_08B_LOOK_BACK]] for scope, target identities and final results.

`captures/` contains 70 fictional images: seven states at 320, 390, 768, 1024 and
1440px in both themes. States are unreviewed, carry choice, recorded review,
next-period preview, changed review/comparison, current and future. Focused proof:
180 checks, 70 axe scans and eight keyboard-scroll checks. Original M5 financial
assertions remain, including immutable recorded spending after a late correction.

Four rendering tests independently verify original/latest/recorded mappings,
non-mutation, availability/freshness and category-policy qualification. Human M7
accessibility/comprehension checks and R01–R05 remain open.

From `app/`, with `SUPABASE_CLI` set to the installed CLI:

```sh
node scripts/test-budget-durable.mjs --lookback-only --workspace
node scripts/test-budget-durable.mjs --items --lifecycle --workspace
```

Each provisions a fresh guarded disposable target. Never point fixtures at personal
API 54321. Stop the exact retained preview runner before conflicting runs; do not
reuse preview fixture identities for automated tests.
