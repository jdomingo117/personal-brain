import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')

describe('shared-chart responsive sizing migration', () => {
  it.each(['Area.tsx', 'Bar.tsx'])('%s measures its own container instead of stretching a fixed SVG', (name) => {
    const chart = source(name)

    expect(chart).toContain("from '../../hooks/useResponsiveChartSize'")
    expect(chart).toContain('useResponsiveChartSize({')
    expect(chart).toContain('viewBox={`0 0 ${W} ${H}`}')
    expect(chart).not.toContain('preserveAspectRatio="none"')
  })

  it('migrates the projection chart and Income sparkline off fixed-viewBox stretching', () => {
    const projection = readFileSync(new URL('../ProjectionChart.tsx', import.meta.url), 'utf8')
    const income = readFileSync(new URL('../../views/Income.tsx', import.meta.url), 'utf8')

    expect(projection).toContain("from '../hooks/useResponsiveChartSize'")
    expect(projection).toContain('useResponsiveChartSize({')
    expect(projection).toContain('viewBox={`0 0 ${W} ${H}`}')
    expect(projection).not.toContain('preserveAspectRatio="none"')

    expect(income).toContain("from '../hooks/useResponsiveChartSize'")
    expect(income).toContain('function Sparkline')
    expect(income).toContain('useResponsiveChartSize({')
    expect(income).not.toContain('preserveAspectRatio="none"')
  })
})
