import { describe, it, expect } from 'vitest'
import { classifyTransferLeg, isTransferCandidateText } from './classify'
import { normalizeMerchant } from '../csv/normalizeMerchant'

describe('classifyTransferLeg', () => {
  it('extracts a reciprocal account mask', () => {
    const t = classifyTransferLeg('From Linked Account Xx3965 - Internal Transfer')
    expect(t.masks).toEqual(['3965'])
    expect(t.isLexical).toBe(true)
    expect(t.direction).toBe('in')
  })

  it('extracts an embedded date + time token', () => {
    const t = classifyTransferLeg('Sct Deposit                   07Jul22:43 Funds Transfer Domingo J T')
    expect(t.embeddedDates).toEqual(['07jul'])
    expect(t.isLexical).toBe(true)
  })

  it('extracts and normalises a long account number, stripping leading zeros', () => {
    const t = classifyTransferLeg('Phone/Internet Tfr From    0000439102433')
    expect(t.accountNumbers).toEqual(['439102433'])
  })

  it('recognises an institution name and collapses aliases', () => {
    const t = classifyTransferLeg('To St George Complete Freedom - Funds Transfer')
    expect(t.institutions).toEqual(['st george'])
    const t2 = classifyTransferLeg('Payment to American Express Australia')
    expect(t2.institutions).toEqual(['american express'])
  })

  it('does not treat a personal payment as lexical', () => {
    const t = classifyTransferLeg('To P Ortiz - Receipt number: OPP00000233093128')
    expect(t.isLexical).toBe(false)
  })

  // The whole reason classify.ts reads original_description: normalizeMerchant()
  // strips exactly the tokens this module depends on. If classification ran on
  // the normalized merchant instead, every mask/prefix signal would vanish.
  it('regression: classifying the normalized merchant loses the transfer signal', () => {
    const original = 'From Linked Account Xx3965 - Internal Transfer'
    const merchant = normalizeMerchant(original).display

    const onOriginal = classifyTransferLeg(original)
    const onMerchant = classifyTransferLeg(merchant)

    expect(onOriginal.masks).toEqual(['3965'])
    expect(onMerchant.masks).toEqual([]) // the mask is gone from the normalized merchant
  })
})

describe('isTransferCandidateText', () => {
  it('flags an explicit Transfer category', () => {
    expect(isTransferCandidateText('Coffee at Bunnings', 'Transfer')).toBe(true)
  })

  it('flags a lexical description regardless of category', () => {
    expect(isTransferCandidateText('Internal Transfer to Xx3692', 'Uncategorized')).toBe(true)
  })

  it('flags a leading To/From as a generous, over-inclusive candidate', () => {
    expect(isTransferCandidateText('To P Ortiz - Receipt number: OPP000', 'Uncategorized')).toBe(true)
  })

  it('does not flag an ordinary merchant purchase', () => {
    expect(isTransferCandidateText('Woolworths Metro Sydney', 'Food')).toBe(false)
  })

  it('excludes Round Up even though it carries category=Transfer — structurally one-sided, never a real candidate', () => {
    expect(isTransferCandidateText('Round Up', 'Transfer')).toBe(false)
  })

  it('the Round Up exclusion is case-insensitive and whitespace-tolerant', () => {
    expect(isTransferCandidateText('  round up  ', 'Transfer')).toBe(false)
    expect(isTransferCandidateText('ROUND UP', 'Uncategorized')).toBe(false)
  })
})
