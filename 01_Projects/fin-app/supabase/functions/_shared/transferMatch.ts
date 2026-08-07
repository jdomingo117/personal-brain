/**
 * Server-side transfer classification + matching.
 *
 * Mirrors app/src/lib/transfers/{types,constants,classify,match}.ts exactly
 * — the client uses its copy to compute transfer_candidate for the staging
 * preview, and link-transfers uses this one to actually persist links. The
 * two must stay in step the same way app/src/lib/csv/dedupe.ts and this
 * directory's dedupe.ts do.
 *
 * See the client copy for the full design rationale (SRD Law 3's O(N)
 * bucketing requirement, the greedy mutual-best assignment, the
 * bucket-overflow guard). This file keeps only the comments that matter for
 * reading the code in isolation; the "why" lives with the original.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type MatchableAccountType = 'Liquid' | 'Savings' | 'Credit Card'

export interface TransferLeg {
  txnId: string
  accountId: string
  accountName: string
  accountType: MatchableAccountType
  date: string
  amountCents: number
  originalDescription: string | null | undefined
  dedupeHashHex: string
  occurrence: number
  subcategory?: string | null
  /** Ground truth from a provider (e.g. Up's transferAccount): the OTHER
   *  Halcyon account this leg's own bank says it moved to/from, already
   *  resolved from the provider's account id via account_connections.
   *  Undefined for CSV/manual rows, which have no such signal. */
  resolvedTransferAccountId?: string | null
  /** Full timestamp from the provider, when available (e.g. Up's
   *  settledAt/createdAt). Null for CSV/manual rows. Ambiguity tie-breaker
   *  only — see scoreTime. */
  providerPostedAt?: string | null
}

export interface AccountIdentifier {
  accountId: string
  kind: 'mask' | 'account_number' | 'institution' | 'alias'
  value: string
  confidence: number
}

export type LinkState = 'auto' | 'suggested'

export interface ScoredPair {
  from: TransferLeg
  to: TransferLeg
  score: number
  reasons: string[]
  ambiguous: boolean
  state: LinkState
}

export interface PersistableLink {
  from_txn_id: string
  to_txn_id: string
  state: LinkState
  score: number
  reasons: string[]
  ambiguous: boolean
  from_account_id: string
  from_hash: string
  from_occurrence: number
  to_account_id: string
  to_hash: string
  to_occurrence: number
}

export function toPersistableLink(pair: ScoredPair): PersistableLink {
  return {
    from_txn_id: pair.from.txnId,
    to_txn_id: pair.to.txnId,
    state: pair.state,
    score: pair.score,
    reasons: pair.reasons,
    ambiguous: pair.ambiguous,
    from_account_id: pair.from.accountId,
    from_hash: pair.from.dedupeHashHex,
    from_occurrence: pair.from.occurrence,
    to_account_id: pair.to.accountId,
    to_hash: pair.to.dedupeHashHex,
    to_occurrence: pair.to.occurrence,
  }
}

// ── Constants ─────────────────────────────────────────────────────────

export const MATCHER_VERSION = 1
export const WINDOW_DAYS = 4
export const MAX_BUCKET = 64
export const AUTO_THRESHOLD = 0.8
export const SUGGESTED_THRESHOLD = 0.55
export const AMBIGUITY_MARGIN = 0.05
export const AMBIGUITY_PENALTY = 0.15

export const WEIGHTS = {
  date: 0.25,
  mask: 0.2,
  name: 0.15,
  embeddedDate: 0.1,
  direction: 0.1,
  lexicon: 0.1,
  accountType: 0.1,
} as const

export const MATCHABLE_ACCOUNT_TYPES = ['Liquid', 'Savings', 'Credit Card'] as const

/** Additive, capped bonuses layered on top of the weighted score — see the
 *  client copy's constants.ts for why these are deliberately not WEIGHTS
 *  entries (usually absent; must contribute exactly 0 then, not skew a
 *  re-normalized sum). */
export const PAIR_CADENCE_BONUS = 0.15
export const PAIR_CADENCE_AMOUNT_TOLERANCE = 0.15
export const PAIR_CADENCE_MIN_OBSERVATIONS = 3
export const TIME_BONUS_MAX = 0.1

// ── Pair-cadence detection ───────────────────────────────────────────────
//
// Mirrors app/src/lib/transfers/pairCadence.ts. That file imports the
// canonical cadence/stats constants from app/src/lib/{cadence,stats}.ts;
// there's no Deno-reachable copy of those to import here, so the handful of
// values actually used are inlined below. Keep these numbers identical to
// their client-side source if either changes.

export type Cadence = 'Weekly' | 'Biweekly' | 'Monthly' | 'Quarterly' | 'Annual'
const CADENCES: Cadence[] = ['Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annual']
const CADENCE_DAYS: Record<Cadence, number> = { Weekly: 7, Biweekly: 14, Monthly: 30.44, Quarterly: 91.31, Annual: 365.25 }
const CADENCE_TOLERANCE: Record<Cadence, number> = { Weekly: 2, Biweekly: 3, Monthly: 6.5, Quarterly: 12, Annual: 30 }
const MIN_CONFORMANCE = 0.6
const ERRATIC_CV = 0.4

