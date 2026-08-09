import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { canonicalDecimal, currencyToCents } from './decimal'
import { isVanguardPersonalInvestorCsv, parseVanguardInvestmentRows } from './vanguard'

const fixturePath = path.resolve(__dirname, '../../../../Sample datasets/Vanguard_investment_transactions.csv')

describe('Vanguard Personal Investor adapter', () => {
  it('normalises the real anonymised export without floating-point drift', () => {
    const parsed = Papa.parse<Record<string, unknown>>(fs.readFileSync(fixturePath, 'utf8'), { header: true, skipEmptyLines: true })
    expect(isVanguardPersonalInvestorCsv(parsed.meta.fields ?? [])).toBe(true)
    const result = parseVanguardInvestmentRows(parsed.data)
    expect(result.instrument.identifier).toBe('VAN0111AU')
    expect(result.accountSuffix).toBe('7777')
    expect(result.summary).toMatchObject({
      activityCount: 9,
      purchases: 4,
      reinvestments: 5,
      redemptions: 0,
      calculatedUnits: '21492.49',
      externalContributionsCents: 4_571_500,
      reinvestedDistributionsCents: 166_259,
      firstDate: '2025-06-11',
      lastDate: '2026-07-01',
    })
    expect(result.activities.every((activity) => activity.issues.length === 0)).toBe(true)
  })

  it('uses signs to distinguish a redemption from a purchase', () => {
    const result = parseVanguardInvestmentRows([{
      'Account number': '1234', Investment: 'Example Fund', 'Product ID': 'ABC0001AU',
      'Product Type': 'Managed Fund', 'Trade Date': '8-Aug-26', Type: 'Managed Fund Transaction',
      'Unit Price': '2.12345678', Quantity: '-10.25', Value: '-21.77', Brokerage: '1.00',
    }])
    expect(result.activities[0].activityType).toBe('redemption')
    expect(result.summary.calculatedUnits).toBe('-10.25')
    expect(result.summary.externalContributionsCents).toBe(-2077)
  })

  it('rejects unsafe precision and parses currency exactly', () => {
    expect(canonicalDecimal('2.30652394')).toBe('2.30652394')
    expect(canonicalDecimal('2.12345678901')).toBeNull()
    expect(currencyToCents('$30,000')).toBe(3_000_000)
    expect(currencyToCents('0.005')).toBeNull()
  })

  it('does not accept mixed accounts or products', () => {
    const base = {
      Investment: 'Example', 'Product ID': 'ABC0001AU', 'Product Type': 'Managed Fund',
      'Trade Date': '8-Aug-26', Type: 'DRP', 'Unit Price': '1', Quantity: '1', Value: '1', Brokerage: '',
    }
    expect(() => parseVanguardInvestmentRows([
      { ...base, 'Account number': '1' }, { ...base, 'Account number': '2' },
    ])).toThrow(/exactly one Vanguard account/)
  })
})
