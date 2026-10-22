import { BudgetCalculationError } from './types.ts'
import type { BudgetPeriod, Clock, ContributionSchedule, LocalDate, PeriodConfig } from './types.ts'

const DAY = 86_400_000
export function dateParts(value: LocalDate): { year: number; month: number; day: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BudgetCalculationError('invalid-date', 'Use a real YYYY-MM-DD date.')
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (year < 1 || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BudgetCalculationError('invalid-date', 'Use a real Gregorian date in years 0001–9999.')
  }
  return { year, month, day }
}
function epoch(value: LocalDate): number {
  dateParts(value)
  return Date.parse(`${value}T00:00:00.000Z`)
}
function iso(time: number): LocalDate {
  const date = new Date(time)
  if (!Number.isFinite(time) || !Number.isFinite(date.getTime())) throw new BudgetCalculationError('invalid-date', 'Date is outside supported bounds.')
  const value = date.toISOString().slice(0, 10)
  dateParts(value)
  return value
}
export function addDays(value: LocalDate, days: number): LocalDate {
  if (!Number.isSafeInteger(days)) throw new BudgetCalculationError('invalid-date', 'Day offset must be an integer.')
  return iso(epoch(value) + days * DAY)
}
export function daysBetween(start: LocalDate, end: LocalDate): number {
  return (epoch(end) - epoch(start)) / DAY
}
function monthDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
export function addMonths(value: LocalDate, months: number, desiredDay = dateParts(value).day): LocalDate {
  const { year, month } = dateParts(value)
  if (!Number.isSafeInteger(months) || !Number.isInteger(desiredDay) || desiredDay < 1 || desiredDay > 31) {
    throw new BudgetCalculationError('invalid-date', 'Invalid month offset or desired day.')
  }
  const index = year * 12 + month - 1 + months
  const y = Math.floor(index / 12), m = index - y * 12 + 1
  if (y < 1 || y > 9999) throw new BudgetCalculationError('invalid-date', 'Month is outside supported bounds.')
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
  const result = monthDate(y, m, Math.min(desiredDay, last))
  dateParts(result)
  return result
}
export function validateTimezone(timezone: string): string {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0) }
  catch { throw new BudgetCalculationError('invalid-date', 'A supported IANA timezone is required.') }
  // Intl also permits fixed-offset strings on newer engines; these are not saved IANA zones.
  if (!timezone || /^[+-]/.test(timezone)) throw new BudgetCalculationError('invalid-date', 'Use an IANA timezone, not a numeric offset.')
  return timezone
}
export function today(clock: Clock, timezone: string): LocalDate {
  validateTimezone(timezone)
  const instant = clock.now()
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) throw new BudgetCalculationError('invalid-date', 'Clock returned an invalid instant.')
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', era: 'short' }).formatToParts(instant)
  const part = (name: string) => parts.find(p => p.type === name)?.value ?? ''
  if (part('era') !== 'AD') throw new BudgetCalculationError('invalid-date', 'Clock is outside supported years.')
  const result = `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`
  dateParts(result)
  return result
}
export function validatePeriod(period: BudgetPeriod): void {
  dateParts(period.start); dateParts(period.end); validateTimezone(period.timezone)
  if (period.end <= period.start) throw new BudgetCalculationError('invalid-date', 'Period end must follow its start.')
  if (period.frequency !== 'monthly' && period.frequency !== 'fortnightly') throw new BudgetCalculationError('invalid-input', 'Unsupported budget frequency.')
  if (!period.transition) {
    if (period.frequency === 'fortnightly' && daysBetween(period.start, period.end) !== 14) throw new BudgetCalculationError('invalid-date', 'A fortnight contains 14 local dates.')
    if (period.frequency === 'monthly' && (dateParts(period.start).day !== 1 || period.end !== addMonths(period.start, 1, 1))) throw new BudgetCalculationError('invalid-date', 'Monthly periods use calendar boundaries.')
  } else if (period.frequency !== 'monthly' || dateParts(period.start).day === 1 || period.end !== addMonths(period.start, 1, 1)) {
    throw new BudgetCalculationError('invalid-date', 'A bridge ends at the next month boundary.')
  }
}
export function periodContaining(date: LocalDate, config: PeriodConfig): BudgetPeriod {
  dateParts(date); validateTimezone(config.timezone)
  let start: string, end: string
  if (config.frequency === 'monthly') {
    start = `${date.slice(0, 7)}-01`; end = addMonths(start, 1, 1)
  } else if (config.frequency === 'fortnightly') {
    const offset = Math.floor(daysBetween(config.anchor, date) / 14)
    start = addDays(config.anchor, offset * 14); end = addDays(start, 14)
  } else throw new BudgetCalculationError('invalid-input', 'Unsupported budget frequency.')
  return { start, end, timezone: config.timezone, frequency: config.frequency, transition: false }
}
export function currentPeriod(clock: Clock, config: PeriodConfig): BudgetPeriod {
  return periodContaining(today(clock, config.timezone), config)
}
export function remainingDays(period: BudgetPeriod, asOf: LocalDate): number {
  validatePeriod(period); dateParts(asOf)
  if (asOf < period.start) return daysBetween(period.start, period.end)
  if (asOf >= period.end) return 0
  return daysBetween(asOf, period.end) - 1 // Forecast starts tomorrow, not today again.
}
/** Dates only. No automatic allocation proration; bridge and full template need separate review. */
export function frequencyTransition(current: BudgetPeriod, next: PeriodConfig): { initial: BudgetPeriod; continuing: BudgetPeriod } {
  validatePeriod(current); validateTimezone(next.timezone)
  const boundary = current.end
  if (next.frequency === 'fortnightly') {
    if (next.anchor !== boundary) throw new BudgetCalculationError('invalid-date', 'The new fortnightly anchor must equal the effective boundary.')
    const initial = periodContaining(boundary, next)
    return { initial, continuing: periodContaining(initial.end, next) }
  }
  if (next.frequency !== 'monthly') throw new BudgetCalculationError('invalid-input', 'Unsupported budget frequency.')
  const initial: BudgetPeriod = dateParts(boundary).day === 1 ? periodContaining(boundary, next)
    : { start: boundary, end: addMonths(boundary, 1, 1), frequency: 'monthly', timezone: next.timezone, transition: true }
  return { initial, continuing: periodContaining(initial.end, next) }
}
/** Inclusive contribution deadline; excludes exact dates already included in reserve available.
 * Bounds limit returned schedule size, never silently truncate it.
 */
