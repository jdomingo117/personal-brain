/**
 * Transfer-signal extraction from a transaction description.
 *
 * Reads `original_description`, NEVER `merchant`. normalizeMerchant()
 * deliberately strips account masks ("Xx3965"), leading TO/FROM, and
 * trailing reference numbers (app/src/lib/csv/normalizeMerchant.ts) — exactly
 * the tokens this module depends on. Classifying the normalized merchant
 * instead would discard the signal entirely; see classify.test.ts for the
 * regression guard.
 *
 * Pure, no I/O. Mirrored byte-for-byte in
 * supabase/functions/_shared/transferMatch.ts.
 */

export interface TransferTokens {
  /** Matches the internal-transfer lexicon (osko, payid, internal transfer, ...). */
  isLexical: boolean
  /** Textual cue for the money's direction, independent of the row's sign. */
  direction: 'out' | 'in' | null
  /** Account masks, digits only, e.g. "Xx3965" -> "3965". */
  masks: string[]
  /** Long embedded account/reference numbers, leading zeros stripped. */
  accountNumbers: string[]
  /** Embedded date tokens, e.g. "07Jul22:43" -> "07jul". */
  embeddedDates: string[]
  /** Institution names recognised from a fixed lexicon (banks operating in the corpus + common AU banks). */
  institutions: string[]
}

const MASK_RE = /\b[xX]{1,2}(\d{3,6})\b/g
const ACCOUNT_NUMBER_RE = /\b\d{9,18}\b/g
const EMBEDDED_DATE_RE = /\b(\d{1,2})([A-Za-z]{3})(?:(\d{2}):(\d{2}))?\b/g

const OUT_CUE_RE = /\b(to|withdrawal|debit|payment to|tfr to|transfer to)\b/i
const IN_CUE_RE = /\b(from|deposit|received|credit|tfr from|transfer from)\b/i

// `transfer (to|from) (spending|savings)` is Up Bank's own fixed, exact
// wording for its Saver-sweep feature (not a guess at varying real-world
// text, unlike the rest of this lexicon) — confirmed against real data that
// a genuine pair ("Transfer to Spending" / "Transfer from Savings", same
// day, opposite accounts) was scoring 0.45, just under SUGGESTED_THRESHOLD,
// purely because this phrase wasn't recognized.
const LEXICON_RE =
  /internal transfer|funds transfer|linked account|osko|payid|bpay|npp|\btfr\b|sct deposit|payment received|direct (credit|debit)|autopay|transfer (to|from) (spending|savings)/i

const MONTH_ABBR = new Set([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
])

/**
 * Fixed lexicon rather than a gazetteer: institution matching only needs to
 * tell "this description names account B's bank" from "it doesn't" — a
 * fuzzy name matcher would risk merging distinct entities, the same trap
 * normalizeMerchant.ts documents and deliberately avoids.
 */
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

/** Strips leading zeros from a numeric token without turning "0" into "". */
function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, '')
  return stripped || '0'
}

export function classifyTransferLeg(description: string | null | undefined): TransferTokens {
  const raw = String(description ?? '')
  const lower = raw.toLowerCase()

  const masks = [...raw.matchAll(MASK_RE)].map((m) => m[1])

  // Account numbers must not double-count digits already claimed by a mask
  // match (a mask is itself a short digit run) — matchAll on the original
  // string handles this naturally since the patterns target different shapes
  // (Xx-prefixed vs bare 9-18 digit runs).
  const accountNumbers = [...raw.matchAll(ACCOUNT_NUMBER_RE)].map((m) => stripLeadingZeros(m[0]))

  const embeddedDates = [...raw.matchAll(EMBEDDED_DATE_RE)]
    .filter((m) => MONTH_ABBR.has(m[2].toLowerCase()))
    .map((m) => `${m[1].padStart(2, '0')}${m[2].toLowerCase()}`)

  const isLexical = LEXICON_RE.test(lower)

  const outCue = OUT_CUE_RE.test(lower)
  const inCue = IN_CUE_RE.test(lower)
  const direction: TransferTokens['direction'] = outCue && !inCue ? 'out' : inCue && !outCue ? 'in' : null

  const institutions = INSTITUTIONS.filter((name) => lower.includes(name))
  // Collapse aliases so "st george"/"st. george"/"stgeorge" and
  // "amex"/"american express" count as one institution for matching purposes.
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

/**
 * A candidate is anything worth including in the O(N) matching pass. Kept
 * deliberately generous to bias toward recall — the hard gates and score in
 * match.ts decide, not this.
 */
export function isTransferCandidateText(description: string | null | undefined, kind: string): boolean {
  // Up's round-up sweep is always exactly this string and structurally
  // one-sided — it will never have a counterpart, so it must never enter
  // the candidate pool. Checked before the kind==='transfer' rule
  // below, which would otherwise catch it (Up sets transferAccountId on
  // it) and leave it stuck "unmatched" forever.
  if (String(description ?? '').trim().toLowerCase() === 'round up') return false
  if (kind === 'transfer') return true
  const tokens = classifyTransferLeg(description)
  if (tokens.isLexical) return true
  return /^\s*(to|from)\s/i.test(String(description ?? ''))
}
