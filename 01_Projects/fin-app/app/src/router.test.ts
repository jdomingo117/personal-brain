import { describe, expect, it } from 'vitest'
import { NAV, VIEW_PATHS, pathToView } from './router'

describe('workflow routing', () => {
  it('gives ledger, import and reconciliation distinct stable URLs', () => {
    expect(VIEW_PATHS.ledger).toBe('/ledger')
    expect(VIEW_PATHS.ingestion).toBe('/ingestion')
    expect(VIEW_PATHS.transfers).toBe('/transfers')
    expect(pathToView('/ledger')).toBe('ledger')
    expect(pathToView('/ingestion')).toBe('ingestion')
    expect(pathToView('/transfers')).toBe('transfers')
  })

  it('places the first-class ledger before ingestion and reconciliation', () => {
    expect(NAV.map((item) => item.id)).toEqual([
      'landing', 'dashboard', 'accounts', 'income', 'expenses', 'ledger', 'ingestion', 'transfers',
    ])
  })
})
