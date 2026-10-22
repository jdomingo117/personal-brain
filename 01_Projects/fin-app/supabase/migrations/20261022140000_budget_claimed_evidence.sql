-- Resolve evidence only for live claimed source keys, not every ledger row.
-- The fingerprint/eligibility kernel is unchanged; unknown/deleted/reparented
-- sources still fail identity equality. No source lock/FK is introduced.
ALTER FUNCTION public.budget_live_claims_reference(uuid,uuid) RENAME TO budget_live_claims_full_source_reference;
CREATE FUNCTION public.budget_claim_activity(p_tenant uuid,p_plan uuid,p_from date,p_until date)
RETURNS TABLE(source_key text,source_type text,booking_date date,capacity bigint,fingerprint text,identity jsonb,category_id text,subcategory_id text,custom_subcategory_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
 WITH rows AS (
 SELECT t.id parent_id,a.id allocation_id,t.date,t.account_id,t.dedupe_hash,t.occurrence,t.merchant,t.pending,t.is_transfer,t.transfer_state,t.kind_source,
 coalesce(a.amount,t.amount)::bigint amount,coalesce(a.kind,t.kind) kind,
 coalesce(a.category_id,t.category_id) category_id,CASE WHEN a.id IS NULL THEN t.subcategory_id ELSE a.subcategory_id END subcategory_id,
 CASE WHEN a.id IS NULL THEN original.custom_subcategory_id ELSE a.custom_subcategory_id END custom_subcategory_id
 FROM public.transactions_analytic t LEFT JOIN public.transaction_allocations a ON a.tenant_id=t.tenant_id AND a.transaction_id=t.id
 JOIN public.transactions original ON original.id=t.id AND original.tenant_id=t.tenant_id
 JOIN public.accounts acct ON acct.id=t.account_id AND acct.tenant_id=t.tenant_id AND acct.currency='AUD'
 WHERE t.id IN (
 SELECT tx.id FROM public.transactions tx JOIN public.budget_source_claims c ON c.source_key='t:'||tx.id
 WHERE tx.tenant_id=p_tenant AND c.tenant_id=p_tenant AND c.plan_id=p_plan AND NOT EXISTS(SELECT 1 FROM public.budget_claim_reversals rev WHERE rev.claim_id=c.id)
 UNION SELECT a.transaction_id FROM public.transaction_allocations a JOIN public.budget_source_claims c ON c.source_key='a:'||a.id
 WHERE a.tenant_id=p_tenant AND c.tenant_id=p_tenant AND c.plan_id=p_plan AND NOT EXISTS(SELECT 1 FROM public.budget_claim_reversals rev WHERE rev.claim_id=c.id)
 ) AND t.tenant_id=p_tenant AND t.date>=p_from AND t.date<p_until AND EXISTS(
 SELECT 1 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan AND m.role='activity' AND m.account_id=t.account_id
 AND m.start_date<=t.date AND (m.end_date IS NULL OR m.end_date>t.date))
 ), effective AS (SELECT *,CASE WHEN kind='transfer' AND kind_source='derived' AND transfer_state='rejected' THEN CASE WHEN amount>=0 THEN 'income' ELSE 'expense' END ELSE kind END k FROM rows),
 typed AS (SELECT *,jsonb_build_object('parent_id',parent_id,'allocation_id',allocation_id,'account_id',account_id,'dedupe_hash',encode(dedupe_hash,'hex'),'occurrence',occurrence,
 'date',date,'amount',amount,'kind',k,'category_id',category_id,'subcategory_id',subcategory_id,'custom_subcategory_id',custom_subcategory_id) detail FROM effective WHERE NOT pending AND NOT is_transfer AND ((k='expense' AND amount<0) OR (k IN('refund','reimbursement') AND amount>0)))
 SELECT CASE WHEN allocation_id IS NULL THEN 't:'||parent_id ELSE 'a:'||allocation_id END,
 CASE WHEN k='expense' THEN 'expense' ELSE 'refund' END,date,abs(amount),encode(extensions.digest(detail::text,'sha256'),'hex'),detail||jsonb_build_object('merchant',merchant),category_id,subcategory_id,custom_subcategory_id FROM typed;
$$;
CREATE FUNCTION public.budget_live_claims_reference(p_tenant uuid,p_plan uuid)
RETURNS TABLE(id uuid,line_id uuid,purpose text,source_key text,source_date date,amount_cents bigint,occurrence_date date,related_claim_id uuid,valid boolean,provenance text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH sources AS (SELECT a.source_key,a.fingerprint,a.source_type FROM public.budget_claim_activity(p_tenant,p_plan,'0001-01-01','9999-12-31') a
 UNION ALL SELECT f.source_key,f.fingerprint,f.source_type FROM public.budget_funding_sources(p_tenant,p_plan,'0001-01-01','9999-12-31') f),
 live AS (SELECT c.*,s.source_type,s.source_key IS NOT NULL ok FROM public.budget_source_claims c LEFT JOIN sources s ON s.source_key=c.source_key AND s.fingerprint=c.source_fingerprint
 WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan AND NOT EXISTS(SELECT 1 FROM public.budget_claim_reversals r WHERE r.claim_id=c.id))
 SELECT c.id,c.line_id,c.purpose,c.source_key,c.source_date,c.amount_cents,c.occurrence_date,c.related_claim_id,
 c.ok AND (c.related_claim_id IS NULL OR EXISTS(SELECT 1 FROM live parent WHERE parent.id=c.related_claim_id AND parent.ok)),coalesce(c.source_type,'changed') FROM live c;
$$;
DO $$ DECLARE f regprocedure;BEGIN
 FOREACH f IN ARRAY ARRAY['public.budget_claim_activity(uuid,uuid,date,date)'::regprocedure,'public.budget_live_claims_reference(uuid,uuid)'::regprocedure,'public.budget_live_claims_full_source_reference(uuid,uuid)'::regprocedure] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Budget claimed evidence grant leak';END IF;
 END LOOP;
END $$;
