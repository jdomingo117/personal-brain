import { describe, expect, it } from 'vitest'
import {
  MAX_MERCHANTS_PER_CATEGORIZATION_REQUEST,
  runCategorizationChunks,
  type MerchantForCategorization,
} from './categorizeChunks'

const merchants = (count: number): MerchantForCategorization[] => Array.from({ length: count }, (_, index) => ({
  key: `merchant-${index}`,
  display: `Merchant ${index}`,
  direction: 'outflow',
  sampleDescriptions: [`Merchant ${index}`],
}))

describe('runCategorizationChunks', () => {
  it('splits 301 merchants into bounded sequential endpoint requests', async () => {
    const requested: number[] = []
    const result = await runCategorizationChunks(merchants(301), async (chunk) => {
      requested.push(chunk.length)
      return {
        assignments: chunk.map((merchant) => ({
          key: merchant.key, category: 'Other', subcategory: 'Miscellaneous', source: 'ai' as const,
        })),
        stats: { fromCache: 0, fromBank: 0, fromAi: chunk.length, geminiCalls: 1 },
      }
    })

    expect(MAX_MERCHANTS_PER_CATEGORIZATION_REQUEST).toBe(300)
    expect(requested).toEqual([300, 1])
    expect(result.assignments).toHaveLength(301)
    expect(result.stats).toEqual({ fromCache: 0, fromBank: 0, fromAi: 301, geminiCalls: 2 })
    expect(result.failedMerchantKeys).toEqual([])
  })

  it('keeps successful chunks and continues after a later recoverable failure', async () => {
    const requested: number[] = []
    const progress: string[] = []
    const result = await runCategorizationChunks(merchants(601), async (chunk) => {
      requested.push(chunk.length)
      if (requested.length === 2) throw new Error('temporary categorisation outage')
      return {
        assignments: chunk.map((merchant) => ({
          key: merchant.key, category: 'Other', subcategory: 'Miscellaneous', source: 'ai' as const,
        })),
        stats: { fromCache: chunk.length, fromBank: 0, fromAi: 0, geminiCalls: 0 },
      }
    }, (state) => progress.push(`${state.completedChunks}/${state.totalChunks}:${state.failedChunks}`))

    expect(requested).toEqual([300, 300, 1])
    expect(result.assignments.map((assignment) => assignment.key)).toEqual([
      ...merchants(300).map((merchant) => merchant.key),
      'merchant-600',
    ])
    expect(result.failedMerchantKeys).toEqual(merchants(300).map((merchant) => `merchant-${Number(merchant.key.slice(9)) + 300}`))
    expect(result.stats).toEqual({ fromCache: 301, fromBank: 0, fromAi: 0, geminiCalls: 0 })
    expect(progress).toEqual(['1/3:0', '2/3:1', '3/3:1'])
  })

  it('treats a hung chunk as recoverable and continues to later chunks', async () => {
    const requested: number[] = []
    const result = await runCategorizationChunks(merchants(601), async (chunk) => {
      requested.push(chunk.length)
      if (requested.length === 2) return await new Promise<never>(() => {})
      return {
        assignments: chunk.map((merchant) => ({
          key: merchant.key, category: 'Other', subcategory: 'Miscellaneous', source: 'ai' as const,
        })),
        stats: { fromCache: 0, fromBank: 0, fromAi: chunk.length, geminiCalls: 1 },
      }
    }, undefined, { requestTimeoutMs: 5 })

    expect(requested).toEqual([300, 300, 1])
    expect(result.assignments.map((assignment) => assignment.key)).toEqual([
      ...merchants(300).map((merchant) => merchant.key),
      'merchant-600',
    ])
    expect(result.failedMerchantKeys).toHaveLength(300)
    expect(result.stats).toEqual({ fromCache: 0, fromBank: 0, fromAi: 301, geminiCalls: 2 })
  })
})
