import { inclusiveDayCount, previousPeriodRange } from './period'

/** Pure KPI arithmetic shared by the Expenses hero cards and their regressions. */
export function expenseMetricValues(currentTotal: number, previousTotal: number, from: string, to: string) {
  const lenDays = inclusiveDayCount(from, to)
  return {
    lenDays,
    dailyAverage: currentTotal / lenDays,
    deltaPct: previousTotal > 0 ? (currentTotal - previousTotal) / previousTotal : null,
    previousRange: previousPeriodRange(from, to),
  }
}
