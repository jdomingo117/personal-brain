import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'

// Four shapes: a decision on an existing link (auto/suggested pair, or
// undoing an auto link), a decision on a single unmatched leg that never got
// a link row because matchTransfers() only ever emits pairs ('confirmed'
// only makes sense for a pairing, so a lone leg can't take it), a batch of
// link decisions, and a batch of leg decisions — both batch shapes exist for
// the same reason: the group-level bulk actions in OskoLinker.tsx are one
// round-trip and one rate-limit hit for what the user experiences as one
// click instead of N.
const DecideTransferSchema = z.union([
  z.object({
    link_id: z.string().uuid(),
    verdict: z.enum(['confirmed', 'rejected', 'external']),
    note: z.string().max(500).optional(),
  }),
  z.object({
    txn_id: z.string().uuid(),
    verdict: z.enum(['rejected', 'external']),
    note: z.string().max(500).optional(),
  }),
  z.object({
    link_ids: z.array(z.string().uuid()).min(1).max(200),
    verdict: z.enum(['confirmed', 'rejected', 'external']),
    note: z.string().max(500).optional(),
  }),
  z.object({
    txn_ids: z.array(z.string().uuid()).min(1).max(200),
    verdict: z.enum(['rejected', 'external']),
    note: z.string().max(500).optional(),
  }),
])

Deno.serve(
  withAuth({ schema: DecideTransferSchema, rateLimit: LIMITS.writePerUser }, async (ctx) => {
    if ('link_ids' in ctx.body) {
      const { data, error } = await ctx.db.rpc('decide_transfers_batch', {
        p_tenant_id: ctx.tenantId,
        p_link_ids: ctx.body.link_ids,
        p_verdict: ctx.body.verdict,
        p_note: ctx.body.note ?? null,
      })
      if (error) throw error

      await ctx.audit('transfers.decided', {
        link_ids: ctx.body.link_ids,
        count: ctx.body.link_ids.length,
        verdict: ctx.body.verdict,
      })

      return { decision_ids: (data ?? []).map((r: { decision_id: string }) => r.decision_id) }
    }

    if ('txn_ids' in ctx.body) {
      const { data, error } = await ctx.db.rpc('decide_transfer_legs_batch', {
        p_tenant_id: ctx.tenantId,
        p_txn_ids: ctx.body.txn_ids,
        p_verdict: ctx.body.verdict,
        p_note: ctx.body.note ?? null,
      })
      if (error) throw error

      await ctx.audit('transfers.decided', {
        txn_ids: ctx.body.txn_ids,
        count: ctx.body.txn_ids.length,
        verdict: ctx.body.verdict,
      })

      return { decision_ids: (data ?? []).map((r: { decision_id: string }) => r.decision_id) }
    }

    const isLeg = 'txn_id' in ctx.body

    const { data, error } = await (
      isLeg
        ? ctx.db.rpc('decide_transfer_leg', {
            p_tenant_id: ctx.tenantId,
            p_txn_id: ctx.body.txn_id,
            p_verdict: ctx.body.verdict,
            p_note: ctx.body.note ?? null,
          })
        : ctx.db.rpc('decide_transfer', {
            p_tenant_id: ctx.tenantId,
            p_link_id: ctx.body.link_id,
            p_verdict: ctx.body.verdict,
            p_note: ctx.body.note ?? null,
          })
    ).single()

    if (error) throw error

    await ctx.audit('transfers.decided', {
      ...(isLeg ? { txn_id: ctx.body.txn_id } : { link_id: ctx.body.link_id }),
      verdict: ctx.body.verdict,
      decision_id: data,
    })

    return { decision_id: data }
  }),
)
