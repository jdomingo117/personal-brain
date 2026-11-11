-- Bill suggestions: choose which merchants to check by recency, not by account id.
--
-- budget_recurring_evidence checks at most 100 merchant groups. They were taken in
-- account_id,merchant_key order, so whichever account's id sorted first filled the
-- quota and current bills on other accounts were never checked (for example every
-- AMEX subscription when an Amplify card sorted first). Prefer groups that can be
-- checked (at most 256 charges), then the most recently paid, then the most
-- frequent; ties stay deterministic. Only which groups are selected changes; the
-- per-group evidence, limits, counts and response shape are unchanged. The reference
-- copy changes identically so parity checks still hold, and the cache key is bumped
-- so an answer selected the old way is not served again.

CREATE OR REPLACE FUNCTION public.budget_recurring_evidence_r06_reference(p_tenant uuid, p_actor uuid, p_plan uuid, p_source bigint, p_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '2s'
 SET statement_timeout TO '8s'
AS $function$
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
 SELECT account_id,merchant_key,count(*) observations,max(date) last_date FROM eligible GROUP BY account_id,merchant_key HAVING count(*)>=2
 ), selected AS (
 SELECT * FROM groups ORDER BY (observations<=256) DESC,last_date DESC,observations DESC,account_id,merchant_key LIMIT 100
 ) SELECT jsonb_build_object('as_of',asof,'normal_from',asof-364,'annual_from',asof-1098,
 'group_count',(SELECT count(*) FROM groups),'group_limit',100,'observation_limit',256,
 'groups',coalesce(jsonb_agg(jsonb_build_object('account_id',g.account_id,'merchant_key',g.merchant_key,'count',g.observations,
 'charges',CASE WHEN g.observations>256 THEN '[]'::jsonb ELSE
 (SELECT jsonb_agg(jsonb_build_object('transactionId',e.id,'date',e.date,'amount',e.amount) ORDER BY e.date,e.id) FROM eligible e WHERE e.account_id=g.account_id AND e.merchant_key=g.merchant_key) END)), '[]')) INTO result FROM selected g;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.budget_recurring_evidence_r06_uncached(p_tenant uuid, p_actor uuid, p_plan uuid, p_source bigint, p_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '2s'
 SET statement_timeout TO '8s'
 SET plan_cache_mode TO 'force_custom_plan'
 SET enable_nestloop TO 'off'
 SET jit TO 'off'
AS $function$
DECLARE plan public.budget_plans%ROWTYPE; v bigint; asof date; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor) THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 v:=public.budget_lock_source(p_tenant);
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF v IS DISTINCT FROM p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 IF plan.version<>p_version THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 asof:=(now() AT TIME ZONE plan.timezone)::date;
 WITH eligible AS NOT MATERIALIZED (
 SELECT t.id,t.account_id,t.merchant_key,t.merchant,t.date,abs(t.amount::bigint) amount
 FROM public.budget_transactions_analytic t JOIN public.accounts a ON a.id=t.account_id AND a.tenant_id=p_tenant AND a.currency='AUD'
 WHERE t.tenant_id=p_tenant AND t.kind='expense' AND t.amount<0 AND NOT t.pending AND NOT t.is_transfer
 AND t.date>=asof-1098 AND t.date<=asof AND nullif(t.merchant_key,'') IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.transaction_allocations x WHERE x.transaction_id=t.id AND x.kind<>'expense')
 AND EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan
 AND m.role='activity' AND m.account_id=t.account_id AND m.start_date<=asof AND (m.end_date IS NULL OR m.end_date>asof))
 ), groups AS MATERIALIZED (
 SELECT account_id,merchant_key,count(*) observations,max(date) last_date FROM eligible GROUP BY account_id,merchant_key HAVING count(*)>=2
 ), selected AS (
 SELECT * FROM groups ORDER BY (observations<=256) DESC,last_date DESC,observations DESC,account_id,merchant_key LIMIT 100
 ) SELECT jsonb_build_object('as_of',asof,'normal_from',asof-364,'annual_from',asof-1098,
 'group_count',(SELECT count(*) FROM groups),'group_limit',100,'observation_limit',256,
 'groups',coalesce(jsonb_agg(jsonb_build_object('account_id',g.account_id,'merchant_key',g.merchant_key,'count',g.observations,
 'charges',CASE WHEN g.observations>256 THEN '[]'::jsonb ELSE
 (SELECT jsonb_agg(jsonb_build_object('transactionId',e.id,'date',e.date,'amount',e.amount) ORDER BY e.date,e.id) FROM eligible e WHERE e.account_id=g.account_id AND e.merchant_key=g.merchant_key) END)), '[]')) INTO result FROM selected g;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.budget_recurring_evidence(p_tenant uuid, p_actor uuid, p_plan uuid, p_source bigint, p_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
 SET lock_timeout TO '2s'
 SET statement_timeout TO '8s'
AS $function$
DECLARE role_name text;zone text;local_date date;basis text;answer jsonb;slot uuid;BEGIN
 SELECT role::text INTO role_name FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor;
 IF role_name IS NULL THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 IF public.budget_lock_source(p_tenant)<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT timezone INTO zone FROM public.budget_plans WHERE id=p_plan AND tenant_id=p_tenant;
 IF zone IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.budget_plans WHERE id=p_plan AND tenant_id=p_tenant AND version=p_version) THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 local_date:=(now() AT TIME ZONE zone)::date;
 SELECT encode(extensions.digest('recurring-read-r06-v2:'||coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]')::text,'sha256'),'hex') INTO basis
 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan;
 SELECT recurring_read INTO answer FROM public.budget_history_facts WHERE tenant_id=p_tenant AND plan_id=p_plan AND actor_id=p_actor AND actor_role=role_name
  AND source_revision=p_source AND plan_version=p_version AND method='history-v1' AND prepared_at>now()-interval '24 hours'
  AND recurring_basis=basis AND recurring_role=role_name AND recurring_source=p_source AND recurring_version=p_version AND recurring_read_at>now()-interval '24 hours'
  AND recurring_read->>'as_of'=local_date::text ORDER BY prepared_at DESC LIMIT 1;
 IF answer IS NOT NULL THEN RETURN answer;END IF;
 answer:=public.budget_recurring_evidence_r06_uncached(p_tenant,p_actor,p_plan,p_source,p_version);
 SELECT c.period_id INTO slot FROM public.budget_history_facts c JOIN public.budget_periods p ON p.id=c.period_id WHERE c.tenant_id=p_tenant AND c.plan_id=p_plan AND c.actor_id=p_actor AND c.actor_role=role_name
  AND c.source_revision=p_source AND c.plan_version=p_version AND c.method='history-v1' AND c.prepared_at>now()-interval '24 hours' ORDER BY p.start_date DESC LIMIT 1;
 IF slot IS NOT NULL THEN UPDATE public.budget_history_facts SET recurring_read=answer,recurring_basis=basis,recurring_role=role_name,recurring_source=p_source,recurring_version=p_version,recurring_read_at=now()
  WHERE tenant_id=p_tenant AND plan_id=p_plan AND period_id=slot AND actor_id=p_actor AND actor_role=role_name AND source_revision=p_source AND plan_version=p_version AND method='history-v1';END IF;
 RETURN answer;
END $function$;

REVOKE ALL ON FUNCTION public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint),public.budget_recurring_evidence_r06_uncached(uuid,uuid,uuid,bigint,bigint),public.budget_recurring_evidence_r06_reference(uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_recurring_evidence(uuid,uuid,uuid,bigint,bigint),public.budget_recurring_evidence_r06_uncached(uuid,uuid,uuid,bigint,bigint),public.budget_recurring_evidence_r06_reference(uuid,uuid,uuid,bigint,bigint) TO service_role;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['budget_recurring_evidence','budget_recurring_evidence_r06_uncached','budget_recurring_evidence_r06_reference']) f(n)
    WHERE has_function_privilege('anon',('public.'||f.n||'(uuid,uuid,uuid,bigint,bigint)')::regprocedure,'EXECUTE')
       OR has_function_privilege('authenticated',('public.'||f.n||'(uuid,uuid,uuid,bigint,bigint)')::regprocedure,'EXECUTE')) THEN
    RAISE EXCEPTION 'Budget recurring evidence grants invalid';
  END IF;
END $$;
