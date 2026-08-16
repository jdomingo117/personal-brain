import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { SafeHttpError, withAuth } from '../_shared/withAuth.ts'
import { TRANSACTION_KINDS } from '../_shared/classification.ts'

const EditPayload = z.object({
  action: z.literal('edit'),
  transaction_id: z.string().uuid(),
  kind: z.enum(TRANSACTION_KINDS),
  is_recurring: z.boolean(),
  is_subscription: z.boolean(),
  spending_nature: z.enum(['essential', 'discretionary']).nullable(),
  is_reimbursable: z.boolean(),
  is_tax_related: z.boolean(),
})
const UndoPayload = z.object({ action: z.literal('undo'), edit_id: z.string().uuid() })
const BulkEditPayload = z.object({
  action: z.literal('bulk_edit'),
  transaction_ids: z.array(z.string().uuid()).min(1).max(500),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  is_recurring: z.boolean().optional(),
  is_subscription: z.boolean().optional(),
  spending_nature: z.enum(['essential', 'discretionary']).nullable().optional(),
  is_reimbursable: z.boolean().optional(),
  is_tax_related: z.boolean().optional(),
})
const UndoOperationPayload = z.object({ action: z.literal('undo_operation'), operation_id: z.string().uuid() })
const Payload = z.discriminatedUnion('action', [EditPayload, UndoPayload, BulkEditPayload, UndoOperationPayload])
  .superRefine((payload, ctx) => {
    if (payload.action !== 'bulk_edit') return
    const fields = ['kind', 'is_recurring', 'is_subscription', 'spending_nature', 'is_reimbursable', 'is_tax_related'] as const
    if (!fields.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose at least one classification field to update' })
    }
  })

const BULK_VISIBILITY_CHUNK_SIZE = 75

async function visibleBulkTransactions(ctx: { db: any }, transactionIds: string[]) {
  const chunks: string[][] = []
  for (let index = 0; index < transactionIds.length; index += BULK_VISIBILITY_CHUNK_SIZE) {
    chunks.push(transactionIds.slice(index, index + BULK_VISIBILITY_CHUNK_SIZE))
  }
  const results = await Promise.all(chunks.map((ids) => ctx.db.from('transactions')
    .select('id,kind,kind_source,subcategory').in('id', ids)))
  const rows: any[] = []
  for (const result of results) {
    if (result.error) throw result.error
    rows.push(...(result.data ?? []))
  }
  return rows
}

