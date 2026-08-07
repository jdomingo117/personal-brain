import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const ExtendSchema = z.object({
  account_connection_id: z.string().uuid(),
  new_cutover_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Same discipline as map-provider-accounts' floor check — pushing into a
  // date range that already has CSV/manual history is allowed, but only
  // with this flag, never silently.
  acknowledge_overlap: z.boolean().optional(),
})

/**
 * Moves an already-connected account's cutover_date earlier and resets its
 * backfill state so the next sync-provider call walks the newly-exposed
 * range. Does NOT touch the anchor itself — sync-provider's reconcileAnchor
 * deletes and recomputes it the moment the resulting backfill actually
 * finishes (see that function's docblock), using a balance fetched fresh at
 * that point, which is what keeps this correct regardless of how far back
 * the new cutover goes.
 *
 * Owner-gated, same as connect/map/disconnect-provider: cutover_date is
 * integrity-bearing (see map-provider-accounts).
 */
Deno.serve(
  withAuth({ schema: ExtendSchema, requireRole: 'owner' }, async (ctx) => {
    const body = ctx.body
    const admin = ctx.admin()

    const { data: ac, error: acErr } = await ctx.db
      .from('account_connections')
      .select('id, account_id, connection_id, provider, cutover_date')
      .eq('id', body.account_connection_id)
      .maybeSingle()
    if (acErr) throw acErr
    if (!ac) return { error: 'Connection mapping not found.' }

    if (body.new_cutover_date >= ac.cutover_date) {
      return { error: 'The new date must be earlier than the current cutover — this only extends history backward.' }
    }

    const { data: connection, error: connErr } = await ctx.db
      .from('provider_connections')
      .select('status')
      .eq('id', ac.connection_id)
      .maybeSingle()
    if (connErr) throw connErr
    if (!connection || connection.status !== 'active') {
      return { error: 'This connection is not active — reconnect before extending history.' }
    }

    // ── Overlap floor: is there CSV/manual history inside the range we're
    // about to backfill into? ────────────────────────────────────────────
    const { data: latestNonProvider } = await ctx.db
      .from('transactions')
      .select('date')
      .eq('account_id', ac.account_id)
      .is('provider', null)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestNonProvider && latestNonProvider.date >= body.new_cutover_date && !body.acknowledge_overlap) {
      const floor = new Date(`${latestNonProvider.date}T00:00:00Z`)
      floor.setUTCDate(floor.getUTCDate() + 1)
      return {
        error: 'overlap_unacknowledged',
        floor_date: floor.toISOString().slice(0, 10),
        message: `You have imported history up to ${latestNonProvider.date}. Extending past that may create duplicates — Up and your CSV import identify transactions differently and can't tell they're the same. Confirm to proceed anyway.`,
      }
    }

    const { error: updateErr } = await admin
      .from('account_connections')
      .update({ cutover_date: body.new_cutover_date, backfill_done: false, backfill_cursor: null })
      .eq('id', ac.id)
    if (updateErr) throw updateErr

    await ctx.audit('provider.history_extended', {
      account_connection_id: ac.id,
      account_id: ac.account_id,
      old_cutover_date: ac.cutover_date,
      new_cutover_date: body.new_cutover_date,
    })

    return { success: true }
  }),
)
