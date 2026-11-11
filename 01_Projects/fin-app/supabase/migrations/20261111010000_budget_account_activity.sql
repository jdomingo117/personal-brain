-- Read-only per-account activity summary for Budget setup: account type, latest
-- settled activity date and how much settled activity the last six complete
-- months hold. Used to pre-select spending accounts and flag unused ones. It
-- never decides coverage or eligibility; budget_assisted_setup still does.
CREATE FUNCTION public.budget_account_activity(p_tenant uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='5s' AS $$
DECLARE as_of date; window_start date; result jsonb;
BEGIN
  PERFORM public.budget_assert_owner(p_tenant,p_actor);
  as_of:=(now() AT TIME ZONE coalesce((SELECT timezone FROM public.budget_plans WHERE tenant_id=p_tenant AND state='active'),'Australia/Sydney'))::date;
  window_start:=(date_trunc('month',as_of)-interval '6 months')::date;
  SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',a.id,'type',a.type,'last_activity_date',l.last_date,
      'recent_activity_count',coalesce(r.n,0),'window_start',window_start) ORDER BY a.name,a.id),'[]'::jsonb)
  INTO result
  FROM public.accounts a
  LEFT JOIN LATERAL (
    SELECT t.date last_date FROM public.transactions t
    WHERE t.tenant_id=p_tenant AND t.account_id=a.id AND NOT t.pending
      AND (t.kind IS DISTINCT FROM 'adjustment' OR t.kind_source IS DISTINCT FROM 'system')
    ORDER BY t.date DESC LIMIT 1
  ) l ON true
  LEFT JOIN LATERAL (
    SELECT count(*) n FROM public.transactions t
    WHERE t.tenant_id=p_tenant AND t.account_id=a.id AND NOT t.pending AND t.date>=window_start AND t.date<=as_of
      AND (t.kind IS DISTINCT FROM 'adjustment' OR t.kind_source IS DISTINCT FROM 'system')
  ) r ON true
  WHERE a.tenant_id=p_tenant AND a.currency='AUD';
  RETURN jsonb_build_object('as_of',as_of,'accounts',result);
END $$;

REVOKE ALL ON FUNCTION public.budget_account_activity(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_account_activity(uuid,uuid) TO service_role;

DO $$ BEGIN
  IF has_function_privilege('anon','public.budget_account_activity(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.budget_account_activity(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Budget account activity grants invalid';
  END IF;
END $$;