export function contributionDates(schedule: ContributionSchedule, start: LocalDate, through: LocalDate, included: readonly LocalDate[] = []): LocalDate[] {
  dateParts(start); dateParts(through); dateParts(schedule.anchor)
  if (schedule.frequency !== 'monthly' && schedule.frequency !== 'fortnightly') throw new BudgetCalculationError('invalid-input', 'Unsupported contribution schedule.')
  if (schedule.frequency === 'monthly' && (!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31)) throw new BudgetCalculationError('invalid-date', 'Contribution day must be between 1 and 31.')
  const excluded = new Set(included.map(d => { dateParts(d); return d }))
  if (through < start || through < schedule.anchor) return []
  const lower = start > schedule.anchor ? start : schedule.anchor
  let date: string
  if (schedule.frequency === 'fortnightly') {
    date = addDays(schedule.anchor, Math.max(0, Math.ceil(daysBetween(schedule.anchor, lower) / 14)) * 14)
  } else if (schedule.frequency === 'monthly') {
    const a = dateParts(schedule.anchor), b = dateParts(lower)
    const offset = (b.year - a.year) * 12 + b.month - a.month
    date = addMonths(schedule.anchor, offset, schedule.dayOfMonth)
    if (date < lower) date = addMonths(date, 1, schedule.dayOfMonth)
  } else throw new BudgetCalculationError('invalid-input', 'Unsupported contribution schedule.')
  const result: string[] = []
  let visited = 0
  while (date <= through) {
    if (++visited > 10_000) throw new BudgetCalculationError('limit', 'Contribution schedule is too large; narrow its date range.')
    if (!excluded.has(date)) result.push(date)
    if (date === through) break
    // Do not overflow beyond the supported end of the date domain merely to stop iteration.
    if (schedule.frequency === 'fortnightly' && daysBetween(date, through) < 14) break
    if (schedule.frequency === 'monthly' && date.slice(0, 7) === through.slice(0, 7)) break
    date = schedule.frequency === 'fortnightly' ? addDays(date, 14) : addMonths(date, 1, schedule.dayOfMonth)
  }
  return result
}
