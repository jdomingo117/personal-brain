import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { syncInvestmentInstrument } from '../_shared/syncInvestmentPrices.ts'

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const supplied = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supplied || !expected || await digest(supplied) !== await digest(expected)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', expected, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: holdings, error: holdingError } = await admin.from('investment_holdings').select('instrument_id')
  if (holdingError) return new Response(JSON.stringify({ error: 'Request failed' }), { status: 500 })
  const instrumentIds = [...new Set((holdings ?? []).map((holding) => holding.instrument_id))]
  if (instrumentIds.length === 0) return Response.json({ synced: 0, results: [] })
  const { data: instruments, error: instrumentError } = await admin.from('investment_instruments')
    .select('id, price_provider, provider_product_id').in('id', instrumentIds).eq('active', true)
  if (instrumentError) return new Response(JSON.stringify({ error: 'Request failed' }), { status: 500 })

  const results = []
  for (const instrument of instruments ?? []) {
    try {
      results.push({ ok: true, ...(await syncInvestmentInstrument(admin, instrument, 'scheduled')) })
    } catch {
      results.push({ ok: false, instrument_id: instrument.id })
    }
  }
  return Response.json({ synced: results.filter((result) => result.ok).length, results })
})

