export interface ConnectedImportRow {
  account_id: string
  date: string
  category: string
  subcategory?: string | null
}

export interface AccountCutover {
  account_id: string
  cutover_date: string
}

export type ConnectedImportViolation = {
  code: 'connected_account_reconciliation_forbidden' | 'connected_account_period_overlap'
  accountId: string
  cutoverDate: string
}

/** Pure policy behind the CSV/provider ownership seam. Kept separate from the
 * Edge Function so boundary dates and mixed-account batches have cheap unit
 * coverage; the Edge Function still obtains cutovers through caller-scoped
 * RLS before invoking it. */
export function connectedImportViolation(
  rows: ConnectedImportRow[],
  connections: AccountCutover[],
): ConnectedImportViolation | null {
  const cutoverByAccount = new Map(
    connections.map((connection) => [connection.account_id, connection.cutover_date]),
  )

  for (const row of rows) {
    const cutoverDate = cutoverByAccount.get(row.account_id)
    if (!cutoverDate) continue

    if (row.category === 'Transfer' && row.subcategory === 'Reconciliation') {
      return {
        code: 'connected_account_reconciliation_forbidden',
        accountId: row.account_id,
        cutoverDate,
      }
    }
    if (row.date >= cutoverDate) {
      return {
        code: 'connected_account_period_overlap',
        accountId: row.account_id,
        cutoverDate,
      }
    }
  }

  return null
}

