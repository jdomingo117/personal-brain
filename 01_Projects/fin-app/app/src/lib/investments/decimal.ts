const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?$/

/** Canonical fixed-precision decimal text; never passes through Number. */
export function canonicalDecimal(value: unknown, scale = 10): string | null {
  const raw = String(value ?? '').trim().replace(/[$,\s]/g, '')
  const match = DECIMAL_RE.exec(raw)
  if (!match) return null
  const fraction = match[3] ?? ''
  if (fraction.length > scale) return null
  const negative = match[1] === '-'
  const whole = match[2].replace(/^0+(?=\d)/, '')
  const trimmedFraction = fraction.replace(/0+$/, '')
  const isZero = whole === '0' && trimmedFraction === ''
  return `${negative && !isZero ? '-' : ''}${whole}${trimmedFraction ? `.${trimmedFraction}` : ''}`
}

export function decimalToScaled(value: string, scale = 10): bigint {
  const canonical = canonicalDecimal(value, scale)
  if (canonical === null) throw new Error(`Invalid decimal: ${value}`)
  const negative = canonical.startsWith('-')
  const unsigned = negative ? canonical.slice(1) : canonical
  const [whole, fraction = ''] = unsigned.split('.')
  const scaled = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'))
  return negative ? -scaled : scaled
}

export function scaledToDecimal(value: bigint, scale = 10): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const divisor = 10n ** BigInt(scale)
  const whole = absolute / divisor
  const fraction = (absolute % divisor).toString().padStart(scale, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

export function sumDecimals(values: string[], scale = 10): string {
  return scaledToDecimal(values.reduce((sum, value) => sum + decimalToScaled(value, scale), 0n), scale)
}

export function subtractDecimals(a: string, b: string, scale = 10): string {
  return scaledToDecimal(decimalToScaled(a, scale) - decimalToScaled(b, scale), scale)
}

export function decimalEquals(a: string, b: string, scale = 10): boolean {
  return decimalToScaled(a, scale) === decimalToScaled(b, scale)
}

/** Parse a currency field into cents without floating point. */
export function currencyToCents(value: unknown): number | null {
  const canonical = canonicalDecimal(value, 2)
  if (canonical === null) return null
  const cents = decimalToScaled(canonical, 2)
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) return null
  return Number(cents)
}
