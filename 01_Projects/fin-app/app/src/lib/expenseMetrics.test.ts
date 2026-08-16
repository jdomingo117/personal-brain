import { describe, expect, it } from 'vitest'
import { expenseMetricValues } from './expenseMetrics'
import { inclusiveDayCount, previousPeriodRange } from './period'

describe('expense KPI periods', () => {
  it('uses an inclusive 75-day 3M range and an equal immediately preceding window', () => {
    expect(inclusiveDayCount('2026-06-01', '2026-08-14')).toBe(75)
    expect(previousPeriodRange('2026-06-01', '2026-08-14')).toEqual({
      from: '2026-03-18',
      to: '2026-05-31',
    })
  })

  it('reproduces the repaired screenshot metrics from exact database cents', () => {
    const metrics = expenseMetricValues(549_082, 908_797, '2026-06-01', '2026-08-14')
    expect(metrics.lenDays).toBe(75)
    expect(metrics.dailyAverage).toBeCloseTo(7_321.0933, 3)
    expect(metrics.deltaPct).toBeCloseTo(-0.39581447, 6)
  })

  it('keeps single-day ranges at one day with the immediately prior day as baseline', () => {
    expect(expenseMetricValues(3_330, 2_000, '2026-05-31', '2026-05-31')).toMatchObject({
      lenDays: 1,
      dailyAverage: 3_330,
      previousRange: { from: '2026-05-30', to: '2026-05-30' },
    })
  })
})
