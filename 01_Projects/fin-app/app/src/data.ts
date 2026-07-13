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
  /** Optional sub-category, drawn from `CATEGORY_TAXONOMY[cat]`. Omitted on
   *  inflow (Income) rows. */
  subcat?: string
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
    // categories are the canonical taxonomy keys (see CATEGORY_TAXONOMY)
    { category: 'Housing', spent: 2100, budget: 2400 },
    { category: 'Food', spent: 680, budget: 750 },
    { category: 'Transport', spent: 410, budget: 400 },
    { category: 'Utilities', spent: 290, budget: 350 },
    { category: 'Subscriptions', spent: 96, budget: 120 },
    { category: 'Retail', spent: 320, budget: 600 },
  ] as Shield[],
  transactions: [
    // Reverse-chronological across the trailing 12-month window. Outflows carry a
    // canonical `cat` + `subcat` (see CATEGORY_TAXONOMY) so the Expenses filters
    // return meaningful results; inflow (Income) rows are preserved so the Income
    // deposits ledger + source shares stay populated as the range changes.
    // ── current month (Jul)
    { date: '07.07', merchant: 'Forge Coffee Outpost', cat: 'Food', subcat: 'Coffee', amount: -5.8 },
    { date: '07.06', merchant: 'Titan Market // Provisions', cat: 'Food', subcat: 'Groceries', amount: -76.4 },
    { date: '07.05', merchant: 'Metro Rideshare', cat: 'Transport', subcat: 'Rideshare', amount: -24.3 },
    { date: '07.03', merchant: 'Helios Energy // Grid', cat: 'Utilities', subcat: 'Power', amount: -138.2 },
    { date: '07.02', merchant: 'Nimbus Cloud // Software', cat: 'Subscriptions', subcat: 'Software', amount: -29.0 },
    { date: '07.01', merchant: 'Habitat // Rent Transfer', cat: 'Housing', subcat: 'Rent', amount: -2100.0 },
    // ── Jun
    { date: '06.22', merchant: 'Fuel Depot // Vehicle', cat: 'Transport', subcat: 'Fuel', amount: -71.1 },
    { date: '06.18', merchant: 'Lumen Electronics', cat: 'Retail', subcat: 'Electronics', amount: -329.99 },
    { date: '06.16', merchant: 'Vanguard // Brokerage', cat: 'Investing', subcat: 'Brokerage', amount: -600.0 },
    { date: '06.14', merchant: 'Titan Market // Provisions', cat: 'Food', subcat: 'Groceries', amount: -84.2 },
    { date: '06.13', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '06.13', merchant: 'Helios Energy // Grid', cat: 'Utilities', subcat: 'Power', amount: -142.66 },
    { date: '06.12', merchant: 'Oracle Contract // Payout', cat: 'Income', amount: 1200.0 },
    { date: '06.12', merchant: 'Fuel Depot // Vehicle', cat: 'Transport', subcat: 'Fuel', amount: -68.4 },
    { date: '06.11', merchant: 'Nova Stream // Uplink', cat: 'Subscriptions', subcat: 'Streaming', amount: -15.99 },
    { date: '06.10', merchant: 'Habitat // Rent Transfer', cat: 'Housing', subcat: 'Rent', amount: -2100.0 },
    { date: '06.09', merchant: 'Forge Coffee Outpost', cat: 'Food', subcat: 'Coffee', amount: -6.75 },
    { date: '06.08', merchant: 'Index Fund // Auto-Invest', cat: 'Investing', subcat: 'Auto-invest', amount: -1000.0 },
    { date: '06.07', merchant: 'Armory Outfitters', cat: 'Retail', subcat: 'Apparel', amount: -212.3 },
    { date: '06.04', merchant: 'Aqua Utility // Water', cat: 'Utilities', subcat: 'Water', amount: -58.4 },
    // ── May
    { date: '05.30', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '05.27', merchant: 'Grove Grocers', cat: 'Food', subcat: 'Groceries', amount: -112.85 },
    { date: '05.20', merchant: 'Helios Energy // Grid', cat: 'Utilities', subcat: 'Power', amount: -131.4 },
    { date: '05.18', merchant: 'Habitat // Rent Transfer', cat: 'Housing', subcat: 'Rent', amount: -2100.0 },
    { date: '05.16', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '05.12', merchant: 'Nexus Mobile // Plan', cat: 'Utilities', subcat: 'Mobile', amount: -45.0 },
    { date: '05.09', merchant: 'CityRail // Transit', cat: 'Transport', subcat: 'Transit', amount: -32.0 },
    { date: '05.06', merchant: 'Ember Bistro', cat: 'Food', subcat: 'Dining', amount: -63.5 },
    { date: '05.02', merchant: 'Oracle Contract // Payout', cat: 'Income', amount: 1200.0 },
    // ── Apr
    { date: '04.24', merchant: 'Index Fund // Auto-Invest', cat: 'Investing', subcat: 'Auto-invest', amount: -1000.0 },
    { date: '04.18', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '04.15', merchant: 'Habitat // Rent Transfer', cat: 'Housing', subcat: 'Rent', amount: -2100.0 },
    { date: '04.10', merchant: 'Habitat Insurance // Home', cat: 'Housing', subcat: 'Insurance', amount: -96.0 },
    { date: '04.08', merchant: 'Volt Rideshare', cat: 'Transport', subcat: 'Rideshare', amount: -18.75 },
    { date: '04.04', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    // ── Mar
    { date: '03.31', merchant: 'RSU Vesting // Equity', cat: 'Income', amount: 2400.0 },
    { date: '03.21', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '03.19', merchant: 'Habitat // Rent Transfer', cat: 'Housing', subcat: 'Rent', amount: -2100.0 },
    { date: '03.14', merchant: 'Dividend // Brokerage', cat: 'Income', amount: 350.0 },
    { date: '03.11', merchant: 'Beacon Broadband', cat: 'Utilities', subcat: 'Internet', amount: -79.0 },
    { date: '03.05', merchant: 'Summit Apparel Co', cat: 'Retail', subcat: 'Apparel', amount: -158.2 },
    // ── Feb
    { date: '02.20', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '02.16', merchant: 'Habitat // Rent Transfer', cat: 'Housing', subcat: 'Rent', amount: -2050.0 },
    { date: '02.09', merchant: 'Cellar Fine Foods', cat: 'Food', subcat: 'Dining', amount: -88.9 },
    // ── Jan
    { date: '01.23', merchant: 'Payroll Deposit', cat: 'Income', amount: 3450.0 },
    { date: '01.14', merchant: 'Habitat // Rent Transfer', cat: 'Housing', subcat: 'Rent', amount: -2050.0 },
    { date: '01.07', merchant: 'Nimbus Cloud // Software', cat: 'Subscriptions', subcat: 'Software', amount: -29.0 },
    // ── prior year (Aug–Dec)
    { date: '12.20', merchant: 'Homestead Depot', cat: 'Retail', subcat: 'Home', amount: -204.6 },
    { date: '12.05', merchant: 'Fixit Home Repair', cat: 'Housing', subcat: 'Maintenance', amount: -175.0 },
    { date: '11.15', merchant: 'Habitat // Rent Transfer', cat: 'Housing', subcat: 'Rent', amount: -2050.0 },
    { date: '10.09', merchant: 'Brew & Bean', cat: 'Food', subcat: 'Coffee', amount: -7.2 },
    { date: '09.03', merchant: 'Orbit Parking // CBD', cat: 'Transport', subcat: 'Parking', amount: -20.0 },
    { date: '08.22', merchant: 'Vertex Gym // Membership', cat: 'Subscriptions', subcat: 'Memberships', amount: -49.0 },
  ] as Txn[],
  achievements: [
    { id: 'debtfree', title: 'Debt-Free Specialist', points: 100, sub: 'Sapphire credit line cleared' },
    { id: 'reserve', title: 'Fortified Reserve', points: 75, sub: '6-month emergency fund secured' },
    { id: 'maxira', title: 'Retirement Ascendant', points: 150, sub: 'Roth IRA maxed for the cycle' },
  ] as Achievement[],
}

/* Canonical expense taxonomy: category → ordered sub-categories. Drives the
   Expenses transaction filters and the `subcat` values on outflow transactions.
   `Income` is an inflow bucket and is intentionally excluded. */
export const CATEGORY_TAXONOMY: Record<string, string[]> = {
  Food: ['Groceries', 'Dining', 'Coffee'],
  Housing: ['Rent', 'Maintenance', 'Insurance'],
  Transport: ['Fuel', 'Rideshare', 'Transit', 'Parking'],
  Utilities: ['Power', 'Water', 'Internet', 'Mobile'],
  Subscriptions: ['Streaming', 'Software', 'Memberships'],
  Retail: ['Apparel', 'Electronics', 'Home'],
  Investing: ['Auto-invest', 'Brokerage'],
}
export const EXPENSE_CATEGORIES = Object.keys(CATEGORY_TAXONOMY)

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
