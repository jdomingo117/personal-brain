import { describe, expect, it } from 'vitest'
import { reviewTaxonomyResolver, validFixedReviewPair } from '../../../supabase/functions/_shared/reviewTaxonomy'

describe('server categorisation review taxonomy', () => {
  const resolve = reviewTaxonomyResolver(
    [{ id: 'shopping', display_name: 'Shopping' }, { id: 'home', display_name: 'Home' }],
    [{ category_id: 'shopping', display_name: 'Workshop supplies' }],
  )

  it('accepts fixed taxonomy including a deliberate blank subcategory', () => {
    expect(validFixedReviewPair('Shopping', 'General retail')).toBe(true)
    expect(resolve('Shopping', null)).toEqual({ category: 'Shopping', subcategory: null })
  })

  it('canonicalises an available custom subcategory under its own category', () => {
    expect(resolve('Shopping', 'workshop SUPPLIES')).toEqual({ category: 'Shopping', subcategory: 'Workshop supplies' })
    expect(resolve('Home', 'Workshop supplies')).toBeNull()
  })

  it('rejects unknown categories, unavailable names and the reserved reconciliation pair', () => {
    expect(resolve('Imaginary', null)).toBeNull()
    expect(resolve('Shopping', 'Unavailable')).toBeNull()
    expect(resolve('Transfer', 'Reconciliation')).toBeNull()
    expect(resolve('Transfer', 'reconciliation')).toBeNull()
  })
})
