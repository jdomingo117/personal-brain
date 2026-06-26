import { useState } from 'react'
import { motion } from 'framer-motion'
import { Screen, ViewHeader } from '../components/Screen'
import Tile from '../components/Tile'
import Stat from '../components/Stat'
import Area from '../components/charts/Area'
import Bar from '../components/charts/Bar'
import AllocationDonut from '../components/AllocationDonut'
import Ledger from '../components/Ledger'
import { data, fmtCents, glowColor, type Glow, type Txn } from '../data'
import { gridStagger } from '../components/motion'

interface AccountDetail {
  income: number
  expenses: number
  trend: number[]
  categories: { label: string; value: number; glow: Glow }[]
}

const getAccountDetails = (name: string, balance: number): AccountDetail => {
  // Hash the name to generate deterministic, realistic mock data per account
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const seed = Math.abs(hash)

  // Generate deterministic mock values (positive income and expenses)
  const income = 1500 + (seed % 3500)
  const expenses = 300 + (seed % 1000)

  // Trend: base it around the current balance and walk backwards
  const trend: number[] = []
  let curr = balance
  for (let i = 0; i < 11; i++) {
    trend.unshift(curr)
    // Walk back with a deterministic pseudo-random walk
    curr -= (income - expenses) / 11 + ((seed + i) % 200) - 100
  }
  trend.unshift(curr) // 12 months total

  // Categories
  const categories = [
    { label: 'Transportation', value: Math.round(expenses * 0.35), glow: 'blue' as const },
    { label: 'Food & Beverage', value: Math.round(expenses * 0.30), glow: 'green' as const },
    { label: 'Uncategorized', value: Math.round(expenses * 0.18), glow: 'red' as const },
    { label: 'Bills & Utilities', value: Math.round(expenses * 0.12), glow: 'amber' as const },
    { label: 'Entertainment & Leisure', value: Math.round(expenses * 0.05), glow: 'cyan' as const },
  ]

  return {
    income,
    expenses,
    trend,
    categories,
    seed
  }
}

const getAccountTransactions = (seed: number): Txn[] => {
  const categories = ['Food', 'Utility', 'Transit', 'Income', 'Subs', 'Housing', 'Invest', 'Retail']
  const txns: Txn[] = []
  let currentDate = new Date('2026-06-14')
  
  for (let i = 0; i < 48; i++) {
    const isIncome = (seed + i) % 7 === 0
    const cat = isIncome ? 'Income' : categories[(seed + i) % categories.length]
    const amount = isIncome ? 500 + ((seed * i) % 2000) : -10 - ((seed * i) % 150)
    const dateStr = `${(currentDate.getMonth() + 1).toString().padStart(2, '0')}.${currentDate.getDate().toString().padStart(2, '0')}`
    
    txns.push({
      date: dateStr,
      merchant: isIncome ? 'Deposit / Transfer' : `Merchant ${(seed + i) % 100}`,
      cat,
      amount
    })
    currentDate.setDate(currentDate.getDate() - (1 + ((seed + i) % 3)))
  }
  return txns
}

