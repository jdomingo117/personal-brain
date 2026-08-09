export type InvestmentActivityType =
  | 'purchase'
  | 'redemption'
  | 'distribution_reinvestment'
  | 'cash_distribution'
  | 'fee'
  | 'opening_units'
  | 'unit_adjustment'
  | 'cost_base_adjustment'

export interface StagedInvestmentActivity {
  id: string
  tradeDate: string | null
  activityType: InvestmentActivityType | null
  sourceLabel: string
  quantity: string | null
  unitPrice: string | null
  valueCents: number | null
  brokerageCents: number | null
  issues: string[]
  include: boolean
}

export interface InvestmentImport {
  adapter: 'vanguard_personal_investor'
  adapterVersion: 1
  platform: 'vanguard_personal_investor'
  accountSuffix: string | null
  instrument: {
    name: string
    identifierType: 'APIR'
    identifier: string
    productType: string
  }
  activities: StagedInvestmentActivity[]
  summary: {
    activityCount: number
    purchases: number
    reinvestments: number
    redemptions: number
    calculatedUnits: string
    externalContributionsCents: number
    reinvestedDistributionsCents: number
    firstDate: string | null
    lastDate: string | null
  }
}

