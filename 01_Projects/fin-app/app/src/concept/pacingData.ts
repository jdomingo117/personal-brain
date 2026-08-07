/* Concept-only dataset for the "category volatility & pacing" tile.

   The shipped `data.transactions` set is a trailing 12-month window but is
   sparse (3–6 outflows/month), which is too thin to derive a believable
   volatility figure from — most categories would have 1–2 populated periods.
   So the concept models 6 completed periods per sub-category, anchored on the
   real taxonomy and the real recurring amounts (rent 2100, internet 79, power
   ~138, auto-invest 1000…). Shapes here are what the real thing would compute
   from `CATEGORY_TAXONOMY`-tagged txns once the ledger is dense enough. */

import { CATEGORY_TAXONOMY } from '../data'

export interface Sub {
  name: string
  /** Spend so far in the *current* (partial) period. */
  current: number
  /** The 6 completed periods before this one, oldest → newest. The last entry
   *  is the baseline period the progress bar is measured against. */
  history: number[]
}
export interface RawCat {
  name: string
  subs: Sub[]
}

/** Fraction of the current period elapsed — the pacing anchor. Real tile would
 *  derive this from the header's period range (day 15 of a 31-day July). */
export const ELAPSED = 15 / 31

const RAW: RawCat[] = [
  {
    name: 'Housing',
    subs: [
      { name: 'Rent', current: 2100, history: [2100, 2100, 2100, 2100, 2100, 2100] },
      { name: 'Insurance', current: 0, history: [96, 96, 96, 96, 96, 96] },
      { name: 'Maintenance', current: 240, history: [0, 310, 0, 0, 120, 0] },
    ],
  },
  {
    name: 'Food',
    subs: [
      { name: 'Groceries', current: 268, history: [388, 441, 372, 455, 402, 410] },
      { name: 'Dining', current: 186, history: [142, 210, 96, 188, 155, 130] },
      { name: 'Coffee', current: 62, history: [58, 61, 55, 64, 60, 59] },
    ],
  },
  {
    name: 'Transport',
    subs: [
      { name: 'Fuel', current: 139, history: [128, 141, 112, 156, 138, 132] },
      { name: 'Rideshare', current: 43, history: [24, 62, 18, 88, 31, 43] },
      { name: 'Transit', current: 32, history: [32, 32, 32, 32, 32, 32] },
      { name: 'Parking', current: 18, history: [12, 24, 8, 30, 16, 14] },
    ],
  },
  {
    name: 'Utilities',
    subs: [
      { name: 'Power', current: 138, history: [131, 142, 128, 149, 138, 140] },
      { name: 'Water', current: 0, history: [58, 58, 62, 58, 58, 58] },
      { name: 'Internet', current: 79, history: [79, 79, 79, 79, 79, 79] },
      { name: 'Mobile', current: 45, history: [45, 45, 45, 45, 45, 45] },
    ],
  },
  {
    name: 'Subscriptions',
    subs: [
      { name: 'Streaming', current: 16, history: [16, 16, 16, 16, 16, 16] },
      { name: 'Software', current: 29, history: [29, 29, 29, 44, 29, 29] },
      { name: 'Memberships', current: 0, history: [0, 0, 55, 0, 0, 55] },
    ],
  },
  {
    name: 'Retail',
    subs: [
      { name: 'Apparel', current: 212, history: [88, 212, 0, 340, 120, 96] },
      { name: 'Electronics', current: 330, history: [0, 0, 329, 0, 890, 120] },
      { name: 'Home', current: 74, history: [45, 130, 0, 210, 60, 88] },
    ],
  },
  {
    name: 'Investing',
    subs: [
      { name: 'Auto-invest', current: 1000, history: [1000, 1000, 1000, 1000, 1000, 1000] },
      { name: 'Brokerage', current: 0, history: [600, 0, 600, 1200, 600, 0] },
    ],
  },
]

/* ── metrics ─────────────────────────────────────────────────────────────── */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0)
const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length)
}

export type VolBand = 'steady' | 'variable' | 'erratic'

