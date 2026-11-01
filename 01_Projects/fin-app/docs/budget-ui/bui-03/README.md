# BUI-03 production adapter captures

These are authenticated production views of disposable fictional fixtures.
The adapter changes value availability/qualification behind the existing layout;
the concept-like header/hero is BUI-04.

| Capture | Meaning |
| --- | --- |
| `captures/{390,1440}-{light,dark}-everyday.png` | Canonical $290 pool / $350 Other; $60 category overage stays signed |
| `captures/1440-dark-stale.png` | Retained $340 remainder after reserve-rights release and failed refresh |
| `captures/390-{light,dark}-manual.png` | Known planning room; recorded everyday spending unavailable, not zero |

The body scrolls inside the existing app shell. Captures show the relevant scrolled
section, not a stitched full-page layout. Reduced motion is enabled. Engineering
inspection covered desktop light and phone dark; owner fidelity gates follow the
new hero/overview work.

Reproduce from `app/` using the guarded fresh disposable provisioner:

```sh
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --presentation-only --workspace
```

Read [SYSTEM_INTEGRITY.md](../../../SYSTEM_INTEGRITY.md) first. Never repoint this
at an existing database. The runner owns and verifies its unique project identity,
uses ports 57300/57421/57422 and cleans up only its fixtures/project.
Full scope and results are in
[BUDGET_BUI_03_PRESENTATION_ADAPTER.md](../../../BUDGET_BUI_03_PRESENTATION_ADAPTER.md).
