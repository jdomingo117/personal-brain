-- Complete SQL counts; bounded detector observations, never a silent ledger cap.
CREATE FUNCTION public.budget_recurring_evidence(p_tenant uuid,p_actor uuid,p_plan uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE plan public.budget_plans%ROWTYPE; v bigint; asof date; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor) THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 v:=public.budget_lock_source(p_tenant);
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF v IS DISTINCT FROM p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 IF plan.version<>p_version THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 asof:=(now() AT TIME ZONE plan.timezone)::date;
 WITH eligible AS MATERIALIZED (
 SELECT t.id,t.account_id,t.merchant_key,t.merchant,t.date,abs(t.amount::bigint) amount
 FROM public.transactions_analytic t JOIN public.accounts a ON a.id=t.account_id AND a.tenant_id=p_tenant AND a.currency='AUD'
 WHERE t.tenant_id=p_tenant AND t.kind='expense' AND t.amount<0 AND NOT t.pending AND NOT t.is_transfer
 AND t.date>=asof-1098 AND t.date<=asof AND nullif(t.merchant_key,'') IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.transaction_allocations x WHERE x.transaction_id=t.id AND x.kind<>'expense')
 AND EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan
 AND m.role='activity' AND m.account_id=t.account_id AND m.start_date<=asof AND (m.end_date IS NULL OR m.end_date>asof))
 ), groups AS MATERIALIZED (
 SELECT account_id,merchant_key,count(*) observations FROM eligible GROUP BY account_id,merchant_key HAVING count(*)>=2
 ), selected AS (
 SELECT * FROM groups ORDER BY account_id,merchant_key LIMIT 100
 ) SELECT jsonb_build_object('as_of',asof,'normal_from',asof-364,'annual_from',asof-1098,
 'group_count',(SELECT count(*) FROM groups),'group_limit',100,'observation_limit',256,
 'groups',coalesce(jsonb_agg(jsonb_build_object('account_id',g.account_id,'merchant_key',g.merchant_key,'count',g.observations,
 'charges',CASE WHEN g.observations>256 THEN '[]'::jsonb ELSE
 (SELECT jsonb_agg(jsonb_build_object('transactionId',e.id,'date',e.date,'amount',e.amount) ORDER BY e.date,e.id) FROM eligible e WHERE e.account_id=g.account_id AND e.merchant_key=g.merchant_key) END)), '[]')) INTO result FROM selected g;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint)','EXECUTE')
 OR has_function_privilege('anon','public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint)','EXECUTE') THEN RAISE EXCEPTION 'Budget recurring grant leak';END IF;
END $$;
