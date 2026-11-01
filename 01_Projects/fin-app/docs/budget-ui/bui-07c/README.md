# BUI-07c rollover and lifecycle form evidence

See [[BUDGET_BUI_07C_ROLLOVER_LIFECYCLE]] for scope, targets and final results.

- `captures/`: 100 images, comprising eight settings summaries, two existing narrow
  form captures and 90 captures of nine edit/review states at 320, 390, 768, 1024
  and 1440px in both themes.
- `task-captures/`: 13 existing goal-task regression images.
- Total: 113 captures, 112 axe scans and 32 keyboard-scroll checks.
- Focused suite: 320 checks, including existing dirty exit, source refresh,
  unknown save recovery, normal save and original rollover/lifecycle journeys.

States: rollover editing, signed rollover review, removed-category transfer review,
pause editing/review, resume review, archive release review and both durable
preparation states. The fixtures show
shortfalls alongside protected positive balances, and explicit signed archive
movement. Viewport and theme are restored after each matrix, preserving the
original phone journey assertions. The two progress checks call the actual durable
SQL checkpoint function because these small fixtures otherwise use the fast path;
normal API behavior is verified separately. Captures are fictional and do not close human
M7 accessibility/comprehension checks or R01–R05.

From `app/`, set `SUPABASE_CLI` to the installed CLI and run:

```sh
node scripts/test-budget-durable.mjs --settings-only --settings-lifecycle --workspace
node scripts/test-budget-durable.mjs --items --lifecycle --workspace
```

Each provisions a fresh guarded disposable stack. Never target personal API 54321
with fixtures. Stop the exact retained preview runner before conflicting runs;
never reuse preview fixture identities for automated tests.
