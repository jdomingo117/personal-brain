export interface ReviewLinkSelection {
  id: string
  ambiguous: boolean
}

export interface OverflowBucket {
  amount_cents: number
  leg_count: number
}

/** Ambiguous pairs are deliberately excluded from bulk selection. */
export function suggestedReviewSelection(
  links: ReviewLinkSelection[],
  deselected: ReadonlySet<string>,
) {
  const selectable = links.filter((link) => !link.ambiguous)
  const selectedIds = selectable.filter((link) => !deselected.has(link.id)).map((link) => link.id)
  const ambiguousCount = links.length - selectable.length

  return {
    selectableCount: selectable.length,
    selectedIds,
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
