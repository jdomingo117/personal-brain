/**
 * CSV amount parsing.
 *
 * Returns **cents as an integer**, matching the DB (`amount integer` — see
 * migrations/20260718000000_initial_schema.sql:35). Parsing to a float and
 * multiplying by 100 late is how rounding drift gets in, so the conversion
 * happens once, here.
 *
 * Returns null (not 0) when a value cannot be parsed. The old implementation
 * coerced NaN to 0, which turned an unreadable amount into a real $0.00
 * transaction instead of an error.
 */

/** Sign convention on the way in, before any invert flag is applied. */
export interface AmountMapping {
  amountCol?: string | null
  debitCol?: string | null
  creditCol?: string | null
  /** True when the file writes expenses as positive numbers (e.g. AMEX). */
  invertAmount?: boolean
}

export function parseAmountCents(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : null
  }

  let s = String(value).trim()
  if (!s || s === '-' || s === '--') return null

  // Accounting negatives: (12.34)
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }

  // Currency symbols, codes and spaces.
  s = s.replace(/[A-Z$£€¥]/gi, '').replace(/\s/g, '').trim()

  if (s.startsWith('-')) { negative = true; s = s.slice(1) }
  else if (s.startsWith('+')) { s = s.slice(1) }

  // Separators. European "1.234,56" uses . for thousands and , for decimals;
  // Anglo "1,234.56" is the reverse. Decide by which separator comes last.
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')  // European
    else s = s.replace(/,/g, '')                                        // Anglo
  } else if (lastComma !== -1) {
    // Lone comma: decimal if it leaves 1-2 trailing digits, else thousands.
    const after = s.length - lastComma - 1
    s = after === 1 || after === 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  }

  // Leading-dot amounts are real: St George writes 13 cents as ".13".
  if (s.startsWith('.')) s = `0${s}`
  if (s.endsWith('.')) s = s.slice(0, -1)

  if (!/^\d+(\.\d+)?$/.test(s)) return null

  // Convert from the DIGITS, not via parseFloat * 100. `parseFloat('1.005')`
  // is 1.0049999999999999, so multiplying and rounding yields 100c instead of
  // 101c — a silent one-cent loss that compounds across an import and makes
  // reconciliation drift. Working on the string is exact.
  const [intPart, fracPart = ''] = s.split('.')
  const frac = `${fracPart}000`.slice(0, 3) // 2 significant + 1 for rounding

  const whole = Number(intPart)
  if (!Number.isSafeInteger(whole)) return null

  let cents = whole * 100 + Number(frac.slice(0, 2))
  if (Number(frac[2]) >= 5) cents += 1 // round half up, as money conventionally does

  if (!Number.isSafeInteger(cents)) return null

  return negative ? -cents : cents
}

/**
 * Resolves a row to signed cents using the column mapping.
 *
 * Sign convention (matching the schema comment): **positive = inflow,
 * negative = outflow**.
 *
 * @returns cents, or null when the row carries no usable amount. A row where
 * both debit and credit are blank is null, not zero — Ingestion.tsx used to
 * silently drop those with `.filter(tx => tx.amount !== 0)`, which also
 * discarded legitimate zero-value entries.
 */
export function resolveRowAmountCents(
  row: Record<string, unknown>,
  mapping: AmountMapping,
): number | null {
  let cents: number | null = null

  if (mapping.amountCol) {
    cents = parseAmountCents(row[mapping.amountCol])
  } else if (mapping.debitCol || mapping.creditCol) {
    const debit = mapping.debitCol ? parseAmountCents(row[mapping.debitCol]) : null
    const credit = mapping.creditCol ? parseAmountCents(row[mapping.creditCol]) : null

    // Exactly one side is normally populated. Both blank means no amount.
    if (debit === null && credit === null) return null

    // Banks write both columns as positive magnitudes; polarity comes from
    // which column is filled, so a debit becomes negative here. Values already
    // carrying a sign are respected via Math.abs on the magnitude only.
    if (credit !== null && credit !== 0) cents = Math.abs(credit)
    else if (debit !== null && debit !== 0) cents = -Math.abs(debit)
    else cents = 0
  }

  if (cents === null) return null

  // Split debit/credit columns already encode direction; inverting them would
  // flip every row. The flag only applies to a single-amount column.
  if (mapping.invertAmount && mapping.amountCol) cents = -cents

  return cents
}
