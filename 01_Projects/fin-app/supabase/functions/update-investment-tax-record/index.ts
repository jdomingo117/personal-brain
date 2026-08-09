import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const Payload = z.object({
  account_id: z.string().uuid(),
  financial_year: z.number().int().min(2000).max(2200),
  amma_status: z.enum(['awaiting', 'received', 'reviewed', 'not_required']),
})

Deno.serve(withAuth({ schema: Payload }, async (ctx) => {
  const { data: account, error: accountError } = await ctx.db
    .from('accounts').select('id, type').eq('id', ctx.body.account_id).maybeSingle()
  if (accountError) throw accountError
  if (!account || account.type !== 'Invest') throw new Error('Investment tax records require an Invest account')

  const { data: summary, error: summaryError } = await ctx.db
    .from('investment_financial_year_summary')
    .select('financial_year')
    .eq('account_id', ctx.body.account_id)
    .eq('financial_year', ctx.body.financial_year)
    .maybeSingle()
  if (summaryError) throw summaryError
  if (!summary) throw new Error('No investment activity exists for this financial year')

  // The account and summary were proven through the caller's RLS-scoped
  // client. The trusted write remains explicitly pinned to that account and
  // tenant so browser clients never receive direct mutation privileges.
  const { data, error } = await ctx.admin().from('investment_tax_records').upsert({
    tenant_id: ctx.tenantId,
    account_id: ctx.body.account_id,
    financial_year: ctx.body.financial_year,
    amma_status: ctx.body.amma_status,
    status_changed_at: new Date().toISOString(),
  }, { onConflict: 'account_id,financial_year' }).select('*').single()
  if (error) throw error

  await ctx.audit('investment.tax_record_updated', {
    account_id: ctx.body.account_id,
    financial_year: ctx.body.financial_year,
    amma_status: ctx.body.amma_status,
  })
  return data
}))
