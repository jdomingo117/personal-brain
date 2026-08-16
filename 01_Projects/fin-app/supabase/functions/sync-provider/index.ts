import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'
import { decryptToken, redactProviderTokens, TokenDecryptError } from '../_shared/crypto.ts'
import { providerDedupeHashHex, toByteaLiteral } from '../_shared/dedupe.ts'
import { normalizeMerchant } from '../_shared/normalizeMerchant.ts'
import { mapUpCategory } from '../_shared/upCategoryMap.ts'
import { isTransferCandidateText } from '../_shared/transferMatch.ts'
import { defaultTransactionKind } from '../_shared/classification.ts'
import { runLinkTransfers } from '../_shared/runLinkTransfers.ts'
import { runInvestmentCashLinks } from '../_shared/runInvestmentCashLinks.ts'
import {
  buildTransactionsUrl, fetchTransactionPage, getUpTransaction, listUpAccounts,
  UpAuthError, UpApiError, type UpTransaction,
} from '../_shared/upClient.ts'

const ANCHOR_DESCRIPTION = 'Opening Balance Offset (Reconciliation)'

const SyncSchema = z.object({
  connection_id: z.string().uuid(),
  trigger: z.enum(['manual', 'stale']).optional().default('manual'),
})

const REPLAY_DAYS = 7
const MAX_PENDING_REFRESH = 50
const BUDGET_MS = 45_000

interface AccountConnRow {
  id: string
  account_id: string
  provider_account_id: string
  cutover_date: string
  synced_through: string | null
  backfill_cursor: string | null
  backfill_done: boolean
}

/**
 * The chunked sync engine. No cron and no queue exist yet, so a multi-year
 * backfill cannot fit in one invocation — this budgets itself to ~45s, stops
 * cleanly at a page boundary, persists the cursor after each committed page
 * (never before), and returns done:false for the client to call again. This
 * is deliberately the shape a scheduler drops into later without a rewrite:
 * only the loop driver moves, from browser to cron.
 */
