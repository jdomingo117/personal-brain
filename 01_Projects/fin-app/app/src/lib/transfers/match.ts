/**
 * Internal-transfer matcher: O(N) Map-bucketed candidate generation, then a
 * weighted score per candidate pair, then greedy mutual-best assignment.
 *
 * SRD Law 3 (transfer matching must be O(N) via Map, no nested loops): the
 * only place this file does anything resembling a nested loop is scoring
 * pairs *within* one abs-amount bucket, which is bounded by MAX_BUCKET on
 * either side — so worst case is `N * MAX_BUCKET`, not `N^2`. A bucket that
 * exceeds MAX_BUCKET is skipped entirely (see `overflowedAmounts`) rather
 * than scored with a cap-and-hope heuristic: skipping is the only way to
 * keep the bound honest, and the caller can tell the user to pair those by
 * hand instead of silently doing partial, unpredictable work.
 *
 * Pure, no I/O — the caller supplies candidate legs (from transfer_candidates)
 * and an identifier map (from account_identifier_map) and gets back scored
 * pairs to persist via replace_transfer_links. Mirrored in
 * supabase/functions/_shared/transferMatch.ts.
 */
import { classifyTransferLeg, type TransferTokens } from './classify'
import {
  AMBIGUITY_MARGIN,
  AMBIGUITY_PENALTY,
  AUTO_THRESHOLD,
  MAX_BUCKET,
  PAIR_CADENCE_BONUS,
  SUGGESTED_THRESHOLD,
  TIME_BONUS_MAX,
  WEIGHTS,
  WINDOW_DAYS,
} from './constants'
import { isWithinAmountTolerance, isWithinCadenceWindow, type PairCadence } from './pairCadence'
import type { AccountIdentifier, MatchableAccountType, ScoredPair, TransferLeg } from './types'

/** Matches transfer_pair_history()'s SQL key: the unordered account pair. */
export function pairHistoryKey(accountIdA: string, accountIdB: string): string {
  return accountIdA < accountIdB ? `${accountIdA}:${accountIdB}` : `${accountIdB}:${accountIdA}`
}

const MATCHABLE = new Set<MatchableAccountType>(['Liquid', 'Savings', 'Credit Card'])

function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

function dayDiff(a: string, b: string): number {
  return Math.abs(isoToUtcDays(a) - isoToUtcDays(b))
}

function isWeekendDay(dayIndex: number): boolean {
  // 1970-01-01 (day 0) was a Thursday, so (day + 4) % 7 gives 0 = Sunday.
  const dow = ((dayIndex + 4) % 7 + 7) % 7
  return dow === 0 || dow === 6
}

function spanCrossesWeekend(a: string, b: string): boolean {
  const start = Math.min(isoToUtcDays(a), isoToUtcDays(b))
  const end = Math.max(isoToUtcDays(a), isoToUtcDays(b))
  for (let d = start; d <= end; d++) {
    if (isWeekendDay(d)) return true
  }
  return false
}

const MONTH_ABBR_BY_INDEX = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

function isoToDdMon(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')}${MONTH_ABBR_BY_INDEX[m - 1]}`
}

function scoreDate(a: string, b: string): number {
  const diff = dayDiff(a, b)
  if (diff === 0) return 1.0
  if (diff === 1) return 0.85
  if (diff === 2) return 0.6
  const crosses = spanCrossesWeekend(a, b)
  if (diff === 3) return crosses ? 0.45 : 0.25
  if (diff === 4) return crosses ? 0.35 : 0.1
  return 0
}

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, '')
  return stripped || '0'
}

/** Builds value -> resolved accountId, where a value shared by >1 account resolves to nothing (ambiguous). */
function buildIdentifierIndex(identifiers: AccountIdentifier[]): Map<string, string | null> {
  const byValue = new Map<string, Set<string>>()
  for (const id of identifiers) {
    if (id.kind !== 'mask' && id.kind !== 'account_number') continue
    const key = stripLeadingZeros(id.value)
    if (!byValue.has(key)) byValue.set(key, new Set())
    byValue.get(key)!.add(id.accountId)
  }
  const resolved = new Map<string, string | null>()
  for (const [value, accountIds] of byValue) {
    resolved.set(value, accountIds.size === 1 ? [...accountIds][0] : null)
  }
  return resolved
}

