/* Category volatility & pacing model for the Expenses analyzer.

   Answers "which category needs attention?" rather than "what did I spend?".
   Every row compares the selected period against the immediately preceding
   window of equal length (the same "vs prev" baseline the hero cards use), and
   sizes that comparison against how volatile the category normally is — a 100%
   swing on Retail is an ordinary month; the same swing on Utilities is not. */
import type { Txn } from '../data'
import { TODAY, dateToIdx, iso, monthStart } from './period'
import { cv, mean, stdev, sum, volBand } from './stats'
import { isGrossExpense } from './classification'

const DAY = 86400000

/** Trailing completed windows sampled for the volatility band. */
const HISTORY = 6
/** Below this many windows carrying actual spend, σ is noise — the band is
 *  suppressed and the row degrades to a plain baseline rail. */
const MIN_BAND_PERIODS = 3
/** Projected overshoot past this trips the warn state. */
const RISK_DELTA = 0.08

/** The volatility bands (and the σ/μ thresholds behind them) are shared with the
 *  recurring detector — see lib/stats.ts. Re-exported because `vol` is a public
 *  field on `PacingRow`. */
export type { VolBand } from './stats'
import type { VolBand } from './stats'

export type PaceState = 'over' | 'risk' | 'ok' | 'idle'

export interface PacingRow {
  name: string
  /** Spend so far in the selected period. */
  current: number
  /** The trailing completed windows, oldest → newest. */
  history: number[]
  /** The last completed window — what the bar is measured against. */
  baseline: number
  /** current ÷ baseline. */
  ratio: number
  /** Best estimate of where the period finishes. */
  landing: number
  /** landing ÷ baseline − 1. Negative = on track to spend less. */
  landingDelta: number
  /** Coefficient of variation (σ ÷ μ) over `history` — the volatility measure. */
  cv: number
  vol: VolBand
  /** ±1σ normal range, or null when there's too little history to mean anything. */
  band: { lo: number; hi: number } | null
  state: PaceState
}
export interface PacingCat extends PacingRow {
  subs: PacingRow[]
}
export interface Pacing {
  cats: PacingCat[]
  /** Fraction of the current period elapsed. 1 once the period has closed. */
  elapsed: number
  /** Size of the period in whole months. */
  months: number
  /** How many trailing blocks the dataset actually supported. */
  periods: number
  /** The month-snapped window actually measured — which is NOT the caller's
   *  `from`/`to` when those fall mid-month. The card surfaces this so it can't
   *  silently disagree with the tiles that use the literal range. */
  period: { from: string; to: string }
}

const parse = (s: string) => new Date(`${s}T00:00:00`)

/** Outflow totals for a window, as cat → sub → amount. */
function bucket(from: string, to: string, transactions: Txn[]) {
  const out = new Map<string, Map<string, number>>()
  transactions.forEach((t) => {
    if (!isGrossExpense(t) || t.isTransfer) return
    const d = t.date
    if (d < from || d > to) return
    const subs = out.get(t.cat) ?? new Map<string, number>()
    const k = t.subcat ?? 'Other'
    subs.set(k, (subs.get(k) ?? 0) + Math.abs(t.amount))
    out.set(t.cat, subs)
  })
  return out
}

/** Where a row finishes the period.
 *
 *  Straight-line projection (spend ÷ elapsed) only models spend that arrives
 *  continuously. Fixed costs — rent, internet, auto-invest — land in one lump on
 *  day 1, so projecting them mid-period reads "on pace to spend 2×" every single
 *  period: a permanent false alarm. Near-zero volatility is exactly the signal
 *  that the baseline already predicts the finish, so steady rows project to
 *  their baseline. Either way you can't un-spend, so the estimate never lands
 *  below what's already gone out. */
const landingFor = (vol: VolBand, current: number, baseline: number, elapsed: number) =>
  vol === 'steady'
    ? Math.max(current, baseline)
    : Math.max(current, elapsed > 0 ? current / elapsed : current)

/** Spending semantics, in one place so the category roll-up and its children
 *  can't drift apart.
 *
 *  `hasHistory` false means there is no comparable prior block at all (a 12-month
 *  range has nothing to look back at within a 12-month dataset). That's an
 *  absent baseline, not an overspend — the row stays neutral and says so, the
 *  same way the hero cards fall back to "no prior period". A zero baseline with
 *  spend against it is merely new, which is worth a glance, not an alarm. */
const stateFor = (
  baseline: number,
  current: number,
  ratio: number,
  landingDelta: number,
  hasHistory: boolean,
): PaceState => {
  if (!hasHistory) return 'idle'
  if (current <= 0) return 'idle'
  if (baseline <= 0) return 'risk'
  if (ratio > 1.001) return 'over'
  if (landingDelta > RISK_DELTA) return 'risk'
  return 'ok'
}

