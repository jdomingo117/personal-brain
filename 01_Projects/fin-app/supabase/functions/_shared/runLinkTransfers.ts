import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  MATCHER_VERSION,
  WINDOW_DAYS,
  classifyTransferLeg,
  detectPairCadence,
  matchTransfers,
  pairKey,
  toPersistableLink,
  type AccountIdentifier,
  type MatchableAccountType,
  type PairCadence,
  type TransferLeg,
} from './transferMatch.ts'

/**
 * The transfer-linking core, factored out of link-transfers/index.ts so
 * sync-provider can call it in-process after committing a batch of rows —
 * no HTTP hop, no second auth/rate-limit pass, same RLS-scoped client. The
 * Edge Function itself stays a thin wrapper around this (window resolution +
 * the `scope: 'all'` case), so the two never drift on what a rescan actually
 * does.
 */

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** PostgREST returns `bytea` as a `\x`-prefixed hex string. */
function byteaToHex(value: unknown): string {
  return String(value ?? '').replace(/^\\x/, '')
}

// Matches this project's PostgREST max_rows — a single unbounded call to a
// SETOF/TABLE-returning RPC is silently truncated at this many rows with no
// error, no warning, and no ORDER BY to make the truncation predictable.
// Confirmed against real data: a tenant with 3,162 transfer-candidate rows
// had a full rescan silently consider only the first 1,000, permanently
// missing genuine pairs whose legs didn't happen to land in that slice.
const CANDIDATE_PAGE_SIZE = 1000

/** Fetches every transfer_candidates() row for the window, paginating past
 *  PostgREST's max_rows cap rather than relying on a single call. */
async function fetchAllCandidates(
  db: SupabaseClient,
  tenantId: string,
  from: string,
  to: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await db
      .rpc('transfer_candidates', { p_tenant_id: tenantId, p_from: from, p_to: to })
      .range(offset, offset + CANDIDATE_PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < CANDIDATE_PAGE_SIZE) break
    offset += CANDIDATE_PAGE_SIZE
  }
  return rows
}

export interface LinkTransfersResult {
  created: number
  kept: number
  removed: number
  auto: number
  suggested: number
  overflowedAmounts: number[]
}

