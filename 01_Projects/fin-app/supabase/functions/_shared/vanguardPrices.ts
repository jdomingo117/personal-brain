export interface NormalizedFundPrice {
  price_date: string
  nav_price: string
  currency: string
  status: 'final'
  source: 'vanguard_au'
  source_version: 1
}

export function normalizeVanguardPriceResponse(payload: unknown): NormalizedFundPrice[] {
  const products = (payload as { data?: unknown })?.data
  if (!Array.isArray(products) || products.length !== 1) throw new Error('Unexpected Vanguard product response')
  const prices = (products[0] as { navPrices?: unknown })?.navPrices
  if (!Array.isArray(prices)) throw new Error('Vanguard response has no NAV history')
  const seen = new Set<string>()
  const normalized: NormalizedFundPrice[] = []
  for (const raw of prices) {
    const row = raw as Record<string, unknown>
    if (row.measureTypeCode !== 'NAV') continue
    const date = String(row.asOfDate ?? '')
    const currency = String(row.currencyCode ?? '')
    const price = Number(row.price)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || currency !== 'AUD' || !Number.isFinite(price) || price <= 0 || price > 1_000_000) {
      throw new Error('Vanguard returned an invalid NAV row')
    }
    if (seen.has(date)) throw new Error('Vanguard returned duplicate NAV dates')
    seen.add(date)
    normalized.push({ price_date: date, nav_price: String(price), currency, status: 'final', source: 'vanguard_au', source_version: 1 })
  }
  if (normalized.length === 0) throw new Error('Vanguard response contained no usable NAV prices')
  return normalized.sort((a, b) => a.price_date.localeCompare(b.price_date))
}

export async function fetchVanguardPrices(providerProductId: string): Promise<NormalizedFundPrice[]> {
  if (!/^\d{4}$/.test(providerProductId)) throw new Error('Invalid Vanguard product id')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`https://www.vanguard.com.au/api/products/personal/fund/${providerProductId}/prices`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Halcyon investment valuation/1.0' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Vanguard price request failed (${response.status})`)
    return normalizeVanguardPriceResponse(await response.json())
  } finally {
    clearTimeout(timeout)
  }
}

