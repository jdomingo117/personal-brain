import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'
import { encryptToken, tokenHint } from '../_shared/crypto.ts'
import { pingUp, listUpAccounts, UpAuthError, UpForbiddenError } from '../_shared/upClient.ts'

const ConnectSchema = z.object({
  provider: z.literal('up'),
  token: z.string().min(10).max(500),
})

/**
 * Validates and stores a provider token. Owner-only: connecting or replacing
 * the household's bank credential is not something a `member` should be able
 * to do just because they can see the shared ledger.
 *
 * The token is validated live (a real /util/ping call) BEFORE anything is
 * written — the user finds out immediately if they pasted it wrong, not on
 * first sync. It is encrypted immediately after and the plaintext never
 * touches Postgres, not even inside this function's own transaction.
 */
Deno.serve(
  withAuth(
    { schema: ConnectSchema, requireRole: 'owner', rateLimit: LIMITS.providerConnectPerUser },
    async (ctx) => {
      const { provider, token } = ctx.body

      try {
        await pingUp(token)
      } catch (err) {
        if (err instanceof UpAuthError) {
          return { error: 'That token was rejected — check you copied it correctly.' }
        }
        if (err instanceof UpForbiddenError) {
          return { error: "That token doesn't have the required access." }
        }
        throw err
      }

      const admin = ctx.admin()

      // Reconnect (replacing a revoked/rotated token) reuses the existing
      // connection row rather than creating a new one — this is what
      // preserves every mapped account's cutover date and sync watermark
      // across a token replacement. A fresh connect and a reconnect must
      // look identical from here on.
      const { data: existing } = await ctx.db
        .from('provider_connections')
        .select('id, status')
        .eq('tenant_id', ctx.tenantId)
        .eq('provider', provider)
        .maybeSingle()

      let connectionId: string
      let isReplace = false

      if (existing) {
        connectionId = existing.id
        isReplace = true
      } else {
        const { data: inserted, error: insertErr } = await admin
          .from('provider_connections')
          .insert({ tenant_id: ctx.tenantId, user_id: ctx.user.id, provider, token_hint: tokenHint(token) })
          .select('id')
          .single()
        if (insertErr) throw insertErr
        connectionId = inserted.id
      }

      const { ciphertext, keyVersion } = await encryptToken(token, {
        tenantId: ctx.tenantId,
        provider,
        connectionId,
      })

      const { error: credErr } = await admin
        .schema('private')
        .from('provider_credentials')
        .upsert(
          { connection_id: connectionId, ciphertext, rotated_at: isReplace ? new Date().toISOString() : null },
          { onConflict: 'connection_id' },
        )
      if (credErr) throw credErr

      const { error: updateErr } = await admin
        .from('provider_connections')
        .update({
          status: 'active',
          token_hint: tokenHint(token),
          key_version: keyVersion,
          last_error: null,
          last_error_at: null,
          last_verified_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
      if (updateErr) throw updateErr

      const accounts = await listUpAccounts(token)

      await ctx.audit(isReplace ? 'provider.token_replaced' : 'provider.connected', {
        provider,
        connection_id: connectionId,
        account_count: accounts.length,
      })

      return {
        connection_id: connectionId,
        accounts: accounts.map((a) => ({
          provider_account_id: a.id,
          display_name: a.displayName,
          account_type: a.accountType,
          ownership_type: a.ownershipType,
          balance_cents: a.balance.valueInBaseUnits,
          currency_code: a.balance.currencyCode,
          // The real earliest possible bound for "all history" — Up has no
          // transactions before the account itself existed, so this beats
          // any arbitrary lookback default.
          created_at: a.createdAt,
        })),
      }
    },
  ),
)
