/* Halcyon — typed mock dataset (ported from the vanilla data.js). */

import type { Cadence } from './lib/cadence'
import type { SpendingNature, TransactionKind } from './lib/classification'

export type Glow = 'green' | 'cyan' | 'blue' | 'amber' | 'red'
export type Status = 'healthy' | 'warning' | 'critical'

export type Account = {
  id: string
  name: string
  type: 'Liquid' | 'Savings' | 'Invest' | 'Debt' | 'Credit Card' | 'Loan'
  balance: number // cents
  credit_limit?: number // cents
  glow: Glow
  balanceSource?: 'manual' | 'bank_provider' | 'investment_valuation'
  balanceAsOf?: string
  /** Display-only institution and masked identifier used to disambiguate import targets. */
  institution?: string
  identifier?: string
  /** Set when a provider (e.g. Up Bank) owns this account's balance and forward ledger from its cutover date. */
  connectionId?: string
  /** CSV imports may add history before this date; the provider owns this date and everything after it. */
  cutoverDate?: string
}
export interface AllocationSlice {
  label: string
  value: number
  glow: Glow
}
export interface IncomeStream {
  source: string
  cadence: Cadence
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
  id: string
  date: string
  merchant: string
  /** Stable normalised identity used by reusable merchant rules. */
  merchantKey?: string
  originalDescription?: string
  cat: string
  categoryId?: string
  subcat?: string
  subcategoryId?: string
  kind: TransactionKind
  kindSource?: 'derived' | 'user' | 'system'
  isRecurring?: boolean
  recurringSource?: 'derived' | 'user'
  isSubscription?: boolean
  subscriptionSource?: 'derived' | 'user'
  spendingNature?: SpendingNature
  isReimbursable?: boolean
  isTaxRelated?: boolean
  categorySource?: 'user' | 'bank' | 'ai' | 'seed' | null
  categoryConfidence?: number | null
  needsReview?: boolean
  amount: number
  account?: string
  account_id: string
  upload_batch_id?: string
  /** True when this leg is a confirmed/auto-linked/external internal transfer — excluded from spend/income analytics. */
  isTransfer?: boolean
  transferState?: 'auto' | 'suggested' | 'confirmed' | 'rejected' | 'external' | 'unmatched' | 'none'
  /** HELD at the provider — amount may still change on settlement. Shown in the ledger but excluded from analytics (already reflected, provisionally, in the account's balance). */
  pending?: boolean
  /** Split-reporting rows keep the bank transaction immutable and replace it only in analytics. */
  parentTransactionId?: string
  isAllocation?: boolean
  allocationNote?: string
  allocations?: TransactionAllocation[]
}
export interface TransactionAllocation {
  id: string
  position: number
  amount: number
  kind: TransactionKind
  category: string
  subcategory?: string
  note?: string
}
export interface CustomSubcategory { id: string; categoryId: string; category: string; displayName: string }
export interface Achievement {
  id: string
  title: string
  points: number
  sub: string
}

export const data = {
  operator: { callsign: '', netWorth: 0, netWorthDelta: 0, liquidCash: 0, rank: { current: '', next: '', progress: 0, toNext: 0 } },
  cashflow: { income: [], expense: [] },
  netWorthTrend: [],
  accounts: [] as Account[],
  allocation: [] as AllocationSlice[],
  income: [] as IncomeStream[],
  objectives: [] as Objective[],
  shields: [] as Shield[],
  transactions: [] as Txn[],
  achievements: [] as Achievement[],
}

/* Canonical expense taxonomy: category → ordered sub-categories. Drives the
   Expenses transaction filters and the `subcat` values on outflow transactions.
   `Income` is an inflow bucket and is intentionally excluded. */
export const CATEGORY_TAXONOMY: Record<string, string[]> = {
  'Food & drink': ['Groceries', 'Dining & takeaway', 'Coffee', 'Alcohol & pubs'],
  Home: ['Rent', 'Rates', 'Maintenance', 'Home insurance', 'Furnishings'],
  Transport: ['Fuel', 'Public transport', 'Rideshare', 'Parking & tolls', 'Registration', 'Servicing', 'Car insurance'],
  'Bills & utilities': ['Electricity & gas', 'Water', 'Internet', 'Mobile'],
  Shopping: ['Clothing', 'Electronics', 'Household', 'Gifts', 'General retail'],
  'Health & wellbeing': ['Medical', 'Dental', 'Pharmacy', 'Allied health', 'Fitness', 'Personal care'],
  Lifestyle: ['Streaming', 'Software & digital services', 'Memberships', 'Events', 'Hobbies', 'Gaming', 'Recreation'],
  Travel: ['Flights', 'Accommodation', 'Local transport', 'Activities', 'General travel'],
  'Family & pets': ['Childcare', 'School', 'Children', 'Pet care', 'Veterinary'],
  Education: ['Courses', 'Books', 'Student costs'],
  'Financial & admin': ['Bank fees', 'Government charges', 'Tax', 'Accounting', 'Legal'],
  Giving: ['Charity', 'Donations'],
  Other: ['Cash withdrawal', 'Miscellaneous'],
}
export const EXPENSE_CATEGORIES = Object.keys(CATEGORY_TAXONOMY)