export interface PairCadence {
  cadence: Cadence
  expectedAmountCents: number
  lastDate: string
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}
function cv(xs: number[]): number {
  const m = mean(xs)
  if (m <= 0) return 0
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length
  return Math.sqrt(variance) / m
}
function daysBetweenIso(a: string, b: string): number {
  const parse = (s: string) => new Date(`${s}T00:00:00`).getTime()
  return Math.round((parse(b) - parse(a)) / 86_400_000)
}

/** Matches transfer_pair_history()'s SQL key: the unordered account pair. */
export function pairHistoryKey(accountIdA: string, accountIdB: string): string {
  return accountIdA < accountIdB ? `${accountIdA}:${accountIdB}` : `${accountIdB}:${accountIdA}`
}

export function detectPairCadence(history: { date: string; amountCents: number }[]): PairCadence | null {
  if (history.length < PAIR_CADENCE_MIN_OBSERVATIONS) return null

  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetweenIso(sorted[i - 1].date, sorted[i].date))

  const medianGap = median(gaps)
  const cadence = CADENCES.find((c) => Math.abs(medianGap - CADENCE_DAYS[c]) <= CADENCE_TOLERANCE[c])
  if (!cadence) return null

  const tol = CADENCE_TOLERANCE[cadence]
  const conformance = gaps.filter((g) => Math.abs(g - CADENCE_DAYS[cadence]) <= tol).length / gaps.length
  if (conformance < MIN_CONFORMANCE) return null

  const amounts = sorted.map((h) => h.amountCents)
  if (cv(amounts) >= ERRATIC_CV) return null

  return { cadence, expectedAmountCents: mean(amounts), lastDate: sorted[sorted.length - 1].date }
}

function isWithinCadenceWindow(candidateDate: string, pairCadence: PairCadence): boolean {
  const gap = Math.abs(daysBetweenIso(pairCadence.lastDate, candidateDate))
  const cadenceDays = CADENCE_DAYS[pairCadence.cadence]
  const tol = CADENCE_TOLERANCE[pairCadence.cadence]
  const remainder = gap % cadenceDays
  const distanceFromCycle = Math.min(remainder, cadenceDays - remainder)
  return distanceFromCycle <= tol
}

function isWithinAmountTolerance(candidateAmountCents: number, pairCadence: PairCadence): boolean {
  const delta = Math.abs(candidateAmountCents - pairCadence.expectedAmountCents)
  return delta <= pairCadence.expectedAmountCents * PAIR_CADENCE_AMOUNT_TOLERANCE
}

// ── Classification ───────────────────────────────────────────────────

export interface TransferTokens {
  isLexical: boolean
  direction: 'out' | 'in' | null
  masks: string[]
  accountNumbers: string[]
  embeddedDates: string[]
  institutions: string[]
}

const MASK_RE = /\b[xX]{1,2}(\d{3,6})\b/g
const ACCOUNT_NUMBER_RE = /\b\d{9,18}\b/g
const EMBEDDED_DATE_RE = /\b(\d{1,2})([A-Za-z]{3})(?:(\d{2}):(\d{2}))?\b/g

const OUT_CUE_RE = /\b(to|withdrawal|debit|payment to|tfr to|transfer to)\b/i
const IN_CUE_RE = /\b(from|deposit|received|credit|tfr from|transfer from)\b/i

// See the client copy's docblock: `transfer (to|from) (spending|savings)` is
// Up's own fixed wording for its Saver sweep, confirmed missing against real
// data (a genuine pair scored 0.45, just under SUGGESTED_THRESHOLD).
const LEXICON_RE =
  /internal transfer|funds transfer|linked account|osko|payid|bpay|npp|\btfr\b|sct deposit|payment received|direct (credit|debit)|autopay|transfer (to|from) (spending|savings)/i

const MONTH_ABBR = new Set([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
])

const INSTITUTIONS = [
  'macquarie',
  'st george', 'st. george', 'stgeorge',
  'american express', 'amex',
  'anz',
  'commbank', 'commonwealth bank',
  'nab', 'national australia bank',
  'westpac',
  'ing',
  'bendigo',
  'suncorp',
  'bankwest',
  'ubank',
  'hsbc',
  'citibank',
]

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, '')
  return stripped || '0'
}

