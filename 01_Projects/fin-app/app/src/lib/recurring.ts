/* Recurring-commitment detection for the Expenses recurring hub (§8.17).

   Answers "what am I committed to?" rather than "what did I spend?". Nothing in
   the ledger says a charge is recurring — that has to be inferred from the shape
   of a merchant's history, the same way a real bank feed would give you nothing
   but dated debits.

   Why this can't reuse `pacing.ts`'s `bucket()`: that keys by cat → subcat and
   buckets by whole calendar month. Month grain cannot tell Quarterly from
   irregular (a quarterly charge is "present in 4 of 12 months", which is exactly
   what four unrelated one-offs look like), and it has no notion of *day* — so
   `lastCharged` and `nextExpected`, which are the directory's entire row metadata
   and the calendar's only input, would be inexpressible. Day-gap analysis is the
   only way to compute this. The volatility maths is genuinely shared, though, and
   lives in `lib/stats.ts` so "fixed cost" has one definition, not two. */
import { detectRecurringSignal } from './recurringSignal'
import type { Txn, Account, Glow } from '../data'
import { TODAY, iso } from './period'
import { CADENCE_DAYS, CADENCE_MONTHS, CADENCE_PER_MONTH, CADENCE_TOLERANCE } from './cadence'
import type { Cadence } from './cadence'
import { ERRATIC_CV, cv } from './stats'
import { normalizeMerchant } from './csv/normalizeMerchant'

/** Below this, an AI hint's own confidence is too weak to bother surfacing —
 *  the candidate block is meant to be a short, high-signal list, not a
 *  restatement of every merchant the model had an opinion on. */
const CANDIDATE_MIN_CONFIDENCE = 0.6

const DAY = 86400000

/** Three observations = two gaps = the fewest at which the gaps can *agree* with
 *  each other. Two observations give one gap, and a single gap is a coincidence,
 *  not a pattern. Same spirit as pacing.ts's MIN_BAND_PERIODS. */
const MIN_OBSERVATIONS = 3
/** Silent for more than a cycle and a half → the series has stopped. Derived from
 *  `lastCharged` rather than from `nextExpected`, so there's one derivation
 *  instead of two that can drift apart. */
const DORMANT_CYCLES = 1.5
/** Annual commitments need a deliberately longer, isolated look-back. This is
 * only evidence for the Annual detector: all recurring reporting, pressure,
 * and normal cadence detection remain bounded to `bounds` below. The small
 * leap-year allowance makes a same-day annual charge reliably inclusive. */
const ANNUAL_EVIDENCE_DAYS = 3 * 366

export type RecurringKind = 'fixed' | 'variable'
export type RecurringStatus = 'active' | 'dormant'
export type Confidence = 'high' | 'medium' | 'low'

export interface Charge {
  /** Present for observed ledger charges; projected future charges have none. */
  transactionId?: string
  date: string
  /** Positive magnitude — the ledger stores outflows as negative. */
  amount: number
}

export interface Series {
  /** Browser-only account-and-normalized-merchant grouping key. */
  id: string
  /** Normalised merchant identity used by durable write-back. */
  merchantKey: string
  /** A recurring commitment is account-scoped; the same merchant on two cards
   * must never be managed as one series. */
  accountId: string
  /** Full merchant, exactly as the ledger spells it. */
  merchant: string
  /** Display label — `shortMerchant(merchant)`. Never used for identity. */
  label: string
  cat: string
  /** `'Other'` when the txn carries none — which is NOT a taxonomy value. */
  subcat: string
  cadence: Cadence
  /** Current detector values remain available so an individual user override
   * can be reset without deleting the whole managed state. */
  detectedCadence: Cadence
  kind: RecurringKind
  status: RecurringStatus
  confidence: Confidence
  /** Oldest → newest. */
  charges: Charge[]
  /** The go-forward obligation. Last amount if fixed, mean if variable — see
   *  `expectedFor`. */
  expected: number
  detectedExpected: number
  /** `expected` normalised to a monthly equivalent. */
  monthly: number
  amountCv: number
  medianGap: number
  conformance: number
  lastCharged: string
  /** Projected. In the past iff the series is dormant. */
  nextExpected: string
  detectedNextExpected: string
  /** What actually left the account inside `bounds` — the reality check against
   *  the annualized projection. */
  trailingTotal: number
  fundingAccount: string
  /** Resolved from the real account list at build time — see `buildRecurring()`.
   *  Falls back to a neutral color when the account can't be matched. */
  fundingAccountGlow: Glow
  /** Whether this remains a pure detection or has a saved user overlay. */
  trackingState: 'detected' | 'managed' | 'stopped' | 'dismissed'
  /** Null means no in-app reminder has been requested. */
  reminderDaysBefore: number | null
  /** Set when the trailing run of charges is steady but differs from the run
   *  before it by more than tolerance — a fixed cost that stepped to a new
   *  price, not a genuinely variable one. See `detect()`. */
  priceChange?: { from: number; to: number; date: string }
}

