import { supabase } from './supabaseClient'

/**
 * Drains the backlog of transactions that have never been through the
 * categorisation tiers (`category_source IS NULL`).
 *
 * Called after a provider sync, because that is the only path that creates
 * such rows: `sync-provider` deliberately does not call Gemini inline (Law 5
 * — never on the main request path), so anything Up's own category ids don't
 * cover arrives Uncategorized and needs this out-of-band pass to pick it up.
 * The CSV path resolves categories during staging and never produces a
 * backlog.
 *
 * Loops because one invocation drains a bounded page (see PAGE in
 * categorize-pending — sized so a cold-cache pass can't overrun the gateway
 * timeout) — same done/progress contract as sync-provider. Bounded so a
 * server that kept returning `done:false` can't spin forever.
 */
const MAX_PASSES = 50

export interface CategorizeProgress {
  rowsCategorized: number
  merchantsResolved: number
  geminiCalls: number
}

export async function runCategorizePending(
  onProgress?: (p: CategorizeProgress) => void,
): Promise<CategorizeProgress> {
  const total: CategorizeProgress = { rowsCategorized: 0, merchantsResolved: 0, geminiCalls: 0 }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { data, error } = await supabase.functions.invoke('categorize-pending', { body: {} })
    if (error) throw error
    if (data?.error) throw new Error(data.message || data.error)

    total.rowsCategorized += data?.progress?.rows_categorized ?? 0
    total.merchantsResolved += data?.progress?.merchants_resolved ?? 0
    total.geminiCalls += data?.progress?.gemini_calls ?? 0
    onProgress?.({ ...total })

    if (data?.done) break
  }

  return total
}
