import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { investmentDedupeHashHex } from '../_shared/investmentDedupe.ts'
import { runInvestmentCashLinks } from '../_shared/runInvestmentCashLinks.ts'

const Decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,10})?$/)
const ActivityType = z.enum([
  'purchase', 'redemption', 'distribution_reinvestment', 'cash_distribution',
  'fee', 'opening_units', 'unit_adjustment', 'cost_base_adjustment',
])
const Row = z.object({
  trade_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activity_type: ActivityType,
  quantity: Decimal,
  unit_price: Decimal.optional().nullable(),
  value_cents: z.number().int().safe(),
  brokerage_cents: z.number().int().safe().default(0),
  source_label: z.string().min(1).max(120),
})
const Payload = z.object({
  account_id: z.string().uuid(),
  platform: z.enum(['vanguard_personal_investor']),
  account_suffix: z.string().regex(/^\d{1,4}$/).optional().nullable(),
  instrument_identifier_type: z.literal('APIR'),
  instrument_identifier: z.string().regex(/^[A-Z]{3}\d{4}AU$/),
  source_adapter: z.literal('vanguard_personal_investor'),
  source_version: z.literal(1),
  upload_batch_id: z.string().uuid(),
  confirmed_units: Decimal,
  rows: z.array(Row).min(1).max(5000),
})

