/**
 * Tuning constants for internal-transfer matching.
 *
 * `MATCHER_VERSION` exists so a weight/threshold change can invalidate stale
 * 'auto'/'suggested' links on the next rescan (replace_transfer_links deletes
 * and regenerates them) while leaving 'confirmed'/'rejected'/'external' —
 * durable human decisions — completely untouched.
 */
export const MATCHER_VERSION = 1

/** Settlement window: Friday → Monday/Tuesday must still score well. */
export const WINDOW_DAYS = 4

/**
 * Above this, one abs-amount bucket stops producing 'auto' links (only
 * same-day + mask-resolved 'suggested' pairs survive). Bounds the per-bucket
 * work at N * MAX_BUCKET instead of letting a bucket go quadratic — SRD Law 3.
 */
export const MAX_BUCKET = 64

export const AUTO_THRESHOLD = 0.8
export const SUGGESTED_THRESHOLD = 0.55
/** A leg's best and second-best candidate within this margin of each other are ambiguous. */
export const AMBIGUITY_MARGIN = 0.05
export const AMBIGUITY_PENALTY = 0.15

export const WEIGHTS = {
  date: 0.25,
  mask: 0.2,
  name: 0.15,
  embeddedDate: 0.1,
  direction: 0.1,
  lexicon: 0.1,
  accountType: 0.1,
} as const

export const MATCHABLE_ACCOUNT_TYPES = ['Liquid', 'Savings', 'Credit Card'] as const

/**
 * Additive, capped bonuses layered on top of the weighted score above —
 * deliberately NOT entries in WEIGHTS, which is tuned assuming every
 * candidate has all seven signals available. These two are usually absent
 * (no pair history yet; no provider timestamp on a CSV leg) and must
 * contribute exactly 0 in that case, not skew a re-normalized sum.
 */
export const PAIR_CADENCE_BONUS = 0.15
/** Candidate amount must fall within this fraction of the pair's established average to earn the bonus. */
export const PAIR_CADENCE_AMOUNT_TOLERANCE = 0.15
/** Fewer observations than this and a "pattern" is coincidence, not cadence — same principle as recurring.ts. */
export const PAIR_CADENCE_MIN_OBSERVATIONS = 3

export const TIME_BONUS_MAX = 0.1
