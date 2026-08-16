import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveResponsiveChartSize } from '../hooks/useResponsiveChartSize'
import { chartYTickCount, visibleTickIndices } from './chartDensity'
import { chartIndexFromPointer } from './chartInteraction'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const area = readFileSync(new URL('../components/charts/Area.tsx', import.meta.url), 'utf8')
const bar = readFileSync(new URL('../components/charts/Bar.tsx', import.meta.url), 'utf8')
const projection = readFileSync(new URL('../components/ProjectionChart.tsx', import.meta.url), 'utf8')

// These approximate device/browser widths exercise the compact, tablet,
// laptop and wide-desktop rendering modes. The visual assertions intentionally
// use the measured SVG coordinate system rather than a viewport-only rule.
const viewports = [390, 768, 1024, 1440] as const
const pointCount = 12

describe.each(viewports)('responsive visual and interaction regression at %ipx', (viewport) => {
  const size = resolveResponsiveChartSize(viewport)
  const plotLeft = 40
  const plotWidth = size.width - plotLeft - 16

  it('keeps SVG geometry, density, and the compact donut composition stable', () => {
    expect(size).toMatchObject({ width: viewport, ready: true })
    expect(size.height).toBeGreaterThanOrEqual(180)
    expect(size.height).toBeLessThanOrEqual(300)
    expect(chartYTickCount(size.height - 38)).toBeGreaterThanOrEqual(3)
    expect(chartYTickCount(size.height - 38)).toBeLessThanOrEqual(5)

    const ticks = visibleTickIndices(pointCount, plotWidth)
    expect(ticks[0]).toBe(0)
    expect(ticks.at(-1)).toBe(pointCount - 1)
    expect(ticks.length).toBeLessThanOrEqual(pointCount)

    const projectionTicks = visibleTickIndices(pointCount, plotWidth, 84, 8)
    expect(projectionTicks[0]).toBe(0)
    expect(projectionTicks.at(-1)).toBe(pointCount - 1)
    expect(projectionTicks.length).toBeLessThanOrEqual(8)

    // 16px gutters approximate the compact card's usable inline size.
    const donutInlineSize = viewport - 32
    expect(donutInlineSize <= 420).toBe(viewport === 390)
  })

  it('maps pointer interaction to stable, bounded data points', () => {
    const pointer = (ratio: number) => ratio * viewport
    const common = {
      rectLeft: 0,
      renderedWidth: viewport,
      viewBoxWidth: size.width,
      plotLeft,
      plotWidth,
      pointCount,
    }

    expect(chartIndexFromPointer({ ...common, clientX: pointer(0), mode: 'nearest' })).toBe(0)
    expect(chartIndexFromPointer({ ...common, clientX: pointer(1), mode: 'nearest' })).toBe(pointCount - 1)
    expect(chartIndexFromPointer({ ...common, clientX: pointer(0.5), mode: 'nearest' })).toBeGreaterThanOrEqual(4)
    expect(chartIndexFromPointer({ ...common, clientX: pointer(0.5), mode: 'nearest' })).toBeLessThanOrEqual(7)
    expect(chartIndexFromPointer({ ...common, clientX: pointer(1), mode: 'slot' })).toBe(pointCount - 1)
  })
})

describe('responsive chart visual contract', () => {
  it('uses measured viewBoxes and pointer interactions in every interactive chart', () => {
    for (const chart of [area, bar, projection]) {
      expect(chart).toContain('viewBox={`0 0 ${W} ${H}`}')
      expect(chart).toContain('onPointerMove')
      expect(chart).toContain('onPointerLeave')
      expect(chart).toContain('chartIndexFromPointer')
      expect(chart).not.toContain('preserveAspectRatio="none"')
    }
  })

  it('preserves the container-query donut stack at the compact breakpoint', () => {
    expect(css).toContain('.allocation-donut { container-type: inline-size; }')
    expect(css).toContain('@container (max-width: 420px)')
    expect(css).toContain('flex-direction: column;')
    expect(css).toContain('.allocation-donut__legend { flex: none; width: 100%; }')
  })
})
