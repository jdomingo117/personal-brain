import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHART_ASPECT_RATIO,
  resolveResponsiveChartSize,
} from './useResponsiveChartSize'

describe('responsive chart sizing', () => {
  it('preserves the existing 640 × 240 desktop geometry', () => {
    expect(resolveResponsiveChartSize(640)).toEqual({ width: 640, height: 240, ready: true })
    expect(DEFAULT_CHART_ASPECT_RATIO).toBeCloseTo(640 / 240)
  })

  it('uses a readable compact height instead of squeezing a narrow chart into a fixed desktop box', () => {
    expect(resolveResponsiveChartSize(249)).toEqual({ width: 249, height: 180, ready: true })
  })

  it('caps wide cards to a deliberate maximum height', () => {
    expect(resolveResponsiveChartSize(1_200)).toEqual({ width: 1_200, height: 300, ready: true })
  })

  it('honours per-chart bounds and a preferred aspect ratio', () => {
    expect(resolveResponsiveChartSize(600, {
      aspectRatio: 2,
      minHeight: 220,
      maxHeight: 260,
    })).toEqual({ width: 600, height: 260, ready: true })
  })

  it('waits for a measurable container and safely ignores invalid dimensions', () => {
    expect(resolveResponsiveChartSize(0)).toEqual({ width: 0, height: 0, ready: false })
    expect(resolveResponsiveChartSize(Number.NaN)).toEqual({ width: 0, height: 0, ready: false })
  })
})