/* Stable database slugs are the durable taxonomy identity. This display-name
   copy retains the canonical reporting order used by `catColor()` and the
   `--cat-1..13` rendering tokens; reorder only as a deliberate design change.

   `Other` vs `Uncategorized` is a real distinction, not redundancy:
   `Other > Miscellaneous` means "reviewed, genuinely miscellaneous" and counts as
   ordinary spending with its own hue; `Uncategorized` means "nothing could
   determine this" and stays in the review queue. Collapsing them would make
   the review queue unfinishable — there'd be no way to say "yes, this one
   really is just miscellaneous". */

/* Non-expense buckets. Deliberately OUTSIDE CATEGORY_TAXONOMY and
   EXPENSE_CATEGORIES so they take no chart hue and never enter spending
   analytics.

   `Income`    — inflows. Income.tsx already groups by `t.cat` for its sources
                 donut but no vocabulary was ever defined; these are it.
   `Transfer`  — money moving between your own accounts (including P2P apps
                 and payments to your own name), plus the synthetic
                 balance-reconciliation anchor. Excluded from spending
                 analytics: counting it would double-count every transfer as
                 both an expense and income.
   `Investing` — buying shares moves money between your own asset classes, it
                 is not consumption. It remains outside the reporting expense
                 taxonomy. Caveat: if a
                 brokerage account is NOT tracked as a Halcyon account, outflows
                 to it now leave spending analytics without arriving anywhere
                 visible. */
export const INCOME_SUBCATEGORIES = ['Salary', 'Interest', 'Dividends & distributions', 'Benefits', 'Rental & business income', 'Refund', 'Reimbursement', 'Transfer In', 'Other'] as const
export const TRANSFER_SUBCATEGORIES = ['Internal', 'Managed fund funding', 'Reconciliation'] as const
export const INVESTING_SUBCATEGORIES = ['Auto-invest', 'Brokerage', 'Managed fund purchase', 'Managed fund funding', 'Distribution'] as const

export const INCOME_CATEGORY = 'Income'
export const TRANSFER_CATEGORY = 'Transfer'
export const INVESTING_CATEGORY = 'Investing'
export const UNCATEGORIZED = 'Uncategorized'

/* The complete vocabulary an importer or the AI may write. Anything outside
   this set is rejected server-side and falls back to `Uncategorized`. */
export const FULL_TAXONOMY: Record<string, readonly string[]> = {
  ...CATEGORY_TAXONOMY,
  [INCOME_CATEGORY]: INCOME_SUBCATEGORIES,
  [TRANSFER_CATEGORY]: TRANSFER_SUBCATEGORIES,
  [INVESTING_CATEGORY]: INVESTING_SUBCATEGORIES,
  [UNCATEGORIZED]: [],
}

export const ALL_CATEGORIES = Object.keys(FULL_TAXONOMY)

/** True when a category represents real spending (drives analytics filters). */
export function isExpenseCategory(cat: string): boolean {
  return EXPENSE_CATEGORIES.includes(cat)
}

/** True when a transaction is an internal transfer leg and must be excluded from spend/income analytics. */
export function isTransferRow(t: Pick<Txn, 'isTransfer'>): boolean {
  return t.isTransfer === true
}

/** Validates a category/subcategory pair against the canonical vocabulary. */
export function isValidTaxonomyPair(cat: string, sub?: string | null): boolean {
  const subs = FULL_TAXONOMY[cat]
  if (!subs) return false
  if (sub === undefined || sub === null || sub === '') return true
  return subs.includes(sub)
}

/* token-mapped colors for charts/legends keyed by `glow` */
export const glowColor: Record<Glow, string> = {
  green: 'var(--color-pos)',
  cyan: 'var(--color-accent)',
  blue: 'var(--color-blue)',
  amber: 'var(--color-warn)',
  red: 'var(--color-neg)',
}

// Every account balance and transaction amount in the DB is stored in cents
// (see the `-- Stored in cents` comment on transactions.amount in the initial
// migration). These are the only two places that convert cents to a display
// string, so every screen in the app depends on the /100 below — do not
// divide again at a call site.
export const fmt = (n: number) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n / 100)).toLocaleString()
export const fmtCents = (n: number) =>
  (n < 0 ? '-' : '') + '$' + (Math.abs(n) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
