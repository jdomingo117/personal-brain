/**
 * Merchant normalisation — server-side mirror of app/src/lib/csv/normalizeMerchant.ts.
 *
 * Byte-identical logic, duplicated for the same reason dedupe.ts and
 * transferMatch.ts are: Edge Functions run in Deno and cannot import from the
 * Vite app's source tree. Needed here specifically because sync-provider has
 * no client-side staging step to compute `merchant` before submission the way
 * CSVUploader does — an Up sync writes transactions directly, so this is the
 * only place that key gets computed for provider rows. Keeping it identical
 * to the client copy is what makes merchant_rules cache hits work the same
 * regardless of whether a merchant's key was first established by a CSV
 * import or an Up sync.
 *
 * If you change this file, change app/src/lib/csv/normalizeMerchant.ts too
 * (or vice versa) — see that file for the full stability-over-prettiness
 * rationale, kept here only where it affects reading this copy in isolation.
 */

export interface NormalizedMerchant {
  key: string
  display: string
}

function takeFirstPaddedSegment(s: string): string {
  const segments = s.split(/\s{2,}/).map((x) => x.trim()).filter(Boolean)
  if (segments.length <= 1) return s
  return segments[0].length >= 4 ? segments[0] : segments.slice(0, 2).join(' ')
}

const TAIL_CUTS: RegExp[] = [
  /\bReceipt\s+number:.*/i,
  /\bFrgn\s+Amt:.*/i,
  /\bForeign\s+Amount:.*/i,
  /\bValue\s+Date:.*/i,
  /\bCard\s+(?:ending|no\.?|number)\s*[:#]?\s*[xX*\d]+.*/i,
  /\bRef(?:erence)?\s*[:#]\s*\S+.*/i,
  /\bEffective\s+Date.*/i,
]

const PREFIX_STRIPS: RegExp[] = [
  /^SQ\s*\*\s*/i,
  /^SP\s+/i,
  /^PAYPAL\s*\*\s*/i,
  /^(?:VISA|EFTPOS|MASTERCARD)\s+(?:PURCHASE|DEBIT|PAYMENT)\s+/i,
  /^(?:DIRECT\s+)?DEBIT\s+/i,
  /^POS\s+(?:PURCHASE\s+)?/i,
  /^(?:TO|FROM)\s+/i,
]

const INLINE_STRIPS: RegExp[] = [
  /\s+[xX]{1,2}\d{3,}(?=\s|$)/g,
  /\s+\*{2,}\d{3,}(?=\s|$)/g,
]

const TRAILING_STRIPS: RegExp[] = [
  /\s*-\s*\d{4,}$/,
  /\s+\d{6,}$/,
  /\s*,?\s*Thank\s+you\.?$/i,
  /\s+(?:AU|AUS|USA|US|NZ|GB|UK)$/i,
  /\s+[A-Z]{2}\s+\d{5}$/,
  /[\s,.-]+$/,
]

const NOT_ACRONYMS = new Set(['FOR', 'AND', 'THE', 'OF', 'TO', 'AT', 'IN', 'ON', 'A', 'AN', 'BY', 'OR'])

const isAcronym = (t: string) => /^[A-Z&]{1,3}$/.test(t) && !NOT_ACRONYMS.has(t)

const titleCasePart = (p: string) =>
  isAcronym(p) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()

function titleCaseIfShouting(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, '')
  if (letters.length === 0) return s
  const upperRatio = (s.match(/[A-Z]/g)?.length ?? 0) / letters.length
  if (upperRatio < 0.8) return s

  return s.replace(/\S+/g, (word) => {
    if (isAcronym(word)) return word
    return word
      .split(/([-/])/)
      .map((part) => (/^[-/]$/.test(part) ? part : titleCasePart(part)))
      .join('')
  })
}

export function normalizeMerchant(raw: string | null | undefined): NormalizedMerchant {
  const input = String(raw ?? '').trim()
  if (!input) return { key: 'unknown', display: 'Unknown' }

  let s = input

  for (const re of TAIL_CUTS) s = s.replace(re, ' ')
  s = takeFirstPaddedSegment(s)
  s = s.replace(/\s+/g, ' ').trim()

  for (const re of INLINE_STRIPS) s = s.replace(re, '')

  let changed = true
  while (changed) {
    changed = false
    for (const re of PREFIX_STRIPS) {
      const next = s.replace(re, '')
      if (next !== s) { s = next.trim(); changed = true }
    }
  }

  changed = true
  while (changed) {
    changed = false
    for (const re of TRAILING_STRIPS) {
      const next = s.replace(re, '')
      if (next !== s) { s = next.trim(); changed = true }
    }
  }

  s = s.replace(/\s+/g, ' ').trim()
  if (!s) s = input.replace(/\s+/g, ' ').trim()

  return {
    key: s.toLowerCase(),
    display: titleCaseIfShouting(s),
  }
}
