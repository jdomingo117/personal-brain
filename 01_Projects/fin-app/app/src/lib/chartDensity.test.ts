import { describe, expect, it } from 'vitest'
import { chartYTickCount, visibleTickIndices } from './chartDensity'

describe('chart density', () => {
  it('keeps both ends of a dense series while respecting available label width', () => {
    expect(visibleTickIndices(12, 208)).toEqual([0, 6, 11])
    expect(visibleTickIndices(12, 560)).toEqual([0, 2, 3, 5, 6, 8, 9, 11])
  })

  it('does not remove labels when every point fits and handles short datasets', () => {
    expect(visibleTickIndices(3, 400)).toEqual([0, 1, 2])
    expect(visibleTickIndices(1, 0)).toEqual([0])
    expect(visibleTickIndices(0, 400)).toEqual([])
  })

  it('uses a calmer three-guide grid for compact heights and five guides for desktop charts', () => {
    expect(chartYTickCount(142)).toBe(3)
    expect(chartYTickCount(193)).toBe(5)
    expect(chartYTickCount(260)).toBe(5)
  })
})
