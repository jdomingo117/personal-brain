/* The Expenses analyzer's shared category focus.
 *
 * One selection drives the whole view: click a category (or sub-category) in the
 * flow or pacing card and the hero row, trend chart and ledger follow it. The two
 * comparison tiles never filter *themselves* — they highlight — because filtering
 * a part-to-whole view to one part deletes the comparison that is the question.
 *
 * The load-bearing rule: **the filter predicate and the highlight predicate are
 * the same function.** If the ledger filtered on one notion of "in scope" and the
 * flow card dimmed on another, the page would quietly contradict itself.
 *
 * Every mutation goes through the toggles here so the invariant
 * `subcats ⊆ union(CATEGORY_TAXONOMY[categories])` holds by construction — an
 * impossible pair like `{categories:['Food & drink'], subcats:['Clothing']}` matches zero
 * rows and offers the user no explanation for the empty list. */
import { CATEGORY_TAXONOMY, type Txn } from '../data'

export interface CatSelection {
  categories: string[]
  subcats: string[]
}

export const EMPTY_SELECTION: CatSelection = { categories: [], subcats: [] }

export const isActive = (s: CatSelection) => s.categories.length > 0 || s.subcats.length > 0

/** The one predicate. Mirrors the list filter TransactionsPanel has always used:
 *  an empty dimension means "no constraint", and the two compose as AND. */
export const matchesSelection = (t: Txn, s: CatSelection) => {
  if (s.categories.length && !s.categories.includes(t.cat)) return false
  if (s.subcats.length && !(t.subcat && s.subcats.includes(t.subcat))) return false
  return true
}

/** Is this category in scope? Used for dimming, so it must agree with
 *  `matchesSelection` — a category is in scope when *some* transaction of it
 *  could match, i.e. the sub-category constraint doesn't exclude the whole cat. */
export const catInScope = (cat: string, s: CatSelection) => {
  if (s.categories.length && !s.categories.includes(cat)) return false
  if (s.subcats.length) {
    // Subcategory interactions always co-set their parent. This also permits
    // tenant-owned subcategories that deliberately are not in the static AI vocabulary.
    if (s.categories.includes(cat)) return true
    const owned = CATEGORY_TAXONOMY[cat] ?? []
    if (!s.subcats.some((sub) => owned.includes(sub))) return false
  }
  return true
}

export const subInScope = (cat: string, sub: string, s: CatSelection) => {
  if (s.categories.length && !s.categories.includes(cat)) return false
  if (s.subcats.length && !s.subcats.includes(sub)) return false
  return true
}

/** Drop sub-categories no longer reachable from `categories`. Only prunes when a
 *  category constraint exists — with no categories selected, every sub-category
 *  in the taxonomy is still reachable (the popover's all-cats mode). */
export const pruneSubcats = (categories: string[], subcats: string[], rows: Txn[] = []) => {
  if (!categories.length) return subcats
  const allowed = new Set(categories.flatMap((c) => CATEGORY_TAXONOMY[c] ?? []))
  rows.forEach((row) => { if (categories.includes(row.cat) && row.subcat) allowed.add(row.subcat) })
  return subcats.filter((s) => allowed.has(s))
}

/** Plain click = replace-or-clear, which gives a single-select feel over the
 *  multi-select shape the filters popover still edits. Clicking the focused
 *  category again clears the focus. */
export const toggleCategory = (s: CatSelection, cat: string): CatSelection =>
  s.categories.length === 1 && s.categories[0] === cat && !s.subcats.length
    ? EMPTY_SELECTION
    : { categories: [cat], subcats: [] }

/** Selecting a sub-category co-sets its parent, so the taxonomy invariant can't
 *  be violated and the flow card's "which category is expanded?" stays trivial. */
export const toggleSubcat = (s: CatSelection, cat: string, sub: string): CatSelection =>
  s.subcats.length === 1 && s.subcats[0] === sub && s.categories.length === 1 && s.categories[0] === cat
    ? EMPTY_SELECTION
    : { categories: [cat], subcats: [sub] }

/** Human label for the current focus — "Shopping" / "Shopping · Clothing". */
export const selectionLabel = (s: CatSelection): string => {
  if (!isActive(s)) return ''
  const cats = s.categories.length > 1 ? `${s.categories.length} categories` : s.categories[0]
  if (!s.subcats.length) return cats ?? ''
  const subs = s.subcats.length > 1 ? `${s.subcats.length} sub-categories` : s.subcats[0]
  return cats ? `${cats} · ${subs}` : subs
}
