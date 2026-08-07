/**
 * CSV date parsing.
 *
 * The rule that matters: **an unparseable date returns null, never today.**
 * The previous implementation (CSVUploader.tsx) fell back to `new Date()`,
 * so a malformed row silently entered the ledger dated today — wrong data
 * presented as fact, with no warning. Null rows are quarantined for review
 * instead of being committed.
 *
 * Dates are built as LOCAL dates and formatted by hand. Going through
 * `toISOString()` (as views/Ingestion.tsx did) converts to UTC first, which
 * shifts the date back a day for anyone east of Greenwich — i.e. every
 * Australian user of this app.
 */

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD MMM YYYY'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Rejects impossible dates (31 Feb) that a Date constructor would roll over. */
function toIso(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null

  const dt = new Date(y, m - 1, d)
  // A rolled-over date (2026-02-31 -> 2026-03-03) no longer matches its parts.
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null

  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
}

function expandYear(y: number): number {
  if (y >= 1000) return y
  // Two-digit years: 70-99 => 1970s-1990s, 00-69 => 2000s-2060s.
  return y >= 70 ? 1900 + y : 2000 + y
}

/**
 * Parses one cell. `format` should come from the detected/selected mapping;
 * without it the numeric forms are ambiguous and DD/MM is assumed (see
 * detectDateFormat for why that default is safe here).
 *
 * @returns ISO `YYYY-MM-DD`, or null if the value cannot be trusted.
 */
export function parseDate(
  value: string | null | undefined,
  format: DateFormat = 'DD/MM/YYYY',
): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  // ISO / YYYY-MM-DD (also matches YYYY/MM/DD)
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/)
  if (iso) return toIso(+iso[1], +iso[2], +iso[3])

  // "12 Jul 2026" / "12-Jul-2026" / "12 July 2026"  (Macquarie)
  const named = raw.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{2,4})$/)
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()]
    if (!month) return null
    return toIso(expandYear(+named[3]), month, +named[1])
  }

  // "Jul 12, 2026"
  const namedFirst = raw.match(/^([A-Za-z]{3,})[\s-]+(\d{1,2}),?[\s-]+(\d{2,4})$/)
  if (namedFirst) {
    const month = MONTHS[namedFirst[1].slice(0, 3).toLowerCase()]
    if (!month) return null
    return toIso(expandYear(+namedFirst[3]), month, +namedFirst[2])
  }

  // Numeric: DD/MM/YYYY or MM/DD/YYYY, separator / . or -
  const numeric = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (numeric) {
    const a = +numeric[1]
    const b = +numeric[2]
    const year = expandYear(+numeric[3])
    // Self-correct when one component cannot be a month, regardless of the
    // declared format — a stated format is a hint, not a licence to emit a
    // date we can see is impossible.
    if (a > 12 && b <= 12) return toIso(year, b, a)
    if (b > 12 && a <= 12) return toIso(year, a, b)
    return format === 'MM/DD/YYYY' ? toIso(year, a, b) : toIso(year, b, a)
  }

  return null
}

/**
 * Infers DD/MM vs MM/DD from a column of samples.
 *
 * `03/04/2026` is genuinely ambiguous, and guessing wrong silently moves
 * transactions by months. A single unambiguous value in the column (a day
 * above 12) settles it for the whole column, which is why this looks at all
 * the samples rather than the first one.
 *
 * `confident: false` means every sample was ambiguous and the AU-default
 * DD/MM was assumed — worth surfacing in the mapping UI.
 */
export function detectDateFormat(samples: (string | null | undefined)[]): {
  format: DateFormat
  confident: boolean
} {
  let sawNamed = false
  let sawIso = false
  let firstOver12 = false
  let secondOver12 = false

  for (const s of samples) {
    const raw = String(s ?? '').trim()
    if (!raw) continue
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(raw)) { sawIso = true; continue }
    if (/^\d{1,2}[\s-]+[A-Za-z]{3,}[\s-]+\d{2,4}$/.test(raw)) { sawNamed = true; continue }
    const m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/)
    if (m) {
      if (+m[1] > 12) firstOver12 = true
      if (+m[2] > 12) secondOver12 = true
    }
  }

  if (sawIso) return { format: 'YYYY-MM-DD', confident: true }
  if (sawNamed) return { format: 'DD MMM YYYY', confident: true }
  if (firstOver12 && !secondOver12) return { format: 'DD/MM/YYYY', confident: true }
  if (secondOver12 && !firstOver12) return { format: 'MM/DD/YYYY', confident: true }

  // Both ambiguous (or contradictory). Default to DD/MM: this app is AUD-first
  // and every sample institution is Australian.
  return { format: 'DD/MM/YYYY', confident: false }
}
