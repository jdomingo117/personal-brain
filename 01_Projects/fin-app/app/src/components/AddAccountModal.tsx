import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './Controls'

type Props = {
  isOpen: boolean
  onClose: () => void
}

type AccountType = 'Liquid' | 'Savings' | 'Invest' | 'Credit Card' | 'Loan'

const TYPE_DESCRIPTIONS: Record<AccountType, string> = {
  Liquid: "Everyday transactional accounts like your checking account. Funds are highly accessible.",
  Savings: "Accounts intended for storing money. Typically earns interest with limited withdrawals.",
  Invest: "Brokerage accounts, superannuation, or other investment vehicles subject to market volatility.",
  'Credit Card': "Revolving line of credit. Highly active, usually paid off monthly.",
  Loan: "Amortizing debt like a mortgage or car loan. Slowly paid off over time."
}

export default function AddAccountModal({ isOpen, onClose }: Props) {
  const { refreshData } = useData()
  const { tenantId } = useAuth()
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('Savings')
  const [balance, setBalance] = useState('0')
  const [limit, setLimit] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Account name is required')
      return
    }

    setLoading(true)
    try {
      // Balance is input as dollars, needs to be cents in the DB
      const parsedCents = Math.round(parseFloat(balance || '0') * 100)
      const isLiability = ['Credit Card', 'Loan', 'Debt'].includes(type)
      const finalCents = isLiability ? -Math.abs(parsedCents) : Math.abs(parsedCents)
      const limitCents = limit ? Math.round(parseFloat(limit) * 100) : undefined

      const { data: account, error: fnError } = await supabase.functions.invoke('upsert-account', {
        body: {
          name: name.trim(),
          type,
          balance: finalCents,
          ...(limitCents !== undefined && { credit_limit: limitCents })
        }
      })

      if (fnError) throw fnError

      // Strictly best-effort, and deliberately never fatal. The account is
      // already created by this point, so letting a failed identifier write
      // surface as an error would show "failed" for work that succeeded — and
      // the obvious user response, retrying, would create a second account.
      // A missing identifier only costs matching strength, and the linker
      // infers it back from the first confirmed pair anyway.
      const digits = identifier.replace(/\D/g, '')
      if (digits && tenantId && account?.id) {
        const { error: idErr } = await supabase.from('account_identifiers').insert({
          tenant_id: tenantId,
          account_id: account.id,
          kind: digits.length <= 6 ? 'mask' : 'account_number',
          value: digits,
          source: 'user',
        })
        if (idErr) console.error('account identifier not saved', idErr.message)
      }

      await refreshData()
      handleClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName('')
    setType('Savings')
    setBalance('0')
    setLimit('')
    setIdentifier('')
    setError('')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-black/5"
          >
            <div className="p-6">
              <h2 className="text-[18px] font-bold tracking-tight text-ink">Add Account</h2>
              <p className="mt-1 text-[13px] text-muted">Initialize a new ledger for your portfolio.</p>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold tracking-wide text-ink2 uppercase">Account Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Macquarie Savings"
                    className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-accent"
                    autoFocus
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold tracking-wide text-ink2 uppercase">Account Type</span>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as AccountType)}
                    className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-accent appearance-none cursor-pointer"
                  >
                    <option value="Liquid">Liquid</option>
                    <option value="Savings">Savings</option>
                    <option value="Invest">Invest</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Loan">Loan</option>
                  </select>
                  <p className="mt-1.5 text-[12.5px] text-muted leading-relaxed">
                    {TYPE_DESCRIPTIONS[type]}
                  </p>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold tracking-wide text-ink2 uppercase">Initial Balance ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={balance}
                    onChange={e => setBalance(e.target.value)}
                    onFocus={e => {
                      if (e.target.value === '0') setBalance('')
                    }}
                    onBlur={e => {
                      if (!e.target.value) setBalance('0')
                    }}
                    className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-accent font-mono"
                  />
                </label>

                {type === 'Credit Card' && (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-semibold tracking-wide text-ink2 uppercase">Credit Limit ($) (Optional)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={limit}
                      onChange={e => setLimit(e.target.value)}
                      placeholder="e.g. 10000"
                      className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-accent font-mono"
                    />
                  </label>
                )}

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold tracking-wide text-ink2 uppercase">Last 4 digits (Optional)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="e.g. 3692"
                    className="rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-accent font-mono"
                  />
                  <p className="mt-1.5 text-[12.5px] text-muted leading-relaxed">
                    Helps the transfer linker recognise this account from another
                    bank's description of it (e.g. "Linked Account Xx3692").
                  </p>
                </label>

                {error && (
                  <div className="rounded-lg bg-red-500/10 p-3 text-[13px] text-red-500 font-medium">
                    {error}
                  </div>
                )}

                <div className="mt-2 flex items-center justify-end gap-3 border-t border-[var(--hair-soft)] pt-5">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-[13px] font-semibold text-muted hover:text-ink transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <Button type="submit" disabled={loading || !name.trim()}>
                    {loading ? 'Adding...' : 'Add Account'}
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
