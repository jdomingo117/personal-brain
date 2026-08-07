/**
 * Merchant normalisation.
 *
 * This function decides the quality of the whole categorisation cache: the key
 * it returns is what `merchant_rules` is keyed on, so two spellings of the same
 * shop must collapse to one key or the AI gets asked twice and the user's
 * correction only sticks to one of them.
 *
 * The governing trade-off — and it is a real one — is **stability over
 * prettiness**. It is tempting to reduce `BP BAULKHAM HILLS   BAULKHAM HILL`
 * all the way to `BP`, but doing that reliably needs a suburb gazetteer and a
 * brand list, and getting it wrong MERGES DISTINCT MERCHANTS, which is much
 * worse than leaving a suburb on the end. A slightly ugly key that is stable
 * across every import is strictly better than a pretty key that sometimes
 * lumps two businesses together. So: strip what is provably noise
 * (transaction refs, FX tails, card masks, padding), and leave the rest alone.
 *
 * All patterns below were derived from the real files in `Sample datasets/`.
 */

export interface NormalizedMerchant {
  /** Lowercased, whitespace-collapsed. The cache key. Never shown to users. */
  key: string
  /** Human-facing, title-cased where the source was SHOUTING. */
  display: string
}

/**
 * Bank descriptions use runs of 2+ spaces as an informal field separator:
 *   "San Jose Place         Sydney        Au"
 *   "Juicychat.Ai           Santa Venera  Mt Frgn Amt:  3.00 Us Dollar"
 * The first segment is the merchant; everything after is location/FX noise.
 * Single-spaced descriptions have no such separator and are left whole.
 */
function takeFirstPaddedSegment(s: string): string {
  const segments = s.split(/\s{2,}/).map((x) => x.trim()).filter(Boolean)
  if (segments.length <= 1) return s
  // Guard against a leading fragment so short it is meaningless ("TO", "SP").
  return segments[0].length >= 4 ? segments[0] : segments.slice(0, 2).join(' ')
}

/** Noise that appears mid-string and should be cut along with everything after it. */
const TAIL_CUTS: RegExp[] = [
  /\bReceipt\s+number:.*/i,        // "To P Ortiz - Receipt number: OPP000..."
  /\bFrgn\s+Amt:.*/i,              // "... Frgn Amt: 3.00 Us Dollar"
  /\bForeign\s+Amount:.*/i,
  /\bValue\s+Date:.*/i,
  /\bCard\s+(?:ending|no\.?|number)\s*[:#]?\s*[xX*\d]+.*/i,
  /\bRef(?:erence)?\s*[:#]\s*\S+.*/i,
  /\bEffective\s+Date.*/i,
]

/** Prefixes some processors bolt on. Removed so the underlying merchant matches. */
const PREFIX_STRIPS: RegExp[] = [
  /^SQ\s*\*\s*/i,                  // Square
  /^SP\s+/i,                       // Shopify
  /^PAYPAL\s*\*\s*/i,
  /^(?:VISA|EFTPOS|MASTERCARD)\s+(?:PURCHASE|DEBIT|PAYMENT)\s+/i,
  /^(?:DIRECT\s+)?DEBIT\s+/i,
  /^POS\s+(?:PURCHASE\s+)?/i,
  /^(?:TO|FROM)\s+/i,              // Macquarie transfer phrasing
]

/** Card/account masks, which appear mid-string as often as at the end. */
const INLINE_STRIPS: RegExp[] = [
  /\s+[xX]{1,2}\d{3,}(?=\s|$)/g,   // "Linked Account Xx3965 - Internal Transfer"
  /\s+\*{2,}\d{3,}(?=\s|$)/g,      // "**** 1234"
]

/** Trailing junk that survives the segment split on single-spaced strings. */
const TRAILING_STRIPS: RegExp[] = [
  /\s*-\s*\d{4,}$/,                // "Salary From The University O - 1188723"
  /\s+\d{6,}$/,                    // bare long reference numbers
  /\s*,?\s*Thank\s+you\.?$/i,      // "PayID Payment Received, Thank you"
  /\s+(?:AU|AUS|USA|US|NZ|GB|UK)$/i,
  /\s+[A-Z]{2}\s+\d{5}$/,          // trailing state + postcode
  /[\s,.-]+$/,
]

/**
 * All-caps tokens of 3 characters or fewer are preserved as acronyms.
 *
 * Three, not four, is the useful cut-off: it keeps the real ones (BP, IGA,
 * KFC, BWS, NSW) while letting four-letter words case normally. At four,
 * "CAFE", "OPAL" and "HOME" get frozen in caps alongside "AMEX" — and AMEX is
 * conventionally written "Amex" anyway, so the longer threshold buys nothing
 * and costs legibility.
 */
const NOT_ACRONYMS = new Set(['FOR', 'AND', 'THE', 'OF', 'TO', 'AT', 'IN', 'ON', 'A', 'AN', 'BY', 'OR'])

const isAcronym = (t: string) => /^[A-Z&]{1,3}$/.test(t) && !NOT_ACRONYMS.has(t)

const titleCasePart = (p: string) =>
  isAcronym(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()

/** SHOUTING text is unreadable in the UI; Title Case it. Mixed case is left as-is. */
function titleCaseIfShouting(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, '')
  if (letters.length === 0) return s
  const upperRatio = (s.match(/[A-Z]/g)?.length ?? 0) / letters.length
  if (upperRatio < 0.8) return s // already mixed case — trust the source

  return s.replace(/\S+/g, (word) => {
    if (isAcronym(word)) return word
    // Hyphenated compounds are cased per part, so NSW-OPAL keeps its acronym.
    return word
      .split(/([-/])/)
      .map((part) => (/^[-/]$/.test(part) ? part : titleCasePart(part)))
      .join('')
  })
}

export function normalizeMerchant(raw: string | null | undefined): NormalizedMerchant {
  const input = String(raw ?? '').trim()
  if (!input) return { key: 'unknown', display: 'Unknown' }

  // Note: whitespace is NOT collapsed yet — runs of 2+ spaces are the field
  // separator that step 2 depends on.
  let s = input

  // 1. Cut everything from the first noise marker onward.
  for (const re of TAIL_CUTS) s = s.replace(re, ' ')

  // 2. Take the merchant field out of a space-padded description.
  s = takeFirstPaddedSegment(s)

  // 3. Collapse whitespace now that padding has served its purpose.
  s = s.replace(/\s+/g, ' ').trim()

  // 3b. Remove card/account masks wherever they sit.
  for (const re of INLINE_STRIPS) s = s.replace(re, '')

  // 4. Strip processor prefixes, repeatedly (they stack: "POS VISA PURCHASE X").
  let changed = true
  while (changed) {
    changed = false
    for (const re of PREFIX_STRIPS) {
      const next = s.replace(re, '')
      if (next !== s) { s = next.trim(); changed = true }
    }
  }

  // 5. Strip trailing references, card masks, country codes.
  changed = true
  while (changed) {
    changed = false
    for (const re of TRAILING_STRIPS) {
      const next = s.replace(re, '')
      if (next !== s) { s = next.trim(); changed = true }
    }
  }

  s = s.replace(/\s+/g, ' ').trim()

  // If stripping ate everything, fall back to the collapsed original rather
  // than returning an empty key — an empty key would merge every such row.
  if (!s) s = input.replace(/\s+/g, ' ').trim()

  return {
    key: s.toLowerCase(),
    display: titleCaseIfShouting(s),
  }
}
