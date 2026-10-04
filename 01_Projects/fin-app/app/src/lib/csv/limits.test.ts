import { describe, expect, it } from 'vitest'
import {
  MAX_CSV_SOURCE_ROWS,
  MAX_RECONCILIATION_ROWS,
  MAX_SUBMITTED_TRANSACTIONS,
  sourceRowLimitError,
} from './limits'

describe('CSV ingestion limits', () => {
  it('keeps the source and submitted transaction boundaries aligned', () => {
    expect(MAX_CSV_SOURCE_ROWS).toBe(5_000)
    expect(MAX_SUBMITTED_TRANSACTIONS).toBe(5_000)
    expect(MAX_RECONCILIATION_ROWS).toBe(1)
  })

  it('accepts exactly 5,000 source rows and rejects 5,001 before staging', () => {
    expect(sourceRowLimitError(5_000)).toBeNull()
    expect(sourceRowLimitError(5_001)).toBe(
      'This statement has 5,001 rows. Halcyon can import up to 5,000 rows at once; export a smaller date range and try again. Nothing has been imported.',
    )
  })
})
