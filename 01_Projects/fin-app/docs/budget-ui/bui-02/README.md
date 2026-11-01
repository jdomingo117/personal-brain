# BUI-02 production goal-panel captures

These images show the authenticated production Budget route with disposable
fictional fixtures. They are separate from BUI-01's concept reference images.

The guarded runner provisions a new project, verifies an empty target, replays
migrations, signs in fixture users and exercises real Edge commands. Reproduce
from `app/` with the installed CLI:

```sh
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --task-panel-only --workspace
```

Do not repoint this at an existing stack. Read
[SYSTEM_INTEGRITY.md](../../../SYSTEM_INTEGRITY.md) before live validation.
The runner owns ports 57300/57421/57422 and refuses an occupied frontend. It removes
only its positively identified project resources and fixture IDs.

| Capture pattern | Scope |
| --- | --- |
| `captures/{320,390,1440}-{light,dark}-goal.png` | Goal editor, opaque theme surface, visible focus, full-width phone layout |
| `captures/{320,390,1440}-{light,dark}-leave.png` | In-panel unsaved-exit decision, same modal/focus owner |
| `captures/1440-light-unknown-save.png` | Interrupted response after a real committed save; original request recoverable |

The 13 PNGs are viewport-height panel captures; the form body scrolls independently.
They do not pretend to show every field at once. Reduced motion is enabled in these
fixtures. Source, test results, limitations and next burst are recorded in
[BUDGET_BUI_02_TASK_PANEL.md](../../../BUDGET_BUI_02_TASK_PANEL.md).

Engineering review inspected desktop light, phone dark and 320px captures. It found
and corrected a wrapping Close label at 320px. Owner acceptance of the larger Budget
presentation remains scheduled after BUI-04, BUI-06b and BUI-11.
