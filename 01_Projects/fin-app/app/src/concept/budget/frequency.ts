/** Local-date, integer-cent helpers for the fictional concept; no account access. */
export type Frequency = 'monthly' | 'fortnightly'
export type Period = { start: string; end: string }
export type FrequencyChange = Period & {
  frequency: Frequency; bridge: boolean; followingStart: string;
  income: number; bills: number; upcoming: number; savings: number; everyday: number;
  goals: { id: string; name: string; amount: number; opening: number }[];
}
export const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
  && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
export const nextMonth = (date: string) => {
  const value = new Date(`${date.slice(0, 7)}-01T00:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + 1)
  return value.toISOString().slice(0, 10)
}
export function periodAt(frequency: Frequency, anchor: string, today = '2026-10-19'): Period {
  if (!validDate(anchor) || !validDate(today)) throw new Error('Choose a valid start date.')
  if (frequency === 'monthly') return { start: `${today.slice(0, 7)}-01`, end: nextMonth(today) }
  const offset = Math.floor((Date.parse(today) - Date.parse(anchor)) / 86400000 / 14) * 14
  const start = addDays(anchor, offset)
  return { start, end: addDays(start, 14) }
}
export const periodLabel = (p: Period) => `${displayDate(p.start)} – ${displayDate(addDays(p.end, -1))}`
export const displayDate = (date: string) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
export const frequencyLabel = (f: Frequency) => f === 'monthly' ? 'Monthly' : 'Every two weeks'
export const amountCadence = (f: Frequency) => f === 'monthly' ? 'each month' : 'every two weeks'
export function transitionPeriod(current: Period, frequency: Frequency) {
  const start = current.end
  const bridge = frequency === 'monthly' && !start.endsWith('-01')
  const end = frequency === 'monthly' ? nextMonth(start) : addDays(start, 14)
  return { start, end, bridge, followingStart: end }
}
export function contributionDates(frequency: Frequency, anchor: string, through: string, from = '2026-10-19'): string[] {
  if (!validDate(through) || !validDate(anchor) || through < from) return []
  const result: string[] = []
  if (frequency === 'fortnightly') {
    let date = addDays(periodAt(frequency, anchor, from).end, -1)
    if (date < from) date = addDays(date, 14)
    for (let n = 0; n < 260 && date <= through; n++, date = addDays(date, 14)) result.push(date)
  } else {
    let month = `${from.slice(0, 7)}-01`
    for (let n = 0; n < 120; n++, month = nextMonth(month)) {
      const date = `${month.slice(0, 7)}-25`
      if (date > through) break
      if (date >= from) result.push(date)
    }
  }
  return result
}
export type Occurrence = { name: string; date: string; amount: number; kind: 'pay' | 'bill' }
export function occurrences(period: Period): Occurrence[] {
  const rows: Occurrence[] = []
  // Fictional salary every 14 days, rent on the 1st, utilities on the 20th.
  for (let day = period.start; day < period.end; day = addDays(day, 1)) {
    if ((Date.parse(day) - Date.parse('2026-10-12')) / 86400000 % 14 === 0) rows.push({ name: 'Take-home pay', date: day, amount: 300000, kind: 'pay' })
    if (day.endsWith('-01')) rows.push({ name: 'Rent', date: day, amount: 210000, kind: 'bill' })
    if (day.endsWith('-20')) rows.push({ name: 'Utilities', date: day, amount: 12000, kind: 'bill' })
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}
