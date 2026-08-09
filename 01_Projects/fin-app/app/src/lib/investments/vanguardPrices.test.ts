import { describe, expect, it } from 'vitest'
import fixture from '../../../../Sample datasets/Vanguard_8134_prices_fixture.json'
import { normalizeVanguardPriceResponse } from './vanguardPrices'

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
