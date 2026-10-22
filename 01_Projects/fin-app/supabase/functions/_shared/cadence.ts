/* How often money moves — the shared vocabulary for income streams (§8.14) and
   detected recurring commitments (§8.17).

   This module deliberately imports nothing. `data.ts` needs `Cadence` to type
   `IncomeStream`, and `period.ts` imports `data` — so anything this file imported
   from `period.ts` would close the loop `data → cadence → period → data`. Keep it
   pure vocabulary: no date math lives here (see `nextChargeDate` in recurring.ts). */

export type Cadence = 'Weekly' | 'Biweekly' | 'Monthly' | 'Quarterly' | 'Annual'

/** Ordered shortest → longest; the detector classifies by first match, and the
 *  tolerance windows below are proven non-overlapping, so order is a
 *  readability aid rather than a tie-break. */
export const CADENCES: Cadence[] = ['Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annual']

/** Monthly-equivalent multiplier — what one charge at this cadence costs per
 *  month. Averaged over a year, so `Weekly` is 52/12, not 4. */
export const CADENCE_PER_MONTH: Record<Cadence, number> = {
  Weekly: 52 / 12,
  Biweekly: 26 / 12,
  Monthly: 1,
  Quarterly: 1 / 3,
  Annual: 1 / 12,
}

/** Nominal days between charges — the classifier's target. Fractional for the
 *  calendar-anchored cadences because months aren't a whole number of days. */
export const CADENCE_DAYS: Record<Cadence, number> = {
  Weekly: 7,
  Biweekly: 14,
  Monthly: 30.44,
  Quarterly: 91.31,
  Annual: 365.25,
}

/** ± days a gap may stray and still read as this cadence.
 *
 *  These windows MUST NOT overlap, or a gap would classify as two cadences and
 *  the first match would win silently. As set: Weekly [5, 9] · Biweekly [11, 17] ·
 *  Monthly [23.94, 36.94] · Quarterly [79.31, 103.31] · Annual [335.25, 395.25].
 *  The dead zones between them (9→11, 17→24, 37→79, 103→335) are not gaps in
 *  coverage — a series landing there genuinely isn't periodic, and is correctly
 *  rejected as irregular. Monthly's ±6.5 comfortably spans real 28–31 day gaps. */
export const CADENCE_TOLERANCE: Record<Cadence, number> = {
  Weekly: 2,
  Biweekly: 3,
  Monthly: 6.5,
  Quarterly: 12,
  Annual: 30,
}

/** Whole months to advance when projecting the next charge; 0 means the cadence
 *  is day-anchored and should advance by `CADENCE_DAYS` instead. Rent charged on
 *  the 1st is charged on the *1st*, not 30.44 days later. */
export const CADENCE_MONTHS: Record<Cadence, number> = {
  Weekly: 0,
  Biweekly: 0,
  Monthly: 1,
  Quarterly: 3,
  Annual: 12,
}
