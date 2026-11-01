# BUI-09a manual setup evidence

See [[BUDGET_BUI_09A_MANUAL_SETUP]] for scope, targets, results and whole-plan status.

`captures/` contains 60 fictional images: monthly and fortnightly editing, review
and saved-draft review at 320/390/768/1024/1440px in both themes. `task-captures/`
contains 13 existing goal-panel regression captures. Total: 73 captures/72 axe scans.
The focused run passes 193 checks, including close/Back retention, no-bank/zero
income, future-gap acknowledgement and separate draft/activation recovery.

From `app/`, with `SUPABASE_CLI` set to the installed CLI:

```sh
node scripts/test-budget-durable.mjs --setup-only --workspace
node scripts/test-budget-durable.mjs --items --lifecycle --workspace
```

Each provisions a fresh guarded disposable target. Never use personal API 54321
for fixtures. Stop the exact retained preview runner before conflicting runs;
never reuse preview fixture identities. Automated scans do not close human M7
accessibility/comprehension checks or R01–R05.