Deno.serve(withAuth({ schema: Payload, requireRole: 'member' }, async (ctx) => {
  if (ctx.body.action === 'edit') {
    const { data: before, error: beforeError } = await ctx.db.from('transactions')
      .select('id,kind,kind_source,subcategory,is_recurring,is_subscription,spending_nature,is_reimbursable,is_tax_related')
      .eq('id', ctx.body.transaction_id).maybeSingle()
    if (beforeError) throw beforeError
    if (!before) throw new SafeHttpError(404, { error: 'Transaction not found' })
    if (before.kind === 'adjustment' && before.subcategory === 'Reconciliation') {
      throw new SafeHttpError(409, { error: 'System reconciliation classification is locked.' })
    }

    const { data, error } = await ctx.admin().rpc('edit_transaction_classification', {
      p_tenant_id: ctx.tenantId,
      p_transaction_id: ctx.body.transaction_id,
      p_actor_id: ctx.user.id,
      p_kind: ctx.body.kind,
      p_is_recurring: ctx.body.is_recurring,
      p_is_subscription: ctx.body.is_subscription,
      p_spending_nature: ctx.body.spending_nature,
      p_is_reimbursable: ctx.body.is_reimbursable,
      p_is_tax_related: ctx.body.is_tax_related,
    })
    if (error) throw error
    await ctx.audit('transaction.classification_edited', {
      target_type: 'transaction', target_id: ctx.body.transaction_id,
      transaction_id: ctx.body.transaction_id, before_kind: before.kind,
      kind: ctx.body.kind, edit_id: data.edit_id,
    })
    return data
  }

  if (ctx.body.action === 'bulk_edit') {
    if (new Set(ctx.body.transaction_ids).size !== ctx.body.transaction_ids.length) {
      throw new SafeHttpError(422, { error: 'Duplicate transaction selection' })
    }
    const visible = await visibleBulkTransactions(ctx, ctx.body.transaction_ids)
    if (visible.length !== ctx.body.transaction_ids.length) {
      throw new SafeHttpError(404, { error: 'One or more transactions were not found' })
    }
    if (visible.some((row) => row.kind === 'adjustment' && row.kind_source === 'system')) {
      throw new SafeHttpError(409, { error: 'System reconciliation classification is locked.' })
    }
    const updates = {
      kind: Object.prototype.hasOwnProperty.call(ctx.body, 'kind'),
      is_recurring: Object.prototype.hasOwnProperty.call(ctx.body, 'is_recurring'),
      is_subscription: Object.prototype.hasOwnProperty.call(ctx.body, 'is_subscription'),
      spending_nature: Object.prototype.hasOwnProperty.call(ctx.body, 'spending_nature'),
      is_reimbursable: Object.prototype.hasOwnProperty.call(ctx.body, 'is_reimbursable'),
      is_tax_related: Object.prototype.hasOwnProperty.call(ctx.body, 'is_tax_related'),
    }
    const { data, error } = await ctx.admin().rpc('bulk_edit_transaction_classification', {
      p_tenant_id: ctx.tenantId, p_transaction_ids: ctx.body.transaction_ids, p_actor_id: ctx.user.id,
      p_update_kind: updates.kind, p_kind: ctx.body.kind ?? null,
      p_update_is_recurring: updates.is_recurring, p_is_recurring: ctx.body.is_recurring ?? null,
      p_update_is_subscription: updates.is_subscription, p_is_subscription: ctx.body.is_subscription ?? null,
      p_update_spending_nature: updates.spending_nature, p_spending_nature: ctx.body.spending_nature ?? null,
      p_update_is_reimbursable: updates.is_reimbursable, p_is_reimbursable: ctx.body.is_reimbursable ?? null,
      p_update_is_tax_related: updates.is_tax_related, p_is_tax_related: ctx.body.is_tax_related ?? null,
    })
    if (error) throw error
    await ctx.audit('transaction.classification_bulk_edited', {
      target_type: 'transaction_selection', operation_id: data.operation_id,
      selected: data.selected, updated: data.updated,
      fields_updated: Object.entries(updates).filter(([, enabled]) => enabled).map(([field]) => field),
      scope: 'selection',
    })
    return data
  }

  if (ctx.body.action === 'undo_operation') {
    const { data: edits, error: editError } = await ctx.db.from('transaction_classification_edits')
      .select('id,transaction_id,undone_at').eq('operation_id', ctx.body.operation_id)
    if (editError) throw editError
    if (!edits?.length) throw new SafeHttpError(404, { error: 'Classification operation not found' })
    if (edits.some((edit) => edit.undone_at)) {
      throw new SafeHttpError(409, { error: 'Classification operation already undone' })
    }
    const { data, error } = await ctx.admin().rpc('undo_transaction_classification_operation', {
      p_tenant_id: ctx.tenantId, p_operation_id: ctx.body.operation_id, p_actor_id: ctx.user.id,
    })
    if (error) {
      if (error.message?.includes('changed after this classification operation')) {
        throw new SafeHttpError(409, { error: 'A transaction changed after this operation, so it cannot be undone.' })
      }
      throw error
    }
    await ctx.audit('transaction.classification_operation_undone', {
      target_type: 'transaction_selection', operation_id: ctx.body.operation_id, restored: data.restored,
    })
    return data
  }

  const { data: edit, error: editError } = await ctx.db.from('transaction_classification_edits')
    .select('id,transaction_id,undone_at').eq('id', ctx.body.edit_id).maybeSingle()
  if (editError) throw editError
  if (!edit) throw new SafeHttpError(404, { error: 'Classification edit not found' })
  if (edit.undone_at) throw new SafeHttpError(409, { error: 'Classification edit already undone' })

  const { data, error } = await ctx.admin().rpc('undo_transaction_classification_edit', {
    p_tenant_id: ctx.tenantId, p_edit_id: ctx.body.edit_id, p_actor_id: ctx.user.id,
  })
  if (error) {
    if (error.message?.includes('changed after this classification edit')) {
      throw new SafeHttpError(409, { error: 'This transaction changed after that classification edit and cannot be undone.' })
    }
    throw error
  }
  await ctx.audit('transaction.classification_edit_undone', {
    target_type: 'transaction', target_id: edit.transaction_id,
    transaction_id: edit.transaction_id, edit_id: ctx.body.edit_id,
  })
  return data
}))
