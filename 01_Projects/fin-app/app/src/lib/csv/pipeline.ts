/**
 * Ingestion pipeline: raw CSV rows → staged, categorised transactions.
 *
 * Deliberately pure and UI-free so the whole import can be reasoned about and
 * tested without mounting a component. The React layer only renders what this
 * produces and calls `commit`.
 */
import { normalizeMerchant } from './normalizeMerchant'
import { parseDate, detectDateFormat, type DateFormat } from './parseDate'
import { resolveRowAmountCents } from './parseAmount'
import { mapBankCategory, unmappedBankCategories } from './bankCategoryMap'
import { assignOccurrences } from './dedupe'
import { UNCATEGORIZED } from '../../data'

export interface ColumnMapping {
  dateCol: string
  descCol: string
  amountCol?: string | null
  debitCol?: string | null
  creditCol?: string | null
  invertAmount?: boolean
  categoryCol?: string | null
  subcategoryCol?: string | null
  dateFormat?: DateFormat
}

export type RowIssue = 'bad-date' | 'no-amount' | 'duplicate'

export interface StagedRow {
  /** Stable id for React keys and selection. */
  id: string
  /** ISO date, or null when unparseable (blocks commit). */
  date: string | null
  originalDescription: string
  merchantKey: string
  merchantDisplay: string
  amountCents: number | null
  category: string
  subcategory: string | null
  categorySource: 'user' | 'bank' | 'ai' | 'seed' | null
  categoryConfidence: number | null
  needsReview: boolean
  issues: RowIssue[]
  /** False when an issue blocks it, or the user excluded it. */
  include: boolean
  hash: string
  occurrence: number
}

export interface StageResult {
  rows: StagedRow[]
  /** Distinct merchants sent through the precedence resolver. Bank answers
   * are included so a durable user rule can override them. */
  pendingMerchants: {
    key: string; display: string
    direction: 'inflow' | 'outflow'
    sampleDescriptions: string[]
    bankCategory?: string
    bankSubcategory?: string | null
  }[]
  stats: {
    total: number
    importable: number
    badDate: number
    noAmount: number
    duplicatesInFile: number
    fromBankCategory: number
  }
  /** Bank categories we could not translate — surfaced, not silently dropped. */
  unmappedBankCategories: string[]
  dateFormat: DateFormat
  dateFormatConfident: boolean
}

/**
 * Stages a parsed CSV against a mapping.
 *
 * Nothing is written here. Rows that cannot be trusted (unparseable date, no
 * resolvable amount) are marked and excluded rather than being guessed at —
 * the old importer silently dated bad rows "today" and coerced bad amounts to
 * zero, which put wrong numbers in the ledger with no indication anything
 * had gone wrong.
 */
