import { EXPENSE_CATEGORIES } from '../data'

/**
 * Category → chart hue. One fixed `--cat-N` per expense category, assigned by
 * TAXONOMY INDEX (see CATEGORY_TAXONOMY's key order, which is load-bearing for
 * exactly this reason).
 *
 * Single source of truth on purpose: this logic used to be duplicated verbatim
 * in ExpenseFlowCard.tsx and concept/pacingData.ts, both hardcoding `% 7`, so
 * adding an 8th category would have silently wrapped `Other` onto `--cat-1`
 * and made it indistinguishable from Food in every chart.
 *
 * A name that isn't an expense category — `Income`, `Transfer`, `Investing`,
 * `Uncategorized`, or anything new — returns the neutral `--cat-unknown`.
 * The previous `((indexOf + 7) % 7) + 1` form mapped `indexOf === -1` to
 * `--cat-7`, so an unknown category impersonated a real one instead of
 * reading as "not a category".
 */
export function catColor(name: string): string {
  const i = EXPENSE_CATEGORIES.indexOf(name)
  if (i < 0) return 'var(--cat-unknown)'
  return `var(--cat-${(i % EXPENSE_CATEGORIES.length) + 1})`
}