export interface RecurringSection {
  cat: string
  /** Active first, then dormant; each block sorted by `monthly` desc. */
  rows: Series[]
  /** Σ `monthly` over ACTIVE rows — the section sub-total. */
  monthly: number
  /** Active rows only. */
  count: number
}

export interface FundingAccountSummary {
  name: string
  amount: number
  percentage: number
  glow: 'cyan' | 'amber' | 'red' | 'green' | 'blue'
}

/** A cached Gemini classification of one merchant, keyed by
 *  `normalizeMerchant(merchant).key` — see supabase/functions/_shared/
 *  recurrenceHints.ts. Confidence is the model's raw 0-1 score, surfaced
 *  as-is rather than bucketed into a label. */
export interface RecurrenceHint {
  isRecurring: boolean
  suggestedCadence: Cadence | null
  confidence: number
}

/** Durable user intent over a live detector result. These values are loaded
 * from `recurring_series_overrides`; they never rewrite bank transactions. */
export interface RecurringSeriesOverride {
  id: string
  merchantKey: string
  accountId: string
  state: 'active' | 'stopped' | 'dismissed'
  cadenceOverride: Cadence | null
  expectedAmountOverride: number | null
  nextExpectedOverride: string | null
  reminderDaysBefore: number | null
}

/** An early recurring signal below `detect()`'s confirmation threshold:
 *  either an AI-recognised subscription archetype or two stable annual-sized
 *  charges. Deliberately NOT a `Series` — fewer fields, no `monthly`/
 *  `expected`/`kind`, so it cannot be summed into `monthlyCommitment` or
 *  `annualBurn` even by a careless caller. See `Recurring.candidates`. */
export interface RecurringCandidate {
  id: string
  merchantKey: string
  accountId: string
  merchant: string
  label: string
  cat: string
  subcat: string
  suggestedCadence: Cadence | null
  /** AI hints are probabilistic; annual evidence is a deterministic two-charge
   * early signal and must not be presented as an AI claim. */
  source: 'ai_hint' | 'annual_evidence'
  confidence: number
  charges: Charge[]
  lastCharged: string
}

export interface Recurring {
  series: Series[]
  active: Series[]
  dormant: Series[]
  sections: RecurringSection[]
  monthlyCommitment: number
  annualBurn: number
  /** Σ `trailingTotal` over active rows. */
  trailingActual: number
  pressure: { recurring: number; total: number; ratio: number | null }
  /** The trailing 12-month reporting window, also used for non-annual cadence
   * detection. `trailingActual` never reaches outside this window. */
  bounds: { from: string; to: string }
  /** The isolated, bounded look-back available only to Annual detection. */
  annualBounds: { from: string; to: string }
  /** Trailing 30 days — what `pressure` measures. */
  window30: { from: string; to: string }
  /** The next 30 days — what the billing calendar projects. */
  horizon: { from: string; to: string }
  fundingAccounts: FundingAccountSummary[]
  /** Early signals below confirmation — AI hints and two-charge annual
   * evidence. Never merged into `series`/`active`/`dormant` or any money total
   * above. See `RecurringCandidate`. */
  candidates: RecurringCandidate[]
  /** Detector-backed series deliberately hidden from totals and calendar by a
   * user stop/dismiss action. They remain available for an explicit resume. */
  untracked: Series[]
}

/** Merchants read `Primary // Detail`; the tail is a display flourish, not an
 *  identity. Split for labels only — never for grouping (see `detectorKeyFor`). */
export const shortMerchant = (name: string) => name.split(' // ')[0]

const parse = (s: string) => new Date(`${s}T00:00:00`)
const shift = (isoDate: string, days: number) => iso(new Date(parse(isoDate).getTime() + days * DAY))
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY)

