# BUI-07b frequency and account forms

See [[BUDGET_BUI_07B_FREQUENCY_ACCOUNTS]] for scope, results and target identities.

`captures/` contains 50 images: eight settings summaries, 40 edit/review captures
for the frequency and account forms at 320/390/768/1024/1440px in both themes,
and two narrow rollover/lifecycle regression captures. `task-captures/` contains
13 existing goal-task regression images. Total: 63 captures, 62 axe scans.

The mixed financial fixture includes everyday, fixed, reserve, contribution and
a reserve configured as a goal. Each amount is asserted to appear once in the
correct frequency group in both independent date windows. Existing financial,
draft, cancellation, focus, source-refresh and same-request recovery assertions
remain in place. Capture state is fictional; it does not close human M7 checks.

From `app/`, with the installed CLI set via `SUPABASE_CLI`:

```sh
node scripts/test-budget-durable.mjs --settings-only --settings-forms --workspace
node scripts/test-budget-durable.mjs --items --lifecycle --workspace
```

Each command provisions a fresh guarded disposable stack. Never target personal
API 54321 with fixtures. Stop the exact retained preview runner before conflicting
runs; do not reuse preview fixture identities for automated tests.
