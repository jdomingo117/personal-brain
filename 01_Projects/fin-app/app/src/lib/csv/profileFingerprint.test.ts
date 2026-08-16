import { describe, expect, it } from 'vitest'
import {
  profileDisplayName,
  profileFingerprint as clientFingerprint,
} from './profileFingerprint'
import { profileFingerprint as serverFingerprint } from '../../../../supabase/functions/_shared/profileFingerprint'

describe('CSV static-profile identity', () => {
  it('is deterministic, order-sensitive and identical on client and server', async () => {
    const headers = ['Date', 'Description', 'Debit', 'Credit']
    const client = await clientFingerprint(headers)
    expect(client).toMatch(/^[0-9a-f]{64}$/)
    expect(await clientFingerprint(headers)).toBe(client)
    expect(await serverFingerprint(headers)).toBe(client)
    expect(await clientFingerprint([...headers].reverse())).not.toBe(client)
  })

  it('uses the legacy pipe serialization for migration compatibility', async () => {
    const expected = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode('Date|Description|Amount'),
    )
    const hex = [...new Uint8Array(expected)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    expect(await clientFingerprint(['Date', 'Description', 'Amount'])).toBe(hex)
  })

  it('derives a bounded human label from the file name', () => {
    expect(profileDisplayName('St George Card 2026.csv')).toBe('St George Card 2026')
    expect(profileDisplayName('.csv')).toBe('Saved CSV layout')
    expect(profileDisplayName(`${'x'.repeat(140)}.csv`)).toHaveLength(120)
  })
})