Deno.serve(withAuth({ schema: Payload, maxBodyBytes: 8 * 1024 * 1024 }, async (ctx) => {
  const body = ctx.body
  const { data: account, error: accountError } = await ctx.db
    .from('accounts').select('id, type, balance, balance_source, balance_as_of').eq('id', body.account_id).maybeSingle()
  if (accountError) throw accountError
  if (!account || account.type !== 'Invest') throw new Error('Investment imports require an Invest account')

  const { data: instrument, error: instrumentError } = await ctx.db
    .from('investment_instruments').select('id, identifier, active')
    .eq('identifier_type', body.instrument_identifier_type)
    .eq('identifier', body.instrument_identifier)
    .maybeSingle()
  if (instrumentError) throw instrumentError
  if (!instrument?.active) throw new Error('Unsupported investment instrument')

  let { data: holding, error: holdingReadError } = await ctx.db
    .from('investment_holdings').select('id')
    .eq('account_id', body.account_id).eq('instrument_id', instrument.id).maybeSingle()
  if (holdingReadError) throw holdingReadError
  if (!holding) {
    const { data, error } = await ctx.db.from('investment_holdings').insert({
      tenant_id: ctx.tenantId,
      account_id: body.account_id,
      instrument_id: instrument.id,
      platform: body.platform,
      account_suffix: body.account_suffix,
      reconciliation_status: 'confirmed',
      confirmed_units: body.confirmed_units,
      confirmed_at: new Date().toISOString(),
    }).select('id').single()
    if (error) throw error
    holding = data
  }

  const hashes = await Promise.all(body.rows.map((row) => investmentDedupeHashHex({
    accountId: body.account_id,
    instrumentIdentifier: body.instrument_identifier,
    tradeDate: row.trade_date,
    activityType: row.activity_type,
    quantity: row.quantity,
    unitPrice: row.unit_price ?? null,
    valueCents: row.value_cents,
    brokerageCents: row.brokerage_cents,
    sourceLabel: row.source_label,
  })))
  const occurrenceByHash = new Map<string, number>()
  const payload = body.rows.map((row, index) => {
    const hash = hashes[index]
    const occurrence = occurrenceByHash.get(hash) ?? 0
    occurrenceByHash.set(hash, occurrence + 1)
    let quantity = row.quantity
    if (row.activity_type === 'redemption' && !quantity.startsWith('-') && quantity !== '0') quantity = `-${quantity}`
    return {
      tenant_id: ctx.tenantId,
      account_id: body.account_id,
      holding_id: holding!.id,
      instrument_id: instrument.id,
      trade_date: row.trade_date,
      activity_type: row.activity_type,
      quantity_delta: quantity,
      unit_price: row.unit_price,
      value_cents: row.value_cents,
      brokerage_cents: row.brokerage_cents,
      source_label: row.source_label,
      source_adapter: body.source_adapter,
      source_version: body.source_version,
      source_hash: hash,
      occurrence,
      upload_batch_id: body.upload_batch_id,
    }
  })

  const { data: inserted, error: insertError } = await ctx.db.from('investment_activities')
    .upsert(payload, { onConflict: 'holding_id,source_hash,occurrence', ignoreDuplicates: true })
    .select('id')
  if (insertError) throw insertError

  const { error: holdingError } = await ctx.db.from('investment_holdings').update({
    account_suffix: body.account_suffix,
    reconciliation_status: 'confirmed',
    confirmed_units: body.confirmed_units,
    confirmed_at: new Date().toISOString(),
  }).eq('id', holding.id)
  if (holdingError) throw holdingError

  const { data: summary, error: summaryError } = await ctx.db
    .from('investment_holding_summary').select('*').eq('holding_id', holding.id).single()
  if (summaryError) throw summaryError

  const insertedCount = inserted?.length ?? 0
  let valuation: {
    status: 'preserved' | 'revalued' | 'awaiting_price'
    value_cents: number
    price_date: string | null
    snapshots_rebuilt: number
  } = {
    status: 'preserved',
    value_cents: Number(account.balance),
    price_date: account.balance_as_of,
    snapshots_rebuilt: 0,
  }

  // A priced duplicate is a true monetary no-op. New activity is revalued
  // synchronously from stored prices only; imports never depend on a live
  // provider request. The scoped SQL call is transactional, so a failed
  // rebuild cannot delete the prior snapshots or cached value.
  if (insertedCount > 0 || account.balance_source !== 'investment_valuation') {
    const { data: rebuilt, error: rebuildError } = await ctx.admin()
      .rpc('rebuild_investment_account_valuations', { p_account_id: body.account_id })
    if (rebuildError) throw rebuildError

    const { data: refreshedAccount, error: refreshedAccountError } = await ctx.db
      .from('accounts').select('balance, balance_source, balance_as_of').eq('id', body.account_id).single()
    if (refreshedAccountError) throw refreshedAccountError
    const rebuiltCount = Number(rebuilt ?? 0)

    if (rebuiltCount > 0) {
      const priceDate = refreshedAccount.balance_as_of?.slice(0, 10) ?? null
      const latestImportedDate = payload.reduce(
        (latest, row) => row.trade_date > latest ? row.trade_date : latest,
        payload[0].trade_date,
      )
      valuation = {
        status: priceDate && priceDate >= latestImportedDate ? 'revalued' : 'awaiting_price',
        value_cents: Number(refreshedAccount.balance),
        price_date: refreshedAccount.balance_as_of,
        snapshots_rebuilt: rebuiltCount,
      }
    } else {
      // This is the only legitimate zero-initialisation path: a first import
      // for an account whose instrument has no stored verified price yet.
      if (account.balance_source !== 'investment_valuation') {
        const { error: initialiseError } = await ctx.db.from('accounts').update({
          balance_source: 'investment_valuation', balance: 0, balance_as_of: null,
        }).eq('id', body.account_id)
        if (initialiseError) throw initialiseError
      }
      valuation = {
        status: 'awaiting_price',
        value_cents: account.balance_source === 'investment_valuation' ? Number(account.balance) : 0,
        price_date: account.balance_as_of,
        snapshots_rebuilt: 0,
      }
    }
  }

  let cashLinks = { created: 0, removed: 0, auto: 0, suggested: 0, confirmed: 0, overflowedAmounts: [] as number[] }
  if (insertedCount > 0) {
    const dates = payload.map((row) => row.trade_date).sort()
    try {
      cashLinks = await runInvestmentCashLinks(ctx.db, ctx.admin(), ctx.tenantId, dates[0], dates[dates.length - 1])
    } catch (error) {
      // Import is already committed and remains valid. The next bank import,
      // provider sync or manual rescan is order-independent and will retry.
      console.error('post-investment-import cash reconciliation failed', String(error))
    }
  }

  await ctx.audit('investment.activities_imported', {
    account_id: body.account_id,
    instrument: body.instrument_identifier,
    submitted: payload.length,
    inserted: insertedCount,
    skipped: payload.length - insertedCount,
    upload_batch_id: body.upload_batch_id,
    valuation_status: valuation.status,
    investment_cash_links: cashLinks.created,
  })
  return { inserted: insertedCount, skipped: payload.length - insertedCount, holding_id: holding.id, summary, valuation, cash_links: cashLinks }
}))
