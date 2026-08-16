#!/usr/bin/env node
/**
 * Saved CSV layout integration tests: real Edge Function, RLS and unique key.
 * Requires the local stack and functions serve process.
 */
import {
  check, section, exitWithSummary, newUserWithAccount, invoke,
} from './lib/harness.mjs'

async function fingerprint(headers) {
  const bytes = new TextEncoder().encode(headers.join('|'))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const headers = ['Date', 'Description', 'Debit', 'Credit', 'Category']
const firstMapping = {
  dateCol: 'Date',
  descCol: 'Description',
  amountCol: null,
  debitCol: 'Debit',
  creditCol: 'Credit',
  invertAmount: false,
  categoryCol: 'Category',
  subcategoryCol: null,
  dateFormat: 'DD/MM/YYYY',
}

async function main() {
  console.log('\n\x1b[1mStatic CSV profiles\x1b[0m')
  const a = await newUserWithAccount('profiles-a')
  const b = await newUserWithAccount('profiles-b')
  const headerFingerprint = await fingerprint(headers)

  section('Create and read exact layout')
  const created = await invoke('upsert-profile', a.token, {
    headers,
    displayName: 'St George Credit Card',
    mappings: firstMapping,
  })
  check('save succeeds', created.status === 200, JSON.stringify(created.json))
  check('server fingerprint matches client', created.json?.header_fingerprint === headerFingerprint,
    created.json?.header_fingerprint)

  const firstRead = await a.client.from('static_profiles')
    .select('id, name, header_fingerprint, mappings')
    .eq('header_fingerprint', headerFingerprint).maybeSingle()
  check('profile is readable by fingerprint', !firstRead.error && Boolean(firstRead.data), firstRead.error?.message)
  check('human label is separate from identity', firstRead.data?.name === 'St George Credit Card', firstRead.data?.name)
  check('camelCase mapping round-trips', firstRead.data?.mappings?.dateCol === 'Date' && firstRead.data?.mappings?.debitCol === 'Debit',
    JSON.stringify(firstRead.data?.mappings))

  section('Correction updates instead of duplicating')
  const updatedMapping = { ...firstMapping, descCol: 'Category', categoryCol: null }
  const updated = await invoke('upsert-profile', a.token, {
    headers,
    displayName: 'Corrected St George Layout',
    mappings: updatedMapping,
  })
  check('update succeeds', updated.status === 200, JSON.stringify(updated.json))
  check('same profile row updated', updated.json?.id === created.json?.id,
    `created=${created.json?.id} updated=${updated.json?.id}`)

  const allA = await a.client.from('static_profiles')
    .select('id, name, mappings').eq('header_fingerprint', headerFingerprint)
  check('only one row exists for the layout', allA.data?.length === 1, `${allA.data?.length} rows`)
  check('corrected mapping persisted', allA.data?.[0]?.mappings?.descCol === 'Category',
    JSON.stringify(allA.data?.[0]?.mappings))

  section('Validation and tenant isolation')
  const invalid = await invoke('upsert-profile', a.token, {
    headers,
    displayName: 'Invalid',
    mappings: { ...firstMapping, dateCol: 'Invented column' },
  })
  check('invented mapped column rejected', invalid.status === 422, `status=${invalid.status}`)

  const hidden = await b.client.from('static_profiles')
    .select('id').eq('header_fingerprint', headerFingerprint)
  check('other tenant cannot read the profile', hidden.data?.length === 0, `${hidden.data?.length} rows`)
  const createdB = await invoke('upsert-profile', b.token, {
    headers,
    displayName: 'Tenant B copy',
    mappings: firstMapping,
  })
  check('same fingerprint is allowed in another tenant', createdB.status === 200,
    JSON.stringify(createdB.json))

  exitWithSummary()
}

main().catch((error) => {
  console.error('\x1b[31mHarness error:\x1b[0m', error.message)
  process.exit(2)
})

