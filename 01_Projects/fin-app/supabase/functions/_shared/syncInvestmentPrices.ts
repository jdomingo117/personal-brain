import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { fetchVanguardPrices } from './vanguardPrices.ts'

export async function syncInvestmentInstrument(admin: SupabaseClient, instrument: {
  id: string; price_provider: string; provider_product_id: string | null
}, trigger: 'manual' | 'stale' | 'scheduled') {
  const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  await admin.from('investment_price_sync_runs').update({
    status: 'failed', finished_at: new Date().toISOString(), error_code: 'stalled',
  }).eq('instrument_id', instrument.id).eq('status', 'running').lt('started_at', staleCutoff)
  const { data: run, error: runError } = await admin.from('investment_price_sync_runs').insert({
    instrument_id: instrument.id, provider: instrument.price_provider, trigger, status: 'running',
  }).select('id').single()
  if (runError?.code === '23505') return { instrument_id: instrument.id, in_progress: true }
  if (runError) throw runError
  try {
    if (instrument.price_provider !== 'vanguard_au' || !instrument.provider_product_id) throw new Error('Unsupported price provider')
    const prices = await fetchVanguardPrices(instrument.provider_product_id)
    const { data: latestStored } = await admin.from('instrument_prices').select('price_date')
      .eq('instrument_id', instrument.id).order('price_date', { ascending: false }).limit(1).maybeSingle()
    const replayFrom = latestStored?.price_date
      ? new Date(new Date(`${latestStored.price_date}T00:00:00Z`).getTime() - 14 * 86400_000).toISOString().slice(0, 10)
      : null
    const pricesToWrite = replayFrom ? prices.filter((price) => price.price_date >= replayFrom) : prices
    const payload = pricesToWrite.map((price) => ({ ...price, instrument_id: instrument.id, fetched_at: new Date().toISOString() }))
    const { error: priceError } = await admin.from('instrument_prices').upsert(payload, { onConflict: 'instrument_id,price_date' })
    if (priceError) throw priceError
    const { data: rebuilt, error: rebuildError } = await admin.rpc('rebuild_investment_valuations')
    if (rebuildError) throw rebuildError
    const newest = prices.at(-1)!.price_date
    await admin.from('investment_price_sync_runs').update({
      status: 'succeeded', finished_at: new Date().toISOString(), prices_seen: prices.length,
      prices_written: pricesToWrite.length, newest_price_at: newest,
    }).eq('id', run.id)
    return { instrument_id: instrument.id, prices: prices.length, prices_written: pricesToWrite.length, newest_price_at: newest, valuations_rebuilt: rebuilt }
  } catch (error) {
    await admin.from('investment_price_sync_runs').update({
      status: 'failed', finished_at: new Date().toISOString(), error_code: 'provider_error',
    }).eq('id', run.id)
    throw error
  }
}
