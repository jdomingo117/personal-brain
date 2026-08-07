/**
 * Recurring-transfer detection for one account pair — reuses the exact
 * gap/conformance/amount-stability approach lib/recurring.ts already uses
 * for merchant subscriptions (median gap against CADENCE_TOLERANCE, a
 * conformance ratio, amount CV against ERRATIC_CV), just re-scoped from
 * "one merchant" to "one account pair." Built from confirmed/auto transfer
 * history only (see transfer_pair_history() — never suggested/unmatched,
 * an unconfirmed guess must not reinforce itself).
 *
 * Pure, no I/O. Mirrored in supabase/functions/_shared/transferMatch.ts,
 * which inlines its own copy of the cadence/stats constants used here since
 * there's no Deno-reachable lib/cadence.ts or lib/stats.ts to import from.
 */
import { CADENCES, CADENCE_DAYS, CADENCE_TOLERANCE, type Cadence } from '../cadence'
import { cv, mean, median, ERRATIC_CV } from '../stats'
import { PAIR_CADENCE_AMOUNT_TOLERANCE, PAIR_CADENCE_MIN_OBSERVATIONS } from './constants'

/** Two observations give one gap, and a single gap is a coincidence, not a pattern. */
const MIN_CONFORMANCE = 0.6

export interface PairCadence {
  cadence: Cadence
  /** Mean of the historical magnitudes, cents. */
  expectedAmountCents: number
  /** Most recent confirmed instance's date, ISO. */
  lastDate: string
}

function daysBetween(a: string, b: string): number {
  const parse = (s: string) => new Date(`${s}T00:00:00`).getTime()
  return Math.round((parse(b) - parse(a)) / 86_400_000)
}

/** `history` need not be sorted or deduplicated by caller. */
export function detectPairCadence(history: { date: string; amountCents: number }[]): PairCadence | null {
  if (history.length < PAIR_CADENCE_MIN_OBSERVATIONS) return null

  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date))

  const medianGap = median(gaps)
  const cadence = CADENCES.find((c) => Math.abs(medianGap - CADENCE_DAYS[c]) <= CADENCE_TOLERANCE[c])
  if (!cadence) return null // gap sits in a dead zone → genuinely not periodic

  const tol = CADENCE_TOLERANCE[cadence]
  const conformance = gaps.filter((g) => Math.abs(g - CADENCE_DAYS[cadence]) <= tol).length / gaps.length
  if (conformance < MIN_CONFORMANCE) return null

  const amounts = sorted.map((h) => h.amountCents)
  if (cv(amounts) >= ERRATIC_CV) return null // amount too unstable to call a pattern

  return {
    cadence,
    expectedAmountCents: mean(amounts),
    lastDate: sorted[sorted.length - 1].date,
  }
}

/** Does `candidateDate` fall near a cadence-multiple of `pairCadence.lastDate`?
 *  Checked against the nearest cycle boundary (not just one step forward) so a
 *  candidate arriving after a rescan gap, or a backfilled earlier instance,
 *  still counts — not only the very next occurrence. */
export function isWithinCadenceWindow(candidateDate: string, pairCadence: PairCadence): boolean {
  const gap = Math.abs(daysBetween(pairCadence.lastDate, candidateDate))
  const cadenceDays = CADENCE_DAYS[pairCadence.cadence]
  const tol = CADENCE_TOLERANCE[pairCadence.cadence]
  const remainder = gap % cadenceDays
  const distanceFromCycle = Math.min(remainder, cadenceDays - remainder)
  return distanceFromCycle <= tol
}

export function isWithinAmountTolerance(candidateAmountCents: number, pairCadence: PairCadence): boolean {
  const delta = Math.abs(candidateAmountCents - pairCadence.expectedAmountCents)
  return delta <= pairCadence.expectedAmountCents * PAIR_CADENCE_AMOUNT_TOLERANCE
}
