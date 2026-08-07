/**
 * Tier 1: translate bank-supplied categories into the Halcyon taxonomy.
 *
 * Three of the four sample formats (St George x2, Macquarie x2) already ship
 * `Category`/`SubCategory` columns that the old importer threw away entirely.
 * Reusing them is free, instant, deterministic, and often more accurate than
 * an LLM guessing from a truncated description — the bank saw the merchant
 * category code, we only see the text.
 *
 * Deliberate design decision: an unmapped bank category returns **null** and
 * falls through to the AI tier. It does NOT get dumped into `Retail` as a
 * catch-all. `Entertainment & Recreation` and `Fees & Charges` (both real, both
 * common in the St George exports) have no honest home among the 7 expense
 * categories, and quietly filing a cinema ticket under Retail would be a lie
 * that is invisible in the UI. Sending them to the AI lets each transaction
 * land on its nearest real category, and `unmappedBankCategories()` keeps the
 * gap measurable rather than guessed at.
 */
import { CATEGORY_TAXONOMY, INCOME_CATEGORY, TRANSFER_CATEGORY } from '../../data'

export interface TaxonomyAssignment {
  category: string
  subcategory: string | null
}

/** Bank category (lowercased) → Halcyon category. Null = defer to the AI. */
const CATEGORY_MAP: Record<string, string | null> = {
  // ── St George / Westpac group ──
  'food & beverage': 'Food',
  'transport & travel': 'Transport',
  'bills & payments': 'Utilities',
  'retail & personal': 'Retail',
  'entertainment & recreation': null,  // no honest home in the 7 — see above
  'fees & charges': null,              // ditto
  'deposits': INCOME_CATEGORY,
  'cash withdrawal': null,
  // ── Macquarie ──
  'financial': null,                   // covers both transfers and fees
  'income': INCOME_CATEGORY,
  'salary': INCOME_CATEGORY,
  'groceries': 'Food',
  'eating out': 'Food',
  'utilities': 'Utilities',
  'transport': 'Transport',
  'shopping': 'Retail',
  'health & medical': null,
  'home': 'Housing',
  'housing': 'Housing',
  'insurance': 'Housing',
  'investments': 'Investing',
  'transfers': TRANSFER_CATEGORY,
  'internal transfer': TRANSFER_CATEGORY,
}

/**
 * Bank subcategory (lowercased) → Halcyon subcategory, applied only when the
 * parent category mapped successfully and the value is in our vocabulary.
 */
const SUBCATEGORY_MAP: Record<string, string> = {
  'dining out': 'Dining',
  'restaurants': 'Dining',
  'cafes': 'Coffee',
  'coffee': 'Coffee',
  'takeaway': 'Dining',
  'groceries': 'Groceries',
  'supermarkets': 'Groceries',
  'fuel': 'Fuel',
  'petrol': 'Fuel',
  'parking & tolls': 'Parking',
  'parking': 'Parking',
  'public transport': 'Transit',
  'taxi & rideshare': 'Rideshare',
  'rideshare': 'Rideshare',
  'electricity': 'Power',
  'gas & electricity': 'Power',
  'water': 'Water',
  'internet': 'Internet',
  'mobile': 'Mobile',
  'phone': 'Mobile',
  'rent': 'Rent',
  'mortgage': 'Rent',
  'insurance': 'Insurance',
  'clothing': 'Apparel',
  'apparel': 'Apparel',
  'electronics': 'Electronics',
  'salary': 'Salary',
  'interest': 'Interest',
  'refund': 'Refund',
  'transfers': 'Internal',
  'internal transfer': 'Internal',
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/**
 * Maps a bank's category/subcategory pair into the taxonomy.
 * @returns null when the bank value has no confident mapping (defer to AI).
 */
export function mapBankCategory(
  bankCategory: unknown,
  bankSubcategory?: unknown,
): TaxonomyAssignment | null {
  const cat = norm(bankCategory)
  if (!cat) return null

  if (!(cat in CATEGORY_MAP)) return null
  const mapped = CATEGORY_MAP[cat]
  if (mapped === null) return null

  // Only accept a subcategory that is valid for the mapped parent; a bank's
  // "Insurance" under Housing is fine, under Food it is nonsense.
  const validSubs: readonly string[] =
    CATEGORY_TAXONOMY[mapped] ??
    (mapped === INCOME_CATEGORY ? ['Salary', 'Transfer In', 'Refund', 'Interest', 'Other'] : ['Internal', 'Reconciliation'])

  const subCandidate = SUBCATEGORY_MAP[norm(bankSubcategory)]
  const subcategory = subCandidate && validSubs.includes(subCandidate) ? subCandidate : null

  return { category: mapped, subcategory }
}

/**
 * Bank categories seen in this file that we could not map. Surfacing these
 * keeps the translation table's blind spots visible instead of silently
 * routing volume to the paid AI tier forever.
 */
export function unmappedBankCategories(values: unknown[]): string[] {
  const seen = new Set<string>()
  for (const v of values) {
    const c = norm(v)
    if (!c) continue
    if (!(c in CATEGORY_MAP) || CATEGORY_MAP[c] === null) seen.add(String(v).trim())
  }
  return [...seen].sort()
}
