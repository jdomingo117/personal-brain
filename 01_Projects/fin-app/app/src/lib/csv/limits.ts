/**
 * Ingestion limits that belong to the browser staging contract.
 *
 * The Edge Function and atomic SQL function intentionally repeat the same
 * 5,000-row boundary because neither runtime can import this Vite module.
 * Keep their values aligned: an oversized source must be rejected before
 * profile lookup, AI categorisation or any attempted write.
 */
export const MAX_CSV_SOURCE_ROWS = 5_000
export const MAX_SUBMITTED_TRANSACTIONS = 5_000
export const MAX_RECONCILIATION_ROWS = 1

export function sourceRowLimitError(rowCount: number): string | null {
  if (rowCount <= MAX_CSV_SOURCE_ROWS) return null
  return `This statement has ${rowCount.toLocaleString('en-AU')} rows. Halcyon can import up to ${MAX_CSV_SOURCE_ROWS.toLocaleString('en-AU')} rows at once; export a smaller date range and try again. Nothing has been imported.`
}
