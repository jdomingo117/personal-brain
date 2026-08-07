import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const DisconnectSchema = z.object({
  connection_id: z.string().uuid(),
  // Deleting a user's ledger as a side effect of disconnecting is not a
  // defensible default — the caller must ask, and the default the UI offers
  // must be "keep".
  keep_transactions: z.boolean(),
})

/**
 * Owner-gated, same as connect. Always deletes the credential (a disabled
 * connection has no legitimate reason to keep a live, usable token around);
 * the ledger is only removed if the caller explicitly says so.
 */
Deno.serve(
  withAuth({ schema: DisconnectSchema, requireRole: 'owner' }, async (ctx) => {
    const { connection_id, keep_transactions } = ctx.body
    const admin = ctx.admin()

    const { data: connection, error: connErr } = await ctx.db
      .from('provider_connections').select('id, provider').eq('id', connection_id).maybeSingle()
    if (connErr) throw connErr
    if (!connection) return { error: 'Connection not found.' }

    const { data: accountConns } = await ctx.db
      .from('account_connections').select('account_id').eq('connection_id', connection_id)

    if (!keep_transactions) {
      for (const ac of accountConns ?? []) {
        const { error: delErr } = await admin
          .from('transactions')
          .delete()
          .eq('account_id', ac.account_id)
          .eq('provider', connection.provider)
        if (delErr) throw delErr
      }
    }

    // account_connections cascades from provider_connections' FK, so it does
    // not need a separate delete — but do it explicitly first so a partial
    // failure doesn't leave the account looking connected with no way to
    // reach the (about to be deleted) credential.
    await admin.from('account_connections').delete().eq('connection_id', connection_id)
    await admin.schema('private').from('provider_credentials').delete().eq('connection_id', connection_id)
    const { error: connDelErr } = await admin.from('provider_connections').delete().eq('id', connection_id)
    if (connDelErr) throw connDelErr

    await ctx.audit('provider.disconnected', {
      connection_id,
      provider: connection.provider,
      transactions_retained: keep_transactions,
    })

    return { success: true }
  }),
)
