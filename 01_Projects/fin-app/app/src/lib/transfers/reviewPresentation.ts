export interface ReviewLinkSelection {
  id: string
  ambiguous: boolean
}

export interface OverflowBucket {
  amount_cents: number
  leg_count: number
}

/** Must stay aligned with decide-transfer's Zod schema and both batch RPCs. */
export const TRANSFER_DECISION_BATCH_LIMIT = 200

/** Default-select a safe, deterministic prefix without ever constructing a
 * request the mutation boundary will reject. Once the prefix is decided and
 * removed, the deferred ids naturally become the next batch. */
export function boundedReviewSelection(
  ids: string[],
  deselected: ReadonlySet<string>,
  limit = TRANSFER_DECISION_BATCH_LIMIT,
) {
  const eligibleIds = ids.filter((id) => !deselected.has(id))
  return {
    selectedIds: eligibleIds.slice(0, limit),
    deferredIds: eligibleIds.slice(limit),
    deferredCount: Math.max(0, eligibleIds.length - limit),
  }
}

/** Ambiguous pairs are deliberately excluded from bulk selection. */
export function suggestedReviewSelection(
  links: ReviewLinkSelection[],
  deselected: ReadonlySet<string>,
) {
  const selectable = links.filter((link) => !link.ambiguous)
  const bounded = boundedReviewSelection(selectable.map((link) => link.id), deselected)
  const ambiguousCount = links.length - selectable.length

  return {
    selectableCount: selectable.length,
    ...bounded,
    ambiguousCount,
    reviewLabel: ambiguousCount > 0
      ? `Review ${ambiguousCount} ambiguous match${ambiguousCount === 1 ? '' : 'es'}`
      : 'Review selections',
  }
}

export function summariseOverflow(buckets: OverflowBucket[]) {
  return {
    bucketCount: buckets.length,
    legCount: buckets.reduce((sum, bucket) => sum + bucket.leg_count, 0),
  }
}

export function untrackedTransferLabel(amountCents?: number) {
  if (amountCents === undefined || amountCents === 0) return 'Transfer to/from an untracked account'
  return amountCents < 0
    ? 'Transfer to an untracked account'
    : 'Transfer from an untracked account'
}
