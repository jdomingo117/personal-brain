/* Shared descriptive statistics + the volatility vocabulary.

   Lives apart from any one model because two of them now read the same signal:
   the pacing rail asks "is this category predictable enough that its baseline
   already predicts the finish?" (§8.15) and the recurring detector asks "is this
   charge the same amount every time?" (§8.17). Both questions are σ/μ against
   STEADY_CV, and they must stay the same question — a second definition of
   "fixed cost" is a bug waiting to happen. */

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0)

/** Population σ. Zero for a single sample — one observation has no spread, and a
 *  NaN here would poison every ratio downstream. */
export const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length)
}

/** Coefficient of variation — σ ÷ μ. Zero when there's no mean to divide by. */
export const cv = (xs: number[]) => {
  const m = mean(xs)
  return m > 0 ? stdev(xs) / m : 0
}

/** Middle value, averaging the two middles on an even count. Used over `mean`
 *  wherever one bad sample shouldn't move the answer — a skipped charge leaves a
 *  double-length gap that would drag a mean out of its cadence bucket. */
export const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** σ/μ under this reads as a fixed cost. */
export const STEADY_CV = 0.12
export const ERRATIC_CV = 0.4

export type VolBand = 'steady' | 'variable' | 'erratic'

export const volBand = (c: number): VolBand =>
  c < STEADY_CV ? 'steady' : c < ERRATIC_CV ? 'variable' : 'erratic'
