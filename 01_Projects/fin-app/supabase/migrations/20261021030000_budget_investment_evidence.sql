-- M4: investment proof shares the bank debit's capacity; never a second credit.
ALTER FUNCTION public.budget_funding_sources(uuid,uuid,date,date) RENAME TO budget_funding_sources_bank;
CREATE FUNCTION public.budget_funding_sources(p_tenant uuid,p_plan uuid,p_from date,p_until date)
RETURNS TABLE(source_key text,source_type text,booking_date date,capacity bigint,fingerprint text,identity jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
 WITH investment AS (
 SELECT t.id,t.date,abs(t.amount::numeric)::bigint amount,
 jsonb_build_object('from_id',t.id,'from_account',t.account_id,'bank_hash',encode(t.dedupe_hash,'hex'),'bank_occurrence',t.occurrence,
 'amount',abs(t.amount::numeric),'from_date',t.date,'activity_id',a.id,'activity_account',a.account_id,
 'instrument_id',a.instrument_id,'activity_hash',a.source_hash,'activity_occurrence',a.occurrence,
 'trade_date',a.trade_date,'value_cents',a.value_cents,'brokerage_cents',a.brokerage_cents,'source_version',a.source_version,'link_id',l.id) detail
 FROM public.investment_cash_links l
 JOIN public.transactions_analytic t ON t.id=l.transaction_id AND t.tenant_id=l.tenant_id
 JOIN public.investment_activities a ON a.id=l.activity_id AND a.tenant_id=l.tenant_id
 JOIN public.accounts bank ON bank.id=t.account_id AND bank.tenant_id=p_tenant AND bank.currency='AUD'
 JOIN public.accounts dest ON dest.id=a.account_id AND dest.tenant_id=p_tenant AND dest.currency='AUD'
 JOIN public.investment_instruments i ON i.id=a.instrument_id AND i.currency='AUD'
 WHERE l.tenant_id=p_tenant AND l.state='confirmed' AND NOT l.ambiguous
 AND NOT t.pending AND t.is_transfer AND t.amount<0 AND a.activity_type='purchase'
 AND abs(t.amount::numeric)=abs(a.value_cents::numeric)+abs(a.brokerage_cents::numeric)
 AND abs(t.amount::numeric)<=9007199254740991
 AND l.transaction_account_id=t.account_id AND l.transaction_hash=t.dedupe_hash AND l.transaction_occurrence=t.occurrence
 AND l.activity_account_id=a.account_id AND l.activity_hash=a.source_hash AND l.activity_occurrence=a.occurrence
 AND t.date>=p_from AND t.date<p_until
 AND NOT EXISTS(SELECT 1 FROM public.transaction_allocations s WHERE s.transaction_id=t.id)
 AND NOT EXISTS(SELECT 1 FROM public.investment_cash_decisions d WHERE d.tenant_id=p_tenant
 AND d.transaction_account_id=t.account_id AND d.transaction_hash=t.dedupe_hash AND d.transaction_occurrence=t.occurrence
 AND d.activity_account_id=a.account_id AND d.activity_hash=a.source_hash AND d.activity_occurrence=a.occurrence AND d.verdict='rejected')
 AND NOT EXISTS(SELECT 1 FROM public.transfer_decisions d WHERE d.tenant_id=p_tenant AND d.from_account_id=t.account_id
 AND d.from_hash=t.dedupe_hash AND d.from_occurrence=t.occurrence AND d.verdict IN('rejected','external'))
 AND EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan AND m.role='activity'
 AND m.account_id=t.account_id AND m.start_date<=t.date AND (m.end_date IS NULL OR m.end_date>t.date))
 ), candidates AS (
 SELECT * FROM public.budget_funding_sources_bank(p_tenant,p_plan,p_from,p_until)
 UNION ALL SELECT 'm:'||id,'bank-observed',date,amount,encode(extensions.digest(detail::text,'sha256'),'hex'),detail FROM investment
 ), unique_sources AS (
 SELECT *,count(*) OVER(PARTITION BY source_key) alternatives FROM candidates
 ) SELECT source_key,source_type,booking_date,capacity,fingerprint,identity FROM unique_sources WHERE alternatives=1;
$$;

-- MVCC reads after the Budget gate, no source-row locks or source FKs. Global
-- instrument currency edits conservatively invalidate every existing Budget.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['investment_activities','investment_instruments'] LOOP
 EXECUTE format('CREATE TRIGGER budget_invalidate_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.budget_invalidate_source()',t);
 EXECUTE format('CREATE TRIGGER budget_invalidate_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.budget_invalidate_source()',t);
 EXECUTE format('CREATE TRIGGER budget_invalidate_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.budget_invalidate_source()',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.budget_funding_sources(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_funding_sources(uuid,uuid,date,date) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.budget_funding_sources(uuid,uuid,date,date)','EXECUTE')
 OR has_function_privilege('anon','public.budget_funding_sources(uuid,uuid,date,date)','EXECUTE') THEN RAISE EXCEPTION 'Budget funding grant leak'; END IF;
END $$;