function scoreMask(
  from: TransferLeg,
  fromTokens: TransferTokens,
  to: TransferLeg,
  toTokens: TransferTokens,
  identifierIndex: Map<string, string | null>,
): number {
  const candidatesFrom = [...fromTokens.masks, ...fromTokens.accountNumbers]
  const candidatesTo = [...toTokens.masks, ...toTokens.accountNumbers]

  const forwardResolved = candidatesFrom.some((v) => identifierIndex.get(stripLeadingZeros(v)) === to.accountId)
  const backwardResolved = candidatesTo.some((v) => identifierIndex.get(stripLeadingZeros(v)) === from.accountId)

  if (forwardResolved && backwardResolved) return 1.0
  if (forwardResolved || backwardResolved) return 0.7
  return 0
}

/**
 * Institution-name matching, simplified from the two-tier "full name subset
 * vs institution-only" design to a single tier: we only extract a fixed
 * institution lexicon (classify.ts), not free-form residual name tokens, so
 * every match this function finds *is* an institution-only match. Splitting
 * hairs between two tiers we can't actually distinguish would be false
 * precision.
 */
function scoreName(
  from: TransferLeg,
  fromTokens: TransferTokens,
  to: TransferLeg,
  toTokens: TransferTokens,
  identifiers: AccountIdentifier[],
): number {
  const toNameLower = to.accountName.toLowerCase()
  const fromNameLower = from.accountName.toLowerCase()
  const toAliases = identifiers
    .filter((id) => id.accountId === to.accountId && (id.kind === 'institution' || id.kind === 'alias'))
    .map((id) => id.value.toLowerCase())
  const fromAliases = identifiers
    .filter((id) => id.accountId === from.accountId && (id.kind === 'institution' || id.kind === 'alias'))
    .map((id) => id.value.toLowerCase())

  const forward = fromTokens.institutions.some(
    (inst) => toNameLower.includes(inst) || toAliases.some((a) => a.includes(inst)),
  )
  const backward = toTokens.institutions.some(
    (inst) => fromNameLower.includes(inst) || fromAliases.some((a) => a.includes(inst)),
  )
  return forward || backward ? 1.0 : 0
}

function scoreEmbeddedDate(from: TransferLeg, fromTokens: TransferTokens, to: TransferLeg, toTokens: TransferTokens): number {
  const shared = fromTokens.embeddedDates.some((d) => toTokens.embeddedDates.includes(d))
  if (shared) return 1.0
  if (fromTokens.embeddedDates.includes(isoToDdMon(to.date))) return 1.0
  if (toTokens.embeddedDates.includes(isoToDdMon(from.date))) return 1.0
  return 0
}

function scoreDirection(fromTokens: TransferTokens, toTokens: TransferTokens): number {
  if (fromTokens.direction && toTokens.direction) {
    return fromTokens.direction !== toTokens.direction ? 1.0 : 0
  }
  if (fromTokens.direction || toTokens.direction) return 0.5
  return 0
}

function scoreLexicon(fromTokens: TransferTokens, toTokens: TransferTokens): number {
  const count = Number(fromTokens.isLexical) + Number(toTokens.isLexical)
  return count === 2 ? 1.0 : count === 1 ? 0.5 : 0
}

/**
 * `from` is always the outflow leg, `to` always the inflow leg (matching the
 * transfer_links schema convention), so this table is directional: a
 * same-type pair like (Credit Card, Liquid) — a refund leaving a card — is
 * deliberately not the same score as (Liquid, Credit Card) — a card payment.
 */
