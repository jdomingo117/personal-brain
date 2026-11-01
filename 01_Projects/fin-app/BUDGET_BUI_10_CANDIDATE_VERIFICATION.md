---
tags: [halcyon, budgeting, ui, accessibility, verification]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-27
updated: 2026-10-27
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_09B_ASSISTANCE]]"
  - "[[BUDGET_M7_ACCESSIBILITY]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# BUI-10 — assembled Budget candidate verification

## Scope and current position

This checkpoint refreshes automated and engineering visual evidence for the
assembled production Budget. It does not approve exposure, personal migration,
R01's missing forecast, independent comprehension or human assistive-technology
operation. BUI-11 owner review/handback follows the completed automated checkpoint.

No financial calculation, command, migration or dependency is changed. The one
production correction is the quick theme control's Budget-only placement, below.
The existing dirty workspace, earlier bursts and unrelated files are preserved.

## Candidate proof

The canonical reference has expected income 600,000 cents, everyday allocation
180,000, settled everyday expense 151,000 and signed unallocated 20,000. Its
headline is 29,000 cents. A separate confirmed release of 5,000 cents from an
existing reserve changes the canonical remainder to 34,000 while planned and
spent amounts remain 180,000/151,000. The hero must read the ledger result rather
than reconstruct planned minus spent. A goal's 60,000 opening reserve and 10,000
contribution remain separate from income and confirmed funding.

`test-budget-candidate.mjs` captures and axe-scans seven states at 320, 390, 768,
1024 and 1440px in both themes: healthy overview, My plan, funding gap, failed
refresh, no history, changed historical review and interrupted draft save.
The changed history retains the immutable 151,000-cent reviewed spending while
showing latest recorded spending of 161,000. The interrupted-save case commits
once at the server, loses the response, keeps the original request and recovers
one exact 50,000-income/25,000-allowance draft without activation. View/capture
inspection creates no financial write.

The refreshed `test-budget-accessibility.mjs` retains its 64-state keyboard,
focus, target-size, reflow, reduced-motion and error matrix. It selects only the
open native dialog while a task is active, and the assistance path explicitly
confirms individual inputs before previewing a change. Every audited state now
has a capture and machine-readable manifest.

Final current-revision checkpoints all pass on separate fresh 95-migration targets:

| Checkpoint | Result | Exact disposable project |
| --- | --- | --- |
| Accessibility | 263 checks, 64 scans/captures | `halcyon-budget-m2-b3f79c6acf134414` |
| Candidate | 187 checks, 70 scans and 80 captures | `halcyon-budget-m2-e2a5198dfb89473f` |
| Full lifecycle | 472 checks | `halcyon-budget-m2-2c2fe69c5d6149d0` |

**134 axe scans pass, with 144 saved captures and no browser runtime errors.**
All audited surfaces fit without page overflow. **586 unit tests pass / 14 existing
skips**, along with full/focused/browser TypeScript, changed-script syntax and
production build. The existing Vite bundle advisory remains. Source hashes in
`docs/budget-ui/bui-10/source-manifest.json` identify the uncommitted candidate;
no commit of earlier or unrelated dirty files is implied.

Earlier passing runs before the theme correction are diagnostic evidence, not
the final revision's pass. Final target cleanup is independently audited.

## Control reachability and regression map

| Action families from the BUI-01 map | Fresh evidence |
| --- | --- |
| Period navigation; Overview / My plan / Look back | Candidate view matrix and full temporal/selected-period reload journeys |
| Manual setup, saved draft, assistance and explicit activation | 64-state audit and full workspace/assistance journeys; draft remains separate from plan activation |
| Everyday limits, category replacement/removal and rights movement | Full item/temporal journeys plus independent rights-inclusive headline check |
| Bill/reserve schedules, matching, funding evidence and purchase/refund | Full M4/item browser and durable assertions; no inferred cash or duplicate reserve credit |
| Goals, edits, opening reserve, purchase and release | Full goal/item journeys and matched candidate reserve assertion |
| Frequency, dated accounts, rollover, pause/resume and archive | Full policy/lifecycle browser and durable assertions; exact previews, signed effects and undo retained |
| Historical review, comparison, reopen and next period | Changed-history matrix plus full lifecycle/temporal and immutable-review tests |
| Error/retry, stale reads and unknown write results | Failed-refresh and interrupted-save matrix, original request/receipt recovery and full source/concurrency tests |
| Theme preference | New inline-control geometry, real shared preference and other-route floating-control proof |
| Required forecast | Explicitly unavailable; R01 remains an open requirement, not a completed action |

