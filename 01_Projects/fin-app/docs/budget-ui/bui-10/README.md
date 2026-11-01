# BUI-10 production candidate evidence

See [the checkpoint](../../../BUDGET_BUI_10_CANDIDATE_VERIFICATION.md).

- `accessibility/`: 64 current rendered-state captures and a manifest for the full
  accessibility/keyboard/reflow audit, including open native tasks.
- `candidate/`: seven financial/recovery states at five widths in light/dark,
  plus healthy body captures and an exact reference-money manifest.
- Approved reference images remain in `../bui-01/references/`.

All images contain fictional isolated fixtures. Final run counts, project cleanup,
limitations, the Budget-only theme occlusion fix and next owner checkpoint are in
the linked record. Automation is not human accessibility or owner acceptance.

## Representative review images

| State | Desktop | Phone |
| --- | --- | --- |
| Healthy overview | [1440 light](candidate/healthy-1440-light.png) | [390 dark](candidate/healthy-390-dark.png) |
| My plan | [1440 light](candidate/my-plan-1440-light.png) | [390 dark](candidate/my-plan-390-dark.png) |
| Funding gap | [1440 dark](candidate/funding-gap-1440-dark.png) | [390 light](candidate/funding-gap-390-light.png) |
| Failed refresh | [1440 light](candidate/failed-refresh-1440-light.png) | [390 dark](candidate/failed-refresh-390-dark.png) |
| No history | [1440 dark](candidate/no-history-1440-dark.png) | [390 light](candidate/no-history-390-light.png) |
| Changed history | [1440 light](candidate/changed-history-1440-light.png) | [390 dark](candidate/changed-history-390-dark.png) |
| Interrupted save | [1440 light](candidate/interrupted-save-1440-light.png) | [390 light](candidate/interrupted-save-390-light.png) |

The [source manifest](source-manifest.json) identifies the tested uncommitted
candidate by SHA-256 without copying secrets or personal data. The two state
manifests record each rendered configuration. Compare the healthy captures with
the [approved desktop reference](../bui-01/references/1440-light-overview.png) and
[approved phone reference](../bui-01/references/390-dark-overview.png); differences
and truthful data adaptations are described in the checkpoint.
