import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { SafeHttpError, withAuth } from '../_shared/withAuth.ts'
import { TRANSACTION_KINDS } from '../_shared/classification.ts'

const Allocation = z.object({
  position: z.number().int().min(0).max(49), amount: z.number().int().refine((v) => v !== 0),
  kind: z.enum(TRANSACTION_KINDS), category: z.string().trim().min(1).max(64),
  subcategory: z.string().trim().max(64).nullable(), note: z.string().trim().max(160).nullable(),
})
const Payload = z.discriminatedUnion('action', [
  z.object({ action: z.literal('replace'), transaction_id: z.string().uuid(), allocations: z.array(Allocation).min(2).max(50) }),
  z.object({ action: z.literal('undo'), edit_id: z.string().uuid() }),
])

Deno.serve(withAuth({ schema: Payload, requireRole: 'member' }, async (ctx) => {
  if (ctx.body.action === 'replace') {
    const { data: transaction, error: readError } = await ctx.db.from('transactions')
      .select('id,amount,pending,kind,kind_source').eq('id', ctx.body.transaction_id).maybeSingle()
    if (readError) throw readError
    if (!transaction) throw new SafeHttpError(404, { error: 'Transaction not found' })
    if (ctx.body.allocations.reduce((sum, item) => sum + item.amount, 0) !== transaction.amount) {
      throw new SafeHttpError(400, { error: 'Allocation amounts must equal the transaction amount.' })
    }
    const { data, error } = await ctx.admin().rpc('replace_transaction_allocations', {
      p_tenant: ctx.tenantId, p_transaction: transaction.id, p_actor: ctx.user.id,
      p_allocations: ctx.body.allocations,
    })
    if (error) throw error
    await ctx.audit('transaction.split_replaced', { target_type: 'transaction', target_id: transaction.id, transaction_id: transaction.id, edit_id: data.edit_id, allocation_count: ctx.body.allocations.length })
    return data
  }
  const { data: edit, error: readError } = await ctx.db.from('transaction_allocation_edits')
    .select('id,transaction_id,undone_at').eq('id', ctx.body.edit_id).maybeSingle()
  if (readError) throw readError
  if (!edit) throw new SafeHttpError(404, { error: 'Split edit not found' })
  if (edit.undone_at) throw new SafeHttpError(409, { error: 'Split edit already undone' })
  const { data, error } = await ctx.admin().rpc('undo_transaction_allocation_edit', { p_tenant: ctx.tenantId, p_edit: edit.id, p_actor: ctx.user.id })
  if (error?.message?.includes('changed after')) throw new SafeHttpError(409, { error: 'This split changed after that edit and cannot be undone.' })
  if (error) throw error
  await ctx.audit('transaction.split_undone', { target_type: 'transaction', target_id: edit.transaction_id, transaction_id: edit.transaction_id, edit_id: edit.id })
  return data
}))
