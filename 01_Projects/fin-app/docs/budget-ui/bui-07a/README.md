# BUI-07a settings host evidence

See [[BUDGET_BUI_07A_SETTINGS_HOST]] for scope and exact disposable targets.

- `captures/`: eight summary captures at 320/390/768/1440px in both themes,
  plus narrow rollover and lifecycle forms (10 images).
- `task-captures/`: 13 goal-task regression images proving the existing panel default.
- Focused settings suite: 91 checks, 22 axe scans and 23 captures.
- Full lifecycle regression: 472 checks on a separate fresh disposable project.
- Accessibility matrix: 263 checks / 64 audited states on a third fresh target.
- Unit suite: 559 passes / 14 existing skips; full/focused/browser TypeScript,
  changed script syntax, production build and diff whitespace checks pass.

Guarded runner commands from `app/` (use the installed Supabase CLI via `SUPABASE_CLI`):

```sh
node scripts/test-budget-durable.mjs --settings-only --workspace
node scripts/test-budget-durable.mjs --workspace
node scripts/test-budget-durable.mjs --accessibility-only --workspace
```

Each command provisions its own positively identified disposable stack. Stop a
retained disposable preview by its verified runner identity before conflicting runs.
Never point fixtures at the personal API on 54321. These captures are automated
fictional evidence; BUI-07a does not close human M7 validation or R01–R05.