export default function Accounts() {
  const [selectedAccount, setSelectedAccount] = useState(data.accounts[0])
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')
  
  // Filter States
  const [page, setPage] = useState(0)
  const [filterCat, setFilterCat] = useState<string | 'All'>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterFlow, setFilterFlow] = useState<'All' | 'Income' | 'Expense'>('All')
  const [timeframe, setTimeframe] = useState('All Time')

  const details = getAccountDetails(selectedAccount.name, selectedAccount.balance)
  const netCashFlow = details.income - details.expenses
  const dates = ['07 Apr', '10 Apr', '13 Apr', '16 Apr', '19 Apr', '22 Apr', '25 Apr', '28 Apr', '01 May', '04 May', '06 May', '08 May']

  const txns = getAccountTransactions(details.seed)
  const allCategories = ['All', ...Array.from(new Set(txns.map(t => t.cat))).sort()]
  
  const filteredTxns = txns.filter(t => {
    // 1. Category Filter
    if (filterCat !== 'All' && t.cat !== filterCat) return false
    
    // 2. Flow Filter
    if (filterFlow === 'Income' && t.amount < 0) return false
    if (filterFlow === 'Expense' && t.amount >= 0) return false
    
    // 3. Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (!t.merchant.toLowerCase().includes(q) && !t.cat.toLowerCase().includes(q)) return false
    }
    
    // Note: Timeframe filter ('All Time', 'This Month', etc.) is visual-only for this mock
    // since the data only spans a few weeks. It sets up the UI structure for the real backend.
    
    return true
  })

  const itemsPerPage = 8
  const pageCount = Math.max(1, Math.ceil(filteredTxns.length / itemsPerPage))
  
  // ensure page is valid when filters change
  const validPage = Math.min(page, pageCount - 1)
  const paginatedTxns = filteredTxns.slice(validPage * itemsPerPage, (validPage + 1) * itemsPerPage)

  return (
    <Screen>
      {/* ViewHeader remains consistent with the rest of the application */}
      <ViewHeader index="02 — Wealth" title="Accounts" sub="Holdings, allocation & trajectory" />

      {/* Account Selector Row (Dropdown & Add Account Button) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 mt-4 pb-3 border-b border-[var(--hair-soft)]">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Select Account</span>
          <div className="relative">
            <select
              value={selectedAccount.name}
              onChange={(e) => {
                const found = data.accounts.find((a) => a.name === e.target.value)
                if (found) setSelectedAccount(found)
              }}
              className="appearance-none pr-8 pl-3.5 py-2 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] text-[12.5px] font-semibold outline-none cursor-pointer focus:border-accent transition duration-200"
            >
              {data.accounts.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
            {/* Dropdown Chevron */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
          <div className="text-[11px] text-muted sm:ml-2.5 uppercase tracking-[0.04em]">
            Ingestion: <strong className="text-ink2">CSV_{selectedAccount.name.split(' ')[0].toUpperCase()}</strong>
          </div>
        </div>

        <button className="micro bg-ink text-surface hover:-translate-y-px hover:shadow-lg rounded-lg px-4 py-2 transition duration-200 cursor-pointer">
          + Add Account
        </button>
      </div>

      {/* Grid Container */}
      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mt-5 grid grid-cols-1 gap-3.5"
      >
        
        {/* ROW 1: Four KPI Hero Cards (Standard Design System Stats) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          <Tile>
            <Stat
              label="Vault Balance"
              value={fmtCents(selectedAccount.balance)}
              delta="Authoritative ledger balance"
              small
            />
          </Tile>

          <Tile>
            <Stat
              label="Income (Period)"
              value={"+" + fmtCents(details.income)}
              delta="Sum of deposits in range"
              dir="up"
              small
            />
          </Tile>

          <Tile>
            <Stat
              label="Expenses (Period)"
              value={"-" + fmtCents(details.expenses)}
              delta="Sum of charges in range"
              dir="down"
              small
            />
          </Tile>

          <Tile>
            <Stat
              label="Net Cash Flow"
              value={(netCashFlow >= 0 ? "+" : "-") + fmtCents(Math.abs(netCashFlow))}
              delta="Income minus expenses"
              dir={netCashFlow >= 0 ? "up" : "down"}
              small
            />
          </Tile>
        </div>

        {/* ROW 2: Two Plot Cards (55% / 45% splits) */}
        <div className="flex flex-col xl:flex-row gap-3.5 mt-1.5">
          {/* Left Plot: Chronological Net Balance Trend */}
          <div className="w-full xl:w-[55%] flex-shrink-0 flex flex-col">
            <Tile 
              title="Chronological Net Balance Trend" 
              tag={
                <div className="flex items-center gap-1.5 -my-1">
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold tracking-[0.06em] uppercase transition ${
                      chartType === 'line'
                        ? 'bg-ink text-surface'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold tracking-[0.06em] uppercase transition ${
                      chartType === 'bar'
                        ? 'bg-ink text-surface'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Bar
                  </button>
                </div>
              }
              className="h-full pb-3.5"
            >
              <div className="mt-2">
                {chartType === 'line' ? (
                  <Area
                    key={selectedAccount.name + 'line'} // Force re-render on account swap for visual reveal animations
                    series={[{ data: details.trend, color: glowColor[selectedAccount.glow as Glow] }]}
                    labels={dates}
                    height={240}
                  />
                ) : (
                  <Bar
                    key={selectedAccount.name + 'bar'} // Force re-render on account swap for visual reveal animations
                    series={[{ data: details.trend, color: glowColor[selectedAccount.glow as Glow] }]}
                    labels={dates}
                    height={240}
                  />
                )}
              </div>
            </Tile>
          </div>

          {/* Right Plot: Expense Category Distribution */}
          <div className="w-full xl:flex-1 flex flex-col">
            <Tile title="Expense Category Distribution" className="h-full pb-3.5">
              <AllocationDonut
                key={selectedAccount.name} // Force re-render on account swap
                data={details.categories}
                totalLabel="Total Expenses"
              />
            </Tile>
          </div>
        </div>

        {/* ROW 3: Ledger with Filters and Pagination */}
        <div className="w-full">
          <Tile title="Account Ledger" className="w-full">
            {/* Advanced Filters */}
            <div className="mb-6 flex flex-col gap-4 border-b border-[var(--hair-soft)] pb-5">
              
              {/* Quick Timeframe Selectors */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-muted"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Quick Timeframe Selectors</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {['All Time', 'This Week', 'This Month', 'Last Month', 'Last 3 Months', 'This Year YTD', 'Financial YTD'].map(tf => (
                    <button
                      key={tf}
                      onClick={() => { setTimeframe(tf); setPage(0) }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.04em] transition-colors duration-200 cursor-pointer whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-accent/50 ${
                        timeframe === tf 
                          ? 'bg-ink text-surface shadow-sm' 
                          : 'bg-black/[0.03] dark:bg-white/[0.03] text-muted hover:text-ink hover:bg-black/[0.06] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inputs Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Search */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">Search Description</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Filter by keyword..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setPage(0) }}
                      className="w-full bg-transparent border border-[var(--hair)] rounded-lg pl-9 pr-3 py-2 text-[12px] font-medium placeholder:text-muted/60 focus:outline-none focus:border-accent transition duration-200"
                    />
                  </div>
                </div>

                {/* Transaction Type */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">Transaction Type</label>
                  <div className="relative">
                    <select
                      value={filterFlow}
                      onChange={(e) => { setFilterFlow(e.target.value as any); setPage(0) }}
                      className="w-full appearance-none bg-transparent border border-[var(--hair)] rounded-lg pl-3 pr-8 py-2 text-[12px] font-medium focus:outline-none focus:border-accent transition duration-200 cursor-pointer"
                    >
                      <option value="All">All Flows</option>
                      <option value="Income">Income (Credits)</option>
                      <option value="Expense">Expense (Debits)</option>
                    </select>
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                  </div>
                </div>

                {/* Category */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">Category</label>
                  <div className="relative">
                    <select
                      value={filterCat}
                      onChange={(e) => { setFilterCat(e.target.value); setPage(0) }}
                      className="w-full appearance-none bg-transparent border border-[var(--hair)] rounded-lg pl-3 pr-8 py-2 text-[12px] font-medium focus:outline-none focus:border-accent transition duration-200 cursor-pointer"
                    >
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
                      ))}
                    </select>
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ledger Table */}
            <div className="min-h-[300px]">
              {paginatedTxns.length > 0 ? (
                <Ledger rows={paginatedTxns} />
              ) : (
                <div className="py-10 text-center text-[13px] text-muted font-medium">No transactions found for this category.</div>
              )}
            </div>

            {/* Pagination Controls */}
            {pageCount > 1 && (
              <div className="mt-4 pt-3 border-t border-[var(--hair-soft)] flex items-center justify-between">
                <div className="text-[11.5px] font-semibold text-muted uppercase tracking-[0.04em]">
                  Showing {validPage * itemsPerPage + 1} - {Math.min((validPage + 1) * itemsPerPage, filteredTxns.length)} of {filteredTxns.length}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={validPage === 0}
                    className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--hair)] text-muted hover:text-ink hover:bg-[var(--hair-soft)] disabled:opacity-30 disabled:pointer-events-none transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50"
                    aria-label="Previous page"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <div className="text-[12px] font-bold tabular-nums text-ink px-2">
                    {validPage + 1} / {pageCount}
                  </div>
                  <button
                    onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                    disabled={validPage === pageCount - 1}
                    className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--hair)] text-muted hover:text-ink hover:bg-[var(--hair-soft)] disabled:opacity-30 disabled:pointer-events-none transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50"
                    aria-label="Next page"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </Tile>
        </div>

      </motion.div>
    </Screen>
  )
}
