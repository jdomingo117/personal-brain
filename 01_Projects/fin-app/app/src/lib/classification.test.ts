import { describe, expect, it } from 'vitest'
import { defaultTransactionKind, earnedIncomeCents, effectiveTransactionKind, expenseEffectCents, isTransferKind } from './classification'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('transaction classification contract', () => {
  it('derives operational kind at ingestion without treating labels as runtime behavior', () => {
    expect(defaultTransactionKind('Food & drink', 'Groceries', -100)).toBe('expense')
    expect(defaultTransactionKind('Income', 'Salary', 100)).toBe('income')
    expect(defaultTransactionKind('Transfer', 'Internal', -100)).toBe('transfer')
    expect(defaultTransactionKind('Transfer', 'Reconciliation', 100)).toBe('adjustment')
    expect(defaultTransactionKind('Investing', 'Brokerage', -100)).toBe('investment')
    expect(defaultTransactionKind('Uncategorized', null, 100)).toBe('income')
  })

  it('does not report refunds or reimbursements as earned income', () => {
    expect(earnedIncomeCents({ kind: 'income', amount: 10_000 })).toBe(10_000)
    expect(earnedIncomeCents({ kind: 'refund', amount: 4_000 })).toBe(0)
    expect(earnedIncomeCents({ kind: 'reimbursement', amount: 3_000 })).toBe(0)
  })

  it('nets refund and reimbursement inflows against expense without losing cents', () => {
    expect(expenseEffectCents({ kind: 'expense', amount: -10_000 })).toBe(10_000)
    expect(expenseEffectCents({ kind: 'refund', amount: 4_000 })).toBe(-4_000)
    expect(expenseEffectCents({ kind: 'reimbursement', amount: 3_000 })).toBe(-3_000)
    expect(expenseEffectCents({ kind: 'income', amount: 100_000 })).toBe(0)
  })

  it('returns rejected derived transfers to ordinary direction-based reporting', () => {
    const rejectedOutflow = { kind: 'transfer' as const, kindSource: 'derived' as const, transferState: 'rejected' as const, isTransfer: false, amount: -47_470 }
    const rejectedInflow = { ...rejectedOutflow, amount: 5_200 }

    expect(effectiveTransactionKind(rejectedOutflow)).toBe('expense')
    expect(expenseEffectCents(rejectedOutflow)).toBe(47_470)
    expect(isTransferKind(rejectedOutflow)).toBe(false)
    expect(effectiveTransactionKind(rejectedInflow)).toBe('income')
    expect(earnedIncomeCents(rejectedInflow)).toBe(5_200)
  })

  it('does not let a transfer rejection overwrite a user-pinned kind', () => {
    const pinned = { kind: 'transfer' as const, kindSource: 'user' as const, transferState: 'rejected' as const, isTransfer: false, amount: -10_000 }
    expect(effectiveTransactionKind(pinned)).toBe('transfer')
    expect(isTransferKind(pinned)).toBe(true)
    expect(expenseEffectCents(pinned)).toBe(0)
  })

  it('keeps the Deno derivation mirror aligned with every kind branch', () => {
    const server = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'functions', '_shared', 'classification.ts'), 'utf8')
    for (const value of ['expense','income','transfer','investment','adjustment','refund','reimbursement']) {
      expect(server).toContain(`'${value}'`)
    }
    for (const value of ['Reconciliation','Refund','Reimbursement','Uncategorized']) expect(server).toContain(`'${value}'`)
    expect(server).toContain('effectiveTransactionKind')
    expect(server).toContain("transaction.transferState === 'rejected'")
  })
})
