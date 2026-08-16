import { describe, expect, it } from 'vitest'
import type { Account } from '../../data'
import {
  INITIAL_TARGET_ACCOUNT_ID,
  accountIdentityLabel,
  accountImportStatus,
  accountOptionLabel,
  selectTargetAccount,
} from './accountSelection'

const manual: Account = {
  id: 'manual', name: 'Daily spending', type: 'Liquid', balance: 0, glow: 'cyan',
  balanceSource: 'manual', institution: 'St George', identifier: '•••• 3965',
}
const connected: Account = {
  id: 'connected', name: 'Up Saver', type: 'Savings', balance: 0, glow: 'cyan',
  balanceSource: 'bank_provider', connectionId: 'connection', institution: 'Up Bank',
}

describe('ingestion target-account selection', () => {
  it('starts without an implicit target', () => {
    expect(INITIAL_TARGET_ACCOUNT_ID).toBe('')
  })

  it('allows selection before staging and preserves it while an import is active', () => {
    expect(selectTargetAccount('', manual.id, false)).toBe(manual.id)
    expect(selectTargetAccount(manual.id, connected.id, true)).toBe(manual.id)
    expect(selectTargetAccount(manual.id, connected.id, false)).toBe(connected.id)
  })

  it('makes account ownership and identity visible in the option label', () => {
    expect(accountOptionLabel(manual)).toBe('Daily spending · Liquid · St George · Manual account')
    expect(accountOptionLabel(connected)).toBe('Up Saver · Savings · Up Bank · Bank connected')
    expect(accountIdentityLabel(manual)).toBe('St George · •••• 3965')
    expect(accountImportStatus(connected)).toBe('Bank connected')
  })

  it('is honest when no identifier is available', () => {
    const unidentified = { ...manual, institution: undefined, identifier: undefined }
    expect(accountIdentityLabel(unidentified))
      .toBe('No institution or identifier saved')
    expect(accountOptionLabel(unidentified))
      .toBe('Daily spending · Liquid · No identifier saved · Manual account')
  })
})
