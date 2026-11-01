# BUI-04 production header/hero review

These are authenticated production Budget views of disposable fictional fixtures,
not the standalone concept. Existing app chrome is retained. Only the header,
hero/income and local page plane have this phase's composition; the lower category,
commitment, goal and check sections follow in later bursts.

## Review captures

| File pattern | Meaning |
| --- | --- |
| `captures/{320,390,768,1024,1440}-{light,dark}-overview.png` | Ten top-of-page captures with matched concept amounts |
| `captures/390-{light,dark}-money-detail.png` | Same phone, scrolled 200px so the stacked income/unallocated content can be reviewed together |
| `captures/1440-light-funding-gap.png` | Signed current funding gap |
| `captures/1440-light-overspend.png` | Signed everyday overage, visually clamped meter |
| `captures/1440-light-stale.png` | Previous values retained with stale/read-failure qualification |
| `captures/320-light-extreme.png` | Exact-cent extreme values wrap in the narrow layout |
| `captures/320-light-unavailable.png` | Unavailable dependent balance/income with known planning input |
| `captures/390-light-manual.png` | Manual planning room, unavailable observed income/spending |
| `task-captures/*.png` | Thirteen reverified goal/dirty-exit/recovery captures, stored here to preserve the BUI-02 baseline |
| `geometry.json` | Actual header/headline/income/control positions at each width/theme |

Primary review: [desktop light](captures/1440-light-overview.png),
[phone dark](captures/390-dark-overview.png),
[phone money detail](captures/390-dark-money-detail.png).

Capture height is 1100px. Narrow phones require some scrolling for the full stacked
income/explanation, especially at 320px; screenshots are not stitched or resized to
pretend all content fits at every phone height. The existing screen-edge mask and
floating theme control are part of the retained shell. Reduced motion is enabled.
The server's current date drives days remaining; the concept's fixed clock is not used.

## Reproduction and evidence scope

Run from `app/` after reading
[SYSTEM_INTEGRITY.md](../../../SYSTEM_INTEGRITY.md):

```sh
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --hero-only --workspace
```

The guarded provisioner owns a newly identified project on ports 57300/57421/57422,
checks the initially empty target and replays the migration chain. It signs in real
fixture users and exercises real Edge behavior. Never repoint it at an existing
database. Cleanup is scoped to captured fixture IDs and the exact project label.

The full existing lifecycle regression remains:

```sh
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --items --lifecycle --workspace
```

Counts, target identities, engineering inspection and the owner visual approval of 26 October 2026
are recorded in [BUDGET_BUI_04_HEADER_HERO.md](../../../BUDGET_BUI_04_HEADER_HERO.md).
Automated checks are not owner approval or human accessibility/comprehension evidence.
