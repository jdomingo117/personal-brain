import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { SafeHttpError, withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'
import { resolveMerchantCategories, type MerchantInput } from '../_shared/categorize.ts'
import { ALL_CATEGORIES, FULL_TAXONOMY, UNCATEGORIZED } from '../_shared/taxonomy.ts'

const TransactionIds = z.array(z.string().uuid()).min(1).max(500)
const PreviewPayload = z.object({ action: z.literal('preview'), transaction_ids: TransactionIds })
const Assignment = z.object({
  transaction_id: z.string().uuid(),
  before_category: z.string().min(1).max(100),
  before_subcategory: z.string().max(100).nullable(),
  before_source: z.enum(['bank', 'ai', 'seed']).nullable(),
  before_confidence: z.number().min(0).max(1).nullable(),
  before_needs_review: z.boolean(),
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).nullable(),
})
const ApplyPayload = z.object({ action: z.literal('apply'), assignments: z.array(Assignment).min(1).max(500) })
const Payload = z.discriminatedUnion('action', [PreviewPayload, ApplyPayload])

const QUERY_CHUNK = 75
const RULE_CHUNK = 100

interface ReviewRow {
  id: string
  date: string
  merchant: string
  merchant_key: string
  original_description: string
  amount: number
  category: string
  subcategory: string | null
  category_source: 'user' | 'bank' | 'ai' | 'seed' | null
  category_confidence: number | null
  needs_review: boolean
  kind: string
  kind_source: string
}

function assertUnique(ids: string[]) {
  if (new Set(ids).size !== ids.length) {
    throw new SafeHttpError(422, { error: 'Duplicate transaction selection' })
  }
}

async function visibleRows(ctx: { db: any }, ids: string[]): Promise<ReviewRow[]> {
  const rows: ReviewRow[] = []
  for (let index = 0; index < ids.length; index += QUERY_CHUNK) {
    const { data, error } = await ctx.db.from('transactions')
      .select('id,date,merchant,merchant_key,original_description,amount,category,subcategory,category_source,category_confidence,needs_review,kind,kind_source')
      .in('id', ids.slice(index, index + QUERY_CHUNK))
    if (error) throw error
    rows.push(...(data ?? []))
  }
  return rows
}

async function userRuleKeys(ctx: { db: any }, merchantKeys: string[]): Promise<Set<string>> {
  const keys = new Set<string>()
  const distinct = [...new Set(merchantKeys)]
  for (let index = 0; index < distinct.length; index += RULE_CHUNK) {
    const { data, error } = await ctx.db.from('merchant_rules')
      .select('merchant_key').eq('source', 'user').in('merchant_key', distinct.slice(index, index + RULE_CHUNK))
    if (error) throw error
    for (const row of data ?? []) keys.add(row.merchant_key)
  }
  return keys
}

function validTaxonomyPair(category: string, subcategory: string | null) {
  if (![...ALL_CATEGORIES, UNCATEGORIZED].includes(category)) return false
  if (!subcategory) return true
  return (FULL_TAXONOMY[category] ?? []).includes(subcategory)
    && !(category === 'Transfer' && subcategory === 'Reconciliation')
}

