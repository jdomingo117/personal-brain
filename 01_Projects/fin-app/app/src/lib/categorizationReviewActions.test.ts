import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CategorizationReviewActions from '../components/CategorizationReviewActions'

describe('Ledger category review toolbar', () => {
  it('keeps setup off the Ledger and provides a discoverable entry even with no candidates', () => {
    const markup = renderToStaticMarkup(createElement(CategorizationReviewActions, {
      unresolvedCount: 0, eligibleCount: 0, hasActiveFilters: true, hasSelection: true, onReview: vi.fn(),
    }))
    expect(markup).toContain('Review categories')
    expect(markup).not.toContain('disabled')
    expect(markup).not.toContain('<select')
    expect(markup).not.toContain('How review works')
    expect(markup).not.toContain('role="dialog"')
  })

  it('reports actual preview progress and offers continuation for an existing session', () => {
    const markup = renderToStaticMarkup(createElement(CategorizationReviewActions, {
      unresolvedCount: 0, eligibleCount: 70, hasActiveFilters: false, hasSelection: false, onReview: vi.fn(),
      session: { scope: 'eligible', batchSizes: [500, 70], previewed: [0], currentIndex: 0 },
    }))
    expect(markup).toContain('1 of 2 batches previewed')
    expect(markup).toContain('Continue review')
    expect(markup).not.toContain('batches completed')
  })
})
