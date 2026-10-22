import React, { useContext, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DataContext } from '../../src/contexts/DataContext'
import { supabase } from '../../src/lib/supabaseClient'
import LedgerView from '../../src/views/LedgerView'
import type { Txn } from '../../src/data'
import '../../src/index.css'

const fixture: Txn[] = Array.from({ length: 570 }, (_, index) => ({
  id: `txn-${index}`, date: '2026-09-01', merchant: `Merchant ${String(index).padStart(3, '0')}`,
  merchantKey: 'fixture-merchant', cat: index === 1 ? 'Uncategorized' : 'Food & drink',
  subcat: index === 1 ? undefined : 'Coffee', kind: 'expense', kindSource: 'derived',
  amount: -1000, account_id: 'test-account', account: 'Test account', categorySource: 'ai',
  needsReview: index === 0,
}))

// The fixture is fully in-memory: this method never sends a request or writes a database.
const calls: Array<{ action: string; transaction_ids?: string[] }> = []
Object.assign(window, { ledgerFixtureCalls: calls })
const invoke = async (_name: string, options: { body: { action: string; transaction_ids?: string[] } }) => {
  calls.push(options.body)
  if ((window as unknown as { ledgerFixtureFailure?: boolean }).ledgerFixtureFailure && options.body.action === 'preview') return { data: null, error: { message: 'Simulated preview failure' } }
  if (options.body.action === 'apply') return { data: { updated: 1, operation_id: 'test-operation' }, error: null }
  const ids = options.body.transaction_ids ?? []
  return { data: {
    rows: ids.map((id, index) => {
      const row = fixture.find((transaction) => transaction.id === id)!
      const current = { category: row.cat, subcategory: row.subcat ?? null, source: 'ai', confidence: 0.8, needs_review: row.needsReview ?? false }
      return { transaction_id: id, date: row.date, merchant: row.merchant, current, proposed: index === 0 ? { ...current, category: 'Transport', subcategory: 'Fuel' } : null, status: index === 0 ? 'suggested' : 'unchanged', protection_reason: null }
    }),
    stats: { requested: ids.length, fromCache: 0, fromBank: 0, fromAi: 0, geminiCalls: 0, selected: ids.length, eligible: ids.length },
  }, error: null }
}
Object.defineProperty(supabase, 'functions', { value: { invoke } })

function Fixture() {
  const defaults = useContext(DataContext)
  const [transactions, setTransactions] = useState(new URLSearchParams(window.location.search).has('empty') ? [] : fixture)
  const refreshData = async () => setTransactions((current) => current.map((row, index) => index < 500 ? { ...row, categorySource: 'user' } : row))
  return <DataContext.Provider value={{ ...defaults, loadState: 'ready', transactions, refreshData }}><MemoryRouter><LedgerView /></MemoryRouter></DataContext.Provider>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
