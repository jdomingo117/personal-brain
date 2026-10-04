/**
 * Client-side orchestration for the bounded categorize-merchants endpoint.
 *
 * The endpoint intentionally accepts no more than 300 merchants. A statement
 * can contain more, so chunks run sequentially. Each successful response is
 * retained if a later request fails: AI availability must never erase useful
 * categorisation that has already completed.
 */
export const MAX_MERCHANTS_PER_CATEGORIZATION_REQUEST = 300
/** A hung network/function request is treated like any other recoverable
 * categorisation failure; it must not leave staging disabled forever. */
export const CATEGORIZATION_REQUEST_TIMEOUT_MS = 60_000

export interface MerchantForCategorization {
  key: string
  display: string
  direction: 'inflow' | 'outflow'
  sampleDescriptions: string[]
  bankCategory?: string
  bankSubcategory?: string | null
}

export interface CategorizationAssignment {
  key: string
  category: string
  subcategory: string | null
  source: 'user' | 'bank' | 'ai' | 'seed'
  confidence?: number | null
  needsReview?: boolean
}

export interface CategorizationStats {
  fromCache: number
  fromBank: number
  fromAi: number
  geminiCalls: number
}

export interface CategorizationProgress {
  completedChunks: number
  totalChunks: number
  failedChunks: number
}

export interface ChunkedCategorizationResult {
  assignments: CategorizationAssignment[]
  stats: CategorizationStats
  /** Merchant keys for requests that did not complete. */
  failedMerchantKeys: string[]
}

export interface CategorizationRunOptions {
  /** Test hook and operational seam; production keeps the one-minute bound. */
  requestTimeoutMs?: number
}

function withRequestTimeout<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Categorisation request timed out.')), timeoutMs)
    request.then(
      (result) => { clearTimeout(timer); resolve(result) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

export function categorizationChunks<T>(items: T[]): T[][] {
  const chunks: T[][] = []
  for (let offset = 0; offset < items.length; offset += MAX_MERCHANTS_PER_CATEGORIZATION_REQUEST) {
    chunks.push(items.slice(offset, offset + MAX_MERCHANTS_PER_CATEGORIZATION_REQUEST))
  }
  return chunks
}

/**
 * Resolves every chunk independently. An endpoint/network failure is a
 * recoverable categorisation outcome, not an import failure: the caller can
 * mark only that chunk's unresolved rows for review and still stage the file.
 */
export async function runCategorizationChunks(
  merchants: MerchantForCategorization[],
  request: (chunk: MerchantForCategorization[]) => Promise<{
    assignments: CategorizationAssignment[]
    stats: CategorizationStats
  }>,
  onProgress?: (progress: CategorizationProgress) => void,
  options: CategorizationRunOptions = {},
): Promise<ChunkedCategorizationResult> {
  const chunks = categorizationChunks(merchants)
  const assignments: CategorizationAssignment[] = []
  const failedMerchantKeys: string[] = []
  const stats: CategorizationStats = { fromCache: 0, fromBank: 0, fromAi: 0, geminiCalls: 0 }
  let failedChunks = 0

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]
    try {
      const result = await withRequestTimeout(
        request(chunk),
        options.requestTimeoutMs ?? CATEGORIZATION_REQUEST_TIMEOUT_MS,
      )
      assignments.push(...result.assignments)
      stats.fromCache += result.stats.fromCache
      stats.fromBank += result.stats.fromBank
      stats.fromAi += result.stats.fromAi
      stats.geminiCalls += result.stats.geminiCalls
    } catch {
      failedChunks++
      failedMerchantKeys.push(...chunk.map((merchant) => merchant.key))
    }
    onProgress?.({ completedChunks: index + 1, totalChunks: chunks.length, failedChunks })
  }

  return { assignments, stats, failedMerchantKeys }
}
