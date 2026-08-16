/**
 * Unit tests for the CSV parsing library.
 *
 * Every string here is copied verbatim from the real files in
 * `Sample datasets/` — synthetic fixtures would not have caught the
 * leading-dot amount, the FX tail, or the padded-location format.
 *
 *   npm test
 */
import { describe, it, expect } from 'vitest'
import { normalizeMerchant } from './normalizeMerchant'
import { parseDate, detectDateFormat } from './parseDate'
import { parseAmountCents, resolveRowAmountCents } from './parseAmount'
import { mapBankCategory, unmappedBankCategories } from './bankCategoryMap'
import { dedupeHash, assignOccurrences } from './dedupe'

describe('normalizeMerchant', () => {
  it('strips padded location tails (St George)', () => {
    expect(normalizeMerchant('San Jose Place         Sydney        Au').display)
      .toBe('San Jose Place')
  })

  it('strips foreign-amount tails', () => {
    expect(
      normalizeMerchant('Juicychat.Ai           Santa Venera  Mt Frgn Amt:        3.00 Us Dollar').display,
    ).toBe('Juicychat.Ai')
  })

  it('strips receipt numbers and transfer prefixes (Macquarie)', () => {
    expect(normalizeMerchant('To P Ortiz - Receipt number: OPP00000233093128').display)
      .toBe('P Ortiz')
  })

  it('strips trailing reference numbers', () => {
    expect(normalizeMerchant('Salary From The University O - 1188723').display)
      .toBe('Salary From The University O')
  })

  it('strips card masks wherever they appear', () => {
    expect(normalizeMerchant('From Linked Account Xx3965 - Internal Transfer').display)
      .toBe('Linked Account - Internal Transfer')
  })

  it('title-cases SHOUTING descriptions but keeps acronyms', () => {
    // <=3-char caps tokens are kept (NSW, BP); 4-char words case normally.
    expect(normalizeMerchant('TRANSPORT FOR NSW-OPAL  CHIPPENDALE').display)
      .toBe('Transport For NSW-Opal')
    // Common short words must NOT be mistaken for acronyms.
    expect(normalizeMerchant('BP SERVICE STATION AND CAFE').display)
      .toBe('BP Service Station And Cafe')
  })

  it('leaves already mixed-case names alone', () => {
    expect(normalizeMerchant('Foreign Transaction Fee').display).toBe('Foreign Transaction Fee')
  })

  it('drops the trailing country code', () => {
    expect(normalizeMerchant('Northern Beaches Hospi Frenchs Fores Au').display)
      .toBe('Northern Beaches Hospi Frenchs Fores')
  })

  it('produces a STABLE key across whitespace and case variants', () => {
    const a = normalizeMerchant('BP BAULKHAM HILLS       BAULKHAM HILL')
    const b = normalizeMerchant('BP BAULKHAM HILLS  BAULKHAM HILL')
    expect(a.key).toBe(b.key)
  })

  it('never returns an empty key, even for junk', () => {
    for (const junk of ['', '   ', '---', 'To ', null, undefined]) {
      expect(normalizeMerchant(junk as string).key.length).toBeGreaterThan(0)
    }
  })

  it('does not merge two distinct merchants', () => {
    // The safety property that matters more than prettiness.
    expect(normalizeMerchant('Woolworths 1234  Sydney').key)
      .not.toBe(normalizeMerchant('Coles 5678  Sydney').key)
  })
})

