import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { SafeHttpError, withAuth } from '../_shared/withAuth.ts'
import { dedupeHashHex } from '../_shared/dedupe.ts'
import { isTransferCandidateText } from '../_shared/transferMatch.ts'
import { connectedImportViolation } from '../_shared/connectedImportPolicy.ts'
import { defaultTransactionKind } from '../_shared/classification.ts'

// Mirrors app/src/lib/csv/limits.ts and the atomic SQL migration. The client
// rejects an oversized source early, but the server owns the write boundary.
const MAX_SOURCE_ROWS = 5_000
const MAX_SUBMITTED_TRANSACTIONS = 5_000

const TransactionSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  original_description: z.string().max(500),
  merchant: z.string().max(200),
  category: z.string().trim().min(1).max(100),
  subcategory: z.string().trim().max(100).optional().nullable(),
  amount: z.number().int(), // Cents (negative for expenses)
  original_amount: z.number().int().optional().nullable(),
  original_currency: z.string().length(3).optional().nullable(),
  upload_batch_id: z.string().uuid().optional().nullable(),
  category_source: z.enum(['user', 'bank', 'ai', 'seed']).optional().nullable(),
  category_confidence: z.number().min(0).max(1).optional().nullable(),
  needs_review: z.boolean().optional(),
})

type ImportRow = z.infer<typeof TransactionSchema>

/**
 * The schema validates untrusted value shapes; this resolver validates their
 * meaning against the active database taxonomy for the importing tenant.
 *
 * `_shared/taxonomy.ts` remains authoritative for model output, but an import
 * can legitimately use an active tenant custom subcategory which cannot live
 * in that static, global vocabulary. The database trigger remains the final
 * constraint; resolving here produces a clear 422 before the atomic import.
 */
async function resolveTaxonomyPairs(db: any, tenantId: string, rows: ImportRow[]): Promise<ImportRow[]> {
  const [categoriesResult, subcategoriesResult] = await Promise.all([
    db.from('taxonomy_categories').select('id,display_name').eq('active', true),
    db.from('taxonomy_subcategories').select('category_id,display_name').eq('active', true),
  ])
  if (categoriesResult.error) throw categoriesResult.error
  if (subcategoriesResult.error) throw subcategoriesResult.error

  const categoriesByName = new Map<string, { id: string; displayName: string }>()
  for (const category of categoriesResult.data ?? []) {
    categoriesByName.set(category.display_name.toLocaleLowerCase(), {
      id: category.id,
      displayName: category.display_name,
    })
  }
  const globalSubcategories = new Map<string, string>()
  for (const subcategory of subcategoriesResult.data ?? []) {
    globalSubcategories.set(
      `${subcategory.category_id}:${subcategory.display_name.toLocaleLowerCase()}`,
      subcategory.display_name,
    )
  }

  const { data: customSubcategories, error: customError } = await db
    .from('tenant_subcategories')
    .select('category_id,display_name')
    .eq('tenant_id', tenantId)
    .eq('active', true)
  if (customError) throw customError
  const customSubcategoryNames = new Map<string, string>()
  for (const subcategory of customSubcategories ?? []) {
    customSubcategoryNames.set(
      `${subcategory.category_id}:${subcategory.display_name.toLocaleLowerCase()}`,
      subcategory.display_name,
    )
  }

  return rows.map((row, index) => {
    const category = categoriesByName.get(row.category.toLocaleLowerCase())
    if (!category) {
      throw new SafeHttpError(422, {
        error: 'invalid_taxonomy_pair',
        message: `Category "${row.category}" is not active in your taxonomy.`,
        row: index,
      })
    }

    const requestedSubcategory = row.subcategory?.trim() || null
    const key = requestedSubcategory
      ? `${category.id}:${requestedSubcategory.toLocaleLowerCase()}`
      : null
    const subcategory = key
      ? globalSubcategories.get(key) ?? customSubcategoryNames.get(key)
      : null
    if (requestedSubcategory && !subcategory) {
      throw new SafeHttpError(422, {
        error: 'invalid_taxonomy_pair',
        message: `Subcategory "${requestedSubcategory}" does not belong to "${category.displayName}" in your taxonomy.`,
        row: index,
      })
    }
    if (category.displayName === 'Transfer' && subcategory === 'Reconciliation'
      && row.original_description !== 'Opening Balance Offset (Reconciliation)') {
      throw new SafeHttpError(422, {
        error: 'reserved_reconciliation',
        message: 'Reconciliation is reserved for system entries.',
        row: index,
      })
    }
    return { ...row, category: category.displayName, subcategory }
  })
}

