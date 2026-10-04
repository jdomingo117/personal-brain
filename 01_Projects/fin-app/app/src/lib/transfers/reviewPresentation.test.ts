import { describe, expect, it } from 'vitest'
import {
  boundedReviewSelection,
  suggestedReviewSelection,
  summariseOverflow,
  untrackedTransferLabel,
} from './reviewPresentation'

describe('transfer review presentation', () => {
  it('never bulk-selects ambiguous matches and offers an explicit review action', () => {
    const state = suggestedReviewSelection([
      { id: 'ambiguous-a', ambiguous: true },
      { id: 'ambiguous-b', ambiguous: true },
    ], new Set())

    expect(state).toEqual({
      selectableCount: 0,
      selectedIds: [],
      deferredIds: [],
      deferredCount: 0,
      ambiguousCount: 2,
      reviewLabel: 'Review 2 ambiguous matches',
    })
  })

  it('shows bulk verdicts only for the current safe selection', () => {
    const state = suggestedReviewSelection([
      { id: 'safe-a', ambiguous: false },
      { id: 'safe-b', ambiguous: false },
      { id: 'ambiguous', ambiguous: true },
    ], new Set(['safe-b']))

    expect(state.selectedIds).toEqual(['safe-a'])
    expect(state.selectableCount).toBe(2)
    expect(state.ambiguousCount).toBe(1)
  })

  it('caps a 203-link group at the mutation boundary and defers the remainder', () => {
    const ids = Array.from({ length: 203 }, (_, index) => `link-${index + 1}`)
    const state = boundedReviewSelection(ids, new Set())

    expect(state.selectedIds).toHaveLength(200)
    expect(state.selectedIds[0]).toBe('link-1')
    expect(state.selectedIds[199]).toBe('link-200')
    expect(state.deferredIds).toEqual(['link-201', 'link-202', 'link-203'])
    expect(state.deferredCount).toBe(3)
  })

  it('promotes the next deferred item when one selected item is unchecked', () => {
    const ids = Array.from({ length: 203 }, (_, index) => `link-${index + 1}`)
    const state = boundedReviewSelection(ids, new Set(['link-2']))

    expect(state.selectedIds).toHaveLength(200)
    expect(state.selectedIds).not.toContain('link-2')
    expect(state.selectedIds).toContain('link-201')
    expect(state.deferredIds).toEqual(['link-202', 'link-203'])
  })

  it('summarises repetitive buckets without dropping their leg count', () => {
    expect(summariseOverflow([
      { amount_cents: 100, leg_count: 49 },
      { amount_cents: 5000, leg_count: 66 },
    ])).toEqual({ bucketCount: 2, legCount: 115 })
  })

  it('names an unmatched transfer from the transaction direction', () => {
    expect(untrackedTransferLabel(-5000)).toBe('Transfer to an untracked account')
    expect(untrackedTransferLabel(5000)).toBe('Transfer from an untracked account')
    expect(untrackedTransferLabel()).toBe('Transfer to/from an untracked account')
  })
})
