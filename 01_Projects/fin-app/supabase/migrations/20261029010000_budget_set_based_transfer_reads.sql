-- R06: keep the canonical analytics meaning, but resolve transfer maps once
-- rather than perform three link lookups and a decision sort per ledger row.
-- This view is private to Budget's service-role functions; other features keep
-- using transactions_analytic. No source data, financial rule or cap changes.
-- A PostgreSQL view freezes t.* at creation. Project the same frozen source
-- columns, rather than accidentally expose columns added to transactions later.
DO $build$ DECLARE source_columns text;BEGIN
 SELECT string_agg(format('t.%I',attname),', ' ORDER BY attnum) INTO source_columns
 FROM pg_attribute WHERE attrelid='public.transactions_analytic'::regclass AND attnum>0 AND NOT attisdropped
 AND attname NOT IN('is_transfer','transfer_state','transfer_link_id','investment_cash_link_id');
 EXECUTE replace($view$CREATE VIEW public.budget_transactions_analytic WITH (security_invoker=true) AS
WITH decisions AS (
 SELECT tenant_id,from_account_id account_id,from_hash hash,from_occurrence occurrence,verdict,decided_at FROM public.transfer_decisions
 UNION ALL SELECT tenant_id,to_account_id,to_hash,to_occurrence,verdict,decided_at FROM public.transfer_decisions
 UNION ALL SELECT tenant_id,transaction_account_id,transaction_hash,transaction_occurrence,verdict,decided_at FROM public.investment_cash_decisions
), ranked AS (
 SELECT *,count(*) OVER(PARTITION BY tenant_id,account_id,hash,occurrence,decided_at) tied
 FROM decisions
), latest AS (
 SELECT DISTINCT ON(tenant_id,account_id,hash,occurrence) tenant_id,account_id,hash,occurrence,verdict,tied
 FROM ranked ORDER BY tenant_id,account_id,hash,occurrence,decided_at DESC
)
SELECT t.*,
 CASE WHEN d.tied>1 OR (outgoing.id IS NOT NULL AND incoming.id IS NOT NULL)
  THEN (SELECT r.is_transfer FROM public.transactions_analytic r WHERE r.id=t.id)
  ELSE CASE WHEN d.verdict='rejected' THEN false WHEN d.verdict IN('confirmed','external') THEN true
   ELSE coalesce(t.kind='transfer' OR coalesce(outgoing.state,incoming.state) IN('auto','suggested','confirmed','external') OR il.state IN('auto','suggested','confirmed'),false) END END is_transfer,
 CASE WHEN d.tied>1 OR (outgoing.id IS NOT NULL AND incoming.id IS NOT NULL)
  THEN (SELECT r.transfer_state FROM public.transactions_analytic r WHERE r.id=t.id)
  ELSE coalesce(il.state,outgoing.state,incoming.state,d.verdict,CASE WHEN t.transfer_candidate THEN 'unmatched' ELSE 'none' END) END transfer_state,
 CASE WHEN d.tied>1 OR (outgoing.id IS NOT NULL AND incoming.id IS NOT NULL)
  THEN (SELECT r.transfer_link_id FROM public.transactions_analytic r WHERE r.id=t.id)
  ELSE coalesce(outgoing.id,incoming.id) END transfer_link_id,
 il.id investment_cash_link_id
FROM public.transactions t
LEFT JOIN public.transfer_links outgoing ON outgoing.from_txn_id=t.id
LEFT JOIN public.transfer_links incoming ON incoming.to_txn_id=t.id
LEFT JOIN public.investment_cash_links il ON il.transaction_id=t.id
LEFT JOIN latest d ON d.tenant_id=t.tenant_id AND d.account_id=t.account_id AND d.hash=t.dedupe_hash AND d.occurrence=t.occurrence;$view$,'SELECT t.*,','SELECT '||source_columns||',');
END $build$;

REVOKE ALL ON public.budget_transactions_analytic FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.budget_transactions_analytic TO service_role;

-- Preserve independent pre-R06 entry points for equivalence checks, then only
-- substitute the analytics relation. All existing money/date/source/actor gates,
-- method names, statement limits and function properties stay byte-for-byte.
DO $$ DECLARE name text;f regprocedure;definition text;reference_name text;count_changed integer:=0;BEGIN
 FOREACH name IN ARRAY ARRAY['budget_query_m4_uncached','budget_activity','budget_activity_amounts','budget_assisted_setup','budget_recurring_evidence','budget_forecast_facts'] LOOP
  SELECT p.oid::regprocedure INTO f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
  IF f IS NULL THEN RAISE EXCEPTION 'budget_r06_missing_function %',name;END IF;
  definition:=pg_get_functiondef(f);
  IF position('public.transactions_analytic' IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_missing_relation %',name;END IF;
  reference_name:=name||'_r06_reference';
  EXECUTE replace(definition,'FUNCTION public.'||name||'(','FUNCTION public.'||reference_name||'(');
  EXECUTE replace(definition,'public.transactions_analytic','public.budget_transactions_analytic');
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated',reference_name,pg_get_function_identity_arguments(f));
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',reference_name,pg_get_function_identity_arguments(f));
  count_changed:=count_changed+1;
 END LOOP;
 IF count_changed<>6 THEN RAISE EXCEPTION 'budget_r06_function_count';END IF;
 IF has_table_privilege('anon','public.budget_transactions_analytic','SELECT') OR has_table_privilege('authenticated','public.budget_transactions_analytic','SELECT')
  OR NOT has_table_privilege('service_role','public.budget_transactions_analytic','SELECT')
  OR NOT (SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid='public.budget_transactions_analytic'::regclass)
 THEN RAISE EXCEPTION 'budget_r06_view_privileges';END IF;
 IF EXISTS(
  (SELECT attnum,attname,atttypid,atttypmod FROM pg_attribute WHERE attrelid='public.transactions_analytic'::regclass AND attnum>0 AND NOT attisdropped
   EXCEPT SELECT attnum,attname,atttypid,atttypmod FROM pg_attribute WHERE attrelid='public.budget_transactions_analytic'::regclass AND attnum>0 AND NOT attisdropped)
  UNION ALL
  (SELECT attnum,attname,atttypid,atttypmod FROM pg_attribute WHERE attrelid='public.budget_transactions_analytic'::regclass AND attnum>0 AND NOT attisdropped
   EXCEPT SELECT attnum,attname,atttypid,atttypmod FROM pg_attribute WHERE attrelid='public.transactions_analytic'::regclass AND attnum>0 AND NOT attisdropped)
 ) THEN RAISE EXCEPTION 'budget_r06_view_shape';END IF;
END $$;