describe('parseDate', () => {
  it('parses DD/MM/YYYY (St George)', () => {
    expect(parseDate('18/06/2026')).toBe('2026-06-18')
  })

  it('parses DD MMM YYYY (Macquarie)', () => {
    expect(parseDate('12 Jul 2026')).toBe('2026-07-12')
  })

  it('parses ISO', () => {
    expect(parseDate('2026-07-12')).toBe('2026-07-12')
  })

  it('RETURNS NULL for an impossible date — never today', () => {
    // The regression this library exists to prevent.
    expect(parseDate('31/31/2026')).toBeNull()
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate('not a date')).toBeNull()
    expect(parseDate('')).toBeNull()
    expect(parseDate(null)).toBeNull()
  })

  it('does not shift the day across timezones', () => {
    // toISOString() on a local midnight would return the previous day in AEST.
    expect(parseDate('01/01/2026')).toBe('2026-01-01')
    expect(parseDate('12 Jul 2026')).toBe('2026-07-12')
  })

  it('self-corrects when the declared format is impossible', () => {
    // Declared MM/DD but 18 cannot be a month.
    expect(parseDate('18/06/2026', 'MM/DD/YYYY')).toBe('2026-06-18')
  })

  it('honours the declared format when genuinely ambiguous', () => {
    expect(parseDate('03/04/2026', 'DD/MM/YYYY')).toBe('2026-04-03')
    expect(parseDate('03/04/2026', 'MM/DD/YYYY')).toBe('2026-03-04')
  })
})

describe('detectDateFormat', () => {
  it('resolves ambiguity from a single unambiguous sample', () => {
    expect(detectDateFormat(['03/04/2026', '18/06/2026'])).toEqual({
      format: 'DD/MM/YYYY', confident: true,
    })
  })

  it('detects MM/DD from a day above 12 in second position', () => {
    expect(detectDateFormat(['04/18/2026'])).toEqual({ format: 'MM/DD/YYYY', confident: true })
  })

  it('flags low confidence when every sample is ambiguous', () => {
    expect(detectDateFormat(['03/04/2026', '05/06/2026'])).toEqual({
      format: 'DD/MM/YYYY', confident: false,
    })
  })

  it('detects named-month and ISO columns', () => {
    expect(detectDateFormat(['12 Jul 2026']).format).toBe('DD MMM YYYY')
    expect(detectDateFormat(['2026-07-12']).format).toBe('YYYY-MM-DD')
  })
})

describe('parseAmountCents', () => {
  it('parses the leading-dot form (St George writes 13c as ".13")', () => {
    expect(parseAmountCents('.13')).toBe(13)
  })

  it('parses plain and thousands-separated values', () => {
    expect(parseAmountCents('3.70')).toBe(370)
    expect(parseAmountCents('4477.27')).toBe(447727)
    expect(parseAmountCents('1,292.00')).toBe(129200)
  })

  it('parses accounting negatives and signs', () => {
    expect(parseAmountCents('(12.34)')).toBe(-1234)
    expect(parseAmountCents('-1292.00')).toBe(-129200)
  })

  it('strips currency symbols', () => {
    expect(parseAmountCents('$78.51')).toBe(7851)
  })

  it('handles European separators', () => {
    expect(parseAmountCents('1.234,56')).toBe(123456)
  })

  it('returns NULL rather than 0 for unparseable input', () => {
    for (const v of ['', '  ', '-', 'abc', null, undefined]) {
      expect(parseAmountCents(v)).toBeNull()
    }
  })

  it('avoids float drift', () => {
    expect(parseAmountCents('0.29')).toBe(29)
    expect(parseAmountCents('1.005')).toBe(101) // rounds, does not truncate to 100
  })
})

describe('resolveRowAmountCents', () => {
  const split = { debitCol: 'Debit', creditCol: 'Credit' }

  it('makes debits negative and credits positive', () => {
    expect(resolveRowAmountCents({ Debit: '3.70', Credit: '' }, split)).toBe(-370)
    expect(resolveRowAmountCents({ Debit: '', Credit: '4477.27' }, split)).toBe(447727)
  })

  it('returns null when both sides are blank', () => {
    expect(resolveRowAmountCents({ Debit: '', Credit: '' }, split)).toBeNull()
  })

  it('inverts a single amount column when the file writes expenses positive', () => {
    const amex = { amountCol: 'Amount', invertAmount: true }
    expect(resolveRowAmountCents({ Amount: '8.55' }, amex)).toBe(-855)      // a charge
    expect(resolveRowAmountCents({ Amount: '-1292.00' }, amex)).toBe(129200) // a payment in
  })

  it('NEVER applies invertAmount to split debit/credit columns', () => {
    // Split columns already encode direction; inverting would flip every row.
    const bad = { ...split, invertAmount: true }
    expect(resolveRowAmountCents({ Debit: '3.70', Credit: '' }, bad)).toBe(-370)
  })
})

