# BUI-06b checks and assembled overview

Guarded commands from `app/`:

```sh
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --attention-only --checks-only --workspace
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --hero-only --checks-overview --workspace
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --items --lifecycle --workspace
```

`captures/` contains priority/all-checks and overview states at five widths in both
themes. `overview/` contains the matched $290 remaining / $200 still-to-plan
reference and existing goal-panel recovery captures. Each command provisions a
fresh positively identified disposable project and performs scoped cleanup.

See [BUDGET_BUI_06B_CHECKS_GUIDANCE.md](../../../BUDGET_BUI_06B_CHECKS_GUIDANCE.md)
for exact results and acceptance boundaries. R01 forecast remains explicitly
unavailable; automated evidence does not imply owner or final human acceptance.