function scoreAccountType(fromType: MatchableAccountType, toType: MatchableAccountType): number {
  if (fromType === 'Liquid' && toType === 'Liquid') return 1.0
  if (fromType === 'Liquid' && toType === 'Savings') return 1.0
  if (fromType === 'Savings' && toType === 'Liquid') return 1.0
  if (fromType === 'Savings' && toType === 'Savings') return 1.0
  if (fromType === 'Liquid' && toType === 'Credit Card') return 1.0 // card payment
  if (fromType === 'Savings' && toType === 'Credit Card') return 0.4
  if (fromType === 'Credit Card' && toType === 'Credit Card') return 0 // balance transfer, out of Phase 1 scope
  return 0.3 // e.g. a refund leaving a card back to a bank account
}

interface ScorePairResult {
  score: number
  reasons: string[]
}

/** True when either leg's own bank told us, by account id, that the other
 *  IS the counterparty — ground truth, not inference. */
function isProviderConfirmed(from: TransferLeg, to: TransferLeg): boolean {
  return from.resolvedTransferAccountId === to.accountId || to.resolvedTransferAccountId === from.accountId
}

/** Ambiguity tie-breaker only — 0 whenever either leg lacks a provider
 *  timestamp (every CSV/manual leg, and any Up leg from before this was
 *  wired up), which is the common case, so this must never behave like a
 *  primary signal. */
function scoreTime(from: TransferLeg, to: TransferLeg): number {
  if (!from.providerPostedAt || !to.providerPostedAt) return 0
  const diffMin = Math.abs(new Date(from.providerPostedAt).getTime() - new Date(to.providerPostedAt).getTime()) / 60_000
  if (diffMin <= 5) return 1.0
  if (diffMin <= 30) return 0.6
  if (diffMin <= 120) return 0.25
  return 0
}

function scorePair(
  from: TransferLeg,
  fromTokens: TransferTokens,
  to: TransferLeg,
  toTokens: TransferTokens,
  identifierIndex: Map<string, string | null>,
  identifiers: AccountIdentifier[],
  pairCadences: Map<string, PairCadence>,
): ScorePairResult {
  // A provider confirming the counterparty outranks every inferred signal
  // below combined — same principle as a user's category correction
  // outranking the AI's guess. Short-circuits the weighted formula entirely.
  if (isProviderConfirmed(from, to)) {
    return { score: 1.0, reasons: ['provider:transferAccount'] }
  }

  const sDate = scoreDate(from.date, to.date)
  const sMask = scoreMask(from, fromTokens, to, toTokens, identifierIndex)
  const sName = scoreName(from, fromTokens, to, toTokens, identifiers)
  const sEmbeddedDate = scoreEmbeddedDate(from, fromTokens, to, toTokens)
  const sDirection = scoreDirection(fromTokens, toTokens)
  const sLexicon = scoreLexicon(fromTokens, toTokens)
  const sAccountType = scoreAccountType(from.accountType, to.accountType)

  const weightedScore =
    WEIGHTS.date * sDate +
    WEIGHTS.mask * sMask +
    WEIGHTS.name * sName +
    WEIGHTS.embeddedDate * sEmbeddedDate +
    WEIGHTS.direction * sDirection +
    WEIGHTS.lexicon * sLexicon +
    WEIGHTS.accountType * sAccountType

  const reasons: string[] = []
  if (sDate === 1.0) reasons.push('same-day')
  else if (sDate > 0) reasons.push('near-date')
  if (sMask === 1.0) reasons.push('mask:reciprocal')
  else if (sMask > 0) reasons.push('mask:one-way')
  if (sName === 1.0) reasons.push('institution-match')
  if (sEmbeddedDate === 1.0) reasons.push('embedded-date')
  if (sLexicon === 1.0) reasons.push('lexicon:both')
  else if (sLexicon > 0) reasons.push('lexicon:one')

  // Additive, capped bonuses — NOT folded into the weighted sum above, since
  // WEIGHTS assumes every signal is available and these two usually aren't
  // (no pair history yet; no provider timestamp on a CSV leg). Both are 0 in
  // the common case, leaving rawScore identical to today.
  let bonus = 0
  const pairCadence = pairCadences.get(pairHistoryKey(from.accountId, to.accountId))
  if (pairCadence && isWithinCadenceWindow(to.date, pairCadence) && isWithinAmountTolerance(Math.abs(to.amountCents), pairCadence)) {
    bonus += PAIR_CADENCE_BONUS
    reasons.push('recurring-pair')
  }
  const sTime = scoreTime(from, to)
  if (sTime > 0) {
    bonus += TIME_BONUS_MAX * sTime
    if (sTime === 1.0) reasons.push('timestamp:close')
  }

  const rawScore = weightedScore + bonus

  // Rounded to 4dp so floating-point summation error (0.1+0.1+0.1 = a hair
  // under 0.3 in IEEE 754) can't push a score that should land exactly on a
  // threshold to the wrong side of it.
  const score = Math.round(Math.min(1, rawScore) * 10_000) / 10_000

  return { score, reasons }
}

