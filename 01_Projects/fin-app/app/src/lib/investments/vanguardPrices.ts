export interface VanguardNavPrice {
  priceDate: string
  navPrice: string
  currency: 'AUD'
}

/** Browser-testable mirror of the server adapter's response validation. */
export function normalizeVanguardPriceResponse(payload: unknown): VanguardNavPrice[] {
  const products = (payload as { data?: unknown })?.data
  if (!Array.isArray(products) || products.length !== 1) throw new Error('Unexpected Vanguard product response')
  const prices = (products[0] as { navPrices?: unknown })?.navPrices
  if (!Array.isArray(prices)) throw new Error('Vanguard response has no NAV history')
  const seen = new Set<string>()
  const result: VanguardNavPrice[] = []
  for (const raw of prices) {
    const row = raw as Record<string, unknown>
    if (row.measureTypeCode !== 'NAV') continue
    const priceDate = String(row.asOfDate ?? '')
    const currency = String(row.currencyCode ?? '')
    const price = Number(row.price)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(priceDate) || currency !== 'AUD' || !Number.isFinite(price) || price <= 0 || price > 1_000_000) throw new Error('Vanguard returned an invalid NAV row')
    if (seen.has(priceDate)) throw new Error('Vanguard returned duplicate NAV dates')
    seen.add(priceDate)
    result.push({ priceDate, navPrice: String(price), currency: 'AUD' })
  }
  if (result.length === 0) throw new Error('Vanguard response contained no usable NAV prices')
  return result.sort((a, b) => a.priceDate.localeCompare(b.priceDate))
}

