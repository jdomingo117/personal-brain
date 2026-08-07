import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { dedupeHashHex, toByteaLiteral } from '../_shared/dedupe.ts'
import { isTransferCandidateText } from '../_shared/transferMatch.ts'

const TransactionSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  original_description: z.string().max(500),
  merchant: z.string().max(200),
  category: z.string().max(100),
  subcategory: z.string().max(100).optional().nullable(),
  amount: z.number().int(), // Cents (negative for expenses)
  original_amount: z.number().int().optional().nullable(),
  original_currency: z.string().length(3).optional().nullable(),
  upload_batch_id: z.string().uuid().optional().nullable(),
  category_source: z.enum(['user', 'bank', 'ai', 'seed']).optional().nullable(),
  needs_review: z.boolean().optional(),
})

// A CSV import arrives as one batch. The cap bounds both the request body and
// the size of the resulting insert.
const PayloadSchema = z.union([TransactionSchema, z.array(TransactionSchema).max(5000)])

Deno.serve(
  withAuth({ schema: PayloadSchema, maxBodyBytes: 8 * 1024 * 1024 }, async (ctx) => {
    const rows = Array.isArray(ctx.body) ? ctx.body : [ctx.body]
    if (rows.length === 0) return { inserted: 0, skipped: 0, needsReview: 0 }

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
        user_id: ctx.user.id,
        tenant_id: ctx.tenantId,
        dedupe_hash: toByteaLiteral(hex),
        occurrence,
        // Computed server-side, like the dedupe hash: a client-supplied
        // classification could be forged to hide real spending from the
        // transfer review panel by claiming a purchase is a transfer.
        transfer_candidate: isTransferCandidateText(row.original_description, row.category),
      }
    })

    // ── Insert, skipping anything already present ───────────────────────
    // ignoreDuplicates turns a re-import into a no-op instead of an error:
    // re-importing is a normal thing for a user to do, not a failure.
    const { data, error } = await ctx.db
      .from('transactions')
      .upsert(payload, {
        onConflict: 'account_id,dedupe_hash,occurrence',
        ignoreDuplicates: true,
      })
      .select('id, needs_review')

    if (error) throw error

    const inserted = data?.length ?? 0
    const skipped = payload.length - inserted
    const needsReview = (data ?? []).filter((r) => r.needs_review).length

    await ctx.audit('transactions.imported', {
      submitted: payload.length,
      inserted,
      skipped,
      needs_review: needsReview,
      upload_batch_id: rows[0]?.upload_batch_id ?? null,
    })

    // Counts are returned so the UI can say "142 imported, 38 duplicates
    // skipped" rather than implying everything landed. Hiding the skipped
    // count is precisely what made the old double-import bug invisible.
    return { inserted, skipped, needsReview, transactions: data ?? [] }
  }),
)
