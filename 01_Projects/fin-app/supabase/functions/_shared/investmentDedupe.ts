export interface InvestmentDedupeInput {
  accountId: string
  instrumentIdentifier: string
  tradeDate: string
  activityType: string
  quantity: string
  unitPrice: string | null
  valueCents: number
  brokerageCents: number
  sourceLabel: string
}

export function investmentDedupeCanonical(input: InvestmentDedupeInput): string {
  return [
    input.accountId,
    input.instrumentIdentifier.trim().toUpperCase(),
    input.tradeDate,
    input.activityType,
    input.quantity,
    input.unitPrice ?? '',
    String(input.valueCents),
    String(input.brokerageCents),
    input.sourceLabel.trim(),
  ].join('\u001f')
}

export async function investmentDedupeHashHex(input: InvestmentDedupeInput): Promise<string> {
  const bytes = new TextEncoder().encode(investmentDedupeCanonical(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

