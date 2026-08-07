import { supabase } from './supabaseClient'

/**
 * Recurring Hub Phase 2 trigger: drains merchants with only 1-2 charges so
 * far through the AI recurrence-hint classifier (see
 * supabase/functions/detect-recurrence-hints and
 * supabase/functions/_shared/recurrenceHints.ts). Structured identically to
 * runCategorizePending() — same MAX_PASSES bound, same done/progress
 * contract — except the server has no natural "already processed" marker to
 * shrink its query on (the resolution lives in a separate cache table keyed
 * by merchant, not on the transaction rows themselves), so a keyset cursor
 * (`nextAfterId`) is threaded from one call into the next rather than relying
 * on the query shrinking by itself.
 */
const MAX_PASSES = 50

export interface RecurrenceHintProgress {
  merchantsChecked: number
  candidatesCached: number
  geminiCalls: number
}

export async function runDetectRecurrenceHints(
  onProgress?: (p: RecurrenceHintProgress) => void,
): Promise<RecurrenceHintProgress> {
  const total: RecurrenceHintProgress = { merchantsChecked: 0, candidatesCached: 0, geminiCalls: 0 }
  let afterId: string | null = null

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const body: { after_id?: string } = afterId ? { after_id: afterId } : {}
    const { data, error } = await supabase.functions.invoke('detect-recurrence-hints', { body })
    if (error) throw error
    if (data?.error) throw new Error(data.message || data.error)

    total.merchantsChecked += data?.progress?.merchants_checked ?? 0
    total.candidatesCached += data?.progress?.candidates_cached ?? 0
    total.geminiCalls += data?.progress?.gemini_calls ?? 0
    onProgress?.({ ...total })

    if (data?.done) break
    afterId = data?.next_after_id ?? afterId
  }

  return total
}
