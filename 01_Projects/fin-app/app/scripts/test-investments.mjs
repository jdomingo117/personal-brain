#!/usr/bin/env node
/** Managed-investment integration, dedupe, balance ownership and isolation. */
import Papa from 'papaparse'
import { check, section, exitWithSummary, newUserWithAccount, invoke, readSample } from './lib/harness.mjs'

function fixtureRows() {
  const parsed = Papa.parse(readSample('Vanguard_investment_transactions.csv'), { header: true, skipEmptyLines: true })
  const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }
  return parsed.data.map((row) => {
    const [day, mon, yy] = row['Trade Date'].split('-')
    const valueCents = Math.round(Number(row.Value) * 100)
    return {
      trade_date: `20${yy}-${months[mon]}-${day.padStart(2, '0')}`,
      activity_type: row.Type === 'DRP' ? 'distribution_reinvestment' : 'purchase',
      quantity: row.Quantity,
      unit_price: row['Unit Price'],
      value_cents: valueCents,
      brokerage_cents: 0,
      source_label: row.Type,
    }
  })
}

function payload(accountId, rows = fixtureRows(), uploadBatchId = crypto.randomUUID()) {
  return {
    account_id: accountId,
    platform: 'vanguard_personal_investor',
    account_suffix: '7777',
    instrument_identifier_type: 'APIR',
    instrument_identifier: 'VAN0111AU',
    source_adapter: 'vanguard_personal_investor',
    source_version: 1,
    upload_batch_id: uploadBatchId,
    confirmed_units: '21492.49',
    rows,
  }
}

