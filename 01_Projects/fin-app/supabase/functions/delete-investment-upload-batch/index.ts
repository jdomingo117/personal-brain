import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const Payload = z.object({
  account_id: z.string().uuid(),
  upload_batch_id: z.string().uuid(),
})

Deno.serve(withAuth({ schema: Payload }, async (ctx) => {
  const { data: rows, error: readError } = await ctx.db.from('investment_activities')
    .select('id, holding_id').eq('account_id', ctx.body.account_id)
    .eq('upload_batch_id', ctx.body.upload_batch_id)
  if (readError) throw readError
  const { error: deleteError } = await ctx.db.from('investment_activities')
    .delete().eq('account_id', ctx.body.account_id).eq('upload_batch_id', ctx.body.upload_batch_id)
  if (deleteError) throw deleteError

  const holdingIds = [...new Set((rows ?? []).map((row) => row.holding_id))]
  for (const holdingId of holdingIds) {
    const { count, error: countError } = await ctx.db.from('investment_activities')
      .select('id', { count: 'exact', head: true }).eq('holding_id', holdingId)
    if (countError) throw countError
    if ((count ?? 0) === 0) {
      const { error } = await ctx.db.from('investment_holdings').update({
        reconciliation_status: 'unconfirmed', confirmed_units: null, confirmed_at: null,
      }).eq('id', holdingId)
      if (error) throw error
    }
  }
  await ctx.audit('investment.upload_batch_deleted', {
    account_id: ctx.body.account_id,
    upload_batch_id: ctx.body.upload_batch_id,
    deleted: rows?.length ?? 0,
  })
  return { deleted: rows?.length ?? 0 }
}))

