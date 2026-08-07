import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const DeleteBatchSchema = z.object({
  upload_batch_id: z.string().uuid(),
  account_id: z.string().uuid(),
})

Deno.serve(
  withAuth({ schema: DeleteBatchSchema, requireRole: 'member' }, async (ctx) => {
    const { upload_batch_id, account_id } = ctx.body

    // Every statement below runs through the caller's RLS-scoped client, so
    // the explicit .eq('user_id', ...) filters the previous version carried
    // are redundant — tenant scoping is enforced by policy, not by remembering
    // to add a filter.
    const { data: deleted, error: deleteError } = await ctx.db
      .from('transactions')
      .delete()
      .eq('upload_batch_id', upload_batch_id)
      .eq('account_id', account_id)
      .select('id')
    if (deleteError) throw deleteError

    // A connected account's ledger deliberately starts at its cutover date —
    // the provider owns balance from there forward, so summing surviving rows
    // is not the balance and would silently clobber Up's authoritative figure.
    const { data: connection } = await ctx.db
      .from('account_connections')
      .select('id')
      .eq('account_id', account_id)
      .maybeSingle()

    if (connection) {
      await ctx.audit('upload_batch.reverted', {
        upload_batch_id,
        account_id,
        removed: deleted?.length ?? 0,
        balanceOwnedByProvider: true,
      })
      return { success: true, balanceOwnedByProvider: true }
    }

    // Recalculate the balance from what survives.
    const { data: remaining, error: fetchError } = await ctx.db
      .from('transactions')
      .select('amount')
      .eq('account_id', account_id)
    if (fetchError) throw fetchError

    const newBalanceCents = remaining.reduce((sum, tx) => sum + (tx.amount ?? 0), 0)

    const { error: updateError } = await ctx.db
      .from('accounts')
      .update({ balance: newBalanceCents })
      .eq('id', account_id)
    if (updateError) throw updateError

    await ctx.audit('upload_batch.reverted', {
      upload_batch_id,
      account_id,
      removed: deleted?.length ?? 0,
    })

    return { success: true, newBalance: newBalanceCents }
  }),
)
