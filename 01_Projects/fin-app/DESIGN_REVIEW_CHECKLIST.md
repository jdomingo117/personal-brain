---
tags:
  - halcyon
  - projects/fin-app
  - design-system
  - quality
status: current
project: Halcyon
up: "[[Halcyon_DesignSystem]]"
---

# UI review checklist

Use this checklist for every visual or workflow change before requesting review.

## Typography and hierarchy

- [ ] Explanatory prose uses `body-copy` (15px) or, where truly compact, `detail-copy` (13px).
- [ ] Micro type is metadata only: labels, tags, provenance or table headers—not a sentence the user must read to complete a task.
- [ ] Currency, totals and decision outcomes use tabular figures and are at least as prominent as their labels.
- [ ] One primary action and one primary consequence are visually apparent in every section.

## Spacing and controls

- [ ] Labels have an 8px gap before their field; independent field groups have 20–24px separation.
- [ ] New decisions begin with 28–32px of space and, when helpful, a quiet divider.
- [ ] Text inputs, selects and primary choices are at least 48px high outside compact tables.
- [ ] Result/outcome areas use `outcome-panel`; comparisons use neutral surfaces and semantic gain/loss colour only.

## Responsive data views

- [ ] Review at 390px, 768px, 1024px and 1440px in both themes.
- [ ] Tables use `data-table-wrap`/`data-table` or an equivalent semantic horizontal-scroll fallback; important reading text is never reduced below its type role to avoid overflow.
- [ ] Empty, loading, warning and error messages are readable body copy and remain visible after wrapping.
- [ ] Charts retain an accessible text/table alternative and keyboard-accessible controls.

## Accessibility and finish

- [ ] Text and icon contrast meet WCAG AA against their actual surface.
- [ ] Keyboard focus is visible, logical and never clipped by overflow.
- [ ] Reduced-motion settings do not hide meaning or make controls ambiguous.
- [ ] Run `npm test -- --run`, `npm run build`, and `git diff --check`; run `npm run test:golden` when browser/database behavior changes.

## Visual-regression policy

The isolated golden browser harness keeps failure screenshots/traces for any regression. Add a
stable screenshot assertion only for deterministic, non-ambient states; do not snapshot the dynamic
scene background or timestamp-driven values. For each new screenshot baseline, cover one desktop and
one narrow viewport, document its fixture state, and review updates as a design change—not merely a
test refresh.
