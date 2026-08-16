import { EXPENSE_CATEGORIES } from '../data'

/**
 * Category → chart hue. One fixed `--cat-N` per active expense category,
 * assigned by the canonical taxonomy-v2 reporting order. Stable database slugs
 * are the data identity; this index is only the shared rendering order.
 *
 * Single source of truth on purpose: this logic used to be duplicated verbatim
 * in ExpenseFlowCard.tsx and concept/pacingData.ts, both hardcoding `% 7`, so
 * adding an 8th category would have silently wrapped it onto `--cat-1`.
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
  return `var(--cat-${i + 1})`
}
