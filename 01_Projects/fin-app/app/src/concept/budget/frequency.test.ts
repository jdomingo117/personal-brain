import { describe, expect, it } from 'vitest'
import { addDays, contributionDates, occurrences, periodAt, transitionPeriod, validDate } from './frequency'
import { budgetPeriod, fortnightlyBudget, goalTiming, requiredMonthly, stillToPlan } from './model'

describe('budget concept local-date periods', () => {
  it('anchors a true fortnight across month, year, leap day and Sydney DST boundaries', () => {
    for (const [anchor, today] of [['2026-10-01', '2026-10-05'], ['2026-12-28', '2027-01-02'], ['2028-02-21', '2028-02-29']]) {
      const p = periodAt('fortnightly', anchor, today)
      expect(p.start <= today && today < p.end).toBe(true)
      expect(Date.parse(p.end) - Date.parse(p.start)).toBe(14 * 86400000)
      expect(periodAt('fortnightly', anchor, p.end).start).toBe(p.end)
    }
    expect(validDate('2026-02-30')).toBe(false)
    expect(validDate('2028-02-29')).toBe(true)
  })
  it('generates a bridge only when returning to monthly away from the first', () => {
    expect(transitionPeriod({ start: '2026-10-12', end: '2026-10-26' }, 'monthly')).toEqual({ start: '2026-10-26', end: '2026-11-01', bridge: true, followingStart: '2026-11-01' })
    expect(transitionPeriod({ start: '2026-10-01', end: '2026-11-01' }, 'fortnightly').end).toBe('2026-11-15')
    expect(transitionPeriod({ start: '2026-10-18', end: '2026-11-01' }, 'monthly').bridge).toBe(false)
  })
  it('counts full bill occurrences by date, never monthly divided by two', () => {
    const current = occurrences({ start: '2026-10-12', end: '2026-10-26' })
    expect(current.map(r => r.name)).toEqual(['Take-home pay', 'Utilities'])
    const next = occurrences({ start: '2026-10-26', end: '2026-11-09' })
    expect(next.find(r => r.name === 'Rent')?.amount).toBe(210000)
    expect(next.filter(r => r.kind === 'pay')).toHaveLength(1)
    expect(occurrences({ start: '2026-10-26', end: '2026-11-01' }).some(r => r.name === 'Rent')).toBe(false)
  })
  it('uses actual fortnightly contribution dates for goals and preserves distinct amounts', () => {
    const b = fortnightlyBudget()
    expect(budgetPeriod(b)).toEqual({ start: '2026-10-12', end: '2026-10-26' })
    expect(stillToPlan(b)).toBe(43000)
    expect(contributionDates(b.frequency, b.anchor, '2026-11-08')).toEqual(['2026-10-25', '2026-11-08'])
    expect(requiredMonthly(90000, 30000, '2026-11-07', b)).toBe(60000)
    expect(requiredMonthly(90000, 30000, '2026-11-08', b)).toBe(30000)
    expect(goalTiming({ ...b.goals[0], target: 90000, opening: 30000, monthly: 10000 }, b)).toEqual({ count: 6, date: '2027-01-03' })
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