async function main() {
  console.log('\n\x1b[1mManaged investments — import integrity\x1b[0m')
  const A = await newUserWithAccount('investment-a', 'Invest')
  const B = await newUserWithAccount('investment-b', 'Invest')

  section('Cross-ledger investment funding')
  const D = await newUserWithAccount('investment-cash-links', 'Invest')
  const fundingAccount = await D.client.from('accounts').insert({
    tenant_id: D.tenantId, user_id: D.userId, name: 'Funding bank', type: 'Liquid', balance: 0, currency: 'AUD',
  }).select('id').single()
  if (fundingAccount.error) throw new Error(`funding account: ${fundingAccount.error.message}`)
  const fundingRows = [
    ['2025-06-10', 'To Vanguard Cash Account - Investments', -1_000_000, 'Investing'],
    ['2025-07-09', 'To Vanguard Cash Account - Funds Transfer', -371_500, 'Transfer'],
    ['2025-10-03', 'To Vanguard Cash Account - Funds Transfer', -200_000, 'Transfer'],
    ['2025-10-13', 'To Vanguard Cash Account - Funds Transfer', -3_000_000, 'Transfer'],
  ].map(([date, description, amount, category]) => ({
    account_id: fundingAccount.data.id, date, original_description: description, merchant: 'Vanguard',
    category, subcategory: 'Managed fund funding', amount,
  }))
  const bankFirst = await invoke('upsert-transactions', D.token, fundingRows)
  check('bank-first funding rows import', bankFirst.status === 200 && bankFirst.json?.inserted === 4, JSON.stringify(bankFirst.json))
  const beforeInvestment = await invoke('link-transfers', D.token, { scope: 'all' })
  check('bank-first rescan waits for investment activity', beforeInvestment.status === 200 && beforeInvestment.json?.investmentCash?.created === 0, JSON.stringify(beforeInvestment.json))

  const fundingBatch = crypto.randomUUID()
  const investmentSecond = await invoke('import-investment-activities', D.token, payload(D.accountId, fixtureRows(), fundingBatch))
  check('investment-second import succeeds', investmentSecond.status === 200, JSON.stringify(investmentSecond.json).slice(0, 300))
  check('all four supplied funding pairs auto-link', investmentSecond.json?.cash_links?.auto === 4, JSON.stringify(investmentSecond.json?.cash_links))
  const linkedFunding = await D.client.from('investment_cash_links')
    .select('id, state, transaction_id, activity_id, transaction:transactions(amount)')
  check('only purchases link; DRP stays non-cash', linkedFunding.data?.length === 4 && linkedFunding.data.every((link) => link.state === 'auto'), JSON.stringify(linkedFunding.data))
  const fundingAnalytics = await D.client.from('transactions_analytic')
    .select('id, amount, is_transfer, investment_cash_link_id').eq('account_id', fundingAccount.data.id)
  check('linked bank legs are excluded from cash-flow analytics', fundingAnalytics.data?.length === 4 && fundingAnalytics.data.every((row) => row.is_transfer === true && !!row.investment_cash_link_id), JSON.stringify(fundingAnalytics.data))

  const directCashDecision = await D.client.from('investment_cash_decisions').insert({
    tenant_id: D.tenantId, verdict: 'confirmed', decided_by: D.userId,
  })
  check('browser client cannot bypass investment funding decisions', !!directCashDecision.error, 'direct decision write unexpectedly succeeded')
  const forgedCashDecision = await invoke('decide-investment-cash-link', B.token, {
    link_id: linkedFunding.data?.[0]?.id, verdict: 'rejected',
  })
  check('other tenant cannot decide an investment funding link', forgedCashDecision.status === 400, JSON.stringify(forgedCashDecision.json))

  const linkByAmount = new Map((linkedFunding.data ?? []).map((link) => [Math.abs(Number(link.transaction?.amount)), link]))
  const confirmedFunding = await invoke('decide-investment-cash-link', D.token, {
    link_id: linkByAmount.get(200_000)?.id, verdict: 'confirmed',
  })
  const rejectedFunding = await invoke('decide-investment-cash-link', D.token, {
    link_id: linkByAmount.get(3_000_000)?.id, verdict: 'rejected',
  })
  check('investment funding can be confirmed and rejected through the validated boundary', confirmedFunding.status === 200 && rejectedFunding.status === 200, `${JSON.stringify(confirmedFunding.json)} ${JSON.stringify(rejectedFunding.json)}`)
  const rejectedTxn = fundingAnalytics.data?.find((row) => Math.abs(Number(row.amount)) === 3_000_000)
  const rejectedRow = rejectedTxn
    ? await D.client.from('transactions_analytic').select('is_transfer, transfer_state').eq('id', rejectedTxn.id).single()
    : { data: null }
  check('rejection outranks the bank Transfer category', rejectedRow.data?.is_transfer === false && rejectedRow.data?.transfer_state === 'rejected', JSON.stringify(rejectedRow.data))

  const deletedFunding = await invoke('delete-investment-upload-batch', D.token, { account_id: D.accountId, upload_batch_id: fundingBatch })
  check('investment source batch deletes for re-import test', deletedFunding.status === 200 && deletedFunding.json?.deleted === 9, JSON.stringify(deletedFunding.json))
  const reimportedFunding = await invoke('import-investment-activities', D.token, payload(D.accountId))
  check('investment activities re-import after deletion', reimportedFunding.status === 200 && reimportedFunding.json?.inserted === 9, JSON.stringify(reimportedFunding.json).slice(0, 300))
  const linksAfterReimport = await D.client.from('investment_cash_links')
    .select('state, transaction:transactions(amount)')
  const statesByAmount = new Map((linksAfterReimport.data ?? []).map((link) => [Math.abs(Number(link.transaction?.amount)), link.state]))
  check('confirmed decision survives delete and re-import', statesByAmount.get(200_000) === 'confirmed', JSON.stringify(linksAfterReimport.data))
  check('rejected decision survives delete and re-import', !statesByAmount.has(3_000_000), JSON.stringify(linksAfterReimport.data))

  const distributionBank = await invoke('upsert-transactions', D.token, [{
    account_id: fundingAccount.data.id, date: '2026-08-01', original_description: 'Vanguard cash distribution',
    merchant: 'Vanguard', category: 'Investing', subcategory: 'Distribution', amount: 12_345,
  }])
  const distributionActivity = await invoke('import-investment-activities', D.token, payload(D.accountId, [{
    trade_date: '2026-08-01', activity_type: 'cash_distribution', quantity: '0', unit_price: null,
    value_cents: 12_345, brokerage_cents: 0, source_label: 'Cash distribution',
  }]))
  await invoke('link-transfers', D.token, { scope: 'window', from: '2026-08-01', to: '2026-08-01' })
  const distributionRow = await D.client.from('transactions_analytic').select('is_transfer').eq('account_id', fundingAccount.data.id).eq('amount', 12_345).single()
  check('cash distributions import on both ledgers', distributionBank.status === 200 && distributionActivity.status === 200, `${JSON.stringify(distributionBank.json)} ${JSON.stringify(distributionActivity.json)}`)
  check('cash distribution remains income, not an asset transfer', distributionRow.data?.is_transfer === false, JSON.stringify(distributionRow.data))
  const stolenCashLinks = await B.client.from('investment_cash_links').select('*').eq('tenant_id', D.tenantId)
  check('other tenant cannot read investment funding links', (stolenCashLinks.data?.length ?? 0) === 0, stolenCashLinks.error?.message)
  const cashLinkAudit = await D.client.from('audit_log').select('metadata').eq('action', 'investment.cash_link_decided').order('occurred_at', { ascending: false }).limit(1)
  check('investment funding decisions are audited', cashLinkAudit.data?.[0]?.metadata?.verdict === 'rejected', JSON.stringify(cashLinkAudit.data))

  section('First import')
  const first = await invoke('import-investment-activities', A.token, payload(A.accountId))
  check('request succeeds', first.status === 200, JSON.stringify(first.json).slice(0, 300))
  check('all nine activities insert', first.json?.inserted === 9, JSON.stringify(first.json))
  check('units reconcile exactly', Number(first.json?.summary?.calculated_units) === 21492.49, String(first.json?.summary?.calculated_units))
  check('external contributions are exact cents', Number(first.json?.summary?.net_external_contributions_cents) === 4_571_500, String(first.json?.summary?.net_external_contributions_cents))
  check('DRP is tracked separately', Number(first.json?.summary?.reinvested_distributions_cents) === 166_259, String(first.json?.summary?.reinvested_distributions_cents))

  section('Idempotent re-import')
  const second = await invoke('import-investment-activities', A.token, payload(A.accountId))
  check('re-import succeeds', second.status === 200, JSON.stringify(second.json).slice(0, 200))
  check('zero duplicate activities insert', second.json?.inserted === 0, `inserted=${second.json?.inserted}`)
  check('all duplicate activities are reported', second.json?.skipped === 9, `skipped=${second.json?.skipped}`)
  const stored = await A.client.from('investment_activities').select('id, source_label')
  check('ledger did not double', stored.data?.length === 9, `${stored.data?.length} rows`)

  section('Derived balance ownership')
  const account = await A.client.from('accounts').select('balance, balance_source').eq('id', A.accountId).single()
  check('investment valuation owns the account balance', account.data?.balance_source === 'investment_valuation', account.data?.balance_source)
  const edit = await invoke('upsert-account', A.token, { id: A.accountId, name: 'Renamed investment', type: 'Invest', balance: 999_999, currency: 'AUD' })
  check('ordinary account edit succeeds', edit.status === 200, JSON.stringify(edit.json))
  const afterEdit = await A.client.from('accounts').select('balance').eq('id', A.accountId).single()
  check('ordinary edit cannot restate derived balance', Number(afterEdit.data?.balance) === Number(account.data?.balance), `${account.data?.balance} -> ${afterEdit.data?.balance}`)

  section('Official price sync and set-based valuation')
  const priceSync = await invoke('sync-investment-prices', A.token, { account_id: A.accountId, trigger: 'manual' })
  check('official Vanguard sync succeeds', priceSync.status === 200, JSON.stringify(priceSync.json).slice(0, 300))
  check('historical NAV prices are backfilled', (priceSync.json?.prices ?? 0) > 200, `prices=${priceSync.json?.prices}`)
  const overview = await A.client.from('investment_account_overview').select('*').eq('account_id', A.accountId).single()
  check('latest NAV is exposed with its real date', Number(overview.data?.nav_price) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(overview.data?.price_date ?? ''), JSON.stringify(overview.data).slice(0, 200))
  check('account has a non-zero derived valuation', Number(overview.data?.value_cents) > 0, `value=${overview.data?.value_cents}`)
  const expectedValue = Math.round(21492.49 * Number(overview.data?.nav_price) * 100)
  check('valuation equals units × NAV rounded once to cents', Number(overview.data?.value_cents) === expectedValue, `${overview.data?.value_cents} vs ${expectedValue}`)
  const valuedAccount = await A.client.from('accounts').select('balance, balance_as_of').eq('id', A.accountId).single()
  check('cached account balance matches latest valuation', Number(valuedAccount.data?.balance) === Number(overview.data?.value_cents), `${valuedAccount.data?.balance} vs ${overview.data?.value_cents}`)
  const valuationCountBeforeDuplicate = await A.client.from('investment_account_valuations')
    .select('id', { count: 'exact', head: true }).eq('account_id', A.accountId)
  const pricedDuplicate = await invoke('import-investment-activities', A.token, payload(A.accountId))
  const accountAfterPricedDuplicate = await A.client.from('accounts')
    .select('balance, balance_as_of').eq('id', A.accountId).single()
  const valuationCountAfterDuplicate = await A.client.from('investment_account_valuations')
    .select('id', { count: 'exact', head: true }).eq('account_id', A.accountId)
  check('priced duplicate import succeeds as a no-op', pricedDuplicate.status === 200 && pricedDuplicate.json?.inserted === 0, JSON.stringify(pricedDuplicate.json))
  check('priced duplicate explicitly preserves valuation', pricedDuplicate.json?.valuation?.status === 'preserved', JSON.stringify(pricedDuplicate.json?.valuation))
  check('priced duplicate preserves cached value', Number(accountAfterPricedDuplicate.data?.balance) === Number(valuedAccount.data?.balance), `${valuedAccount.data?.balance} -> ${accountAfterPricedDuplicate.data?.balance}`)
  check('priced duplicate preserves price date', accountAfterPricedDuplicate.data?.balance_as_of === valuedAccount.data?.balance_as_of, `${valuedAccount.data?.balance_as_of} -> ${accountAfterPricedDuplicate.data?.balance_as_of}`)
  check('priced duplicate leaves valuation snapshots untouched', valuationCountAfterDuplicate.count === valuationCountBeforeDuplicate.count, `${valuationCountBeforeDuplicate.count} -> ${valuationCountAfterDuplicate.count}`)

  const C = await newUserWithAccount('investment-new-activity', 'Invest')
  const newActivityPayload = payload(C.accountId, [{
    trade_date: '2026-08-03', activity_type: 'purchase', quantity: '10', unit_price: '2',
    value_cents: 2_000, brokerage_cents: 0, source_label: 'Purchase',
  }])
  newActivityPayload.confirmed_units = '10'
  const newActivityImport = await invoke('import-investment-activities', C.token, newActivityPayload)
  const newActivityAccount = await C.client.from('accounts').select('balance, balance_as_of').eq('id', C.accountId).single()
  check('genuine new activity revalues from stored prices', newActivityImport.status === 200 && newActivityImport.json?.valuation?.status === 'revalued', JSON.stringify(newActivityImport.json))
  check('new activity receives a non-zero derived value without a provider fetch', Number(newActivityAccount.data?.balance) > 0 && !!newActivityAccount.data?.balance_as_of, JSON.stringify(newActivityAccount.data))
  const priceCountBefore = await A.client.from('instrument_prices').select('id', { count: 'exact', head: true })
  const priceSyncAgain = await invoke('sync-investment-prices', A.token, { account_id: A.accountId, trigger: 'manual' })
  const priceCountAfter = await A.client.from('instrument_prices').select('id', { count: 'exact', head: true })
  check('repeat price sync succeeds', priceSyncAgain.status === 200, JSON.stringify(priceSyncAgain.json).slice(0, 200))
  check('repeat price sync is idempotent', priceCountAfter.count === priceCountBefore.count, `${priceCountBefore.count} -> ${priceCountAfter.count}`)
  const purchaseDay = await A.client.from('investment_account_valuations')
    .select('external_flow_cents, market_movement_cents').eq('account_id', A.accountId).eq('valuation_date', '2025-07-10').single()
  check('purchase-day external flow is explicit', Number(purchaseDay.data?.external_flow_cents) === 371_500, JSON.stringify(purchaseDay.data))
  check('purchase amount is not reported as market performance', Math.abs(Number(purchaseDay.data?.market_movement_cents)) < 100_000, JSON.stringify(purchaseDay.data))

  section('Mixed-account net-worth history')
  const cash = await A.client.from('accounts').insert({
    tenant_id: A.tenantId, user_id: A.userId, name: 'Funding cash', type: 'Liquid', balance: 0, currency: 'AUD',
  }).select('id').single()
  if (cash.error) throw new Error(`cash fixture: ${cash.error.message}`)
  const funding = await A.client.from('transactions').insert({
    tenant_id: A.tenantId, user_id: A.userId, account_id: cash.data.id,
    date: '2025-06-11', original_description: 'Vanguard contribution', merchant: 'Vanguard',
    category: 'Investing', subcategory: 'Managed fund purchase', amount: -1_000_000,
  })
  if (funding.error) throw new Error(`funding fixture: ${funding.error.message}`)
  const history = await A.client.from('net_worth_monthly').select('month, value_cents').in('month', ['2025-05-01', '2025-06-01']).order('month')
  const may = Number(history.data?.find((point) => point.month === '2025-05-01')?.value_cents)
  const june = Number(history.data?.find((point) => point.month === '2025-06-01')?.value_cents)
  check('cash before contribution remains visible', may === 1_000_000, `May=${may}`)
  check('funding an investment does not erase net worth', june > 900_000, `June=${june}`)
  check('only market movement changes net worth across funding', Math.abs(june - may) < 100_000, `${may} -> ${june}`)
  const monthly = await A.client.from('investment_account_monthly').select('cumulative_contributions_cents').eq('account_id', A.accountId).order('valuation_date', { ascending: false }).limit(1).single()
  check('monthly performance series carries cumulative contributions', Number(monthly.data?.cumulative_contributions_cents) === 4_571_500, JSON.stringify(monthly.data))
  const stolenHistory = await B.client.from('net_worth_monthly').select('*').eq('tenant_id', A.tenantId)
  check('other tenant cannot read net-worth history', (stolenHistory.data?.length ?? 0) === 0, stolenHistory.error?.message)

  section('Financial-year records and AMMA workflow')
  const financialYears = await A.client.from('investment_financial_year_summary')
    .select('*').eq('account_id', A.accountId).order('financial_year')
  const fy2025 = financialYears.data?.find((row) => row.financial_year === 2025)
  const fy2026 = financialYears.data?.find((row) => row.financial_year === 2026)
  const fy2027 = financialYears.data?.find((row) => row.financial_year === 2027)
  check('activity is grouped by Australian financial year', financialYears.data?.length === 3 && !!fy2025 && !!fy2026 && !!fy2027, JSON.stringify(financialYears.data))
  check('June purchase stays in FY2025', Number(fy2025?.purchases_cents) === 1_000_000, JSON.stringify(fy2025))
  check('FY2026 purchase total is exact', Number(fy2026?.purchases_cents) === 3_571_500, JSON.stringify(fy2026))
  check('FY2026 reinvested distributions are exact', Number(fy2026?.reinvested_distributions_cents) === 86_534, JSON.stringify(fy2026))
  check('FY2027 reinvested distribution is exact', Number(fy2027?.reinvested_distributions_cents) === 79_725, JSON.stringify(fy2027))
  check('no disposal is invented', Number(fy2026?.disposal_count) === 0 && Number(fy2027?.disposal_count) === 0, JSON.stringify(financialYears.data))

  const directTaxWrite = await A.client.from('investment_tax_records').insert({
    tenant_id: A.tenantId, account_id: A.accountId, financial_year: 2026, amma_status: 'reviewed',
  }).select()
  check('browser client cannot bypass tax-record validation', !!directTaxWrite.error, 'direct write unexpectedly succeeded')
  const taxUpdate = await invoke('update-investment-tax-record', A.token, {
    account_id: A.accountId, financial_year: 2026, amma_status: 'received',
  })
  check('validated AMMA status update succeeds', taxUpdate.status === 200 && taxUpdate.json?.amma_status === 'received', JSON.stringify(taxUpdate.json))
  const taxUpdateAgain = await invoke('update-investment-tax-record', A.token, {
    account_id: A.accountId, financial_year: 2026, amma_status: 'reviewed',
  })
  check('AMMA status update is an idempotent upsert', taxUpdateAgain.status === 200 && taxUpdateAgain.json?.amma_status === 'reviewed', JSON.stringify(taxUpdateAgain.json))
  const taxRecords = await A.client.from('investment_tax_records').select('*').eq('account_id', A.accountId)
  check('one financial-year workflow record is retained', taxRecords.data?.length === 1 && taxRecords.data[0].amma_status === 'reviewed', JSON.stringify(taxRecords.data))
  const forgedTaxUpdate = await invoke('update-investment-tax-record', B.token, {
    account_id: A.accountId, financial_year: 2026, amma_status: 'not_required',
  })
  check('other tenant cannot alter AMMA status', forgedTaxUpdate.status === 400, JSON.stringify(forgedTaxUpdate.json))
  const stolenTaxRecords = await B.client.from('investment_tax_records').select('*').eq('account_id', A.accountId)
  check('other tenant cannot read tax records', (stolenTaxRecords.data?.length ?? 0) === 0, stolenTaxRecords.error?.message)

  section('Tenant isolation and global catalogue integrity')
  const stolenHolding = await B.client.from('investment_holdings').select('*').eq('account_id', A.accountId)
  check('other tenant cannot read holding', (stolenHolding.data?.length ?? 0) === 0, stolenHolding.error?.message)
  const stolenActivities = await B.client.from('investment_activities').select('*').eq('account_id', A.accountId)
  check('other tenant cannot read activities', (stolenActivities.data?.length ?? 0) === 0, stolenActivities.error?.message)
  const forged = await B.client.from('investment_activities').insert({
    tenant_id: A.tenantId, account_id: A.accountId, holding_id: first.json?.holding_id,
    instrument_id: '00000000-0000-0000-0000-000000000000', trade_date: '2026-08-08',
    activity_type: 'fee', source_label: 'forged', source_adapter: 'forged', source_hash: 'a'.repeat(64),
    upload_batch_id: crypto.randomUUID(),
  }).select()
  check('other tenant cannot write activity', !!forged.error || (forged.data?.length ?? 0) === 0, forged.error?.message)
  const priceWrite = await A.client.from('instrument_prices').insert({
    instrument_id: first.json?.summary?.instrument_id, price_date: '2026-08-08', nav_price: '2.1', source: 'forged',
  }).select()
  check('authenticated user cannot publish prices', !!priceWrite.error, 'write unexpectedly succeeded')

  section('Audit')
  const audit = await A.client.from('audit_log').select('metadata').eq('action', 'investment.activities_imported').order('occurred_at', { ascending: false }).limit(1)
  check('import is audited with counts', audit.data?.[0]?.metadata?.submitted === 9 && typeof audit.data?.[0]?.metadata?.inserted === 'number', JSON.stringify(audit.data?.[0]?.metadata))
  const taxAudit = await A.client.from('audit_log').select('metadata').eq('action', 'investment.tax_record_updated').order('occurred_at', { ascending: false }).limit(1)
  check('AMMA status changes are audited', taxAudit.data?.[0]?.metadata?.financial_year === 2026 && taxAudit.data?.[0]?.metadata?.amma_status === 'reviewed', JSON.stringify(taxAudit.data?.[0]?.metadata))

  exitWithSummary()
}

main().catch((error) => { console.error('\x1b[31mHarness error:\x1b[0m', error.message); process.exit(2) })
