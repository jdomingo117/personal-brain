/* Halcyon — typed mock dataset (ported from the vanilla data.js). */

export type Glow = 'green' | 'cyan' | 'blue' | 'amber' | 'red'
export type Status = 'healthy' | 'warning' | 'critical'

export interface Account {
  name: string
  type: string
  balance: number
  glow: Glow
}
export interface AllocationSlice {
  label: string
  value: number
  glow: Glow
}
export interface IncomeStream {
  source: string
  cadence: string
  amount: number
  glow: Glow
}
export interface Objective {
  name: string
  current: number
  target: number
  glow: Glow
  status: Status
}
export interface Shield {
  category: string
  spent: number
  budget: number
}
export interface Txn {
  date: string
  merchant: string
  cat: string
  amount: number
}
export interface Achievement {
  id: string
  title: string
  points: number
  sub: string
}

const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

export const data = {
  operator: {
    callsign: 'Alex Mercer',
    netWorth: 124500,
    netWorthDelta: 3.8,
    liquidCash: 18420.55,
    rank: { current: 'Vanguard', next: 'Sovereign', progress: 0.71, toNext: 2450 },
  },
  cashflow: {
    months,
    income: [7200, 7200, 7600, 7600, 8100, 9400, 8100, 8100, 8450, 8450, 8650, 8450],
    expense: [5100, 4820, 5300, 5650, 6100, 7200, 5400, 5210, 5980, 5440, 5710, 5610],
  },
  netWorthTrend: [101.2, 104.8, 106.1, 108.9, 110.4, 109.2, 113.6, 116.0, 118.7, 120.1, 122.4, 124.5],
  accounts: [
    { name: 'Operations Checking', type: 'Liquid', balance: 18420.55, glow: 'cyan' },
    { name: 'Reserve // High-Yield', type: 'Savings', balance: 42680.0, glow: 'green' },
    { name: 'Index Fund // VTSAX', type: 'Invest', balance: 71240.18, glow: 'green' },
    { name: 'Roth IRA', type: 'Invest', balance: 28910.4, glow: 'green' },
    { name: 'Sapphire Credit Line', type: 'Debt', balance: -4310.22, glow: 'amber' },
    { name: 'Auto Loan // Vehicle', type: 'Debt', balance: -12640.0, glow: 'red' },
  ] as Account[],
  allocation: [
    { label: 'Equities', value: 100150, glow: 'green' },
    { label: 'Cash', value: 18420, glow: 'cyan' },
    { label: 'Reserve', value: 42680, glow: 'blue' },
    { label: 'Crypto', value: 9300, glow: 'amber' },
  ] as AllocationSlice[],
  income: [
    // `amount` is per-cadence; normalised to a monthly-equivalent for share math.
    // Salary ties to the recurring $3,450 payroll deposits in `transactions`.
    { source: 'Primary Salary // Employer', cadence: 'Biweekly', amount: 3450, glow: 'green' },
    { source: 'Contract // Oracle', cadence: 'Monthly', amount: 1200, glow: 'blue' },
    { source: 'RSU Vesting // Equity', cadence: 'Quarterly', amount: 2400, glow: 'cyan' },
    { source: 'Dividend Yield', cadence: 'Quarterly', amount: 350, glow: 'amber' },
  ] as IncomeStream[],
  objectives: [
    { name: 'Emergency Reserve // 6mo', current: 28800, target: 36000, glow: 'green', status: 'healthy' },
    { name: 'Debt-Free', current: 33050, target: 50000, glow: 'amber', status: 'warning' },
    { name: 'Home Deposit', current: 41200, target: 120000, glow: 'cyan', status: 'healthy' },
  ] as Objective[],
  shields: [
    { category: 'Housing // Habitat', spent: 2100, budget: 2400 },
    { category: 'Provisions // Food', spent: 680, budget: 750 },
    { category: 'Transit // Fuel', spent: 410, budget: 400 },
    { category: 'Recreation', spent: 320, budget: 600 },
    { category: 'Utilities // Grid', spent: 290, budget: 350 },
    { category: 'Uplink // Subs', spent: 96, budget: 120 },
  ] as Shield[],
  transactions: [
    { date: '06.14', merchant: 'Titan Market // Provisions', cat: 'Food', amount: -84.2 },
    { date: '06.13', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '06.13', merchant: 'Helios Energy // Grid', cat: 'Utility', amount: -142.66 },
    { date: '06.12', merchant: 'Fuel Depot // Vehicle', cat: 'Transit', amount: -68.4 },
    { date: '06.12', merchant: 'Oracle Contract // Payout', cat: 'Income', amount: 1200.0 },
    { date: '06.11', merchant: 'Nova Stream // Uplink', cat: 'Subs', amount: -15.99 },
    { date: '06.10', merchant: 'Habitat // Rent Transfer', cat: 'Housing', amount: -2100.0 },
    { date: '06.09', merchant: 'Forge Coffee Outpost', cat: 'Food', amount: -6.75 },
    { date: '06.08', merchant: 'Index Fund // Auto-Invest', cat: 'Invest', amount: -1000.0 },
    { date: '06.07', merchant: 'Armory Outfitters', cat: 'Retail', amount: -212.3 },
    // Recurring inflow spread across the trailing window so the deposits ledger
    // and source shares stay populated as the date range changes.
    { date: '05.30', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '05.16', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '05.02', merchant: 'Oracle Contract // Payout', cat: 'Income', amount: 1200.0 },
    { date: '04.18', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '04.04', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '03.31', merchant: 'RSU Vesting // Equity', cat: 'Income', amount: 2400.0 },
    { date: '03.21', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '03.14', merchant: 'Dividend // Brokerage', cat: 'Income', amount: 350.0 },
    { date: '02.20', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '01.23', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
  ] as Txn[],
  achievements: [
    { id: 'debtfree', title: 'Debt-Free Specialist', points: 100, sub: 'Sapphire credit line cleared' },
    { id: 'reserve', title: 'Fortified Reserve', points: 75, sub: '6-month emergency fund secured' },
    { id: 'maxira', title: 'Retirement Ascendant', points: 150, sub: 'Roth IRA maxed for the cycle' },
  ] as Achievement[],
}

/* token-mapped colors for charts/legends keyed by `glow` */
export const glowColor: Record<Glow, string> = {
  green: 'var(--color-pos)',
  cyan: 'var(--color-accent)',
  blue: 'var(--color-blue)',
  amber: 'var(--color-warn)',
  red: 'var(--color-neg)',
}

export const fmt = (n: number) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString()
export const fmtCents = (n: number) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
