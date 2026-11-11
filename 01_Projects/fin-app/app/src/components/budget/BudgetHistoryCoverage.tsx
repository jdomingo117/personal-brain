import { useEffect, useState, type FormEvent } from 'react'
import { Button, DateInput, Select } from '../Controls'
import { useBudget } from '../../contexts/BudgetContext'
import type { BudgetCoverage } from '../../lib/budgetWorkspace'

export default function BudgetHistoryCoverage() {
  const b = useBudget()
  const accounts = b.snapshot?.accounts.filter(account => account.currency === 'AUD') ?? []
  const [selected, setSelected] = useState('')
  const accountId = accounts.some(account => account.id === selected) ? selected : ''
  return <section className="space-y-4" aria-label="Account history dates">
    <h4 className="font-semibold" tabIndex={-1}>Account history dates</h4>
    <p className="body-copy">Confirm a date range only if all activity for that account is recorded for those dates, including days with no transactions. Budget can use those dates for suggestions and forecasts.</p>
    {accounts.length === 0 ? <p className="body-copy text-muted">There are no AUD accounts to confirm. You can still plan manually.</p> : <>
      <fieldset disabled={b.busy || !!b.pending}><label className="grid min-w-0 gap-2"><span className="field-label">Account to confirm</span>
        <Select value={accountId} onChange={setSelected} ariaLabel="Account to confirm">
          <option value="">Choose an account</option>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </Select>
      </label></fieldset>
      {accountId && <AccountCoverage key={accountId} accountId={accountId}/>}
    </>}
  </section>
}

function AccountCoverage({ accountId }: { accountId: string }) {
  const b = useBudget()
  const readCoverage = b.coverage, source = b.snapshot?.source_revision
  const [data, setData] = useState<BudgetCoverage | null>(null)
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  const [first, setFirst] = useState(''), [last, setLast] = useState('')
  const [confirmed, setConfirmed] = useState(false), [formError, setFormError] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    setData(null); setError('')
    void readCoverage(accountId).then(value => { if (current) setData(value) }, reason => {
      if (current) setError(reason instanceof Error ? reason.message : 'Could not load history confirmations.')
    })
    return () => { current = false }
  }, [accountId, source, attempt, readCoverage])
  const fresh = !!data && data.source_revision === source && b.readState === 'ready'
  const writable = b.canWrite && fresh
  const coverageNotice = b.notice.startsWith('Account history dates confirmed.') || b.notice.startsWith('History confirmation removed.')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!data || !writable || !confirmed) return
    if (!first || !last || first > last || last > data.latest_date) {
      setFormError('Enter a first and last date in order, ending today or earlier.')
      return
    }
    setFormError('')
    if (await b.run({action:'confirm_coverage', account_id:accountId, first_date:first, last_date:last, confirmed:true})) {
      setFirst(''); setLast(''); setConfirmed(false)
    }
  }
  return <div className="space-y-4">
    {coverageNotice && <p role="status" className="body-copy">{b.notice}</p>}
    {error ? <div className="space-y-2"><p role="alert">{error}</p><Button variant="ghost" onClick={() => setAttempt(n => n + 1)}>Try loading confirmations again</Button></div>
      : !data ? <p role="status" className="body-copy">Loading confirmed dates…</p>
      : !fresh ? <div className="space-y-2"><p role="status">Refresh Budget before changing these confirmations.</p><Button variant="ghost" disabled={b.loading || b.busy} onClick={() => void b.refresh()}>Refresh Budget</Button></div>
      : <>
        <section className="space-y-2" aria-label="Saved history confirmations">
          <h4 className="font-semibold">Your confirmed dates</h4>
          {data.confirmations.length === 0 ? <p className="body-copy text-muted">You haven’t confirmed any dates for this account.</p> : <ul className="space-y-3">
            {data.confirmations.map(range => <li key={range.id} className="outcome-panel space-y-2">
              <p className="body-copy"><strong>{range.first_date} to {range.last_date}</strong> · Confirmed by you</p>
              {removing === range.id ? <>
                <p className="detail-copy">Remove this confirmation if these dates aren’t complete. Suggestions or forecasts that need this history may become unavailable.</p>
                <div className="flex flex-wrap gap-2"><Button disabled={!writable} onClick={async () => {
                  if (await b.run({action:'revoke_coverage', coverage_id:range.id})) setRemoving(null)
                }}>Remove these dates</Button><Button variant="ghost" disabled={b.busy} onClick={() => setRemoving(null)}>Keep confirmation</Button></div>
              </> : <Button variant="ghost" disabled={!writable} ariaLabel={`Remove confirmation for ${range.first_date} to ${range.last_date}`} onClick={() => setRemoving(range.id)}>Remove confirmation</Button>}
            </li>)}
          </ul>}
        </section>
        <form className="space-y-3" onSubmit={event => void save(event)}>
          <h4 className="font-semibold">Confirm another date range</h4>
          <p className="detail-copy text-muted">Both dates are included. You can confirm up to 10 years at a time.</p>
          <fieldset disabled={!writable} className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-2"><span className="field-label">First complete date</span>
              <DateInput className="budget-input min-w-0" ariaLabel="First complete date" value={first} max={last || data.latest_date} onChange={date => { setFirst(date); setConfirmed(false); setFormError('') }}/>
            </label>
            <label className="grid min-w-0 gap-2"><span className="field-label">Last complete date</span>
              <DateInput className="budget-input min-w-0" ariaLabel="Last complete date" value={last} min={first || undefined} max={data.latest_date} onChange={date => { setLast(date); setConfirmed(false); setFormError('') }}/>
            </label>
            <label className="flex min-h-11 items-center gap-3 body-copy sm:col-span-2">
              <input type="checkbox" checked={confirmed} disabled={!first || !last} onChange={event => setConfirmed(event.target.checked)}/>
              I checked that all activity for this account is recorded for these dates.
            </label>
          </fieldset>
          {formError && <p role="alert" className="text-neg">{formError}</p>}
          <Button type="submit" disabled={!writable || !confirmed}>Confirm history dates</Button>
        </form>
      </>}
  </div>
}