function passesHardGates(from: TransferLeg, to: TransferLeg): boolean {
  if (from.amountCents >= 0 || to.amountCents <= 0) return false // G1: from must be outflow, to must be inflow
  if (from.amountCents !== -to.amountCents) return false // G1
  if (from.accountId === to.accountId) return false // G2
  if (dayDiff(from.date, to.date) > WINDOW_DAYS) return false // G3
  if (!MATCHABLE.has(from.accountType) || !MATCHABLE.has(to.accountType)) return false // G4
  if (from.subcategory === 'Reconciliation' || to.subcategory === 'Reconciliation') return false // G5
  return true
}

interface CandidatePair {
  from: TransferLeg
  to: TransferLeg
  score: number
  reasons: string[]
}

export interface MatchResult {
  pairs: ScoredPair[]
  /** abs-amount-cents buckets skipped entirely because they exceeded MAX_BUCKET. Surface to the user for manual pairing. */
  overflowedAmounts: number[]
}

export interface MatchExclusions {
  /**
   * Pairs the user explicitly rejected, as `${fromTxnId}:${toTxnId}`.
   *
   * Skipping these is what lets a leg recover from a wrong guess. Without it
   * the matcher re-proposes the same highest-scoring wrong pair every rescan,
   * greedily consumes both legs, and the correct counterpart never gets a
   * turn — so the rejection would silently disable detection for that leg
   * rather than just refining it.
   */
  rejectedPairKeys?: Set<string>
  /**
   * Legs already held by a confirmed/external link.
   *
   * The one-link-per-leg unique indexes would refuse any new pair touching
   * them anyway; excluding them here means the matcher's output matches what
   * actually persists, instead of relying on a silent ON CONFLICT drop.
   */
  pinnedLegIds?: Set<string>
}

export const pairKey = (fromTxnId: string, toTxnId: string) => `${fromTxnId}:${toTxnId}`

/**
 * Deterministic ordering key so re-runs over identical input produce
 * byte-identical output (idempotency depends on this — see
 * replace_transfer_links, which diffs against what's already persisted).
 */
function pairSortKey(p: CandidatePair): string {
  return `${p.from.txnId}:${p.to.txnId}`
}

