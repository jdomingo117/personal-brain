import { describe, expect, it } from 'vitest'
import {
  connectedImportViolation,
  type ConnectedImportRow,
} from '../../../../supabase/functions/_shared/connectedImportPolicy'

const CONNECTED = '11111111-1111-1111-1111-111111111111'
const MANUAL = '22222222-2222-2222-2222-222222222222'
const connections = [{ account_id: CONNECTED, cutover_date: '2026-07-01' }]

const row = (patch: Partial<ConnectedImportRow> = {}): ConnectedImportRow => ({
  account_id: CONNECTED,
  date: '2026-06-30',
  category: 'Food & drink',
  subcategory: 'Dining & takeaway',
  ...patch,
})

describe('connected-account CSV import policy', () => {
  it('allows history strictly before the provider cutover', () => {
    expect(connectedImportViolation([row()], connections)).toBeNull()
  })

  it('rejects the cutover date and later dates', () => {
    expect(connectedImportViolation([row({ date: '2026-07-01' })], connections)?.code)
      .toBe('connected_account_period_overlap')
    expect(connectedImportViolation([row({ date: '2026-07-02' })], connections)?.code)
      .toBe('connected_account_period_overlap')
  })

  it('rejects reconciliation anchors even when dated before cutover', () => {
    expect(connectedImportViolation([
      row({ category: 'Transfer', subcategory: 'Reconciliation' }),
    ], connections)?.code).toBe('connected_account_reconciliation_forbidden')
  })

  it('does not constrain manual accounts in a mixed-account batch', () => {
    expect(connectedImportViolation([
      row({ account_id: MANUAL, date: '2026-08-01' }),
      row(),
    ], connections)).toBeNull()
  })
})