/** Advance one cadence step.
 *
 *  Monthly/Quarterly/Annual advance by whole CALENDAR months, never by
 *  `CADENCE_DAYS`: rent charged on the 1st is charged on the *1st*, whereas
 *  1 Jul + 30.44 days lands on the 31st. Day-of-month is clamped to the target
 *  month's length, because `Date` would otherwise roll 31 Jan + 1 month over into
 *  early March. */
/** Browser-only grouping identity. JSON keeps it deterministic without using
 * the local legacy NUL-delimited series key as a database key. */
const detectorKeyFor = (t: Pick<Txn, 'account_id' | 'merchant' | 'merchantKey'>) =>
  JSON.stringify([t.account_id, t.merchantKey ?? normalizeMerchant(t.merchant).key])

const overrideKeyFor = (accountId: string, merchantKey: string) =>
  JSON.stringify([accountId, merchantKey])

export function nextChargeDate(fromIso: string, cadence: Cadence): string {
  const months = CADENCE_MONTHS[cadence]
  if (months === 0) return shift(fromIso, CADENCE_DAYS[cadence])
  const d = parse(fromIso)
  const y = d.getFullYear()
  const m = d.getMonth() + months
  const lastDay = new Date(y, m + 1, 0).getDate() // 0th of next month = last of target
  return iso(new Date(y, m, Math.min(d.getDate(), lastDay)))
}

/** Every charge a series is projected to make inside `[from, to]`.
 *
 *  Walks forward from `lastCharged` rather than from `nextExpected` so a dormant
 *  series (whose next charge is already in the past) can't silently emit a burst
 *  of backdated charges. */
export function upcomingCharges(s: Series, from: string, to: string): Charge[] {
  const out: Charge[] = []
  let d = nextChargeDate(s.lastCharged, s.cadence)
  // A dormant series' projection is fiction; the caller filters, but guard anyway.
  for (let i = 0; i < 64 && d <= to; i++) {
    if (d >= from) out.push({ date: d, amount: s.expected })
    d = nextChargeDate(d, s.cadence)
  }
  return out
}

/** Pure signal detection; reporting totals remain bounded to the normal year. */
function detect(id: string, txns: Txn[], today: string, reportingFrom: string): Series | null {
 const signal=detectRecurringSignal(txns.map(t=>({transactionId:t.id,date:t.date,amount:Math.abs(t.amount)})),today)
 if(!signal)return null
 const t0=txns[0]
 return {...signal,id,merchantKey:t0.merchantKey??normalizeMerchant(t0.merchant).key,accountId:t0.account_id,
 merchant:t0.merchant,label:shortMerchant(t0.merchant),cat:t0.cat,subcat:t0.subcat??'Other',
 detectedCadence:signal.cadence,detectedExpected:signal.expected,detectedNextExpected:signal.nextExpected,
 monthly:signal.expected*CADENCE_PER_MONTH[signal.cadence],
 trailingTotal:signal.charges.filter(c=>c.date>=reportingFrom).reduce((sum,c)=>sum+c.amount,0),
 fundingAccount:t0.account||'Unknown account',fundingAccountGlow:'cyan',trackingState:'detected',reminderDaysBefore:null}
}

/** Two annual-sized, stable charges are useful context, but one gap cannot
 * prove a recurring commitment. Surface it as an explicitly non-financial
 * early signal; a third matching renewal is required for a real `Series`. */
