import { useState } from 'react'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import CSVUploader from '../components/CSVUploader'
import InvestmentCSVUploader from '../components/InvestmentCSVUploader'
import { useData } from '../contexts/DataContext'
import { useView } from '../router'
import {
  INITIAL_TARGET_ACCOUNT_ID,
  accountIdentityLabel,
  accountImportStatus,
  accountOptionLabel,
  selectTargetAccount,
} from '../lib/ingestion/accountSelection'

/**
 * Full-page ingestion portal (SRD §6.E).
 *
 * This view used to carry an entirely separate CSV implementation — its own
 * parser, its own date handling, no AI, no batch id, and an account picked as
 * `accounts[0]` ("for MVP, we will just fetch the first account"). That meant
 * imports landed in whichever account the database returned first and could
 * never be undone.
 *
 * It is now a host for the one shared engine, plus the account selector that
 * was missing. All parsing, categorisation and dedupe live in CSVUploader and
 * lib/csv/.
 */
export default function Ingestion() {
  const { accounts } = useData()
  const { go } = useView()
  const [accountId, setAccountId] = useState<string>(INITIAL_TARGET_ACCOUNT_ID)
  const [importActive, setImportActive] = useState(false)

  const account = accounts.find((a) => a.id === accountId)

  return (
    <Screen>
      <ViewHeader
        index="05 — Ingestion"
        title="Ingestion"
        sub="Import statements, categorise, reconcile balances"
      />
      <Grid>
        <Tile title="Target account" span={3} className="workflow-surface">
          {accounts.length === 0 ? (
            <p className="text-[13px] text-muted">
              Create an account before importing — transactions have to belong to one.
            </p>
          ) : (
            <div className="grid gap-2 pt-1">
              <label className="grid gap-1.5 sm:max-w-[520px]">
                <span className="micro text-muted">Import into</span>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId((current) => selectTargetAccount(current, e.target.value, importActive))}
                  disabled={importActive}
                  aria-describedby="target-account-help"
                  className="min-h-11 rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[14px] outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="" disabled>Choose an account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{accountOptionLabel(a)}</option>
                  ))}
                </select>
              </label>
              {account ? (
                <div className="grid gap-1 rounded-[10px] border border-[var(--hair)] bg-black/[0.02] px-3 py-2 text-[13px] text-ink2 sm:max-w-[520px]">
                  <span><strong className="text-ink">{account.name}</strong> · {account.type}</span>
                  <span>{accountIdentityLabel(account)} · {accountImportStatus(account)}</span>
                </div>
              ) : null}
              <p id="target-account-help" className="text-[13px] text-ink2">
                {importActive
                  ? 'Target locked while this file is being prepared. Cancel or finish the import to choose another account.'
                  : account
                    ? 'Rows are matched against this account only; duplicate statements are detected and skipped.'
                    : 'Choose the ledger this statement belongs to before selecting a file.'}
              </p>
            </div>
          )}
        </Tile>

        {!account && accounts.length > 0 && (
          <Tile title="Statement upload" span={3} className="workflow-surface">
            <p className="text-[13px] text-muted">
              Choose a target account above to open its statement importer and upload history.
            </p>
          </Tile>
        )}

        {account && (
          <Tile title="Statement upload" span={3} className="workflow-surface">
            {account.type === 'Invest' ? (
              <InvestmentCSVUploader
                key={account.id}
                accountId={account.id}
                accountName={account.name}
                onImportStateChange={setImportActive}
                onReviewTransfers={() => go('transfers')}
              />
            ) : (
              <CSVUploader
                key={account.id}
                accountId={account.id}
                accountName={account.name}
                accountType={account.type}
                isConnected={Boolean(account.connectionId || account.balanceSource === 'bank_provider')}
                cutoverDate={account.cutoverDate}
                onImportStateChange={setImportActive}
                onReviewTransfers={() => go('transfers')}
              />
            )}
          </Tile>
        )}
      </Grid>
    </Screen>
  )
}