export async function runLinkTransfers(
  db: SupabaseClient,
  tenantId: string,
  from: string,
  to: string,
  isFullRescan = false,
): Promise<LinkTransfersResult> {
  const paddedFrom = addDaysIso(from, -WINDOW_DAYS)
  const paddedTo = addDaysIso(to, WINDOW_DAYS)

  const [
    candidateRows,
    { data: identifierRows, error: idErr },
    { data: exclusionRows, error: exclErr },
    { data: connectionRows, error: connErr },
    { data: pairHistoryRows, error: pairHistErr },
  ] = await Promise.all([
    fetchAllCandidates(db, tenantId, paddedFrom, paddedTo),
    db.rpc('account_identifier_map', { p_tenant_id: tenantId }),
    db.rpc('transfer_match_exclusions', { p_tenant_id: tenantId }),
    db.from('account_connections').select('account_id, provider_account_id'),
    db.rpc('transfer_pair_history', { p_tenant_id: tenantId }),
  ])
  if (idErr) throw idErr
  if (exclErr) throw exclErr
  if (connErr) throw connErr
  if (pairHistErr) throw pairHistErr

  const pairHistoryByKey = new Map<string, { date: string; amountCents: number }[]>()
  for (const row of pairHistoryRows ?? []) {
    const r = row as { pair_key: string; txn_date: string; amount_cents: number }
    if (!pairHistoryByKey.has(r.pair_key)) pairHistoryByKey.set(r.pair_key, [])
    pairHistoryByKey.get(r.pair_key)!.push({ date: r.txn_date, amountCents: r.amount_cents })
  }
  const pairCadences = new Map<string, PairCadence>()
  for (const [key, history] of pairHistoryByKey) {
    const cadence = detectPairCadence(history)
    if (cadence) pairCadences.set(key, cadence)
  }

  const providerAccountToHalcyonId = new Map(
    (connectionRows ?? []).map((r: { provider_account_id: string; account_id: string }) => [r.provider_account_id, r.account_id]),
  )

  const rejectedPairKeys = new Set<string>()
  const pinnedLegIds = new Set<string>()
  for (const row of exclusionRows ?? []) {
    const r = row as { kind: string; from_txn_id: string | null; to_txn_id: string | null }
    if (r.kind === 'rejected_pair') {
      if (r.from_txn_id && r.to_txn_id) rejectedPairKeys.add(pairKey(r.from_txn_id, r.to_txn_id))
    } else if (r.kind === 'pinned_leg') {
      if (r.from_txn_id) pinnedLegIds.add(r.from_txn_id)
      if (r.to_txn_id) pinnedLegIds.add(r.to_txn_id)
    }
  }

  const legs: TransferLeg[] = (candidateRows ?? []).map((r: Record<string, unknown>) => {
    const providerTransferAccountId = r.provider_transfer_account_id as string | null
    return {
      txnId: r.txn_id as string,
      accountId: r.account_id as string,
      accountName: r.account_name as string,
      accountType: r.account_type as MatchableAccountType,
      date: r.txn_date as string,
      amountCents: r.amount as number,
      originalDescription: r.original_description as string | null,
      dedupeHashHex: byteaToHex(r.dedupe_hash),
      occurrence: r.occurrence as number,
      subcategory: r.subcategory as string | null,
      resolvedTransferAccountId: providerTransferAccountId
        ? providerAccountToHalcyonId.get(providerTransferAccountId) ?? null
        : null,
      providerPostedAt: r.provider_posted_at as string | null,
    }
  })

  const identifiers: AccountIdentifier[] = (identifierRows ?? []).map((r: Record<string, unknown>) => ({
    accountId: r.account_id as string,
    kind: r.kind as AccountIdentifier['kind'],
    value: r.value as string,
    confidence: r.confidence as number,
  }))

  const { pairs, overflowedAmounts } = matchTransfers(legs, identifiers, { rejectedPairKeys, pinnedLegIds }, pairCadences)

  const links = pairs.map(toPersistableLink)
  const { data: result, error: replaceErr } = await db
    .rpc('replace_transfer_links', {
      p_tenant_id: tenantId,
      p_from: paddedFrom,
      p_to: paddedTo,
      p_links: links,
      p_matcher_version: MATCHER_VERSION,
    })
    .single()
  if (replaceErr) throw replaceErr

  const inferredRows: Array<{ tenant_id: string; account_id: string; kind: string; value: string; source: string }> = []
  for (const p of pairs) {
    if (p.state !== 'auto') continue
    const fromTokens = classifyTransferLeg(p.from.originalDescription)
    const toTokens = classifyTransferLeg(p.to.originalDescription)
    for (const value of [...fromTokens.masks, ...fromTokens.accountNumbers]) {
      inferredRows.push({ tenant_id: tenantId, account_id: p.to.accountId, kind: fromTokens.masks.includes(value) ? 'mask' : 'account_number', value, source: 'inferred' })
    }
    for (const value of [...toTokens.masks, ...toTokens.accountNumbers]) {
      inferredRows.push({ tenant_id: tenantId, account_id: p.from.accountId, kind: toTokens.masks.includes(value) ? 'mask' : 'account_number', value, source: 'inferred' })
    }
  }
  if (inferredRows.length > 0) {
    const { error: inferErr } = await db
      .from('account_identifiers')
      .upsert(inferredRows, { onConflict: 'tenant_id,kind,value,account_id', ignoreDuplicates: true })
    if (inferErr) console.error('inferred identifier write-back failed', inferErr.message)
  }

  // Surface skipped buckets rather than letting them vanish silently — see
  // match.ts's MAX_BUCKET docblock. leg_count is derived from this run's own
  // `legs`, not returned by matchTransfers(), so overflowedAmounts' shape
  // (a plain number[]) stays untouched for its existing callers/tests.
  if (overflowedAmounts.length > 0) {
    const overflowRows = overflowedAmounts.map((amount) => ({
      tenant_id: tenantId,
      amount_cents: amount,
      leg_count: legs.filter((l) => Math.abs(l.amountCents) === amount).length,
      last_seen_at: new Date().toISOString(),
    }))
    const { error: overflowErr } = await db
      .from('transfer_match_overflow')
      .upsert(overflowRows, { onConflict: 'tenant_id,amount_cents' })
    if (overflowErr) console.error('overflow write-back failed', overflowErr.message)
  }
  // Only a full rescan has seen the whole ledger, so only it can safely say
  // "this amount doesn't overflow anymore" — a windowed rescan only ever
  // adds rows it personally observed and must never delete, or a resolved
  // bucket outside its window would look falsely resolved.
  if (isFullRescan) {
    const stillOverflowing = new Set(overflowedAmounts)
    const { data: existingOverflow, error: existingErr } = await db
      .from('transfer_match_overflow')
      .select('amount_cents')
      .eq('tenant_id', tenantId)
    if (existingErr) {
      console.error('overflow prune read failed', existingErr.message)
    } else {
      const staleAmounts = (existingOverflow ?? [])
        .map((r: { amount_cents: number }) => r.amount_cents)
        .filter((amount: number) => !stillOverflowing.has(amount))
      if (staleAmounts.length > 0) {
        const { error: pruneErr } = await db
          .from('transfer_match_overflow')
          .delete()
          .eq('tenant_id', tenantId)
          .in('amount_cents', staleAmounts)
        if (pruneErr) console.error('overflow prune failed', pruneErr.message)
      }
    }
  }

  const auto = pairs.filter((p) => p.state === 'auto').length
  const suggested = pairs.filter((p) => p.state === 'suggested').length

  return { ...(result as Omit<LinkTransfersResult, 'auto' | 'suggested' | 'overflowedAmounts'>), auto, suggested, overflowedAmounts }
}
