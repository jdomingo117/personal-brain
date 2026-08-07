import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { decryptToken } from '../_shared/crypto.ts'
import { listUpAccounts, UpAuthError } from '../_shared/upClient.ts'

const MapSchema = z.object({
  connection_id: z.string().uuid(),
  provider_account_id: z.string().min(1),
  cutover_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Pushing the cutover earlier than the safe floor is allowed (the user may
  // genuinely have a gap in their CSV history), but only with this flag —
  // never silently. See the floor check below.
  acknowledge_overlap: z.boolean().optional(),
}).and(
  z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('existing'), account_id: z.string().uuid() }),
    z.object({
      mode: z.literal('new'),
      new_account_name: z.string().min(1).max(120),
      new_account_type: z.enum(['Liquid', 'Savings']), // Up accounts are TRANSACTIONAL|SAVER — never a credit product
    }),
  ]),
)

/**
 * Links one Up account to one Halcyon account. Owner-gated, same as
 * connect-provider: this writes cutover_date, an integrity-bearing field.
 *
 * Deliberately does NOT insert the reconciliation anchor — that used to
 * happen here, computed as `balance_now - existingSum`, which is only
 * correct when cutover_date is close to "now" (true when cutover always
 * defaulted to today). Once cutover can be set arbitrarily far in the past
 * (see ConnectBankModal's history presets / extend-provider-history), that
 * formula double-counts every real transaction between cutover and connect
 * time: once implicitly (already inside "balance now") and once explicitly
 * (backfill inserts it for real). The anchor is now computed by
 * sync-provider, once, right after a backfill actually finishes — see its
 * docblock. `accounts.balance` is still set immediately below purely for
 * "something recognisable shows while backfill runs"; it gets corrected to
 * the authoritative figure the moment that reconciliation runs.
 */
Deno.serve(
  withAuth({ schema: MapSchema, requireRole: 'owner' }, async (ctx) => {
    const body = ctx.body
    const admin = ctx.admin()

    const { data: connection, error: connErr } = await ctx.db
      .from('provider_connections')
      .select('id, provider, status')
      .eq('id', body.connection_id)
      .maybeSingle()
    if (connErr) throw connErr
    if (!connection) return { error: 'Connection not found.' }
    if (connection.status !== 'active') {
      return { error: 'This connection is not active — reconnect before mapping accounts.' }
    }

    const { data: credRow, error: credErr } = await admin
      .schema('private')
      .from('provider_credentials')
      .select('ciphertext')
      .eq('connection_id', connection.id)
      .maybeSingle()
    if (credErr) throw credErr
    if (!credRow) return { error: 'No credential stored for this connection — reconnect.' }

    const token = await decryptToken(credRow.ciphertext, {
      tenantId: ctx.tenantId,
      provider: connection.provider,
      connectionId: connection.id,
    })

    let upAccounts
    try {
      upAccounts = await listUpAccounts(token)
    } catch (err) {
      if (err instanceof UpAuthError) {
        // Same revocation handling as sync-provider: a dead token is pure
        // liability, so it's deleted rather than kept around unusable.
        await admin.schema('private').from('provider_credentials').delete().eq('connection_id', connection.id)
        await admin
          .from('provider_connections')
          .update({ status: 'revoked', last_error: 'token_revoked', last_error_at: new Date().toISOString() })
          .eq('id', connection.id)
        await ctx.audit('provider.token_revoked', { provider: connection.provider, connection_id: connection.id, detected_by: 'map_401' })
        return { error: 'token_revoked', message: 'Up disconnected — your access token was replaced. Reconnect to resume syncing.' }
      }
      throw err
    }
    const upAccount = upAccounts.find((a) => a.id === body.provider_account_id)
    if (!upAccount) return { error: 'That Up account was not found on this connection.' }
    if (upAccount.balance.currencyCode !== 'AUD') {
      // Up is AUD-only in practice; this guards the one line it would cost
      // to notice if that ever changes rather than silently mismatching units.
      return { error: `Unsupported currency ${upAccount.balance.currencyCode}.` }
    }

    let accountId: string
    if (body.mode === 'existing') {
      const { data: existingAccount, error: acctErr } = await ctx.db
        .from('accounts').select('id').eq('id', body.account_id).maybeSingle()
      if (acctErr) throw acctErr
      if (!existingAccount) return { error: 'Account not found.' }
      accountId = existingAccount.id

      const { data: alreadyConnected } = await ctx.db
        .from('account_connections').select('id').eq('account_id', accountId).maybeSingle()
      if (alreadyConnected) return { error: 'This account is already connected to a provider.' }
    } else {
      const { data: created, error: createErr } = await admin
        .from('accounts')
        .insert({
          user_id: ctx.user.id,
          tenant_id: ctx.tenantId,
          name: body.new_account_name,
          type: body.new_account_type,
          balance: upAccount.balance.valueInBaseUnits,
          currency: upAccount.balance.currencyCode,
        })
        .select('id')
        .single()
      if (createErr) throw createErr
      accountId = created.id
    }

    // ── Cutover floor ──────────────────────────────────────────────────
    const { data: latestTxn } = await ctx.db
      .from('transactions')
      .select('date')
      .eq('account_id', accountId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestTxn) {
      const floor = new Date(`${latestTxn.date}T00:00:00Z`)
      floor.setUTCDate(floor.getUTCDate() + 1)
      const floorIso = floor.toISOString().slice(0, 10)
      if (body.cutover_date < floorIso && !body.acknowledge_overlap) {
        return {
          error: 'overlap_unacknowledged',
          floor_date: floorIso,
          message: `This account has transactions up to ${latestTxn.date}. Choosing an earlier cutover may create duplicates — Up and your CSV import identify transactions differently and can't tell they're the same. Confirm to proceed anyway.`,
        }
      }
    }

    const { data: accountConnection, error: acErr } = await admin
      .from('account_connections')
      .insert({
        tenant_id: ctx.tenantId,
        connection_id: connection.id,
        account_id: accountId,
        provider: connection.provider,
        provider_account_id: upAccount.id,
        provider_account_type: upAccount.accountType,
        provider_ownership: upAccount.ownershipType,
        cutover_date: body.cutover_date,
      })
      .select('id')
      .single()
    if (acErr) throw acErr

    // Provisional — sync-provider overwrites this with the authoritative
    // figure the moment the backfill it's about to run actually finishes.
    const { error: balErr } = await admin
      .from('accounts')
      .update({ balance: upAccount.balance.valueInBaseUnits })
      .eq('id', accountId)
    if (balErr) throw balErr

    const { error: baErr } = await admin
      .from('account_connections')
      .update({ balance_as_of: new Date().toISOString() })
      .eq('id', accountConnection.id)
    if (baErr) throw baErr

    await ctx.audit('provider.account_mapped', {
      account_id: accountId,
      account_connection_id: accountConnection.id,
      provider_account_id: upAccount.id,
      cutover_date: body.cutover_date,
    })

    return {
      account_id: accountId,
      account_connection_id: accountConnection.id,
      balance_cents: upAccount.balance.valueInBaseUnits,
    }
  }),
)
