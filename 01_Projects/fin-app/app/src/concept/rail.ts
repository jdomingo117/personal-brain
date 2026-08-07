/* Shared geometry + state logic for the pacing rails. Every option maps values
   through the same scale, so the four are a fair comparison. */
import type { Metrics } from './pacingData'

/** The baseline sits at a constant x on every row, so the marker reads as one
 *  vertical rule you scan down — anything past it is over last period. 66%
 *  leaves headroom to render up to ~1.5× baseline before clamping. */
export const BASE_X = 66

/** value → % of track width, with `baseline` pinned at BASE_X, *unclamped*. */
const rawX = (v: number, baseline: number) => (baseline > 0 ? (v / baseline) * BASE_X : v > 0 ? 100 : 0)

/** value → % of track width, clamped to the track. */
export const scaleX = (v: number, baseline: number) => Math.min(100, rawX(v, baseline))

/** Pinning the baseline to a constant x is what makes the marker scannable as a
 *  single vertical rule — but it also fixes the visible ceiling at ~1.5×
 *  baseline, and erratic categories blow straight through it (Retail projects
 *  4.2×). Marks that clamp must say so, or a bar pinned to the right edge is
 *  indistinguishable from one that merely reaches it. */
export const isClamped = (v: number, baseline: number) => rawX(v, baseline) > 100.5

/** Projected finish vs baseline. Negative = on track to save. See `landingFor`
 *  and the CATEGORIES roll-up in pacingData.ts for how `landing` is derived. */
export const landingDelta = (m: Metrics) => (m.baseline > 0 ? m.landing / m.baseline - 1 : 0)

export type State = 'over' | 'risk' | 'ok' | 'idle'

/** Row state, in spending semantics (over = unfavourable). */
export const stateOf = (m: Metrics): State => {
  if (m.baseline <= 0) return m.current > 0 ? 'over' : 'idle'
  if (m.current <= 0) return 'idle'
  if (m.ratio > 1.001) return 'over'
  if (landingDelta(m) > 0.08) return 'risk'
  return 'ok'
}

export const STATE_COLOR: Record<State, string> = {
  over: 'var(--color-neg)',
  risk: 'var(--color-warn)',
  ok: 'var(--color-pos)',
  idle: 'var(--color-muted)',
}

/** Pace tick position — constant across rows, since baseline is pinned. */
export const paceX = (elapsed: number) => BASE_X * elapsed

/** Chip text for a delta. A zero baseline has no ratio to quote: spend against
 *  it is "new", and no spend at all is simply dormant. `value` is whichever
 *  delta the option measures — ratio−1 for A/B/D, landingDelta for C. */
export const deltaLabel = (m: Metrics, value: number, pct: (d: number) => string) => {
  if (m.baseline > 0) return pct(value)
  return m.current > 0 ? 'new' : '—'
}