export interface Metrics {
  name: string
  current: number
  history: number[]
  /** Last completed period — what the bar is measured against. */
  baseline: number
  /** current ÷ baseline. 1 = matched last period. */
  ratio: number
  /** What you'd have spent by now if you tracked baseline exactly. */
  expectedToDate: number
  /** Straight-line projection of the current period's finish. */
  projected: number
  /** Best estimate of where the period actually finishes — see `landingFor`. */
  landing: number
  /** Coefficient of variation over `history` — the volatility measure. */
  cv: number
  vol: VolBand
  /** ±1σ "normal range" around the historical mean, clamped at 0. */
  band: { lo: number; hi: number; mid: number }
}

/** Where this row finishes the period.
 *
 *  Straight-line projection (spend ÷ elapsed) only models spend that arrives
 *  continuously. Fixed costs — rent, internet, auto-invest — land in one lump on
 *  day 1, so projecting them on day 15 reads "on pace to spend 2×" every single
 *  period: a permanent false alarm. Near-zero volatility is exactly the signal
 *  that the baseline already predicts the finish, so steady rows project to
 *  their baseline. Either way you can't un-spend, so the estimate never lands
 *  below what's already gone out. */
const landingFor = (vol: VolBand, current: number, baseline: number, projected: number) =>
  vol === 'steady' ? Math.max(current, baseline) : Math.max(current, projected)

/** Volatility = coefficient of variation (σ ÷ μ) over the completed periods.
 *  It's unitless, so a $96 subscription and $2,100 rent are comparable — which
 *  is the whole point of showing it next to a spend bar. */
const metricsFor = (name: string, current: number, history: number[]): Metrics => {
  const baseline = history[history.length - 1] ?? 0
  const mu = mean(history)
  const sd = stdev(history)
  const cv = mu > 0 ? sd / mu : 0
  const vol: VolBand = cv < 0.12 ? 'steady' : cv < 0.4 ? 'variable' : 'erratic'
  const projected = ELAPSED > 0 ? current / ELAPSED : 0
  return {
    name,
    current,
    history,
    baseline,
    ratio: baseline > 0 ? current / baseline : current > 0 ? Infinity : 0,
    expectedToDate: baseline * ELAPSED,
    projected,
    landing: landingFor(vol, current, baseline, projected),
    cv,
    vol,
    band: { lo: Math.max(0, mu - sd), hi: mu + sd, mid: mu },
  }
}

export interface CatMetrics extends Metrics {
  subs: Metrics[]
}

/** Category rows with their sub-category rows, biggest baseline first. Category
 *  figures are the sum of their children so the drill-down reconciles.
 *
 *  `landing` is the exception: it's rolled up from the children rather than
 *  recomputed on the aggregate. A category is a *mix* of fixed and discretionary
 *  costs, so its blended volatility is nobody's real behaviour — Investing looks
 *  "variable" because Brokerage is erratic, which would drag Auto-invest's
 *  already-landed $1,000 lump through a straight-line projection and report
 *  "+107% on pace to overspend". Projecting each sub on its own volatility and
 *  summing gives the honest answer (+0%). */
export const CATEGORIES: CatMetrics[] = RAW.map((c) => {
  const periods = c.subs[0].history.length
  const history = Array.from({ length: periods }, (_, i) => sum(c.subs.map((s) => s.history[i])))
  const cat = metricsFor(c.name, sum(c.subs.map((s) => s.current)), history)
  const subs = c.subs.map((s) => metricsFor(s.name, s.current, s.history)).sort((a, b) => b.baseline - a.baseline)
  return { ...cat, landing: sum(subs.map((s) => s.landing)), subs }
}).sort((a, b) => b.baseline - a.baseline)

/* Re-exported so this concept module keeps its old import surface; the real
   implementation is shared with ExpenseFlowCard (these two used to carry
   duplicate copies that both hardcoded `% 7`). */
export { catColor } from '../lib/categoryColor'

export const VOL_LABEL: Record<VolBand, string> = {
  steady: 'Steady',
  variable: 'Variable',
  erratic: 'Erratic',
}

/** Spending semantics: over baseline reads unfavourable, under reads favourable
 *  — matching the ▲red / ▼green convention on the Expenses hero cards. */
export const deltaTone = (d: number) => (Math.abs(d) < 0.02 ? 'muted' : d > 0 ? 'neg' : 'pos')

export const pctText = (d: number) =>
  `${d > 0.02 ? '▲' : d < -0.02 ? '▼' : '±'} ${Math.abs(Math.round(d * 100))}%`
