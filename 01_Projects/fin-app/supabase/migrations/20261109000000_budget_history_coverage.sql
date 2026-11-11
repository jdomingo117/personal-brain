-- Explicit owner attestation. Transaction dates never establish coverage by themselves.
CREATE FUNCTION public.budget_coverage(p_tenant uuid,p_actor uuid,p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE source_v bigint; as_of date; confirmations jsonb;
BEGIN
  source_v:=public.budget_lock_source(p_tenant);
  PERFORM public.budget_assert_owner(p_tenant,p_actor);
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE tenant_id=p_tenant AND id=p_account AND currency='AUD') THEN
    RAISE EXCEPTION 'budget_account_unavailable';
  END IF;
  as_of:=(now() AT TIME ZONE coalesce((SELECT timezone FROM public.budget_plans WHERE tenant_id=p_tenant AND state='active'),'Australia/Sydney'))::date;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'first_date',start_date,'last_date',end_date-1,'provenance',provenance)
    ORDER BY start_date,end_date,id),'[]'::jsonb) INTO confirmations
    FROM (SELECT id,start_date,end_date,provenance FROM public.account_activity_coverage
      WHERE tenant_id=p_tenant AND account_id=p_account AND revoked_at IS NULL AND provenance='user_confirmed'
      ORDER BY start_date,end_date,id LIMIT 50) c;
  RETURN jsonb_build_object('source_revision',source_v::text,'latest_date',as_of,'confirmations',confirmations);
END $$;

-- Reuse the same operation receipts, source lock and feature gate as every other Budget write.
ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_before_coverage;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE action_name text:=p_input->>'action'; source_v bigint; input_hash text; prior public.budget_operations%ROWTYPE;
  target_account uuid; first_on date; last_on date; as_of date; coverage public.account_activity_coverage%ROWTYPE;
  op uuid:=gen_random_uuid(); answer jsonb; before_data jsonb:='{}'; after_data jsonb;
BEGIN
  IF action_name IS NULL OR action_name NOT IN('confirm_coverage','revoke_coverage') THEN
    RETURN public.budget_command_before_coverage(p_tenant,p_actor,p_request,p_input,p_enabled);
  END IF;
  source_v:=public.budget_lock_source(p_tenant);
  PERFORM public.budget_assert_owner(p_tenant,p_actor);
  input_hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
  SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
  IF FOUND THEN
    IF prior.payload_hash<>input_hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;
    RETURN prior.outcome;
  END IF;
  IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
  IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
  IF source_v IS DISTINCT FROM (p_input->>'expected_source')::bigint THEN RAISE EXCEPTION 'budget_stale_source';END IF;
  IF action_name='confirm_coverage' THEN
    IF p_input->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'budget_invalid_coverage_confirmation';END IF;
    IF coalesce(p_input->>'first_date','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(p_input->>'last_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'budget_invalid_coverage_dates';
    END IF;
    target_account:=(p_input->>'account_id')::uuid;
    first_on:=(p_input->>'first_date')::date; last_on:=(p_input->>'last_date')::date;
    IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE tenant_id=p_tenant AND id=target_account AND currency='AUD') THEN
      RAISE EXCEPTION 'budget_account_unavailable';
    END IF;
    as_of:=(now() AT TIME ZONE coalesce((SELECT timezone FROM public.budget_plans WHERE tenant_id=p_tenant AND state='active'),'Australia/Sydney'))::date;
    IF first_on>last_on OR last_on>as_of OR last_on>=(first_on+interval '10 years')::date THEN
      RAISE EXCEPTION 'budget_invalid_coverage_dates';
    END IF;
    IF EXISTS(SELECT 1 FROM public.account_activity_coverage WHERE tenant_id=p_tenant AND account_id=target_account
      AND provenance='user_confirmed' AND revoked_at IS NULL AND start_date=first_on AND end_date=last_on+1) THEN
      RAISE EXCEPTION 'budget_coverage_already_confirmed';
    END IF;
    IF (SELECT count(*) FROM public.account_activity_coverage WHERE tenant_id=p_tenant AND account_id=target_account
      AND provenance='user_confirmed' AND revoked_at IS NULL)>=50 THEN RAISE EXCEPTION 'budget_coverage_limit';END IF;
    INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision,confirmed_by)
      VALUES(p_tenant,target_account,target_account,first_on,last_on+1,'user_confirmed','{"method":"budget-owner-attestation-v1"}',source_v,p_actor)
      RETURNING * INTO coverage;
  ELSE
    UPDATE public.account_activity_coverage SET revoked_at=now(),revoked_reason='owner_withdrew_confirmation'
      WHERE tenant_id=p_tenant AND id=(p_input->>'coverage_id')::uuid AND provenance='user_confirmed' AND revoked_at IS NULL
      RETURNING * INTO coverage;
    IF NOT FOUND THEN RAISE EXCEPTION 'budget_coverage_unavailable';END IF;
    before_data:=jsonb_build_object('revoked',false);
  END IF;
  -- The existing coverage trigger has advanced the source revision in this transaction.
  source_v:=public.budget_lock_source(p_tenant);
  after_data:=jsonb_build_object('coverage_id',coverage.id,'account_id',coverage.original_account_id,'first_date',coverage.start_date,
    'last_date',coverage.end_date-1,'provenance',coverage.provenance,'revoked',coverage.revoked_at IS NOT NULL);
  answer:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source_v::text,
    'method','budget-foundation-v1','result',after_data);
  INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome)
    VALUES(op,p_tenant,p_actor,p_request,input_hash,action_name,before_data,after_data,answer);
  RETURN answer;
END $$;

REVOKE ALL ON FUNCTION public.budget_coverage(uuid,uuid,uuid),public.budget_command(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_coverage(uuid,uuid,uuid),public.budget_command(uuid,uuid,uuid,jsonb,boolean) TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(role_name) WHERE
    has_function_privilege(role_name,'public.budget_coverage(uuid,uuid,uuid)','EXECUTE') OR
    has_function_privilege(role_name,'public.budget_command(uuid,uuid,uuid,jsonb,boolean)','EXECUTE') OR
    has_table_privilege(role_name,'public.account_activity_coverage','INSERT,UPDATE,DELETE')) OR
    NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.account_activity_coverage'::regclass) THEN
    RAISE EXCEPTION 'Budget history coverage grants invalid';
  END IF;
END $$;