export async function stageRows(
  rawRows: Record<string, unknown>[],
  mapping: ColumnMapping,
  accountId: string,
): Promise<StageResult> {
  const detected = detectDateFormat(
    rawRows.slice(0, 50).map((r) => String(r[mapping.dateCol] ?? '')),
  )
  const dateFormat = mapping.dateFormat ?? detected.format

  const interim = rawRows.map((raw, i) => {
    const description = String(raw[mapping.descCol] ?? '').trim() || 'Unknown'
    const { key, display } = normalizeMerchant(description)
    const date = parseDate(String(raw[mapping.dateCol] ?? ''), dateFormat)
    const amountCents = resolveRowAmountCents(raw, mapping)

    // Tier 1: the bank's own category, free and deterministic.
    const bank = mapping.categoryCol
      ? mapBankCategory(raw[mapping.categoryCol], mapping.subcategoryCol ? raw[mapping.subcategoryCol] : null)
      : null

    const issues: RowIssue[] = []
    if (date === null) issues.push('bad-date')
    if (amountCents === null) issues.push('no-amount')

    return {
      id: `r${i}`,
      date,
      originalDescription: description,
      merchantKey: key,
      merchantDisplay: display,
      amountCents,
      category: bank?.category ?? UNCATEGORIZED,
      subcategory: bank?.subcategory ?? null,
      categorySource: bank ? ('bank' as const) : null,
      categoryConfidence: bank ? 1 : null,
      needsReview: false,
      issues,
      include: issues.length === 0,
      hash: '',
      occurrence: 0,
    }
  })

  // Hash only the rows that could actually be imported; a row with no date or
  // amount has no stable identity to hash.
  const hashable = interim.filter((r) => r.date !== null && r.amountCents !== null)
  const assigned = await assignOccurrences(
    hashable.map((r) => ({
      accountId,
      date: r.date!,
      amountCents: r.amountCents!,
      originalDescription: r.originalDescription,
    })),
  )
  hashable.forEach((r, i) => {
    r.hash = assigned[i].hash
    r.occurrence = assigned[i].occurrence
  })

  // Every included merchant goes through the resolver. It will retain the
  // bank answer unless a higher-precedence user rule exists.
  const pending = new Map<string, StageResult['pendingMerchants'][number]>()
  for (const r of interim) {
    if (!r.include) continue
    const existing = pending.get(r.merchantKey)
    if (existing) {
      if (existing.sampleDescriptions.length < 3) {
        existing.sampleDescriptions.push(r.originalDescription)
      }
      if (r.categorySource === 'bank' && !existing.bankCategory) {
        existing.bankCategory = r.category
        existing.bankSubcategory = r.subcategory
      }
      continue
    }
    pending.set(r.merchantKey, {
      key: r.merchantKey,
      display: r.merchantDisplay,
      direction: (r.amountCents ?? 0) >= 0 ? 'inflow' : 'outflow',
      sampleDescriptions: [r.originalDescription],
      bankCategory: r.categorySource === 'bank' ? r.category : undefined,
      bankSubcategory: r.categorySource === 'bank' ? r.subcategory : undefined,
    })
  }

  const bankCatValues = mapping.categoryCol
    ? rawRows.map((r) => r[mapping.categoryCol!])
    : []

  return {
    rows: interim,
    pendingMerchants: [...pending.values()],
    stats: {
      total: interim.length,
      importable: interim.filter((r) => r.include).length,
      badDate: interim.filter((r) => r.issues.includes('bad-date')).length,
      noAmount: interim.filter((r) => r.issues.includes('no-amount')).length,
      duplicatesInFile: interim.filter((r) => r.occurrence > 0).length,
      fromBankCategory: interim.filter((r) => r.categorySource === 'bank').length,
    },
    unmappedBankCategories: unmappedBankCategories(bankCatValues),
    dateFormat,
    dateFormatConfident: mapping.dateFormat ? true : detected.confident,
  }
}

/** Applies categorisation results (from the AI/cache) onto staged rows. */
export function applyAssignments(
  rows: StagedRow[],
  assignments: {
    key: string; category: string; subcategory: string | null
    source: 'user' | 'bank' | 'ai' | 'seed'; confidence?: number | null; needsReview?: boolean
  }[],
): StagedRow[] {
  const byKey = new Map(assignments.map((a) => [a.key, a]))
  return rows.map((r) => {
    const a = byKey.get(r.merchantKey)
    if (!a) return r
    // Bank remains above AI/seed cache. Only a user rule may replace it.
    if (r.categorySource === 'bank' && a.source !== 'user') return r
    return {
      ...r,
      category: a.category,
      subcategory: a.subcategory,
      categorySource: a.source,
      categoryConfidence: a.confidence ?? null,
      needsReview: a.needsReview ?? a.category === UNCATEGORIZED,
    }
  })
}

/** Shapes staged rows into the upsert-transactions payload. */
export function toTransactionPayload(
  rows: StagedRow[],
  accountId: string,
  uploadBatchId: string,
) {
  return rows
    .filter((r) => r.include && r.date !== null && r.amountCents !== null)
    .map((r) => ({
      account_id: accountId,
      date: r.date!,
      original_description: r.originalDescription.slice(0, 500),
      merchant: r.merchantDisplay.slice(0, 200),
      category: r.category,
      subcategory: r.subcategory,
      amount: r.amountCents!,
      upload_batch_id: uploadBatchId,
      category_source: r.categorySource,
      category_confidence: r.categoryConfidence,
      needs_review: r.needsReview,
    }))
}
