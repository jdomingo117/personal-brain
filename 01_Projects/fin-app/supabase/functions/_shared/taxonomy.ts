/**
 * The canonical category vocabulary, server-side.
 *
 * Mirrors app/src/data.ts (CATEGORY_TAXONOMY + the Income/Transfer buckets).
 * Duplicated rather than imported because Edge Functions run in Deno and
 * cannot reach into the Vite app's source tree — but this copy is the
 * AUTHORITATIVE one: it is what validates AI output before anything is
 * written, so a drift here is a data-integrity issue, not a cosmetic one.
 *
 * Taxonomy v2 uses stable database slugs for identity. This display-name copy
 * retains canonical reporting order because the design system assigns the 13
 * `--cat-N` rendering tokens by that order.
 *
 * Income, Transfer and Investing sit OUTSIDE that set so they take no hue and
 * never enter spending analytics. Investing is there because buying shares
 * moves money between your own asset classes rather than consuming it.
 *
 * `Other` vs `Uncategorized` is a real distinction: `Other > Miscellaneous` is
 * "reviewed, genuinely miscellaneous" and counts as ordinary spending;
 * `Uncategorized` is "nothing could determine this" and stays in the review
 * queue. The AI may return either, and they mean different things.
 */

export const EXPENSE_TAXONOMY: Record<string, readonly string[]> = {
  'Food & drink': ['Groceries', 'Dining & takeaway', 'Coffee', 'Alcohol & pubs'],
  Home: ['Rent', 'Rates', 'Maintenance', 'Home insurance', 'Furnishings'],
  Transport: ['Fuel', 'Public transport', 'Rideshare', 'Parking & tolls', 'Registration', 'Servicing', 'Car insurance'],
  'Bills & utilities': ['Electricity & gas', 'Water', 'Internet', 'Mobile'],
  Shopping: ['Clothing', 'Electronics', 'Household', 'Gifts', 'General retail'],
  'Health & wellbeing': ['Medical', 'Dental', 'Pharmacy', 'Allied health', 'Fitness', 'Personal care'],
  Lifestyle: ['Streaming', 'Software & digital services', 'Memberships', 'Events', 'Hobbies', 'Gaming', 'Recreation'],
  Travel: ['Flights', 'Accommodation', 'Local transport', 'Activities', 'General travel'],
  'Family & pets': ['Childcare', 'School', 'Children', 'Pet care', 'Veterinary'],
  Education: ['Courses', 'Books', 'Student costs'],
  'Financial & admin': ['Bank fees', 'Government charges', 'Tax', 'Accounting', 'Legal'],
  Giving: ['Charity', 'Donations'],
  Other: ['Cash withdrawal', 'Miscellaneous'],
}

export const INCOME_CATEGORY = 'Income'
export const TRANSFER_CATEGORY = 'Transfer'
export const INVESTING_CATEGORY = 'Investing'
export const UNCATEGORIZED = 'Uncategorized'

export const FULL_TAXONOMY: Record<string, readonly string[]> = {
  ...EXPENSE_TAXONOMY,
  [INCOME_CATEGORY]: ['Salary', 'Interest', 'Dividends & distributions', 'Benefits', 'Rental & business income', 'Refund', 'Reimbursement', 'Transfer In', 'Other'],
  [TRANSFER_CATEGORY]: ['Internal', 'Managed fund funding', 'Reconciliation'],
  [INVESTING_CATEGORY]: ['Auto-invest', 'Brokerage', 'Managed fund purchase', 'Managed fund funding', 'Distribution'],
  [UNCATEGORIZED]: [],
}

export const ALL_CATEGORIES = Object.keys(FULL_TAXONOMY)

/**
 * Coerces a model's answer onto the vocabulary.
 *
 * Never throws and never lets an invented category through: an unrecognised
 * category becomes `Uncategorized` with `needsReview`, so a bad answer shows
 * up in the review queue instead of polluting the taxonomy that every chart,
 * filter and budget join depends on.
 */
export function coerceToTaxonomy(
  category: unknown,
  subcategory: unknown,
): { category: string; subcategory: string | null; needsReview: boolean } {
  const cat = String(category ?? '').trim()

  // Case-insensitive matching normalises display casing, not legacy names.
  const matched = ALL_CATEGORIES.find((c) => c.toLowerCase() === cat.toLowerCase())
  if (!matched) {
    return { category: UNCATEGORIZED, subcategory: null, needsReview: true }
  }

  const sub = String(subcategory ?? '').trim()
  if (!sub) return { category: matched, subcategory: null, needsReview: false }

  const validSubs = FULL_TAXONOMY[matched]
  const matchedSub = validSubs.find((s) => s.toLowerCase() === sub.toLowerCase())

  // A valid category with a bogus subcategory keeps the category — the
  // top-level answer is the one the UI depends on — and drops the subcategory
  // rather than inventing one.
  return {
    category: matched,
    subcategory: matchedSub ?? null,
    needsReview: false,
  }
}

/** Flat list for the model prompt and its response schema enum. */
export function taxonomyPromptLines(): string {
  return ALL_CATEGORIES
    .map((c) => `  ${c}: ${FULL_TAXONOMY[c].join(', ') || '(no subcategories)'}`)
    .join('\n')
}
