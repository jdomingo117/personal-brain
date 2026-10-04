import { describe, expect, it } from 'vitest'
import { normalizeVanguardPriceResponse } from './vanguardPrices'

const fixture = { data: [{ navPrices: [
  { measureTypeCode: 'NAV', asOfDate: '2026-08-06', currencyCode: 'AUD', price: 2.3601 },
  { measureTypeCode: 'NAV', asOfDate: '2026-08-04', currencyCode: 'AUD', price: 2.3493 },
  { measureTypeCode: 'NAV', asOfDate: '2026-08-05', currencyCode: 'AUD', price: 2.3583 },
] }] }

describe('Vanguard price adapter', () => {
  it('normalises and chronologically sorts verified official response data', () => {
    expect(normalizeVanguardPriceResponse(fixture)).toEqual([
      { priceDate: '2026-08-04', navPrice: '2.3493', currency: 'AUD' },
      { priceDate: '2026-08-05', navPrice: '2.3583', currency: 'AUD' },
      { priceDate: '2026-08-06', navPrice: '2.3601', currency: 'AUD' },
    ])
  })

  it('rejects invalid, duplicate, non-AUD and empty NAV data', () => {
    const wrap = (navPrices: unknown[]) => ({ data: [{ navPrices }] })
    expect(() => normalizeVanguardPriceResponse(wrap([]))).toThrow(/no usable/)
    expect(() => normalizeVanguardPriceResponse(wrap([{ measureTypeCode: 'NAV', asOfDate: 'bad', currencyCode: 'AUD', price: 2 }]))).toThrow(/invalid/)
    expect(() => normalizeVanguardPriceResponse(wrap([{ measureTypeCode: 'NAV', asOfDate: '2026-08-06', currencyCode: 'USD', price: 2 }]))).toThrow(/invalid/)
    const row = { measureTypeCode: 'NAV', asOfDate: '2026-08-06', currencyCode: 'AUD', price: 2 }
    expect(() => normalizeVanguardPriceResponse(wrap([row, row]))).toThrow(/duplicate/)
  })
})