function rowFor(name: string, current: number, history: number[], elapsed: number): PacingRow {
  const baseline = history.length ? history[history.length - 1] : 0
  const mu = mean(history)
  const sd = stdev(history)
  const variation = cv(history)
  const vol: VolBand = volBand(variation)
  const landing = landingFor(vol, current, baseline, elapsed)
  const ratio = baseline > 0 ? current / baseline : current > 0 ? Infinity : 0
  const landingDelta = baseline > 0 ? landing / baseline - 1 : 0
  const populated = history.filter((v) => v > 0).length

  return {
    name,
    current,
    history,
    baseline,
    ratio,
    landing,
    landingDelta,
    cv: variation,
    vol,
    band: populated >= MIN_BAND_PERIODS ? { lo: Math.max(0, mu - sd), hi: mu + sd } : null,
    state: stateFor(baseline, current, ratio, landingDelta, history.length > 0),
  }
}

/** `gated` mirrors the analyzer's all-or-nothing account gate: transactions
 *  aren't account-mapped, so any selected spending account yields the full
 *  outflow set and none yields an empty one. */
/** Last calendar day of the month `idx` falls in. */
const monthEnd = (idx: number) => {
  const s = monthStart(idx)
  return new Date(s.getFullYear(), s.getMonth() + 1, 0)
}
/** The date range covering whole months `[startIdx, endIdx]`. */
const block = (startIdx: number, endIdx: number) => ({
  from: iso(monthStart(startIdx)),
  to: iso(monthEnd(endIdx)),
})

export function buildPacing(from: string, to: string, gated: boolean, transactions: Txn[]): Pacing {
  // Snap the range out to whole months. Volatility and pacing are inherently
  // monthly here: rent, internet and auto-invest recur once a calendar month, so
  // sub-month windows would chop a single fixed cost into an alternating
  // spend/no-spend series and report the app's most predictable rows as its most
  // erratic. Month buckets are also the dataset's native grain, and the analyzers
  // already resolve sub-month picks to their containing month (see period.ts).
  const fromIdx = dateToIdx(from)
  const toIdx = dateToIdx(to)
  const months = Math.max(1, toIdx - fromIdx + 1)

  const period = block(fromIdx, toIdx)
  const startD = parse(period.from)
  const endD = parse(period.to)
  const totalDays = Math.round((endD.getTime() - startD.getTime()) / DAY) + 1

  // How far into the period we are. A period that has already closed is fully
  // elapsed, which collapses `landing` to `current` — the tile then reads as a
  // plain completed-period comparison rather than a projection.
  const todayD = parse(TODAY)
  const seenTo = todayD < endD ? todayD : endD
  const elapsed =
    Math.min(totalDays, Math.max(0, Math.round((seenTo.getTime() - startD.getTime()) / DAY) + 1)) / totalDays

  if (!gated) return { cats: [], elapsed, months, periods: 0, period }

  // Trailing blocks of the same month-count, oldest → newest. The dataset is a
  // trailing 12-month window, so long periods simply yield fewer of them (a
  // 3-month range only looks back 3 blocks) — which is why the band has to be
  // able to say "not enough history" rather than invent one.
  const wins: { from: string; to: string }[] = []
  for (let i = HISTORY; i >= 1; i--) {
    const s = fromIdx - i * months
    if (s < 0) continue
    wins.push(block(s, toIdx - i * months))
  }

  const cur = bucket(period.from, period.to, transactions)
  const hist = wins.map((w) => bucket(w.from, w.to, transactions))
  const all = [cur, ...hist]

  const catNames = new Set<string>()
  all.forEach((m) => m.forEach((_, k) => catNames.add(k)))

  const cats: PacingCat[] = [...catNames].map((cat) => {
    const subNames = new Set<string>()
    all.forEach((m) => m.get(cat)?.forEach((_, k) => subNames.add(k)))

    const subs = [...subNames]
      .map((sub) =>
        rowFor(
          sub,
          cur.get(cat)?.get(sub) ?? 0,
          hist.map((m) => m.get(cat)?.get(sub) ?? 0),
          elapsed,
        ),
      )
      .sort((a, b) => Math.max(b.baseline, b.current) - Math.max(a.baseline, a.current))

    // Category figures are the sum of their children, so the drill-down
    // reconciles. `landing` is the exception: it's rolled up from the children
    // rather than recomputed on the aggregate. A category is a *mix* of fixed
    // and discretionary costs, so its blended volatility is nobody's real
    // behaviour — Investing looks "variable" because Brokerage is erratic, which
    // would drag Auto-invest's already-landed lump through a straight-line
    // projection and report a huge phantom overspend. Projecting each sub on its
    // own volatility and summing gives the honest answer.
    const row = rowFor(
      cat,
      sum(subs.map((s) => s.current)),
      hist.map((m) => sum([...(m.get(cat)?.values() ?? [])])),
      elapsed,
    )
    const landing = sum(subs.map((s) => s.landing))
    const landingDelta = row.baseline > 0 ? landing / row.baseline - 1 : 0

    return {
      ...row,
      landing,
      landingDelta,
      state: stateFor(row.baseline, row.current, row.ratio, landingDelta, wins.length > 0),
      subs,
    }
  })

  return {
    cats: cats.sort((a, b) => Math.max(b.baseline, b.current) - Math.max(a.baseline, a.current)),
    elapsed,
    months,
    periods: wins.length,
    period,
  }
}
