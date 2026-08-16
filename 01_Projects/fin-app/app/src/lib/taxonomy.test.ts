import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_CATEGORIES, CATEGORY_TAXONOMY, EXPENSE_CATEGORIES, FULL_TAXONOMY, isValidTaxonomyPair } from '../data'
import { catColor } from './categoryColor'

const EXPECTED_EXPENSES = [
  'Food & drink', 'Home', 'Transport', 'Bills & utilities', 'Shopping',
  'Health & wellbeing', 'Lifestyle', 'Travel', 'Family & pets', 'Education',
  'Financial & admin', 'Giving', 'Other',
]

describe('taxonomy v2 contract', () => {
  it('keeps the canonical 13-category reporting order', () => {
    expect(EXPENSE_CATEGORIES).toEqual(EXPECTED_EXPENSES)
    expect(new Set(EXPENSE_CATEGORIES).size).toBe(13)
  })

  it('contains only unique category/subcategory pairs', () => {
    const pairs = Object.entries(FULL_TAXONOMY)
      .flatMap(([category, subs]) => subs.map((subcategory) => `${category}\0${subcategory}`))
    expect(new Set(pairs).size).toBe(pairs.length)
    for (const [category, subs] of Object.entries(FULL_TAXONOMY)) {
      expect(isValidTaxonomyPair(category, null)).toBe(true)
      for (const subcategory of subs) expect(isValidTaxonomyPair(category, subcategory)).toBe(true)
    }
    expect(isValidTaxonomyPair('Food & drink', 'Car insurance')).toBe(false)
  })

  it('keeps the Deno authority mirror aligned with the frontend vocabulary', () => {
    const server = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'functions', '_shared', 'taxonomy.ts'), 'utf8')
    for (const category of ALL_CATEGORIES) expect(server).toContain(category)
    for (const subs of Object.values(FULL_TAXONOMY)) {
      for (const subcategory of subs) expect(server).toContain(`'${subcategory}'`)
    }
  })

  it('assigns every expense a distinct declared palette token', () => {
    const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
    const colors = EXPENSE_CATEGORIES.map(catColor)
    expect(new Set(colors).size).toBe(EXPENSE_CATEGORIES.length)
    colors.forEach((color, index) => {
      expect(color).toBe(`var(--cat-${index + 1})`)
      expect(css).toContain(`--cat-${index + 1}:`)
    })
    expect(catColor('Uncategorized')).toBe('var(--cat-unknown)')
  })

  it('keeps subscriptions as purpose classifications rather than a top-level category', () => {
    expect(CATEGORY_TAXONOMY).not.toHaveProperty('Subscriptions')
    expect(CATEGORY_TAXONOMY.Lifestyle).toContain('Streaming')
    expect(CATEGORY_TAXONOMY.Lifestyle).toContain('Software & digital services')
  })
})
