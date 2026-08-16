import type { Account } from '../../data'

export const INITIAL_TARGET_ACCOUNT_ID = ''

export function selectTargetAccount(currentId: string, nextId: string, importActive: boolean): string {
  return importActive ? currentId : nextId
}

export function accountImportStatus(account: Account): string {
  if (account.connectionId || account.balanceSource === 'bank_provider') return 'Bank connected'
  if (account.balanceSource === 'investment_valuation') return 'Valuation managed'
  return 'Manual account'
}

export function accountOptionLabel(account: Account): string {
  const identity = account.institution ?? account.identifier ?? 'No identifier saved'
  return [account.name, account.type, identity, accountImportStatus(account)]
    .join(' · ')
}

export function accountIdentityLabel(account: Account): string {
  if (account.institution && account.identifier) return `${account.institution} · ${account.identifier}`
  return account.institution ?? account.identifier ?? 'No institution or identifier saved'
}
