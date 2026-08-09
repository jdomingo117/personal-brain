import { canonicalDecimal, currencyToCents, decimalToScaled, scaledToDecimal } from './decimal'
import type { InvestmentActivityType, InvestmentImport, StagedInvestmentActivity } from './types'

export const VANGUARD_HEADERS = [
  'Account number', 'Investment', 'Product ID', 'Product Type', 'Trade Date',
  'Type', 'Unit Price', 'Quantity', 'Value', 'Brokerage',
] as const

function parseVanguardDate(value: unknown): string | null {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const months: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  }
  const month = months[match[2][0].toUpperCase() + match[2].slice(1).toLowerCase()]
  if (!month) return null
  const yearPart = Number(match[3])
  const year = match[3].length === 2 ? 2000 + yearPart : yearPart
  const day = Number(match[1])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function classify(label: string, quantity: string | null, valueCents: number | null): InvestmentActivityType | null {
  const normalized = label.trim().toLowerCase()
  if (normalized === 'drp') return 'distribution_reinvestment'
  if (normalized.includes('distribution') && normalized.includes('cash')) return 'cash_distribution'
  if (normalized.includes('fee')) return 'fee'
  if (normalized === 'managed fund transaction') {
    if (quantity === null || valueCents === null) return null
    return quantity.startsWith('-') || valueCents < 0 ? 'redemption' : 'purchase'
  }
  return null
}

export function isVanguardPersonalInvestorCsv(headers: string[]): boolean {
  const present = new Set(headers.map((header) => header.trim()))
  return VANGUARD_HEADERS.every((header) => present.has(header))
}

export function parseVanguardInvestmentRows(rows: Record<string, unknown>[]): InvestmentImport {
  if (rows.length === 0) throw new Error('The Vanguard export has no activity rows.')
  const accounts = new Set(rows.map((row) => String(row['Account number'] ?? '').replace(/\D/g, '')).filter(Boolean))
  const identifiers = new Set(rows.map((row) => String(row['Product ID'] ?? '').trim()).filter(Boolean))
  const names = new Set(rows.map((row) => String(row.Investment ?? '').trim()).filter(Boolean))
  const productTypes = new Set(rows.map((row) => String(row['Product Type'] ?? '').trim()).filter(Boolean))
  if (accounts.size !== 1) throw new Error('The file must contain exactly one Vanguard account.')
  if (identifiers.size !== 1 || names.size !== 1 || productTypes.size !== 1) {
    throw new Error('This import currently supports one investment per file. Split the export by product and retry.')
  }

  const activities: StagedInvestmentActivity[] = rows.map((row, index) => {
    const tradeDate = parseVanguardDate(row['Trade Date'])
    const sourceLabel = String(row.Type ?? '').trim()
    const quantity = canonicalDecimal(row.Quantity, 10)
    const unitPrice = canonicalDecimal(row['Unit Price'], 10)
    const valueCents = currencyToCents(row.Value)
    const brokerageRaw = String(row.Brokerage ?? '').trim()
    const brokerageCents = brokerageRaw === '' ? 0 : currencyToCents(brokerageRaw)
    const activityType = classify(sourceLabel, quantity, valueCents)
    const issues: string[] = []
    if (!tradeDate) issues.push('Invalid trade date')
    if (!activityType) issues.push('Unrecognised activity type')
    if (quantity === null) issues.push('Invalid quantity')
    if (unitPrice === null && !['cash_distribution', 'fee'].includes(activityType ?? '')) issues.push('Invalid unit price')
    if (valueCents === null) issues.push('Invalid value')
    if (brokerageCents === null) issues.push('Invalid brokerage')
    return {
      id: `investment-${index}`,
      tradeDate,
      activityType,
      sourceLabel,
      quantity,
      unitPrice,
      valueCents,
      brokerageCents,
      issues,
      include: issues.length === 0,
    }
  })

  const importable = activities.filter((activity) => activity.include)
  const calculatedUnits = scaledToDecimal(importable.reduce((sum, activity) => {
    if (!activity.quantity) return sum
    const magnitude = decimalToScaled(activity.quantity)
    return sum + (activity.activityType === 'redemption' && magnitude > 0n ? -magnitude : magnitude)
  }, 0n))
  const dates = importable.flatMap((activity) => activity.tradeDate ? [activity.tradeDate] : []).sort()
  const account = [...accounts][0]

  return {
    adapter: 'vanguard_personal_investor',
    adapterVersion: 1,
    platform: 'vanguard_personal_investor',
    accountSuffix: account.slice(-4),
    instrument: {
      name: [...names][0],
      identifierType: 'APIR',
      identifier: [...identifiers][0],
      productType: [...productTypes][0],
    },
    activities,
    summary: {
      activityCount: importable.length,
      purchases: importable.filter((activity) => activity.activityType === 'purchase').length,
      reinvestments: importable.filter((activity) => activity.activityType === 'distribution_reinvestment').length,
      redemptions: importable.filter((activity) => activity.activityType === 'redemption').length,
      calculatedUnits,
      externalContributionsCents: importable.reduce((sum, activity) => {
        if (activity.activityType === 'purchase') return sum + (activity.valueCents ?? 0) + (activity.brokerageCents ?? 0)
        if (activity.activityType === 'redemption') return sum - Math.abs(activity.valueCents ?? 0) + (activity.brokerageCents ?? 0)
        return sum
      }, 0),
      reinvestedDistributionsCents: importable
        .filter((activity) => activity.activityType === 'distribution_reinvestment')
        .reduce((sum, activity) => sum + (activity.valueCents ?? 0), 0),
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
    },
  }
}

