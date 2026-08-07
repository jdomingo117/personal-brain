#!/usr/bin/env node
/**
 * AI categorisation tests.
 *
 * The two claims that matter:
 *   1. The AI can only ever emit categories from the fixed taxonomy — an
 *      invented category would break the 7-hue chart palette and every budget
 *      join, so it must be impossible, not merely unlikely.
 *   2. The merchant cache makes repeat imports free. A second run over the
 *      same merchants must make ZERO Gemini calls.
 *
 *   node app/scripts/test-categorization.mjs
 */
import {
  check, section, exitWithSummary, newUserWithAccount, invoke,
} from './lib/harness.mjs'

const EXPENSE_CATEGORIES = ['Food', 'Housing', 'Transport', 'Utilities', 'Subscriptions', 'Retail', 'Health', 'Other']
const ALLOWED = [...EXPENSE_CATEGORIES, 'Income', 'Transfer', 'Investing', 'Uncategorized']

const merchant = (key, display, direction = 'outflow', samples = []) => ({
  key, display, direction, sampleDescriptions: samples,
})

async function main() {
  console.log('\n\x1b[1mAI merchant categorisation\x1b[0m')

  const u = await newUserWithAccount('cat')

  section('Categorising real merchants from the sample files')
  const merchants = [
    merchant('woolworths', 'Woolworths', 'outflow', ['WOOLWORTHS 1234  SYDNEY']),
    merchant('bp baulkham hills', 'BP Baulkham Hills', 'outflow', ['BP BAULKHAM HILLS   BAULKHAM HILL']),
    merchant('transport for nsw-opal', 'Transport For NSW-Opal', 'outflow', ['TRANSPORT FOR NSW-OPAL  CHIPPENDALE']),
    merchant('netflix', 'Netflix', 'outflow', ['NETFLIX.COM']),
    merchant('salary from the university o', 'Salary From The University O', 'inflow', ['Salary From The University O - 1188723']),
    merchant('linked account - internal transfer', 'Linked Account - Internal Transfer', 'inflow', ['From Linked Account Xx3965 - Internal Transfer']),
  ]

  const r = await invoke('categorize-merchants', u.token, { merchants })
  check('request succeeds', r.status === 200, JSON.stringify(r.json).slice(0, 300))

  const assignments = r.json?.assignments ?? []
  check('every merchant gets an assignment', assignments.length === merchants.length,
    `${assignments.length} of ${merchants.length}`)

  section('Taxonomy containment — the hard constraint')
  const outside = assignments.filter((a) => !ALLOWED.includes(a.category))
  check('no category outside the fixed vocabulary', outside.length === 0,
    JSON.stringify(outside.map((a) => a.category)))
  check('no invented subcategories', assignments.every((a) => a.subcategory === null || typeof a.subcategory === 'string'))

  section('Categorisation quality')
  const by = Object.fromEntries(assignments.map((a) => [a.key, a]))
  check('a supermarket is Food', by['woolworths']?.category === 'Food',
    `got ${by['woolworths']?.category}`)
  check('a petrol station is Transport', by['bp baulkham hills']?.category === 'Transport',
    `got ${by['bp baulkham hills']?.category}`)
  check('public transport is Transport', by['transport for nsw-opal']?.category === 'Transport',
    `got ${by['transport for nsw-opal']?.category}`)
  check('a streaming service is Subscriptions', by['netflix']?.category === 'Subscriptions',
    `got ${by['netflix']?.category}`)
  check('salary is Income, not an expense', by['salary from the university o']?.category === 'Income',
    `got ${by['salary from the university o']?.category}`)
  check('an internal transfer is Transfer', by['linked account - internal transfer']?.category === 'Transfer',
    `got ${by['linked account - internal transfer']?.category}`)

  section('Cost: the cache must make a repeat run free')
  check('first run used the AI', r.json?.stats?.geminiCalls > 0, JSON.stringify(r.json?.stats))
  check('first run batched, not one call per merchant', r.json?.stats?.geminiCalls === 1,
    `${r.json?.stats?.geminiCalls} calls for ${merchants.length} merchants`)

  const again = await invoke('categorize-merchants', u.token, { merchants })
  check('second run makes ZERO Gemini calls', again.json?.stats?.geminiCalls === 0,
    `geminiCalls=${again.json?.stats?.geminiCalls}`)
  check('second run served entirely from cache',
    again.json?.stats?.fromCache === merchants.length,
    `fromCache=${again.json?.stats?.fromCache} of ${merchants.length}`)
  check('cached answers match the originals',
    JSON.stringify(again.json.assignments.map((a) => [a.key, a.category]).sort()) ===
    JSON.stringify(assignments.map((a) => [a.key, a.category]).sort()))

  section('The cache is persisted and tenant-scoped')
  const rules = await u.client.from('merchant_rules').select('merchant_key, category, source')
  check('rules were written', (rules.data?.length ?? 0) === merchants.length,
    `${rules.data?.length} rules`)
  check("rules are marked as AI-sourced", rules.data?.every((x) => x.source === 'ai'))

  const other = await newUserWithAccount('cat-b')
  const otherRules = await other.client.from('merchant_rules').select('merchant_key')
  check("another tenant cannot see them", (otherRules.data?.length ?? 0) === 0,
    `${otherRules.data?.length} leaked`)
  const otherRun = await invoke('categorize-merchants', other.token, { merchants: [merchants[0]] })
  check('another tenant pays for its own categorisation',
    otherRun.json?.stats?.geminiCalls === 1, JSON.stringify(otherRun.json?.stats))

  section('User corrections outrank the AI, permanently')
  const rule = await invoke('apply-merchant-rule', u.token, {
    merchantKey: 'woolworths', merchantDisplay: 'Woolworths',
    category: 'Retail', subcategory: 'Home', applyToExisting: true,
  })
  check('rule accepted', rule.status === 200, JSON.stringify(rule.json))

  const afterCorrection = await invoke('categorize-merchants', u.token, { merchants: [merchants[0]] })
  const a0 = afterCorrection.json?.assignments?.[0]
  check('the correction is returned, not the AI answer', a0?.category === 'Retail',
    `got ${a0?.category}`)
  check('and it is marked as user-sourced', a0?.source === 'user', `source=${a0?.source}`)
  check('no AI call was needed', afterCorrection.json?.stats?.geminiCalls === 0)

  section('Invalid input is rejected')
  const bogus = await invoke('apply-merchant-rule', u.token, {
    merchantKey: 'x', merchantDisplay: 'X',
    category: 'Cryptocurrency Gambling', subcategory: null,
  })
  check('a category outside the taxonomy cannot be introduced via the API', bogus.status === 400,
    `got ${bogus.status}`)

  const empty = await invoke('categorize-merchants', u.token, { merchants: [] })
  check('empty batch rejected', empty.status === 422, `got ${empty.status}`)

  exitWithSummary()
}

main().catch((e) => { console.error('\x1b[31mHarness error:\x1b[0m', e.message); process.exit(2) })