This maps tested action families; it is not a claim that every possible data/error
combination or human assistive interaction has been exhausted.

## Accessibility audit — 27 October 2026

Standard: WCAG 2.1 AA automated coverage plus the project's 44px target policy.
The 44px policy is additional project guidance; WCAG 2.1 criterion 2.5.5 is AAA.
The accessibility-review skill guided the audit. Axe rules and violating nodes
are not disabled or excluded to get a pass.

| Finding | Severity / evidence | Correction / closure |
| --- | --- | --- |
| B10-V01 — floating theme control can cover signed money on a phone | Major visual usability issue; engineering inspection of the 390px dark healthy capture showed overlap with Still to plan. Overflow and axe scans alone did not detect it. | Reuse the shared ThemeToggle in the Budget header's normal flow for active and no-plan states. AppFrame omits the floating copy only on the Budget route. Other routes retain one floating control. Fresh geometry checks require no overlap with money; real toggle and route-transition checks preserve behavior. Final header geometry and preference/route checks pass in the 187-check candidate rerun. |

The correction touches `App.tsx`, `ThemeToggle.tsx`, `BudgetPageHeader.tsx` and
Budget-local CSS. It adds no theme state, handler or new control implementation.
The inline button uses the same shared preference, accessible name and pressed
state. Its 46px target stays in the header. Native dialogs remain the sole focus
owners; the quick theme button is outside the modal task.

Shipping text-token contrast against theme surfaces was independently recomputed
and the existing unit guard passes:

| Token | Light | Dark | Normal-text AA threshold |
| --- | ---: | ---: | ---: |
| muted | 5.45 | 9.39 | 4.5 |
| faint | 4.89 | 7.79 | 4.5 |
| accent ink | 4.98 | 9.64 | 4.5 |
| positive | 5.06 | 8.55 | 4.5 |
| warning | 5.31 | 7.48 | 4.5 |
| negative | 5.65 | 4.97 | 4.5 |

The keyboard audit covers native task entry, Tab/Shift+Tab containment and Escape
restoration, settings form entry/return, table ArrowRight scrolling and ordinary
control activation. Names/roles/values and validation messages are checked through
rendered DOM/axe. Real VoiceOver/NVDA, native browser magnification, full keyboard-
only human tasks, glass-background focus/contrast and real touch remain M7.3.
The additional 720px reflow configuration is not a native 200% zoom result.

## Visual comparison and adaptations

The approved BUI-01 concept captures are the comparison reference. Production's
1440px healthy overview preserves the dates/money hierarchy, 29,000 remainder,
600,000 expected versus 300,000 received, signed 20,000 Still to plan, restrained
surfaces, optional detail and primary everyday/commitments beside secondary goals
and checks. Phone views stack the income and content. Both themes, My plan,
changed history and the recovery panel are captured and inspected.

Intentional adaptations remain explicit:

- The existing app shell/rail consumes width; the concept reference is a cropped
  content canvas. The Budget route does not redesign the global shell.
- Real saved period IDs, previous/next/current actions and lifecycle labels replace
  the fictional selector. Remaining days use the real 27 October date, not the
  concept's frozen 19 October clock.
- A single everyday pool is retained with limits off. The concept's optional
  category partition is not invented from missing production evidence.
- Planned reserves, bank-matched and user-confirmed goal evidence stay separate.
  No unsupported combined funded-progress number is invented.
- Native retained tasks preserve draft, stale-source and receipt recovery meaning.
  The concept's fixture/restart toolbar never ships.
- Forecast availability remains truthful and R01 remains open. No layout or test
  turns an unavailable forecast into completed functionality.