Deno.serve(
  withAuth({ schema: SyncSchema, rateLimit: LIMITS.providerSyncPerUser }, async (ctx) => {
    const { connection_id, trigger } = ctx.body
    const admin = ctx.admin()
    const deadline = Date.now() + BUDGET_MS

    const { data: connection, error: connErr } = await ctx.db
      .from('provider_connections')
      .select('id, provider, status')
      .eq('id', connection_id)
      .maybeSingle()
    if (connErr) throw connErr
    if (!connection) return { error: 'Connection not found.' }
    if (connection.status !== 'active') {
      return { error: `Connection is ${connection.status} — reconnect before syncing.` }
    }

    // A killed invocation must not lock the connection forever.
    await admin
      .from('sync_runs')
      .update({ status: 'stalled', finished_at: new Date().toISOString() })
      .eq('connection_id', connection_id)
      .eq('status', 'running')
      .lt('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

    const { data: accountConns, error: acErr } = await ctx.db
      .from('account_connections')
      .select('id, account_id, provider_account_id, cutover_date, synced_through, backfill_cursor, backfill_done')
      .eq('connection_id', connection_id)
    if (acErr) throw acErr
    if (!accountConns || accountConns.length === 0) {
      return { done: true, progress: { pages_fetched: 0, rows_inserted: 0 }, message: 'No accounts mapped yet.' }
    }

    const kind = accountConns.some((a) => !a.backfill_done) ? 'backfill' : 'incremental'

    const { data: runRow, error: runErr } = await admin
      .from('sync_runs')
      .insert({ tenant_id: ctx.tenantId, connection_id, kind, status: 'running', trigger })
      .select('id')
      .single()
    if (runErr) {
      if (runErr.code === '23505') {
        const { data: existingRun } = await ctx.db
          .from('sync_runs').select('id').eq('connection_id', connection_id).eq('status', 'running').maybeSingle()
        return { alreadyRunning: true, run_id: existingRun?.id ?? null }
      }
      throw runErr
    }
    const runId = runRow.id

    // Keys match sync_runs' columns exactly — this object is spread straight
    // into .update() calls below, and PostgREST rejects the WHOLE payload
    // (silently, if the caller doesn't check .error) on an unrecognised key.
    const totals = { pages_fetched: 0, rows_seen: 0, rows_inserted: 0, rows_updated: 0, rows_rejected_pre_cutover: 0 }
    let pendingDropped = 0
    let budgetExceeded = false
    // Widest span of dates any row written this run actually landed on — the
    // window handed to the post-sync rescan below. Not provider_posted_at:
    // that's a timestamp for ordering/watermarking, `date` is what
    // transfer_candidates filters on.
    let touchedFrom: string | null = null
    let touchedTo: string | null = null
    const trackDate = (date: string) => {
      if (!touchedFrom || date < touchedFrom) touchedFrom = date
      if (!touchedTo || date > touchedTo) touchedTo = date
    }

    try {
      const { data: credRow, error: credErr } = await admin
        .schema('private')
        .from('provider_credentials')
        .select('ciphertext')
        .eq('connection_id', connection_id)
        .maybeSingle()
      if (credErr) throw credErr
      if (!credRow) throw new TokenDecryptError('no credential stored')

      const token = await decryptToken(credRow.ciphertext, {
        tenantId: ctx.tenantId,
        provider: connection.provider,
        connectionId: connection_id,
      })

      // One extra call, reused for every account below — cheap, and it's
      // what keeps accounts.balance from going stale between backfills: the
      // provider's balance is fetched fresh every sync, not just at connect.
      const upAccounts = await listUpAccounts(token)
      const balanceByProviderAccountId = new Map(upAccounts.map((a) => [a.id, a.balance.valueInBaseUnits]))

      for (const acctConn of accountConns as AccountConnRow[]) {
        if (Date.now() > deadline) { budgetExceeded = true; break }

        const backfillDoneAtStart = acctConn.backfill_done
        let url: string | null
        let isBackfillPass = !acctConn.backfill_done
        if (isBackfillPass) {
          url = acctConn.backfill_cursor ?? buildTransactionsUrl(acctConn.provider_account_id, `${acctConn.cutover_date}T00:00:00+10:00`)
        } else {
          const sinceDate = acctConn.synced_through
            ? new Date(new Date(acctConn.synced_through).getTime() - REPLAY_DAYS * 86_400_000)
            : new Date(`${acctConn.cutover_date}T00:00:00Z`)
          const cutoverDate = new Date(`${acctConn.cutover_date}T00:00:00Z`)
          const since = sinceDate < cutoverDate ? cutoverDate : sinceDate
          url = buildTransactionsUrl(acctConn.provider_account_id, since.toISOString())
        }

        let latestPostedAt: string | null = acctConn.synced_through

        while (url) {
          if (Date.now() > deadline) { budgetExceeded = true; break }

          const page = await fetchTransactionPage(url, token)
          totals.pages_fetched++
          totals.rows_seen += page.transactions.length

          const mapped = await Promise.all(
            page.transactions.map((t) => toRow(t, acctConn, connection.provider, ctx.user.id, ctx.tenantId)),
          )
          const rows = mapped.filter((r): r is NonNullable<typeof r> => {
            if (r === null) { totals.rows_rejected_pre_cutover++; return false }
            return true
          })

          if (rows.length > 0) {
            // Pre-check which external_ids already exist, both to count
            // inserts vs updates accurately and to preserve a user's own
            // category correction rather than let the provider's guess
            // silently overwrite it.
            const externalIds = rows.map((r) => r.external_id)
            const { data: existingRows } = await ctx.db
              .from('transactions')
              .select('external_id, category, subcategory, category_source, category_confidence, needs_review')
              .eq('account_id', acctConn.account_id)
              .in('external_id', externalIds)
            const existingByExternalId = new Map((existingRows ?? []).map((r) => [r.external_id, r]))

            // A durable user rule outranks the provider's category. Resolve it
            // in the synchronous ingestion path so a correction survives the
            // very next sync; AI remains asynchronous in categorize-pending.
            const merchantKeys = [...new Set(rows.map((row) => row.merchant_key))]
            const userRules = new Map<string, { category: string; subcategory: string | null }>()
            for (let i = 0; i < merchantKeys.length; i += 100) {
              const { data: rules, error: rulesError } = await ctx.db
                .from('merchant_rules')
                .select('merchant_key, category, subcategory')
                .eq('source', 'user')
                .in('merchant_key', merchantKeys.slice(i, i + 100))
              if (rulesError) throw rulesError
              for (const rule of rules ?? []) userRules.set(rule.merchant_key, rule)
            }

            const payload = rows.map((r) => {
              const existing = existingByExternalId.get(r.external_id)
              if (existing?.category_source === 'user') {
                return {
                  ...r, category: existing.category, subcategory: existing.subcategory,
                  category_source: 'user' as const,
                  category_confidence: existing.category_confidence,
                  needs_review: existing.needs_review,
                }
              }
              const rule = userRules.get(r.merchant_key)
              if (rule) {
                return {
                  ...r, category: rule.category, subcategory: rule.subcategory,
                  category_source: 'user' as const, category_confidence: 1,
                  needs_review: false,
                }
              }
              return r
            })

            const { error: upsertErr } = await admin
              .from('transactions')
              .upsert(payload, { onConflict: 'account_id,dedupe_hash,occurrence', ignoreDuplicates: false })
            if (upsertErr) throw upsertErr

            totals.rows_inserted += payload.filter((r) => !existingByExternalId.has(r.external_id)).length
            totals.rows_updated += payload.filter((r) => existingByExternalId.has(r.external_id)).length
            for (const r of payload) trackDate(r.date)
          }

          for (const t of page.transactions) {
            const posted = t.settledAt ?? t.createdAt
            if (!latestPostedAt || posted > latestPostedAt) latestPostedAt = posted
          }

          if (isBackfillPass) {
            // Persisted after THIS page commits, never before — a killed
            // invocation resumes from the last page that actually landed.
            const stillMore = page.next !== null
            await admin
              .from('account_connections')
              .update({
                backfill_cursor: page.next,
                backfill_done: !stillMore,
                // Up returns newest-first, so the watermark only advances
                // once the WHOLE backfill completes — advancing it mid-walk
                // would make an interrupted backfill look caught up while
                // its tail (the oldest transactions) is still missing.
                synced_through: stillMore ? acctConn.synced_through : latestPostedAt,
                last_synced_at: new Date().toISOString(),
              })
              .eq('id', acctConn.id)
            if (!stillMore) isBackfillPass = false
          } else {
            await admin
              .from('account_connections')
              .update({ synced_through: latestPostedAt, last_synced_at: new Date().toISOString() })
              .eq('id', acctConn.id)
          }

          url = page.next
        }

        if (Date.now() > deadline) { budgetExceeded = true; break }

        // ── Pending refresh: re-check still-held rows by id ─────────────
        const { data: pendingRows } = await ctx.db
          .from('transactions')
          .select('id, external_id')
          .eq('account_id', acctConn.account_id)
          .eq('pending', true)
          .not('external_id', 'is', null)
          .order('provider_posted_at', { ascending: true })
          .limit(MAX_PENDING_REFRESH)

        for (const p of pendingRows ?? []) {
          const fresh = await getUpTransaction(p.external_id, token)
          if (fresh === null) {
            // The hold vanished (expired/cancelled auth) — it never happened.
            await admin.from('transactions').delete().eq('id', p.id)
            pendingDropped++
            await ctx.audit('provider.pending_dropped', { account_id: acctConn.account_id, external_id: p.external_id })
            continue
          }
          if (fresh.status === 'SETTLED') {
            const row = await toRow(fresh, acctConn, connection.provider, ctx.user.id, ctx.tenantId)
            if (row) {
              await admin
                .from('transactions')
                .update({
                  amount: row.amount, date: row.date, pending: false,
                  original_description: row.original_description, merchant: row.merchant,
                  provider_posted_at: row.provider_posted_at,
                })
                .eq('id', p.id)
              totals.rows_updated++
              trackDate(row.date)
            }
          }
        }

        // ── Balance refresh + one-time reconciliation ────────────────────
        const freshBalance = balanceByProviderAccountId.get(acctConn.provider_account_id)
        if (freshBalance !== undefined) {
          // The backfill that covers [cutover_date, now] just finished for
          // the first time this call — reconcile now, using a balance
          // fetched fresh THIS call and a ledger sum that already includes
          // every row that backfill just committed. See map-provider-accounts'
          // docblock for why this can't happen any earlier: doing it before
          // backfill runs double-counts everything between cutover and "now"
          // once cutover isn't pinned to today.
          if (!backfillDoneAtStart && !isBackfillPass) {
            await reconcileAnchor(admin, ctx.user.id, ctx.tenantId, connection.provider, acctConn, freshBalance)
          }
          await admin.from('accounts').update({ balance: freshBalance }).eq('id', acctConn.account_id)
          await admin.from('account_connections').update({ balance_as_of: new Date().toISOString() }).eq('id', acctConn.id)
        }
      }

      // Best-effort, same discipline as CSVUploader's post-commit rescan: a
      // failed link pass must not fail the sync that already landed. Only
      // Up's own transferAccount signal needs this to fire promptly — the
      // ordinary fuzzy matcher still gets its turn on the next rescan either
      // way — but a settled Up->Up transfer should link the moment both legs
      // exist, not wait for the user to open the transfer panel.
      if (touchedFrom && touchedTo) {
        try {
          await runLinkTransfers(ctx.db, ctx.tenantId, touchedFrom, touchedTo)
          await runInvestmentCashLinks(ctx.db, admin, ctx.tenantId, touchedFrom, touchedTo)
        } catch (err) {
          console.error('post-sync transfer rescan failed', String(err))
        }
      }

      const status = budgetExceeded ? 'partial' : 'succeeded'
      const { error: finishErr } = await admin
        .from('sync_runs')
        .update({ status, finished_at: new Date().toISOString(), ...totals })
        .eq('id', runId)
      if (finishErr) throw finishErr

      return { done: !budgetExceeded, run_id: runId, progress: { ...totals, pending_dropped: pendingDropped } }
    } catch (err) {
      if (err instanceof UpAuthError) {
        // Up revoked this token (the user generated a new one elsewhere). A
        // dead token is pure liability — delete it rather than keep it.
        await admin.schema('private').from('provider_credentials').delete().eq('connection_id', connection_id)
        await admin
          .from('provider_connections')
          .update({ status: 'revoked', last_error: 'token_revoked', last_error_at: new Date().toISOString() })
          .eq('id', connection_id)
        const { error: revokeRunErr } = await admin
          .from('sync_runs')
          .update({ status: 'failed', finished_at: new Date().toISOString(), error_code: 'token_revoked', ...totals })
          .eq('id', runId)
        if (revokeRunErr) throw revokeRunErr
        await ctx.audit('provider.token_revoked', { provider: connection.provider, connection_id, detected_by: 'sync_401' })
        return { error: 'token_revoked', message: 'Up disconnected — your access token was replaced. Reconnect to resume syncing.' }
      }

      const errorCode = err instanceof UpApiError ? `up_${err.status}` : err instanceof TokenDecryptError ? 'credential_unreadable' : 'unknown'
      const detail = redactProviderTokens(String(err instanceof Error ? err.message : err)).slice(0, 500)
      await admin
        .from('provider_connections')
        .update({ status: 'error', last_error: errorCode, last_error_at: new Date().toISOString() })
        .eq('id', connection_id)
      const { error: failRunErr } = await admin
        .from('sync_runs')
        .update({ status: 'failed', finished_at: new Date().toISOString(), error_code: errorCode, error_detail: detail, ...totals })
        .eq('id', runId)
      if (failRunErr) throw failRunErr
      await ctx.audit('provider.sync_failed', { run_id: runId, error_code: errorCode })
      return { error: errorCode, message: 'Sync failed — please try again.' }
    }
  }),
)

/**
 * Runs exactly once per account_connection, the moment its backfill first
 * finishes covering [cutover_date, now]. Replaces any existing anchor (an
 * extend-provider-history re-run leaves a stale one behind) with
 * `fresh_balance - sum(everything currently in the ledger)` — by this point
 * that sum already includes the CSV/manual history before cutover AND every
 * row the backfill that just finished committed, so the formula is correct
 * regardless of how far back cutover was set. See map-provider-accounts'
 * docblock for the bug this replaced (computing the anchor before backfill
 * ran, which only worked when cutover ≈ today).
 */
async function reconcileAnchor(
  admin: SupabaseClient,
  userId: string,
  tenantId: string,
  provider: string,
  acctConn: AccountConnRow,
  freshBalanceCents: number,
): Promise<void> {
  const anchorExternalId = `up-anchor:${acctConn.id}`

  await admin
    .from('transactions')
    .delete()
    .eq('account_id', acctConn.account_id)
    .eq('provider', provider)
    .eq('external_id', anchorExternalId)

  const { data: existingTxns } = await admin
    .from('transactions')
    .select('amount')
    .eq('account_id', acctConn.account_id)
  const existingSum = (existingTxns ?? []).reduce((sum, t) => sum + t.amount, 0)
  const offsetCents = freshBalanceCents - existingSum
  if (offsetCents === 0) return

  const anchorDate = new Date(`${acctConn.cutover_date}T00:00:00Z`)
  anchorDate.setUTCDate(anchorDate.getUTCDate() - 1)
  const anchorHash = await providerDedupeHashHex(provider, anchorExternalId)

  await admin.from('transactions').upsert(
    {
      user_id: userId,
      tenant_id: tenantId,
      account_id: acctConn.account_id,
      date: anchorDate.toISOString().slice(0, 10),
      original_description: ANCHOR_DESCRIPTION,
      merchant: 'Opening Balance',
      category: 'Transfer',
      subcategory: 'Reconciliation',
      amount: offsetCents,
      category_source: 'seed',
      needs_review: false,
      provider,
      external_id: anchorExternalId,
      dedupe_hash: toByteaLiteral(anchorHash),
      occurrence: 0,
    },
    { onConflict: 'account_id,dedupe_hash,occurrence', ignoreDuplicates: true },
  )
}

/**
 * Maps one Up transaction to a transactions row, or null if it falls before
 * the account's cutover date (CSV owns that history — see
 * account_connections.cutover_date).
 */
async function toRow(
  t: UpTransaction, acctConn: AccountConnRow, provider: string, userId: string, tenantId: string,
) {
  const postedAt = t.settledAt ?? t.createdAt
  const date = postedAt.slice(0, 10)
  if (date < acctConn.cutover_date) return null

  const mapped = mapUpCategory(t.categoryId, t.parentCategoryId, t.transferAccountId)
  const merchant = normalizeMerchant(t.rawText ?? t.description)
  const originalDescription = t.rawText ?? t.description
  const category = mapped?.category ?? 'Uncategorized'
  const subcategory = mapped?.subcategory ?? null
  const hashHex = await providerDedupeHashHex(provider, t.id)

  return {
    user_id: userId,
    tenant_id: tenantId,
    account_id: acctConn.account_id,
    date,
    original_description: originalDescription,
    merchant: merchant.display,
    merchant_key: merchant.key,
    category,
    subcategory,
    category_source: mapped ? ('bank' as const) : null,
    needs_review: !mapped,
    amount: t.amount.valueInBaseUnits,
    original_amount: t.foreignAmount?.valueInBaseUnits ?? null,
    original_currency: t.foreignAmount?.currencyCode ?? null,
    provider,
    external_id: t.id,
    pending: t.status === 'HELD',
    provider_posted_at: postedAt,
    provider_transfer_account_id: t.transferAccountId,
    transfer_candidate: isTransferCandidateText(
      originalDescription,
      defaultTransactionKind(category, subcategory, t.amount.valueInBaseUnits),
    ),
    dedupe_hash: toByteaLiteral(hashHex),
    occurrence: 0,
  }
}
