import { useEffect, useState } from 'react'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import CSVUploader from '../components/CSVUploader'
import OskoLinker from '../components/OskoLinker'
import { useData } from '../contexts/DataContext'

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
  const [accountId, setAccountId] = useState<string>('')

  useEffect(() => {
    // Default to the first account only as an initial UI value — the user can
    // change it, and nothing is written until they explicitly commit.
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  const account = accounts.find((a) => a.id === accountId)

  return (
    <Screen>
      <ViewHeader
        index="05 — Ingestion"
        title="Ingestion"
        sub="Import statements, categorise, reconcile"
      />
      <Grid>
        <Tile title="Target account" span={3}>
          {accounts.length === 0 ? (
            <p className="text-[13px] text-muted">
              Create an account before importing — transactions have to belong to one.
            </p>
          ) : (
            <div className="grid gap-2 pt-1">
              <label className="grid gap-1.5 sm:max-w-[340px]">
                <span className="micro text-muted">Import into</span>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="min-h-[42px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[14px] outline-none focus:border-accent"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} · {a.type}</option>
                  ))}
                </select>
              </label>
              <p className="text-[12px] text-muted">
                Rows are matched against this account only, so importing the same
                statement twice is detected and skipped.
              </p>
            </div>
          )}
        </Tile>

        {account && (
          <Tile title="Statement upload" span={3}>
            <CSVUploader
              key={account.id}
              accountId={account.id}
              accountName={account.name}
              accountType={account.type}
            />
          </Tile>
        )}

        <Tile title="Same-day transfer linker" span={3}>
          <OskoLinker />
        </Tile>
      </Grid>
    </Screen>
  )
}