function annualEvidenceCandidate(id: string, txns: Txn[], today: string): RecurringCandidate | null {
  if (txns.length !== 2) return null
  const charges: Charge[] = txns
    .map((t) => ({ transactionId: t.id, date: t.date, amount: Math.abs(t.amount) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const gap = daysBetween(charges[0].date, charges[1].date)
  if (Math.abs(gap - CADENCE_DAYS.Annual) > CADENCE_TOLERANCE.Annual) return null
  if (cv(charges.map((charge) => charge.amount)) >= ERRATIC_CV) return null
  const silentFor = daysBetween(charges[1].date, today)
  if (silentFor > DORMANT_CYCLES * CADENCE_DAYS.Annual) return null

  const t0 = txns[0]
  return {
    id,
    merchantKey: t0.merchantKey ?? normalizeMerchant(t0.merchant).key,
    accountId: t0.account_id,
    merchant: t0.merchant,
    label: shortMerchant(t0.merchant),
    cat: t0.cat,
    subcat: t0.subcat ?? 'Other',
    suggestedCadence: 'Annual',
    source: 'annual_evidence',
    // Required by the shared candidate sort only. The UI intentionally does
    // not render a faux precision percentage for deterministic annual evidence.
    confidence: 0.7,
    charges,
    lastCharged: charges[1].date,
  }
}

/** `today` is a parameter rather than a constant so the model is pinnable without
 *  mocking a clock. `transactions`/`accounts` are parameters rather than a
 *  module import for the same reason — plus it's the only way this can ever
 *  see real, live data instead of the (now-deleted) mock dataset it silently
 *  ran against for every real user. Required, not optional, so a caller can't
 *  accidentally fall back to nothing. */
export function buildRecurring(
  transactions: Txn[],
  accounts: Account[],
  today: string = TODAY,
  hints: Map<string, RecurrenceHint> = new Map(),
  overrides: RecurringSeriesOverride[] = [],
): Recurring {
  const bounds = { from: shift(today, -364), to: today }
  const annualBounds = { from: shift(today, -ANNUAL_EVIDENCE_DAYS), to: today }
  const window30 = { from: shift(today, -29), to: today }
  const horizon = { from: today, to: shift(today, 29) }

  const glowFor = (accountName: string): Glow => accounts.find((a) => a.name === accountName)?.glow ?? 'cyan'

  // Transfers and pending (HELD) rows are excluded, same discipline as every
  // other spend aggregate in this app — an internal sweep (e.g. a fortnightly
  // savings transfer) is not a recurring *expense commitment*, and a HELD
  // amount may still change before it settles.
  const groups = new Map<string, Txn[]>()
  const annualGroups = new Map<string, Txn[]>()
  transactions.forEach((t) => {
    if (t.kind !== 'expense' || t.amount >= 0 || t.isTransfer || t.pending) return
    const d = t.date
    if (d < annualBounds.from || d > annualBounds.to) return // never let a future row in
    const k = detectorKeyFor(t)
    const annual = annualGroups.get(k)
    if (annual) annual.push(t)
    else annualGroups.set(k, [t])
    if (d >= bounds.from) {
      const g = groups.get(k)
      if (g) g.push(t)
      else groups.set(k, [t])
    }
  })

  const detectedSeries: Series[] = []
  // AI-hinted candidates: merchants `detect()` rejects purely on evidence
  // (1-2 charges, below MIN_OBSERVATIONS), never on any other criterion —
  // a merchant with 3+ erratic or non-periodic charges gets NO candidate
  // even with a matching hint, because the deterministic signal there is
  // "this genuinely isn't a pattern," not "not enough data yet."
  const candidates: RecurringCandidate[] = []
  const detectedKeys = new Set<string>()
  groups.forEach((txns, k) => {
    const s = detect(k, txns, today, bounds.from)
    if (s) {
      detectedSeries.push({ ...s, fundingAccountGlow: glowFor(s.fundingAccount) })
      detectedKeys.add(k)
    }
  })

  // Do not broaden all cadence detection to three years: that would alter the
  // product's current reporting semantics and make old, lapsed patterns far
  // too influential. Only an Annual result is admitted from this second pass.
  const annualCandidateKeys = new Set<string>()
  annualGroups.forEach((txns, k) => {
    if (detectedKeys.has(k)) return
    const s = detect(k, txns, today, bounds.from)
    if (s?.cadence === 'Annual') {
      detectedSeries.push({ ...s, fundingAccountGlow: glowFor(s.fundingAccount) })
      detectedKeys.add(k)
      return
    }
    const candidate = annualEvidenceCandidate(k, txns, today)
    if (candidate) {
      candidates.push(candidate)
      annualCandidateKeys.add(k)
    }
  })

  groups.forEach((txns, k) => {
    if (detectedKeys.has(k) || annualCandidateKeys.has(k)) return
    if (txns.length >= MIN_OBSERVATIONS) return
    const t0 = txns[0]
    const hint = hints.get(normalizeMerchant(t0.merchant).key)
    if (!hint || !hint.isRecurring || hint.confidence < CANDIDATE_MIN_CONFIDENCE) return
    const charges: Charge[] = txns
      .map((t) => ({ transactionId: t.id, date: t.date, amount: Math.abs(t.amount) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    candidates.push({
      id: k,
      merchantKey: t0.merchantKey ?? normalizeMerchant(t0.merchant).key,
      accountId: t0.account_id,
      merchant: t0.merchant,
      label: shortMerchant(t0.merchant),
      cat: t0.cat,
      subcat: t0.subcat ?? 'Other',
      suggestedCadence: hint.suggestedCadence,
      source: 'ai_hint',
      confidence: hint.confidence,
      charges,
      lastCharged: charges[charges.length - 1].date,
    })
  })
  const overridesBySeries = new Map(overrides.map((override) => [
    overrideKeyFor(override.accountId, override.merchantKey), override,
  ]))
  const untracked: Series[] = []
  const series: Series[] = []
  for (const detected of detectedSeries) {
    const override = overridesBySeries.get(overrideKeyFor(detected.accountId, detected.merchantKey))
    if (!override) {
      series.push(detected)
      continue
    }
    const cadence = override.cadenceOverride ?? detected.cadence
    const expected = override.expectedAmountOverride ?? detected.expected
    const nextExpected = override.nextExpectedOverride ?? detected.nextExpected
    const effective: Series = {
      ...detected,
      cadence,
      expected,
      monthly: expected * CADENCE_PER_MONTH[cadence],
      nextExpected,
      // A manually supplied next date is explicit user intent, even if the
      // old detector evidence is now dormant.
      status: override.nextExpectedOverride ? 'active' : detected.status,
      trackingState: override.state === 'active' ? 'managed' : override.state,
      reminderDaysBefore: override.reminderDaysBefore,
    }
    if (override.state === 'active') series.push(effective)
    else untracked.push(effective)
  }

  series.sort((a, b) => b.monthly - a.monthly)
  untracked.sort((a, b) => b.monthly - a.monthly)
  candidates.sort((a, b) => b.confidence - a.confidence)

  const active = series.filter((s) => s.status === 'active')
  const dormant = series.filter((s) => s.status === 'dormant')

  // Sections come from here, not the component, mirroring buildPacing's cats[].subs[] —
  // so the directory stays presentational and its sub-totals can't drift from the hero.
  const cats = [...new Set(series.map((s) => s.cat))]
  const sections: RecurringSection[] = cats
    .map((cat) => {
      const rows = series
        .filter((s) => s.cat === cat)
        .sort((a, b) => Number(a.status === 'dormant') - Number(b.status === 'dormant') || b.monthly - a.monthly)
      const live = rows.filter((s) => s.status === 'active')
      return { cat, rows, monthly: live.reduce((a, s) => a + s.monthly, 0), count: live.length }
    })
    .sort((a, b) => b.monthly - a.monthly)

  const monthlyCommitment = active.reduce((a, s) => a + s.monthly, 0)

  // Pressure is measured on ACTUAL rows in the trailing window, never by summing
  // `monthly`. A 30-day window isn't a calendar month, so a monthly series can
  // land 0, 1 or 2 times in it depending on its day — summing `monthly` would be
  // right today and wrong the moment a charge day shifts.
  const activeKeys = new Set(active.map((s) => s.id))
  let recurringSpend = 0
  let totalSpend = 0
  transactions.forEach((t) => {
    if (t.kind !== 'expense' || t.amount >= 0 || t.isTransfer || t.pending) return
    const d = t.date
    if (d < window30.from || d > window30.to) return
    const amt = Math.abs(t.amount)
    totalSpend += amt
    if (activeKeys.has(detectorKeyFor(t))) recurringSpend += amt
  })

  // Aggregated dynamically from whichever real accounts actually fund active
  // series — not a fixed fake list. An account with no active commitments
  // simply never appears here, rather than showing a $0 row for it.
  const accountTotals = new Map<string, number>()
  active.forEach((s) => {
    accountTotals.set(s.fundingAccount, (accountTotals.get(s.fundingAccount) ?? 0) + s.monthly)
  })

  const totalRecurring = [...accountTotals.values()].reduce((a, b) => a + b, 0)
  const fundingAccounts: FundingAccountSummary[] = [...accountTotals.entries()].map(([name, amount]) => {
    return {
      name,
      amount,
      percentage: totalRecurring > 0 ? (amount / totalRecurring) * 100 : 0,
      glow: glowFor(name),
    }
  }).sort((a, b) => b.amount - a.amount)

  return {
    series,
    active,
    dormant,
    sections,
    monthlyCommitment,
    annualBurn: monthlyCommitment * 12,
    trailingActual: active.reduce((a, s) => a + s.trailingTotal, 0),
    pressure: {
      recurring: recurringSpend,
      total: totalSpend,
      ratio: totalSpend > 0 ? recurringSpend / totalSpend : null,
    },
    bounds,
    annualBounds,
    window30,
    horizon,
    fundingAccounts,
    candidates,
    untracked,
  }
}
