import { describe, expect, it } from 'vitest'
import { providerSyncNoticeDetail } from './providerSyncStatus'

describe('provider-sync notice copy', () => {
  it('names only durable checkpoints and does not invent completion', () => {
    expect(providerSyncNoticeDetail([
      { accountId: 'cash', pagesFetched: 0, rowsSeen: 0, rowsInserted: 0, rowsUpdated: 0 },
    ], new Map([['cash', 'Everyday cash']]))).toBe('Checking Everyday cash. This may take a moment.')
  })

  it('aggregates active connections without duplicating an account name', () => {
    expect(providerSyncNoticeDetail([
      { accountId: 'cash', pagesFetched: 1, rowsSeen: 12, rowsInserted: 2, rowsUpdated: 1 },
      { accountId: 'cash', pagesFetched: 2, rowsSeen: 8, rowsInserted: 0, rowsUpdated: 1 },
      { accountId: 'savings', pagesFetched: 1, rowsSeen: 0, rowsInserted: 0, rowsUpdated: 0 },
    ], new Map([['cash', 'Everyday cash'], ['savings', 'Rainy-day savings']]))).toBe(
      'Checking Everyday cash, Rainy-day savings. 4 pages received. 20 transactions checked. 4 changes recorded.',
    )
  })
})