This is engineering comparison, not the owner's BUI-11 visual acceptance.

## Commands and target safety

Run from `app/`, with the installed CLI supplied as `SUPABASE_CLI`:

- `node scripts/test-budget-durable.mjs --accessibility-only --workspace`
- `node scripts/test-budget-durable.mjs --candidate-only --workspace`
- `node scripts/test-budget-durable.mjs --items --lifecycle --workspace`
- `npm test`, full/focused/browser TypeScript, changed `.mjs` syntax and production build

The three browser/database checkpoints provision unique projects on API 57421,
DB 57422 and frontend 57300, verify empty targets, replay the complete migration
chain and clean up only captured fixture identities and exact project resources.
They never target the personal app/API 5300/54321 or a retained preview. M7.7's
separate ingestion/ledger golden and security/telemetry audit are not closed here.

An initial candidate attempt was interrupted by a Vite reload while its new test
module was being finalized; the timestamp matched the view reset. The stable
pre-correction rerun passed 175 checks. Its subsequent visual inspection caught
B10-V01, so final post-correction runs supersede that evidence. The earlier full
lifecycle run passed 472; it is rerun after the UI correction rather than being
presented as the final revision's result.

## Remaining gates

The UI count is 16/17: next BUI-11 owner review and
handback. R02–R05 are corrected. R01 remains required before final acceptance of
affected checks, and M7.3/M7.4 human accessibility/comprehension, M7.5 capacity,
M7.6 persistent migration/restore, M7.7 cross-feature/security and M7.8 rollout
approval remain open. Release remains No-Go. No personal migration or exposure
has been performed.

## Exact cleanup audit

The retired BUI-09b preview `halcyon-budget-m2-d142599a4ea34e92` was positively
identified, stopped and cleaned before tests. All completed attempt labels were
audited for containers, volumes and networks. Earlier diagnostic/pre-correction
targets were `halcyon-budget-m2-7b34e4b9f25a4c6d`,
`halcyon-budget-m2-efa0fc3694714314`, `halcyon-budget-m2-5948f696b0d54d2a` and
`halcyon-budget-m2-3a2cf95508f749f4`. Final accessibility/candidate targets are in
the table above. A final lifecycle attempt at
`halcyon-budget-m2-4a96a068a6d94ef4` timed out during CLI stack startup before
fixtures/tests; exact cleanup passed. The fresh retry
`halcyon-budget-m2-2c2fe69c5d6149d0` passed all 472 checks and its runner reports
exact cleanup. The retained preview is a separate fresh project.

## Retained owner-review site

Fresh disposable project `halcyon-budget-m2-f76a234b3e374c95`, runner PID 86115,
serves `http://127.0.0.1:57300/budget` (API/DB 57421/57422). All seven fictional
accounts passed normal password sign-in and their sample/setup/history/eligibility/
readiness/individual-input/signed-estimator controls. The existing in-app tab is
signed into the healthy sample through normal login and was explicitly reloaded
to load the verified candidate assets after the development-server restarts.

The overview shows $290 everyday remaining, $1,510 spent against $1,800 planned,
$6,000 expected income, $3,000 received and $200 Still to plan. The single quick
theme control is visibly in the header. No edit or save was performed in the
final browser inspection. The preview's named goal is Weekend away; the candidate
matrix separately uses Flights to Japan with its tested opening reserve. Both
use the same canonical headline reference values.

Screenshot: `/private/tmp/halcyon-bui10-ready.png`. Runtime credentials stay in the
runner's mode-0600 temporary `manual-preview.json`, outside documentation. Keep
this exact runner alive for BUI-11; positively identify it before stopping and
verify cleanup before conflicting tests. Never reuse the retained preview for
destructive test fixtures. No personal-stack inspection, fixtures, migration or
feature exposure was performed.

BUI-11 subsequently recorded explicit owner visual acceptance on 27 October 2026. [[BUDGET_BUI_11_OWNER_HANDBACK]] and its cleanup delta identify the removal of exactly two unused CSS rules; all other 440 candidate hashes remain unchanged. This record remains the BUI-10 automated baseline, not a new BUI-11 test run.
