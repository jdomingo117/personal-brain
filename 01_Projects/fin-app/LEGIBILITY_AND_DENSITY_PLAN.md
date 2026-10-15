---
aliases:
  - Legibility Plan
  - UI Density Plan
tags:
  - halcyon
  - projects/fin-app
  - design-system
  - accessibility
status: planned
project: Halcyon
up: "[[Halcyon_DesignSystem]]"
related:
  - "[[CURRENT_STATUS]]"
  - "[[PLANNING_EXPERIENCE_PLAN]]"
---

# Legibility and UI-density remediation plan

## Why this exists

The Strategic Projections screenshots exposed a system-wide issue: controls meet a usable minimum
height, but explanatory text, labels, spacing and outcome panels are composed too densely. The
result feels more like a compact diagnostic console than a calm financial workspace. Repeated,
panel-by-panel font-size fixes would make the application inconsistent.

This plan establishes one typography and spacing contract, applies it through shared primitives,
then audits high-use screens against that contract.

## Design critique summary

### What works

- The field order in **Goal & what-if** follows the user’s mental model: target, return,
  hypothetical change, then expected outcome.
- Inputs have recognisable boundaries and generally meet the 40–48px interaction-size range.
- The app’s neutral surface, limited mint accent and semantic gain/loss colours are appropriate for
  personal finance when they are not overused.

### Primary problems

| Finding | Severity | Why it hurts | Direction |
| --- | --- | --- | --- |
| Paragraphs and helper text commonly use 12–13px | High | On a dark, textured surface this is effortful to read, especially in multi-line explanatory copy. | Establish a 14px minimum for supporting prose and 15px default body copy. |
| Form groups have only small local gaps | High | Labels, fields, checkbox controls and result cards visually merge into one long form. | Introduce consistent group spacing and section dividers. |
| Labels and paragraphs are too similar in density | Medium | Uppercase labels create visual noise while instructions do not receive enough space or contrast. | Reserve uppercase for true metadata; use sentence-case helper copy. |
| Outcome panels look like another form field | Medium | Users cannot immediately distinguish inputs from the forecast consequence. | Give results a dedicated section heading, breathing room and a restrained neutral surface. |
| Local Tailwind font sizes are repeated ad hoc | High | A future panel can regress even after one screen is repaired. | Move semantic typography/density rules into shared classes or components. |

## Product-wide contract

### Typography

| Role | Minimum / default | Line height | Use |
| --- | --- | --- | --- |
| Long-form body / helper text | 14px minimum; 15px default | 1.5–1.7 | Instructions, explanations, empty states, card descriptions. |
| Compact supporting detail | 13px | 1.45–1.55 | One-line provenance, table support, concise notes only. |
| Field label | 12px | 1.2 | Short labels; uppercase only where scanning benefits from it. |
| Control label | 14px | 1.35 | Button groups, checkbox titles, selector values. |
| Data value | 15–16px | 1.3 | Currency, calculated results and values requiring comparison. |
| Micro/status label | 11–12px | 1.2 | Tags, provenance and eyebrow metadata; never paragraphs. |

No paragraph-sized content may use `text-[12px]` or `text-[13px]` merely to fit more on screen.
If a panel becomes too tall, fix the information architecture first: collapse optional detail,
split sections, or defer secondary content.

### Spacing and grouping

Use a deliberate 4px base scale: **4 / 8 / 12 / 16 / 24 / 32px**.

- Label → control: 8px.
- One field group → next field group: 20–24px.
- Form subsection → next subsection: 28–32px plus a subtle divider where useful.
- Panel edge padding: 20px standard; 24px for explanatory or review panels.
- Result card: at least 16px above its section label and 20px internal padding.
- Two controls that are alternatives remain visually adjacent (8px); two controls that begin a new
  decision receive a section gap rather than another border.

### Information hierarchy

1. **Decision:** the field or action the user should take now.
2. **Consequence:** the resulting date/value or variance in larger type.
3. **Reason:** short supporting sentence in body size.
4. **Method:** optional disclosure/table; never compete with the decision.

Use neutral surfaces for calculations and comparisons. Mint denotes active selection/action;
green/red denote financial direction; do not use decorative blue callouts for “smart” analysis.

## Phased implementation

### Phase A — Tokens and shared primitives

1. Add semantic `body`, `detail`, `field-label`, `control-label`, `data-value` and `micro` utility
classes to `app/src/index.css`; document them in `Halcyon_DesignSystem.md`.
2. Create or extend shared `FieldGroup`, `FormSection`, `HelperText`, and `OutcomePanel` primitives
so standard spacing is not repeated as raw Tailwind values.
3. Make 48px the default interactive height for text inputs, selects and primary segmented options;
keep 40px only for compact table controls with an equally accessible alternative.
4. Add a lintable review rule: paragraph/help copy cannot use `text-[12px]`; exceptional compact
metadata must be explicitly labelled as such.

**Exit gate:** one reference form and one dense data panel use only the primitives; their rendered
typography and spacing match the contract in light and dark themes.

### Phase B — High-impact workflow pass

1. Rebuild **Strategic Projections** as three visibly separated sections:
   - goal assumptions;
   - optional what-if; and
   - forecast consequence.
2. Apply the shared contract to recurring management, category review, import/reconciliation,
   settings forms and authentication/error states.
3. Increase all explanatory paragraphs and warnings to the body role; retain compact details only
in dense tables and provenance rows.
4. Replace over-nested bordered boxes with whitespace/dividers when the content is a continuation
of the same decision.

**Exit gate:** a user can complete the goal/what-if form at 100% browser zoom without needing to
lean in, and each workflow presents one clear primary action per section.

### Phase C — Data-view and responsive audit

1. Audit Dashboard, Accounts, Income, Expenses, Ledger, Recurring and Settings at 390px, 768px,
   1024px and 1440px.
2. Check paragraph wrapping, table headers, tooltip values, control hit targets and empty/error
   states in light/dark themes.
3. Retain dense data tables where needed, but add progressive disclosure rather than shrinking
   reading text.
4. Verify reduced-motion, keyboard focus, screen-reader names and 4.5:1 text contrast for every
   new semantic role.

**Exit gate:** no workflow uses small paragraph text to avoid wrapping; all text-bearing controls
remain readable and operable at the target breakpoints.

### Phase D — Visual regression and governance

**Status: shipped 2026-10-15.** Shared semantic roles are documented, failure screenshots/traces
remain enabled in the isolated browser harness, and the required responsive/themed review gates now
live in `DESIGN_REVIEW_CHECKLIST.md`. Stable screenshot baselines are deliberately limited to
deterministic fixture states so the ambient scene and time-dependent content do not create noisy
test failures.

1. Add Playwright screenshots for representative form, table, explanation and error states in both
   themes and at desktop/mobile breakpoints.
2. Add a design-review checklist to pull-request guidance: type role, minimum text size, spacing
   rhythm, semantic colour, focus state and responsive wrapping.
3. Review any exceptions quarterly; exceptions must name why compact density materially improves
   the task rather than merely fitting more content.

## Recommended first implementation sequence

Start with **Phase A**, then use Strategic Projections as the reference implementation in Phase B.
It contains every relevant pattern—inputs, segmented choices, helper copy, computed outcome,
warning, comparison and disclosure—so it is the fastest way to prove the system before propagating
it to the rest of the application.
