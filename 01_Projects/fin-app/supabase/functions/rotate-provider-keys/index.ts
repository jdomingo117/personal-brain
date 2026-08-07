import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'
import { decryptToken, encryptToken, redactProviderTokens } from '../_shared/crypto.ts'

const RotateSchema = z.object({}).optional()

/**
 * Re-encrypts every stored provider credential under the newest
 * PROVIDER_TOKEN_KEYS version. The rotation workflow (see .env.example):
 * add a new highest version, deploy, run this, then remove the old version
 * once nothing references it — this function is the "run this" step, the
 * thing that actually moves ciphertext off a version you're about to retire.
 *
 * Platform-admin only: this reaches across every tenant's credentials, which
 * no tenant-scoped role should be able to trigger. withAuth still resolves a
 * tenant (every user has exactly one) purely to get a valid caller through
 * the pipeline — the actual gate is the admin app_metadata check below, and
 * the rotation itself operates tenant-blind via the service-role client.
 */
Deno.serve(
  withAuth({ schema: RotateSchema, rateLimit: LIMITS.writePerUser }, async (ctx) => {
    const admin = ctx.admin()

    const { data: userRec, error: userErr } = await admin.auth.admin.getUserById(ctx.user.id)
    if (userErr) throw userErr
    if (userRec.user?.app_metadata?.admin !== true) {
      return { error: 'Forbidden — platform admin only.' }
    }

    const [{ data: credRows, error: credErr }, { data: connRows, error: connErr }] = await Promise.all([
      admin.schema('private').from('provider_credentials').select('connection_id, ciphertext'),
      admin.from('provider_connections').select('id, tenant_id, provider, key_version'),
    ])
    if (credErr) throw credErr
    if (connErr) throw connErr

    const connectionById = new Map((connRows ?? []).map((c) => [c.id, c]))

    let rotated = 0
    let alreadyCurrent = 0
    let failed = 0
    const failedConnectionIds: string[] = []

    for (const row of credRows ?? []) {
      const connection = connectionById.get(row.connection_id)
      if (!connection) { failed++; failedConnectionIds.push(row.connection_id); continue }

      const currentVersion = Number(row.ciphertext.split('.')[0]?.slice(1))
      const aad = { tenantId: connection.tenant_id, provider: connection.provider, connectionId: connection.id }

      try {
        const plaintext = await decryptToken(row.ciphertext, aad)
        const { ciphertext, keyVersion } = await encryptToken(plaintext, aad)

        if (keyVersion === currentVersion) { alreadyCurrent++; continue }

        const { error: credUpdateErr } = await admin
          .schema('private')
          .from('provider_credentials')
          .update({ ciphertext, rotated_at: new Date().toISOString() })
          .eq('connection_id', row.connection_id)
        if (credUpdateErr) throw credUpdateErr

        const { error: connUpdateErr } = await admin
          .from('provider_connections')
          .update({ key_version: keyVersion })
          .eq('id', connection.id)
        if (connUpdateErr) throw connUpdateErr

        rotated++
      } catch (err) {
        // A single unreadable row (corrupted, or genuinely missing its key —
        // see decryptToken's docblock) must not abort every other tenant's
        // rotation. Surfaced in the summary and audit, not silently dropped.
        failed++
        failedConnectionIds.push(row.connection_id)
        console.error('rotate-provider-keys: row failed', row.connection_id, redactProviderTokens(String(err instanceof Error ? err.message : err)))
      }
    }

    await ctx.audit('provider.keys_rotated', { rotated, already_current: alreadyCurrent, failed, failed_connection_ids: failedConnectionIds })

    return { rotated, alreadyCurrent, failed, failedConnectionIds }
  }),
)
