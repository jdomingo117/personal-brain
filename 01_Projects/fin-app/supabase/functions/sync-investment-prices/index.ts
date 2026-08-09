import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { syncInvestmentInstrument } from '../_shared/syncInvestmentPrices.ts'

const Payload = z.object({
  account_id: z.string().uuid(),
  trigger: z.enum(['manual', 'stale']).default('manual'),
})

Deno.serve(withAuth({ schema: Payload }, async (ctx) => {
  const { data: holding, error: holdingError } = await ctx.db.from('investment_holdings')
    .select('instrument_id').eq('account_id', ctx.body.account_id).maybeSingle()
  if (holdingError) throw holdingError
  if (!holding) throw new Error('Investment holding not found')
  const admin = ctx.admin()
  const { data: instrument, error: instrumentError } = await admin.from('investment_instruments')
    .select('id, price_provider, provider_product_id').eq('id', holding.instrument_id).single()
  if (instrumentError) throw instrumentError
  const result = await syncInvestmentInstrument(admin, instrument, ctx.body.trigger)
  await ctx.audit('investment.prices_synced', { account_id: ctx.body.account_id, ...result })
  return result
}))

