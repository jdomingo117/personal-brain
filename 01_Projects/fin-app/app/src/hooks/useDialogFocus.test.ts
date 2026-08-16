import { describe, expect, it } from 'vitest'
import { wrappedFocusIndex } from './useDialogFocus'

describe('dialog focus wrapping', () => {
  it('moves from an untracked initial target to the first control', () => {
    expect(wrappedFocusIndex(-1, 4, false)).toBe(0)
  })

  it('moves backwards from an untracked initial target to the last control', () => {
    expect(wrappedFocusIndex(-1, 4, true)).toBe(3)
  })

  it('wraps forward from the last control', () => {
    expect(wrappedFocusIndex(3, 4, false)).toBe(0)
  })

  it('wraps backwards from the first control and handles an empty dialog', () => {
    expect(wrappedFocusIndex(0, 4, true)).toBe(3)
    expect(wrappedFocusIndex(0, 0, false)).toBe(-1)
  })
})
