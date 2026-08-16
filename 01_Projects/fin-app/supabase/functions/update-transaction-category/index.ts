import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { SafeHttpError, withAuth } from '../_shared/withAuth.ts'
import { ALL_CATEGORIES, FULL_TAXONOMY, UNCATEGORIZED } from '../_shared/taxonomy.ts'

const EditPayload = z.object({
  action: z.literal('edit'),
  transaction_id: z.string().uuid(),
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).nullable().optional(),
})

const UndoPayload = z.object({
  action: z.literal('undo'),
  edit_id: z.string().uuid(),
})

const BulkPayload = z.object({
  action: z.literal('bulk_edit'),
  transaction_ids: z.array(z.string().uuid()).min(1).max(500),
  category: z.string().min(1).max(100).optional(),
  subcategory: z.string().max(100).nullable().optional(),
})

const UndoOperationPayload = z.object({
  action: z.literal('undo_operation'),
  operation_id: z.string().uuid(),
})

const Payload = z.discriminatedUnion('action', [EditPayload, UndoPayload, BulkPayload, UndoOperationPayload])
  .superRefine((payload, ctx) => {
    if (payload.action !== 'bulk_edit') return
    const updatesCategory = payload.category !== undefined
    const updatesSubcategory = Object.prototype.hasOwnProperty.call(payload, 'subcategory')
    if (!updatesCategory && !updatesSubcategory) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a category or subcategory to update' })
    }
    if (updatesCategory && !updatesSubcategory) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a subcategory when changing category' })
    }
  })

const BULK_VISIBILITY_CHUNK_SIZE = 75

async function visibleBulkTransactions(ctx: { db: any }, transactionIds: string[]) {
  const chunks: string[][] = []
  for (let index = 0; index < transactionIds.length; index += BULK_VISIBILITY_CHUNK_SIZE) {
    chunks.push(transactionIds.slice(index, index + BULK_VISIBILITY_CHUNK_SIZE))
  }
  const results = await Promise.all(chunks.map((ids) => ctx.db
    .from('transactions')
    .select('id, category, subcategory, kind, kind_source')
    .in('id', ids)))
  const rows: any[] = []
  for (const result of results) {
    if (result.error) throw result.error
    rows.push(...(result.data ?? []))
  }
  return rows
}

async function validPair(ctx: { db: any }, category: string, subcategory?: string | null) {
  const matchedCategory = [...ALL_CATEGORIES, UNCATEGORIZED]
    .find((candidate) => candidate.toLowerCase() === category.trim().toLowerCase())
  if (!matchedCategory) throw new SafeHttpError(422, { error: 'Unknown category' })
  const requestedSubcategory = subcategory?.trim() || null
  const matchedSubcategory = requestedSubcategory
    ? (FULL_TAXONOMY[matchedCategory] ?? [])
      .find((candidate) => candidate.toLowerCase() === requestedSubcategory.toLowerCase())
    : null
  let resolvedSubcategory = matchedSubcategory
  if (requestedSubcategory && !resolvedSubcategory) {
    const { data: categoryRow } = await ctx.db.from('taxonomy_categories').select('id').eq('display_name', matchedCategory).maybeSingle()
    const { data: custom } = categoryRow ? await ctx.db.from('tenant_subcategories').select('display_name').eq('category_id', categoryRow.id).eq('active', true).ilike('display_name', requestedSubcategory).maybeSingle() : { data: null }
    resolvedSubcategory = custom?.display_name ?? null
    if (!resolvedSubcategory) throw new SafeHttpError(422, { error: 'Subcategory does not belong to this category' })
  }
  if (matchedCategory === 'Transfer' && matchedSubcategory === 'Reconciliation') {
    throw new SafeHttpError(422, { error: 'Reconciliation is reserved for system entries.' })
  }
  return { matchedCategory, matchedSubcategory: resolvedSubcategory }
}

