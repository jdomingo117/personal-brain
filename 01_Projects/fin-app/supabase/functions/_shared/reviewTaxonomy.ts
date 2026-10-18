import { ALL_CATEGORIES, FULL_TAXONOMY } from './taxonomy.ts'

export interface ReviewCategory { id: string; display_name: string }
export interface ReviewCustomSubcategory { category_id: string; display_name: string }

/** Fixed suggestions and explicit user choices share the same reserved-pair rule. */
export function validFixedReviewPair(category: string, subcategory: string | null): boolean {
  if (!ALL_CATEGORIES.includes(category)) return false
  if (!subcategory) return true
  return (FULL_TAXONOMY[category] ?? []).includes(subcategory)
    && !(category === 'Transfer' && subcategory === 'Reconciliation')
}

/** Callers must supply only active rows from the requesting tenant. */
export function reviewTaxonomyResolver(categories: ReviewCategory[], custom: ReviewCustomSubcategory[]) {
  const categoryIds = new Map(categories.map((row) => [row.display_name, row.id]))
  const customNames = new Map(custom.map((row) => [`${row.category_id}:${row.display_name.toLowerCase()}`, row.display_name]))
  return (category: string, subcategory: string | null): { category: string; subcategory: string | null } | null => {
    if (validFixedReviewPair(category, subcategory)) return { category, subcategory }
    if (category === 'Transfer' && subcategory?.toLowerCase() === 'reconciliation') return null
    const id = categoryIds.get(category)
    const name = id && subcategory ? customNames.get(`${id}:${subcategory.toLowerCase()}`) : undefined
    if (!id || !name || !ALL_CATEGORIES.includes(category)) return null
    return { category, subcategory: name }
  }
}
