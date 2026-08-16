/* Shared period-filter machinery for the analyzer views (Income · Expenses).
   The dataset is a trailing 12-month window of monthly buckets whose last bucket
   is the current calendar month. These helpers bridge real dates (for the
   calendar pickers) and the month buckets the figures are stored in, and define
   the quick-select ranges surfaced as the pill bar. */
const now = new Date()
const anchor = new Date(now.getFullYear(), now.getMonth(), 1) // 1st of the current month
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(anchor.getFullYear(), anchor.getMonth() - (11 - i), 1)
  return MON[d.getMonth()]
})
export const LAST = MONTHS.length - 1

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const DAY_MS = 86_400_000
const utcDay = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}
const utcIso = (value: number) => new Date(value).toISOString().slice(0, 10)

/** Inclusive calendar-day length, deliberately UTC-based so DST cannot change a denominator. */
export const inclusiveDayCount = (from: string, to: string) =>
  Math.max(1, Math.round((utcDay(to) - utcDay(from)) / DAY_MS) + 1)

/** Immediately preceding comparison window with exactly the same number of calendar days. */
export const previousPeriodRange = (from: string, to: string) => {
  const days = inclusiveDayCount(from, to)
  const start = utcDay(from)
  return {
    from: utcIso(start - days * DAY_MS),
    to: utcIso(start - DAY_MS),
  }
}

export const monthStart = (idx: number) => {
  const d = new Date(anchor)
  d.setMonth(d.getMonth() - (LAST - idx))
  return d
}

export const dateToIdx = (s: string) => {
  const d = new Date(`${s}T00:00:00`)
  const diff = (anchor.getFullYear() - d.getFullYear()) * 12 + (anchor.getMonth() - d.getMonth())
  return Math.max(0, Math.min(LAST, LAST - diff))
}

export const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
export const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
/** AU financial year opens 1 July; before July it began the previous calendar year. */
export const auFyStart = (d: Date) => new Date(d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1, 6, 1)

/** `MM.DD` ledger date → ISO within the trailing window (months after the
 *  current one belong to last year). */

/** `17 Jul` — compact day form for surfaces that name a specific date. */
export const dayLabel = (isoDate: string) => {
  const d = new Date(`${isoDate}T00:00:00`)
  return `${d.getDate()} ${MON[d.getMonth()]}`
}
/** `Aug 2025` */
export const monthLabel = (isoDate: string) => {
  const d = new Date(`${isoDate}T00:00:00`)
  return `${MON[d.getMonth()]} ${d.getFullYear()}`
}

export const TODAY = iso(now)
export const MIN_DATE = iso(monthStart(0))
export const MAX_DATE = iso(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)) // last day of current month

/* Quick-select ranges. Each resolves to concrete `from`/`to` ISO dates that the
   analyzers then snap to month buckets (the dataset's native granularity), so
   sub-month picks like Week resolve to their containing month for the aggregate
   figures while still narrowing the day-level transactions ledger. */
export type Preset = { id: string; label: string; title: string; range: () => { from: string; to: string } }
export const PRESETS: Preset[] = [
  { id: 'W', label: 'Week', title: 'Last 7 days', range: () => ({ from: iso(addDays(now, -6)), to: TODAY }) },
  { id: 'M', label: 'Month', title: 'This month to date', range: () => ({ from: iso(monthStart(LAST)), to: TODAY }) },
  {
    id: 'LM',
    label: 'Last month',
    title: 'Previous calendar month',
    range: () => {
      const s = new Date(anchor)
      s.setMonth(s.getMonth() - 1)
      return { from: iso(s), to: iso(monthEnd(s)) }
    },
  },
  { id: '3M', label: '3M', title: 'Last 3 months', range: () => ({ from: iso(monthStart(LAST - 2)), to: TODAY }) },
  { id: '12M', label: '12M', title: 'Last 12 months', range: () => ({ from: MIN_DATE, to: TODAY }) },
  { id: 'FYTD', label: 'FY YTD', title: 'Financial year to date (from 1 Jul)', range: () => ({ from: iso(auFyStart(now)), to: TODAY }) },
  { id: 'ALL', label: 'All', title: 'All available data', range: () => ({ from: MIN_DATE, to: MAX_DATE }) },
]
export const DEFAULT_PRESET = '3M'
export const presetRange = (id: string) => (PRESETS.find((p) => p.id === id) ?? PRESETS[0]).range()
