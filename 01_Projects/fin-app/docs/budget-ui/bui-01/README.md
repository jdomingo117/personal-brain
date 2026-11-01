# BUI-01 concept references

Captured 25 October 2026. Financial and interaction decisions are in
[BUDGET_BUI_01_REFERENCE_MAP.md](../../../BUDGET_BUI_01_REFERENCE_MAP.md).

These are fictional concept references. They are not production implementation
screenshots, accessibility certification or owner acceptance.

To reproduce from the repository root, start Vite in a separate terminal:

```sh
cd app
npm run dev -- --port 5314 --strictPort --host 127.0.0.1
```

Then from the repository root:

```sh
node docs/budget-ui/bui-01/capture-reference.mjs
```

The script requires the existing app Playwright installation and Chromium. It uses
fresh browser contexts; it never visits the production Budget route or provisions
a database. Only its isolated concept state is changed. Stop only the Vite process
you started. Do not reuse or kill an unidentified listener on 5314.

## Manifest

| File pattern in `references/` | Count | Scope |
| --- | --- | --- |
| `{320,390,768,1024,1440}-{light,dark}-overview.png` | 10 | Healthy content viewport, top |
| `{390,1440}-{light,dark}-{lower,calculation,plan,history}.png` | 16 | Lower content, task panel, plan and original September review |
| `1440-{light,dark}-phone-preview.png` | 2 | Explicit 430px concept Phone preview |
| `1440-{light,dark}-{incomplete,gap,changedHistory,noLimits}.png` | 8 | Independent fictional scenarios |
| `measurements.json` | 1 | Computed geometry, healthy remaining assertions, errors and data-service requests |

Capture run: **36 PNGs / 10 healthy viewport-theme measurements; zero page errors,
zero data-service requests, zero healthy-overview horizontal overflows**. Script
syntax check passes. The first sandboxed Chromium launch failed because macOS denied
Mach-port registration; the permitted external-sandbox run completed successfully.

Reference geometry differs from the production adaptation in the handoff: the
concept has a 56px phone hero amount and uses its own shell/container rules. Preserve
its hierarchy while fitting the existing production shell and extreme values.
The 1100px viewport captures show the visible content scroller; `lower` shows its
bottom. They are not stitched full-page screenshots.

Engineering visual inspection sampled desktop light overview, phone dark overview,
changed September history and phone calculation. Text/amounts are legible and the
review toolbar is excluded. Owner review of the production adaptation follows
BUI-04, BUI-06b and BUI-11.