export function matchTransfers(
  legs: TransferLeg[],
  identifiers: AccountIdentifier[] = [],
  exclusions: MatchExclusions = {},
  pairCadences: Map<string, PairCadence> = new Map(),
): MatchResult {
  const rejected = exclusions.rejectedPairKeys ?? new Set<string>()
  const pinned = exclusions.pinnedLegIds ?? new Set<string>()

  // ── Step 1: O(N) bucket by absolute amount ──────────────────────────
  const buckets = new Map<number, TransferLeg[]>()
  for (const leg of legs) {
    if (pinned.has(leg.txnId)) continue
    const key = Math.abs(leg.amountCents)
    if (key === 0) continue
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(leg)
  }

  const identifierIndex = buildIdentifierIndex(identifiers)
  const overflowedAmounts: number[] = []
  const candidates: CandidatePair[] = []

  for (const [amount, bucketLegs] of buckets) {
    if (bucketLegs.length > MAX_BUCKET) {
      // Skip entirely rather than scoring a truncated subset: a partial,
      // order-dependent result would be worse than telling the user plainly
      // that this amount needs manual attention.
      overflowedAmounts.push(amount)
      continue
    }

    const outflows = bucketLegs.filter((l) => l.amountCents < 0).sort((a, b) => (a.date < b.date ? -1 : 1))
    const inflows = bucketLegs.filter((l) => l.amountCents > 0).sort((a, b) => (a.date < b.date ? -1 : 1))
    if (outflows.length === 0 || inflows.length === 0) continue

    // Bounded by MAX_BUCKET on both sides, so this is at most
    // MAX_BUCKET^2 — a fixed constant, not a function of the ledger size.
    for (const from of outflows) {
      const fromTokens = classifyTransferLeg(from.originalDescription)
      for (const to of inflows) {
        if (!passesHardGates(from, to)) continue
        if (rejected.has(pairKey(from.txnId, to.txnId))) continue
        const toTokens = classifyTransferLeg(to.originalDescription)
        const { score, reasons } = scorePair(from, fromTokens, to, toTokens, identifierIndex, identifiers, pairCadences)
        if (score < SUGGESTED_THRESHOLD) continue
        candidates.push({ from, to, score, reasons })
      }
    }
  }

  // ── Ambiguity: per leg, is the best candidate too close to the second-best? ──
  const bestByLeg = new Map<string, { score: number; secondScore: number | null }>()
  for (const c of candidates) {
    for (const legId of [c.from.txnId, c.to.txnId]) {
      const cur = bestByLeg.get(legId)
      if (!cur) {
        bestByLeg.set(legId, { score: c.score, secondScore: null })
      } else if (c.score > cur.score) {
        bestByLeg.set(legId, { score: c.score, secondScore: cur.score })
      } else if (cur.secondScore === null || c.score > cur.secondScore) {
        cur.secondScore = c.score
      }
    }
  }
  const isLegAmbiguous = (legId: string): boolean => {
    const entry = bestByLeg.get(legId)
    if (!entry || entry.secondScore === null) return false
    return entry.score - entry.secondScore < AMBIGUITY_MARGIN
  }

  // ── Sort candidates best-first, deterministic tie-break ─────────────
  candidates.sort((a, b) => b.score - a.score || pairSortKey(a).localeCompare(pairSortKey(b)))

  // ── Greedy mutual-best assignment ────────────────────────────────────
  const consumed = new Set<string>()
  const pairs: ScoredPair[] = []
  for (const c of candidates) {
    if (consumed.has(c.from.txnId) || consumed.has(c.to.txnId)) continue

    const ambiguous = isLegAmbiguous(c.from.txnId) || isLegAmbiguous(c.to.txnId)
    // The penalty only ever pulls a pair OUT of 'auto' contention — it must
    // never drop a pair below the persist threshold. Candidates already
    // cleared SUGGESTED_THRESHOLD on their raw score at generation time; an
    // ambiguous pair is exactly the case the review panel exists for, not a
    // reason to make the pair vanish.
    const finalScore = ambiguous ? Math.max(SUGGESTED_THRESHOLD, c.score - AMBIGUITY_PENALTY) : c.score
    const isMutualBest = bestByLeg.get(c.from.txnId)?.score === c.score && bestByLeg.get(c.to.txnId)?.score === c.score

    const state =
      finalScore >= AUTO_THRESHOLD && !ambiguous && isMutualBest ? 'auto' : 'suggested'

    consumed.add(c.from.txnId)
    consumed.add(c.to.txnId)
    pairs.push({ from: c.from, to: c.to, score: finalScore, reasons: c.reasons, ambiguous, state })
  }

  return { pairs, overflowedAmounts }
}