export function classifyTransferLeg(description: string | null | undefined): TransferTokens {
  const raw = String(description ?? '')
  const lower = raw.toLowerCase()

  const masks = [...raw.matchAll(MASK_RE)].map((m) => m[1])
  const accountNumbers = [...raw.matchAll(ACCOUNT_NUMBER_RE)].map((m) => stripLeadingZeros(m[0]))

  const embeddedDates = [...raw.matchAll(EMBEDDED_DATE_RE)]
    .filter((m) => MONTH_ABBR.has(m[2].toLowerCase()))
    .map((m) => `${m[1].padStart(2, '0')}${m[2].toLowerCase()}`)

  const isLexical = LEXICON_RE.test(lower)

  const outCue = OUT_CUE_RE.test(lower)
  const inCue = IN_CUE_RE.test(lower)
  const direction: TransferTokens['direction'] = outCue && !inCue ? 'out' : inCue && !outCue ? 'in' : null

  const institutions = INSTITUTIONS.filter((name) => lower.includes(name))
  const canonicalInstitutions = new Set(
    institutions.map((name) => {
      if (name.startsWith('st')) return 'st george'
      if (name === 'amex') return 'american express'
      if (name === 'commonwealth bank') return 'commbank'
      if (name === 'national australia bank') return 'nab'
      return name
    }),
  )

  return {
    isLexical,
    direction,
    masks,
    accountNumbers,
    embeddedDates,
    institutions: [...canonicalInstitutions],
  }
}

export function isTransferCandidateText(description: string | null | undefined, category: string): boolean {
  // Up's round-up sweep is always exactly this string and structurally
  // one-sided — it will never have a counterpart, so it must never enter
  // the candidate pool. Checked before the category==='Transfer' rule
  // below, which would otherwise catch it (Up sets transferAccountId on
  // it) and leave it stuck "unmatched" forever.
  if (String(description ?? '').trim().toLowerCase() === 'round up') return false
  if (category === 'Transfer') return true
  const tokens = classifyTransferLeg(description)
  if (tokens.isLexical) return true
  return /^\s*(to|from)\s/i.test(String(description ?? ''))
}

// ── Matching ──────────────────────────────────────────────────────────

const MATCHABLE = new Set<MatchableAccountType>(['Liquid', 'Savings', 'Credit Card'])

function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

function dayDiff(a: string, b: string): number {
  return Math.abs(isoToUtcDays(a) - isoToUtcDays(b))
}

function isWeekendDay(dayIndex: number): boolean {
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

function scoreAccountType(fromType: MatchableAccountType, toType: MatchableAccountType): number {
  if (fromType === 'Liquid' && toType === 'Liquid') return 1.0
  if (fromType === 'Liquid' && toType === 'Savings') return 1.0
  if (fromType === 'Savings' && toType === 'Liquid') return 1.0
  if (fromType === 'Savings' && toType === 'Savings') return 1.0
  if (fromType === 'Liquid' && toType === 'Credit Card') return 1.0
  if (fromType === 'Savings' && toType === 'Credit Card') return 0.4
  if (fromType === 'Credit Card' && toType === 'Credit Card') return 0
  return 0.3
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
 *  timestamp, which is the common case. */
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

  // Additive, capped bonuses — see PAIR_CADENCE_BONUS/TIME_BONUS_MAX above.
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
  const score = Math.round(Math.min(1, rawScore) * 10_000) / 10_000

  return { score, reasons }
}

function passesHardGates(from: TransferLeg, to: TransferLeg): boolean {
  if (from.amountCents >= 0 || to.amountCents <= 0) return false
  if (from.amountCents !== -to.amountCents) return false
  if (from.accountId === to.accountId) return false
  if (dayDiff(from.date, to.date) > WINDOW_DAYS) return false
  if (!MATCHABLE.has(from.accountType) || !MATCHABLE.has(to.accountType)) return false
  if (from.subcategory === 'Reconciliation' || to.subcategory === 'Reconciliation') return false
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
  overflowedAmounts: number[]
}

/** See app/src/lib/transfers/match.ts for why these exclusions exist. */
export interface MatchExclusions {
  rejectedPairKeys?: Set<string>
  pinnedLegIds?: Set<string>
}

export const pairKey = (fromTxnId: string, toTxnId: string) => `${fromTxnId}:${toTxnId}`

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
      overflowedAmounts.push(amount)
      continue
    }

    const outflows = bucketLegs.filter((l) => l.amountCents < 0).sort((a, b) => (a.date < b.date ? -1 : 1))
    const inflows = bucketLegs.filter((l) => l.amountCents > 0).sort((a, b) => (a.date < b.date ? -1 : 1))
    if (outflows.length === 0 || inflows.length === 0) continue

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

  candidates.sort((a, b) => b.score - a.score || pairSortKey(a).localeCompare(pairSortKey(b)))

  const consumed = new Set<string>()
  const pairs: ScoredPair[] = []
  for (const c of candidates) {
    if (consumed.has(c.from.txnId) || consumed.has(c.to.txnId)) continue

    const ambiguous = isLegAmbiguous(c.from.txnId) || isLegAmbiguous(c.to.txnId)
    const finalScore = ambiguous ? Math.max(SUGGESTED_THRESHOLD, c.score - AMBIGUITY_PENALTY) : c.score
    const isMutualBest = bestByLeg.get(c.from.txnId)?.score === c.score && bestByLeg.get(c.to.txnId)?.score === c.score

    const state = finalScore >= AUTO_THRESHOLD && !ambiguous && isMutualBest ? 'auto' : 'suggested'

    consumed.add(c.from.txnId)
    consumed.add(c.to.txnId)
    pairs.push({ from: c.from, to: c.to, score: finalScore, reasons: c.reasons, ambiguous, state })
  }

  return { pairs, overflowedAmounts }
}
