/**
 * Tier 2 (bank category): translate Up's own category ids into the Halcyon
 * taxonomy. Sits at exactly the same tier `_shared/upsert-transactions` /
 * `app/src/lib/csv/bankCategoryMap.ts` already occupies for CSV banks —
 * below a user correction, above the AI fallback — per the precedence
 * `user > bank > ai > seed` (20260804010000_ingestion_engine.sql).
 *
 * Same deliberate discipline as bankCategoryMap.ts: an unmapped Up category
 * id returns **null** and falls through to the AI tier via the out-of-band
 * `categorize-pending` sweep, which picks up any row left with
 * `category_source IS NULL` after a sync. It is never dumped into a
 * catch-all category. A wrong or missing id in the map below costs nothing
 * beyond one extra AI call per affected merchant — it can never mislabel a
 * transaction, which is the property that makes this safe to ship without
 * having enumerated Up's full category list against a live account.
 *
 * Up transaction ids: try the leaf `category` id first, then the
 * `parentCategory` id, else null.
 */
import { TRANSFER_CATEGORY } from './taxonomy.ts'

export interface TaxonomyAssignment {
  category: string
  subcategory: string | null
}

/** Up leaf category id (as returned in relationships.category.data.id) -> Halcyon category+subcategory, or null to defer to AI. */
const LEAF_MAP: Record<string, TaxonomyAssignment | null> = {
  // ── good-life ──
  'restaurants-and-cafes': { category: 'Food', subcategory: 'Dining' },
  takeaway: { category: 'Food', subcategory: 'Dining' },
  'pubs-and-bars': null, // still no honest home — defer to AI, same reasoning as bankCategoryMap's "Entertainment & Recreation"
  'alcohol-and-tobacco': null,
  hobbies: null,
  'games-and-software': { category: 'Subscriptions', subcategory: 'Software' },
  'holidays-and-travel': { category: 'Transport', subcategory: 'Travel' },
  'events-and-gigs': null,

  // ── home ──
  groceries: { category: 'Food', subcategory: 'Groceries' },
  'homeware-and-appliances': { category: 'Retail', subcategory: 'Home' },
  'home-maintenance-and-improvements': { category: 'Housing', subcategory: 'Maintenance' },
  'rent-and-mortgage': { category: 'Housing', subcategory: 'Rent' },
  utilities: null, // Up's own "utilities" spans power/water/internet with no sub-signal to split on — same "financial" ambiguity Macquarie's map defers on
  internet: { category: 'Utilities', subcategory: 'Internet' },

  // ── personal ──
  'clothing-and-accessories': { category: 'Retail', subcategory: 'Apparel' },
  tech: { category: 'Retail', subcategory: 'Electronics' },
  'health-and-medical': { category: 'Health', subcategory: 'Medical' },
  'fitness-and-wellbeing': { category: 'Health', subcategory: 'Fitness' },
  'education-and-student-loans': null,
  'gifts-and-charity': { category: 'Retail', subcategory: 'Gifts' },
  'lottery-and-gambling': null,
  'life-admin': null,
  family: null,
  'personal-care': { category: 'Health', subcategory: 'Personal care' },

  // ── transport ──
  fuel: { category: 'Transport', subcategory: 'Fuel' },
  'public-transport': { category: 'Transport', subcategory: 'Transit' },
  'taxis-and-share-cars': { category: 'Transport', subcategory: 'Rideshare' },
  parking: { category: 'Transport', subcategory: 'Parking' },
  tolls: { category: 'Transport', subcategory: 'Parking' },
  'car-insurance-and-maintenance': null,
  'car-repayments': null,

  // ── investing/income-adjacent, if Up ever exposes them ──
  investments: { category: 'Investing', subcategory: 'Brokerage' },
}

/** Up parent category id -> fallback assignment, tried only when the leaf id is absent, unrecognised, or maps to null. */
const PARENT_MAP: Record<string, TaxonomyAssignment | null> = {
  'good-life': null, // too broad to guess a single expense category from
  home: null,
  personal: null,
  transport: { category: 'Transport', subcategory: null },
}

/**
 * Maps an Up transaction's category relationship to a taxonomy assignment.
 * `transferAccountId` presence overrides everything else — Up telling us
 * this leg moved to the user's own account is ground truth for a transfer,
 * stronger than any category guess (see the transfer-linker's use of
 * provider_transfer_account_id).
 */
export function mapUpCategory(
  categoryId: string | null,
  parentCategoryId: string | null,
  transferAccountId: string | null,
): TaxonomyAssignment | null {
  if (transferAccountId) return { category: TRANSFER_CATEGORY, subcategory: 'Internal' }

  if (categoryId && categoryId in LEAF_MAP) {
    const mapped = LEAF_MAP[categoryId]
    if (mapped) return mapped
  }
  if (parentCategoryId && parentCategoryId in PARENT_MAP) {
    const mapped = PARENT_MAP[parentCategoryId]
    if (mapped) return mapped
  }
  return null
}

/** Up category ids seen that had no mapping — surfaced the same way bankCategoryMap.unmappedBankCategories() is, so the gap stays measurable rather than silently absorbed. */
export function unmappedUpCategories(categoryIds: (string | null)[]): string[] {
  const seen = new Set<string>()
  for (const id of categoryIds) {
    if (!id) continue
    if (!(id in LEAF_MAP) || LEAF_MAP[id] === null) seen.add(id)
  }
  return [...seen].sort()
}
