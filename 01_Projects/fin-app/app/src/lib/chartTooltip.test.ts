import { describe, expect, it } from 'vitest'
import { sharedTooltipLayout } from './chartTooltip'

const bounds = { left: 40, right: 640, top: 16, bottom: 218 }

describe('shared chart tooltip layout', () => {
  it('keeps a multi-series tooltip within the plot bounds at the right edge', () => {
    const layout = sharedTooltipLayout({ anchorX: 624, pointYs: [42, 74], itemCount: 2, ...bounds })
    expect(layout.x + layout.width).toBeLessThanOrEqual(bounds.right - 4)
    expect(layout.y).toBeGreaterThanOrEqual(bounds.top + 4)
    expect(layout.height).toBeGreaterThan(40)
  })

  it('flips below the points when there is not enough room above', () => {
    const layout = sharedTooltipLayout({ anchorX: 260, pointYs: [20, 33], itemCount: 2, ...bounds })
    expect(layout.y).toBeGreaterThan(33)
  })

  it('uses a single bounded card even when series points are close together', () => {
    const layout = sharedTooltipLayout({ anchorX: 400, pointYs: [112, 116], itemCount: 2, ...bounds })
    expect(layout).toMatchObject({ width: 132, height: 52 })
    expect(layout.y + layout.height).toBeLessThanOrEqual(bounds.bottom - 4)
  })
})