Deno.serve(withAuth({ schema: Payload, requireRole: 'member' }, async (ctx) => {
  if (ctx.body.action === 'edit') {
    const { data: transaction, error: transactionError } = await ctx.db
      .from('transactions')
      .select('id, category, subcategory, kind, kind_source')
      .eq('id', ctx.body.transaction_id)
      .maybeSingle()
    if (transactionError) throw transactionError
    if (!transaction) throw new SafeHttpError(404, { error: 'Transaction not found' })
    if (transaction.kind === 'adjustment' && transaction.kind_source === 'system') {
      throw new SafeHttpError(409, { error: 'System reconciliation entries cannot be recategorised.' })
    }

    const { matchedCategory, matchedSubcategory } = await validPair(ctx, ctx.body.category, ctx.body.subcategory)

    const { data, error } = await ctx.admin().rpc('edit_transaction_category', {
      p_tenant_id: ctx.tenantId,
      p_transaction_id: ctx.body.transaction_id,
      p_actor_id: ctx.user.id,
      p_category: matchedCategory,
      p_subcategory: matchedSubcategory,
    })
    if (error) throw error

    await ctx.audit('transaction.category_edited', {
      target_type: 'transaction',
      target_id: ctx.body.transaction_id,
      transaction_id: ctx.body.transaction_id,
      before_category: transaction.category,
      before_subcategory: transaction.subcategory,
      category: matchedCategory,
      subcategory: matchedSubcategory,
      edit_id: data.edit_id,
      scope: 'transaction',
    })
    return data
  }

  if (ctx.body.action === 'bulk_edit') {
    if (new Set(ctx.body.transaction_ids).size !== ctx.body.transaction_ids.length) {
      throw new SafeHttpError(422, { error: 'Duplicate transaction selection' })
    }
    const visible = await visibleBulkTransactions(ctx, ctx.body.transaction_ids)
    if ((visible?.length ?? 0) !== ctx.body.transaction_ids.length) {
      throw new SafeHttpError(404, { error: 'One or more transactions were not found' })
    }
    if (visible?.some((row) => row.kind === 'adjustment' && row.kind_source === 'system')) {
      throw new SafeHttpError(409, { error: 'System reconciliation entries cannot be recategorised.' })
    }

    const updatesCategory = ctx.body.category !== undefined
    const updatesSubcategory = Object.prototype.hasOwnProperty.call(ctx.body, 'subcategory')
    const categories = [...new Set(visible?.map((row) => row.category) ?? [])]
    const validationCategory = ctx.body.category ?? (categories.length === 1 ? categories[0] : null)
    if (!validationCategory) {
      throw new SafeHttpError(422, { error: 'Selected transactions must share a category to change only their subcategory' })
    }
    const { matchedCategory, matchedSubcategory } = await validPair(
      ctx,
      validationCategory,
      updatesSubcategory ? ctx.body.subcategory : undefined,
    )

    const { data, error } = await ctx.admin().rpc('bulk_edit_transaction_categories', {
      p_tenant_id: ctx.tenantId,
      p_transaction_ids: ctx.body.transaction_ids,
      p_actor_id: ctx.user.id,
      p_category: updatesCategory ? matchedCategory : null,
      p_subcategory: updatesSubcategory ? matchedSubcategory : null,
      p_update_category: updatesCategory,
      p_update_subcategory: updatesSubcategory,
    })
    if (error) throw error
    await ctx.audit('transaction.categories_bulk_edited', {
      target_type: 'transaction_selection',
      operation_id: data.operation_id,
      selected: data.selected,
      updated: data.updated,
      category: updatesCategory ? matchedCategory : undefined,
      subcategory: updatesSubcategory ? matchedSubcategory : undefined,
      fields_updated: [updatesCategory ? 'category' : null, updatesSubcategory ? 'subcategory' : null].filter(Boolean),
      scope: 'selection',
    })
    return data
  }

  if (ctx.body.action === 'undo_operation') {
    const { data: edits, error: editError } = await ctx.db
      .from('transaction_category_edits')
      .select('id, transaction_id, undone_at')
      .eq('operation_id', ctx.body.operation_id)
    if (editError) throw editError
    if (!edits?.length) throw new SafeHttpError(404, { error: 'Category operation not found' })
    if (edits.some((edit) => edit.undone_at)) {
      throw new SafeHttpError(409, { error: 'Category operation already undone' })
    }
    const { data, error } = await ctx.admin().rpc('undo_transaction_category_operation', {
      p_tenant_id: ctx.tenantId,
      p_operation_id: ctx.body.operation_id,
      p_actor_id: ctx.user.id,
    })
    if (error) {
      if (error.message?.includes('changed after this operation')) {
        throw new SafeHttpError(409, { error: 'A transaction changed after this operation, so it cannot be undone.' })
      }
      throw error
    }
    await ctx.audit('transaction.category_operation_undone', {
      target_type: 'transaction_selection',
      operation_id: ctx.body.operation_id,
      restored: data.restored,
    })
    return data
  }

  const { data: edit, error: editError } = await ctx.db
    .from('transaction_category_edits')
    .select('id, transaction_id, undone_at')
    .eq('id', ctx.body.edit_id)
    .maybeSingle()
  if (editError) throw editError
  if (!edit) throw new SafeHttpError(404, { error: 'Category edit not found' })
  if (edit.undone_at) throw new SafeHttpError(409, { error: 'Category edit already undone' })

  const { data, error } = await ctx.admin().rpc('undo_transaction_category_edit', {
    p_tenant_id: ctx.tenantId,
    p_edit_id: ctx.body.edit_id,
    p_actor_id: ctx.user.id,
  })
  if (error) {
    if (error.message?.includes('changed after this edit')) {
      throw new SafeHttpError(409, { error: 'This transaction has changed since that edit and cannot be undone.' })
    }
    throw error
  }

  await ctx.audit('transaction.category_edit_undone', {
    target_type: 'transaction',
    target_id: edit.transaction_id,
    transaction_id: edit.transaction_id,
    edit_id: ctx.body.edit_id,
  })
  return data
}))
