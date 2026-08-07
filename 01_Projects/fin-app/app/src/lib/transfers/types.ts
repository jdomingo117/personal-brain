/** Shared types for internal-transfer detection. Mirrored in supabase/functions/_shared/transferMatch.ts. */

export type MatchableAccountType = 'Liquid' | 'Savings' | 'Credit Card'

export interface TransferLeg {
  txnId: string
  accountId: string
  accountName: string
  accountType: MatchableAccountType
  /** ISO YYYY-MM-DD. */
  date: string
  /** Signed cents. Positive = inflow, negative = outflow. */
  amountCents: number
  originalDescription: string | null | undefined
  /** Lowercase hex, matching app/src/lib/csv/dedupe.ts. */
  dedupeHashHex: string
  occurrence: number
  /** 'Reconciliation' marks the synthetic opening-balance anchor — never a real transfer leg. */
  subcategory?: string | null
  /** Ground truth from a provider (e.g. Up's transferAccount): the OTHER
   *  Halcyon account this leg's own bank says it moved to/from, already
   *  resolved from the provider's account id via account_connections.
   *  Undefined for CSV/manual rows, which have no such signal. */
  resolvedTransferAccountId?: string | null
  /** Full timestamp from the provider (e.g. Up's settledAt/createdAt), when
   *  available. Null for CSV/manual rows — bank exports carry a date, never
   *  a time. Used only as an ambiguity tie-breaker (see match.ts's
   *  scoreTime), never a primary signal, since it's absent for most legs. */
  providerPostedAt?: string | null
}

export interface AccountIdentifier {
  accountId: string
  kind: 'mask' | 'account_number' | 'institution' | 'alias'
  value: string
  confidence: number
}

export type LinkState = 'auto' | 'suggested'

export interface ScoredPair {
  from: TransferLeg
  to: TransferLeg
  score: number
  reasons: string[]
  ambiguous: boolean
  state: LinkState
}

/** The exact shape replace_transfer_links() expects in its p_links jsonb array. */
export interface PersistableLink {
  from_txn_id: string
  to_txn_id: string
  state: LinkState
  score: number
  reasons: string[]
  ambiguous: boolean
  from_account_id: string
  from_hash: string
  from_occurrence: number
  to_account_id: string
  to_hash: string
  to_occurrence: number
}

export function toPersistableLink(pair: ScoredPair): PersistableLink {
  return {
    from_txn_id: pair.from.txnId,
    to_txn_id: pair.to.txnId,
    state: pair.state,
    score: pair.score,
    reasons: pair.reasons,
    ambiguous: pair.ambiguous,
    from_account_id: pair.from.accountId,
    from_hash: pair.from.dedupeHashHex,
    from_occurrence: pair.from.occurrence,
    to_account_id: pair.to.accountId,
    to_hash: pair.to.dedupeHashHex,
    to_occurrence: pair.to.occurrence,
  }
}
