import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const DeleteBatchSchema = z.object({
  upload_batch_id: z.string().uuid(),
  account_id: z.string().uuid(),
})

Deno.serve(
  withAuth({ schema: DeleteBatchSchema, requireRole: 'member' }, async (ctx) => {
    const { upload_batch_id, account_id } = ctx.body

    // Deletion, SQL aggregation, manual-balance update and batch status are
    // one PostgreSQL transaction. No PostgREST row cap can truncate SUM().
    const { data, error } = await ctx.db.rpc('delete_upload_batch_atomic', {
      p_tenant_id: ctx.tenantId,
      p_upload_batch_id: upload_batch_id,
      p_account_id: account_id,
    })
    if (error) throw error

    const result = data as {
      success: boolean
      alreadyUndone: boolean
      removed: number
      newBalance: number | null
      balanceOwnedByProvider: boolean
    }

    await ctx.audit('upload_batch.reverted', {
      upload_batch_id,
      account_id,
      removed: result.removed,
      already_undone: result.alreadyUndone,
      balance_owned_by_provider: result.balanceOwnedByProvider,
    })

    return result
  }),
)
