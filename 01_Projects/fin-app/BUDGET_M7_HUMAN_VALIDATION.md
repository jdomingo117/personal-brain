---
type: verification-protocol
status: prepared-results-pending
project: Halcyon
updated: 2026-10-28
---

# Budget — observed human validation

The owner accepted the real Overview's three clarity questions on 28 October 2026. The owner reported on 28 October 2026 that the independent beginner tester is no longer available. An AI beginner-perspective critique is complete as supporting review only; see `docs/budget-ui/human-validation/ai-critique.md`. Screen-reader observation is not yet arranged. This packet prepares M7.3 and M7.4; it records no observed passes and does not authorize deployment. See [[BUDGET_M7_RELEASE_VERIFICATION]] for the remaining release gates.

## Start here

Use the real [Budget preview](http://127.0.0.1:57300/budget), not the separate study. Keep all sessions on fictional accounts on this device. The current R01 example is suitable for the first 10–15 minute comprehension session. Give the participant only `docs/budget-ui/human-validation/participant-tasks.md`. Keep the moderator answers out of view. Record observations in `docs/budget-ui/human-validation/results.md`.

After the initial Overview tasks, the moderator can arrange the existing sample-budget account for goal tasks and an eligible assistance account for draft tasks. These are separate fixtures; do not suggest that an empty goal list is a failure. Runtime credentials remain in the private temporary preview metadata, never in participant materials. A fresh browser may require normal sign-in. Do not use real finances or publish this local preview for these sessions.

## M7.3 — observed accessibility

Record the actual OS, browser, screen reader/version, device, input method, theme, date, fixture and source manifest. The current production baseline is `docs/budget-ui/copy-refinement/source-manifest.json`, following the approved copy changes in [[BUDGET_OVERVIEW_COPY_REFINEMENT]]. Earlier assembled engine/workflow evidence remains in pass three. Test both themes; capture which tasks ran in each. Automated axe, DOM accessibility-tree inspection and keyboard automation are supporting evidence, not spoken screen-reader observations.

VoiceOver is already part of macOS. A person can enable it through System Settings → Accessibility → VoiceOver; [Apple's instructions](https://support.apple.com/en-gb/guide/voiceover/vo2682/mac) explain the controls. The agent has no current tool for listening to VoiceOver speech. Record a first-time user's guided check as such; it does not establish independent experienced screen-reader usability. If the in-app browser does not work with the chosen AT, use a supported local browser and record that exact combination and any in-app issue separately.

| Task | Observe and record |
| --- | --- |
| Navigate Overview with the screen reader | Headings/landmarks and period context; remaining, recorded, projected and pending labels/amounts in a sensible order; chart meaning available without vision; no bank-balance inference |
| Open forecast explanation, income and goal disclosures | Names, expanded state and readable contents; return/navigation remains usable |
| Reach the priority action and other checks | Understand the action; operate it; no inaccessible secondary checks |
| Open a goal editor and leave a dirty form | Field labels and errors; dialog name; focus stays within the active dialog and returns to its trigger; retained/discarded changes are understandable |
| Navigate Overview, My plan, Look back, Accounts & settings with keyboard only | Visible focus; sensible order; all controls reachable/operable; no trap or obscured active control |
| Trigger an ordinary validation error in the fictional goal form | Error is associated with the field and discoverable through AT; correction and retry work |
| Observe a save and a genuine recoverable failure when safely available | Busy/result/error announcements; no false success; outcome check/retry and focus recovery. Unavailable cases stay not run; do not manufacture production failures |
| Use actual browser 200% zoom and a narrow window | No lost controls, clipped money, unreadable overlap or forced two-dimensional reading. Record native zoom; viewport resizing alone is insufficient |
| Use an actual touch device when available | Targets operable, focus/scroll/dialog content reachable. Project target policy is 44px; do not label that policy a WCAG 2.1 AA target-size requirement |
| Inspect both themes and glass/focus contexts | Text, errors, disabled state and focus remain distinguishable against their actual backgrounds; record any unreadable combination |

Record each task as pass, fail, assisted or not run with actual behavior/announcements. An untested browser/device/state stays untested. Fix reproducible blockers, refresh affected automated evidence, then repeat the affected human task. M7.3 stays open until its required observations are recorded and findings resolved; the owner visual yes does not close it.

## M7.4 — independent comprehension

Use an unfamiliar participant, without explaining the intended financial meanings first. Say: “We are testing the page. Please say what you think it means and show where you would go. It is fine to be unsure.” Ask the participant-card questions verbatim and let them navigate. Capture their words, first route, hesitation and any help. If help is necessary, record the initial result before helping; a corrected answer after coaching is assisted, not an independent pass.

AC30 requires planned income, received income and budget remaining to be understood as different quantities. AC33 requires the headline and an adjustment to be explained in the beginner's own words. SG09 requires explaining the suggestion's inputs, changing an amount, distinguishing a what-if from guaranteed results and identifying that no money moved. Goal checks also require distinguishing plan reservation, confirmed funding and conditional timing. No new participant-count threshold is imposed by this packet; one session supplies evidence, not a blanket claim about all beginners. Review repeat patterns and arrange further participants if the evidence is inconclusive.

The [moderator guide](docs/budget-ui/human-validation/moderator-guide.md) maps each task to these criteria. Sessions may be split: Overview first, then goals and assistance once their fixtures are ready. Report completed scope precisely. M7.4 cannot close on the Overview questions alone.

## After the sessions

Triage observations into misunderstanding, navigation, accessibility or fixture/setup issues. Record concrete reproduction, severity, owner and affected criterion. Resolve blockers and retest without treating coached answers as new independent evidence. Update the release matrix with actual completed scope. M7.5 capacity, M7.6 authorized persistent migration/restore, M7.7 cross-feature/security/operations and M7.8 release decision remain separate and open.