Deno.serve(withAuth({ schema: Payload, requireRole: 'member', rateLimit: LIMITS.categorizePerUser }, async (ctx) => {
  if (ctx.body.action === 'apply') {
    assertUnique(ctx.body.assignments.map((assignment) => assignment.transaction_id))
    for (const assignment of ctx.body.assignments) {
      if (!validTaxonomyPair(assignment.category, assignment.subcategory)) {
        throw new SafeHttpError(422, { error: 'A suggested category pair is invalid' })
      }
    }

    const { data, error } = await ctx.admin().rpc('apply_categorization_review', {
      p_tenant_id: ctx.tenantId,
      p_actor_id: ctx.user.id,
      p_assignments: ctx.body.assignments,
    })
    if (error) {
      const message = String(error.message ?? '')
      if (message.includes('changed since preview')) throw new SafeHttpError(409, { error: 'One or more transactions changed since this preview. Review them again before applying.' })
      if (message.includes('protected')) throw new SafeHttpError(409, { error: 'One or more transactions became protected and were not changed.' })
      throw error
    }
    await ctx.audit('transactions.categorization_review_applied', {
      operation_id: data.operation_id, selected: data.selected, updated: data.updated,
    })
    return data
  }

  assertUnique(ctx.body.transaction_ids)
  const rows = await visibleRows(ctx, ctx.body.transaction_ids)
  if (rows.length !== ctx.body.transaction_ids.length) {
    throw new SafeHttpError(404, { error: 'One or more transactions were not found' })
  }
  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered = ctx.body.transaction_ids.map((id) => byId.get(id) as ReviewRow)
  const ruleKeys = await userRuleKeys(ctx, ordered.map((row) => row.merchant_key))

  const protectedReason = (row: ReviewRow): string | null => {
    if (row.kind === 'adjustment' && row.kind_source === 'system') return 'System reconciliation entry'
    if (row.category_source === 'user') return 'Manual transaction correction'
    if (ruleKeys.has(row.merchant_key)) return 'Protected by a user merchant rule'
    if (row.category_source === 'bank') return 'Bank classification is protected by default'
    return null
  }
  const eligible = ordered.filter((row) => !protectedReason(row))

  interface Group {
    key: string
    display: string
    samples: string[]
    inflow: number
    outflow: number
  }
  const groups = new Map<string, Group>()
  for (const row of eligible) {
    let group = groups.get(row.merchant_key)
    if (!group) {
      group = { key: row.merchant_key, display: row.merchant, samples: [], inflow: 0, outflow: 0 }
      groups.set(row.merchant_key, group)
    }
    if (row.amount >= 0) group.inflow++
    else group.outflow++
    if (group.samples.length < 3 && !group.samples.includes(row.original_description)) group.samples.push(row.original_description)
  }
  const merchants: MerchantInput[] = [...groups.values()].map((group) => ({
    key: group.key, display: group.display, sampleDescriptions: group.samples,
    direction: group.inflow > group.outflow ? 'inflow' : 'outflow',
  }))
  if (merchants.length > 200) {
    throw new SafeHttpError(422, { error: 'Review at most 200 distinct merchants per preview request' })
  }
  const { resolved, stats } = merchants.length
    ? await resolveMerchantCategories(ctx.db, ctx.tenantId, merchants, {
      bypassNonUserCache: true, cacheAiResults: false,
    })
    : { resolved: new Map(), stats: { requested: 0, fromCache: 0, fromBank: 0, fromAi: 0, geminiCalls: 0 } }

  const resultRows = ordered.map((row) => {
    const protection = protectedReason(row)
    const suggestion = protection ? null : resolved.get(row.merchant_key) ?? null
    const proposed = suggestion ? {
      category: suggestion.category,
      subcategory: suggestion.subcategory,
      source: suggestion.source,
      confidence: suggestion.confidence,
      needs_review: suggestion.needsReview,
    } : null
    const changed = Boolean(proposed)
      && (row.category !== proposed!.category || row.subcategory !== proposed!.subcategory || row.needs_review)
    const status = protection ? 'protected'
      : !proposed || proposed.category === UNCATEGORIZED ? 'unresolved'
      : changed ? 'suggested' : 'unchanged'
    return {
      transaction_id: row.id, date: row.date, merchant: row.merchant,
      current: { category: row.category, subcategory: row.subcategory, source: row.category_source, confidence: row.category_confidence, needs_review: row.needs_review },
      proposed, status, protection_reason: protection,
    }
  })

  await ctx.audit('transactions.categorization_review_previewed', {
    selected: ordered.length, eligible: eligible.length,
    suggested: resultRows.filter((row) => row.status === 'suggested').length,
    protected: resultRows.filter((row) => row.status === 'protected').length,
    unresolved: resultRows.filter((row) => row.status === 'unresolved').length,
    gemini_calls: stats.geminiCalls,
  })
  return { rows: resultRows, stats: { ...stats, selected: ordered.length, eligible: eligible.length } }
}))