// A CSV import arrives as one batch. The cap bounds both the request body and
// the size of the resulting insert.
const ImportSchema = z.object({
  transactions: z.array(TransactionSchema).min(1).max(MAX_SUBMITTED_TRANSACTIONS),
  target_balance: z.number().int().optional().nullable(),
  file_name: z.string().trim().min(1).max(255).optional(),
  source_row_count: z.number().int().nonnegative().max(MAX_SOURCE_ROWS).optional(),
  blocked_count: z.number().int().nonnegative().optional(),
}).superRefine((value, ctx) => {
  const sourceRows = value.source_row_count ?? value.transactions.length
  if (sourceRows < value.transactions.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['source_row_count'],
      message: 'source_row_count cannot be smaller than the submitted transaction count',
    })
  }
  if ((value.blocked_count ?? 0) > sourceRows) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blocked_count'],
      message: 'blocked_count cannot exceed source_row_count',
    })
  }
})
const PayloadSchema = z.union([
  TransactionSchema,
  z.array(TransactionSchema).max(MAX_SUBMITTED_TRANSACTIONS),
  ImportSchema,
])

Deno.serve(
  withAuth({ schema: PayloadSchema, maxBodyBytes: 8 * 1024 * 1024 }, async (ctx) => {
    const isImport = !Array.isArray(ctx.body) && 'transactions' in ctx.body
    const submittedRows = isImport
      ? ctx.body.transactions
      : Array.isArray(ctx.body) ? ctx.body : [ctx.body]
    const targetBalance = isImport ? ctx.body.target_balance ?? null : null
    const fileName = isImport ? ctx.body.file_name ?? null : null
    const sourceRowCount = isImport ? ctx.body.source_row_count ?? submittedRows.length : submittedRows.length
    const blockedCount = isImport ? ctx.body.blocked_count ?? 0 : 0
    if (submittedRows.length === 0) return { inserted: 0, skipped: 0, needsReview: 0 }

    const accountIds = [...new Set(submittedRows.map((row) => row.account_id))]
    if (accountIds.length !== 1) {
      throw new SafeHttpError(422, {
        error: 'single_account_required',
        message: 'A transaction import must target exactly one account.',
      })
    }

    const rows = await resolveTaxonomyPairs(ctx.db, ctx.tenantId, submittedRows)

    // A provider-connected account has an explicit ownership seam: CSV may
    // write history before cutover_date, while the provider owns that date and
    // everything after it. Enforce this here even though CSVUploader provides
    // the same guardrail — browser state is advisory, never an integrity
    // boundary. Reconciliation anchors are manual balance restatements and are
    // never valid once a provider owns the balance.
    const { data: connections, error: connectionError } = await ctx.db
      .from('account_connections')
      .select('account_id, cutover_date')
      .in('account_id', accountIds)
    if (connectionError) throw connectionError

    if ((connections?.length ?? 0) > 0 && targetBalance !== null) {
      throw new SafeHttpError(409, {
        error: 'connected_account_reconciliation_forbidden',
        message: 'This account balance is owned by its bank connection and cannot be reconciled by CSV.',
        account_id: accountIds[0],
        cutover_date: connections?.[0]?.cutover_date,
      })
    }

    const violation = connectedImportViolation(rows, connections ?? [])
    if (violation) {
      throw new SafeHttpError(409, {
        error: violation.code,
        message: violation.code === 'connected_account_reconciliation_forbidden'
          ? 'This account balance is owned by its bank connection and cannot be reconciled by CSV.'
          : `CSV history for this connected account must be dated before ${violation.cutoverDate}.`,
        account_id: violation.accountId,
        cutover_date: violation.cutoverDate,
      })
    }

    // ── Hash every row, server-side ─────────────────────────────────────
    // The client computes the same hashes to preview which rows will be
    // skipped, but never sends them: a caller who could name their own hash
    // could collide with — and therefore suppress — someone else's row, or
    // sidestep duplicate detection entirely by sending a random one.
    const hashed = await Promise.all(
      rows.map(async (r) => ({
        row: r,
        hex: await dedupeHashHex({
          accountId: r.account_id,
          date: r.date,
          amountCents: r.amount,
          originalDescription: r.original_description,
        }),
      })),
    )

    // ── Occurrence ordinals, counted WITHIN THIS BATCH, always from 0 ──────
    //
    // Per-batch is the whole trick, and it is easy to get backwards. Starting
    // the ordinals from the count already in the account would guarantee that
    // a re-import never collides — the second import would simply continue at
    // 1, 2, 3 and insert duplicates forever.
    //
    // Counting from 0 every time means the same file always produces the same
    // (hash, occurrence) pairs, so a re-import collides on every row, while a
    // file that genuinely contains the same coffee twice still yields
    // occurrences 0 and 1 and inserts both.
    //
    // The accepted trade-off: a genuinely new transaction that is identical to
    // one already imported (same account, date, cents and description) but
    // arrives in a SEPARATE file is treated as a duplicate and skipped. That
    // is the conservative choice, and it is the correct one here — overlapping
    // statement periods are the common case, and re-importing an overlap
    // should not double the ledger.
    const running = new Map<string, number>()
    const payload = hashed.map(({ row, hex }) => {
      const key = `${row.account_id}:${hex}`
      const occurrence = running.get(key) ?? 0
      running.set(key, occurrence + 1)
      return {
        ...row,
        dedupe_hash_hex: hex,
        occurrence,
        // Computed server-side, like the dedupe hash: a client-supplied
        // classification could be forged to hide real spending from the
        // transfer review panel by claiming a purchase is a transfer.
        transfer_candidate: isTransferCandidateText(
          row.original_description,
          defaultTransactionKind(row.category, row.subcategory, row.amount),
        ),
      }
    })

    const batchIds = [...new Set(rows.map((row) => row.upload_batch_id ?? null))]
    if (batchIds.length !== 1) {
      throw new SafeHttpError(422, {
        error: 'single_upload_batch_required',
        message: 'Every row in an import must use the same upload batch.',
      })
    }

    // One RPC means one PostgreSQL transaction: dedupe, reconciliation-anchor
    // replacement and accounts.balance either all commit or all roll back.
    const { data, error } = await ctx.db.rpc('import_transactions_atomic', {
      p_tenant_id: ctx.tenantId,
      p_account_id: accountIds[0],
      p_rows: payload,
      p_upload_batch_id: batchIds[0],
      p_target_balance: targetBalance,
      p_file_name: fileName,
      p_source_row_count: sourceRowCount,
      p_blocked_count: blockedCount,
    })
    if (error) throw error

    const result = data as {
      inserted: number
      skipped: number
      needsReview: number
      reconciliationAmount: number | null
      reconciliationDate: string | null
    }

    await ctx.audit('transactions.imported', {
      submitted: payload.length,
      inserted: result.inserted,
      skipped: result.skipped,
      needs_review: result.needsReview,
      upload_batch_id: batchIds[0],
      file_name: fileName,
      source_rows: sourceRowCount,
      blocked: blockedCount,
      reconciled: targetBalance !== null,
    })

    // Counts are returned so the UI can say "142 imported, 38 duplicates
    // skipped" rather than implying everything landed. Hiding the skipped
    // count is precisely what made the old double-import bug invisible.
    return result
  }),
)