describe('mapBankCategory', () => {
  it('maps the St George vocabulary', () => {
    expect(mapBankCategory('Food & Beverage', 'Dining out'))
      .toEqual({ category: 'Food & drink', subcategory: 'Dining & takeaway' })
    expect(mapBankCategory('Transport & Travel', 'Parking & Tolls'))
      .toEqual({ category: 'Transport', subcategory: 'Parking & tolls' })
    expect(mapBankCategory('Bills & Payments', null))
      .toEqual({ category: 'Bills & utilities', subcategory: null })
  })

  it('uses the expanded taxonomy for formerly unmapped bank categories', () => {
    expect(mapBankCategory('Entertainment & Recreation', 'TV, Movies, Music & Games')?.category).toBe('Lifestyle')
    expect(mapBankCategory('Fees & Charges', 'Fees & Charges')?.category).toBe('Financial & admin')
  })

  it('maps income and transfers to the non-expense buckets', () => {
    expect(mapBankCategory('Deposits', null)?.category).toBe('Income')
    expect(mapBankCategory('Transfers', 'Internal transfer'))
      .toEqual({ category: 'Transfer', subcategory: 'Internal' })
  })

  it('rejects a subcategory that is invalid for its parent', () => {
    // "Home insurance" is not a Food & drink subcategory.
    expect(mapBankCategory('Food & Beverage', 'Insurance')?.subcategory).toBeNull()
  })

  it('reports unmapped bank categories so the gap stays visible', () => {
    expect(unmappedBankCategories(['Food & Beverage', 'Fees & Charges', 'Entertainment & Recreation']))
      .toEqual([])
  })
})

describe('dedupe', () => {
  const base = {
    accountId: 'acct-1', date: '2026-06-18', amountCents: -370,
    originalDescription: 'San Jose Place         Sydney        Au',
  }

  it('is stable across whitespace and case in the description', async () => {
    const a = await dedupeHash(base)
    const b = await dedupeHash({ ...base, originalDescription: 'san jose place Sydney Au' })
    expect(a).toBe(b)
  })

  it('differs when any identity field differs', async () => {
    const a = await dedupeHash(base)
    expect(await dedupeHash({ ...base, amountCents: -371 })).not.toBe(a)
    expect(await dedupeHash({ ...base, date: '2026-06-19' })).not.toBe(a)
    expect(await dedupeHash({ ...base, accountId: 'acct-2' })).not.toBe(a)
  })

  it('gives genuine same-day repeats distinct occurrences', async () => {
    // Two identical coffees on one day must BOTH survive a single import.
    const out = await assignOccurrences([base, base])
    expect(out[0].hash).toBe(out[1].hash)
    expect(out.map((o) => o.occurrence)).toEqual([0, 1])
  })

  it('restarts ordinals at 0 for every batch, so re-imports collide', async () => {
    // The property deduplication depends on: the same file must always
    // produce the same (hash, occurrence) pairs. Continuing the ordinals from
    // what the account already holds would make a re-import land on 1, 2, 3…
    // and never conflict — silently doubling the ledger.
    const first = await assignOccurrences([base, base])
    const second = await assignOccurrences([base, base])
    expect(first.map((o) => o.occurrence)).toEqual([0, 1])
    expect(second.map((o) => o.occurrence)).toEqual([0, 1])
    expect(second.map((o) => o.hash)).toEqual(first.map((o) => o.hash))
  })
})
