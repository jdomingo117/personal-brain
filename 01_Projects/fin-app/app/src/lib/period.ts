/* Shared period-filter machinery for the analyzer views (Income · Expenses).
   The dataset is a trailing 12-month window of monthly buckets whose last bucket
   is the current calendar month. These helpers bridge real dates (for the
   calendar pickers) and the month buckets the figures are stored in, and define
   the quick-select ranges surfaced as the pill bar. */
import { data } from '../data'

export const MONTHS = data.cashflow.months
export const LAST = MONTHS.length - 1

const now = new Date()
const anchor = new Date(now.getFullYear(), now.getMonth(), 1) // 1st of the current month

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

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

const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
/** AU financial year opens 1 July; before July it began the previous calendar year. */
const auFyStart = (d: Date) => new Date(d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1, 6, 1)

/** `MM.DD` ledger date → ISO within the trailing window (months after the
 *  current one belong to last year). */
export const txnIso = (mmdd: string) => {
  const [mm, dd] = mmdd.split('.')
  const year = Number(mm) <= now.getMonth() + 1 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${mm}-${dd}`
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
