-- Provider history coverage.
--
-- A completed Up history walk (the first backfill, or a verification walk over an
-- already-backfilled account) returns every transaction posted from cutover until
-- the walk began. That is evidence, not an inference from transaction dates, so it
-- is recorded as `verified_provider` coverage for [cutover, local date the walk
-- began). Later incremental passes extend the range only when their fetch window
-- starts no later than the start of the current range's end day, so a partial or
-- missed sync can never be bridged. Existing invalidation still applies: deleting
-- settled activity, removing or remapping the connection, or changing cutover
-- revokes the range, and the next sync re-verifies it.
--
-- Up timestamps carry Australian Eastern offsets and transaction dates are their
-- local calendar day, so provider coverage dates use Australia/Sydney.

ALTER TABLE public.account_connections
  ADD COLUMN coverage_walk_started_at timestamptz,
  ADD COLUMN coverage_walk_from date,
  ADD COLUMN coverage_walk_cursor text;

-- Lock order matches ordinary source writes: the account_connections row first,
-- then the tenant source gate (its trigger, or budget_lock_source).
CREATE FUNCTION public.budget_provider_coverage_base(p_tenant uuid,p_account_connection uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE conn public.account_connections%ROWTYPE; first_on date; end_on date; source_v bigint;
  existing public.account_activity_coverage%ROWTYPE; created public.account_activity_coverage%ROWTYPE;
BEGIN
  SELECT * INTO conn FROM public.account_connections WHERE tenant_id=p_tenant AND id=p_account_connection FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
  IF NOT conn.backfill_done OR conn.coverage_walk_started_at IS NULL OR conn.coverage_walk_from IS NULL
    OR conn.coverage_walk_started_at>now() THEN
    RETURN jsonb_build_object('recorded',false,'reason','walk_incomplete');
  END IF;
  first_on:=greatest(conn.coverage_walk_from,conn.cutover_date);
  end_on:=(conn.coverage_walk_started_at AT TIME ZONE 'Australia/Sydney')::date;
  -- The walk is consumed whether or not it yields a range.
  UPDATE public.account_connections SET coverage_walk_started_at=NULL,coverage_walk_from=NULL,coverage_walk_cursor=NULL WHERE id=conn.id;
  IF NOT EXISTS(SELECT 1 FROM public.accounts a JOIN public.provider_connections p ON p.id=conn.connection_id AND p.tenant_id=a.tenant_id
      WHERE a.tenant_id=p_tenant AND a.id=conn.account_id AND a.currency='AUD' AND p.status='active') OR end_on<=first_on THEN
    RETURN jsonb_build_object('recorded',false,'reason','not_eligible');
  END IF;
  source_v:=public.budget_lock_source(p_tenant);
  SELECT * INTO existing FROM public.account_activity_coverage
    WHERE tenant_id=p_tenant AND account_id=conn.account_id AND provenance='verified_provider' AND revoked_at IS NULL
      AND evidence->>'account_connection_id'=conn.id::text
    ORDER BY end_date DESC,id LIMIT 1 FOR UPDATE;
  IF FOUND AND existing.start_date<=first_on AND existing.end_date>=end_on THEN
    RETURN jsonb_build_object('recorded',false,'reason','current','coverage_id',existing.id);
  END IF;
  UPDATE public.account_activity_coverage SET revoked_at=now(),revoked_reason='superseded_by_provider_walk'
    WHERE tenant_id=p_tenant AND account_id=conn.account_id AND provenance='verified_provider' AND revoked_at IS NULL
      AND evidence->>'account_connection_id'=conn.id::text;
  INSERT INTO public.account_activity_coverage(tenant_id,account_id,original_account_id,start_date,end_date,provenance,evidence,source_revision)
    VALUES(p_tenant,conn.account_id,conn.account_id,first_on,end_on,'verified_provider',
      jsonb_build_object('method','budget-provider-walk-v1','account_connection_id',conn.id,'connection_id',conn.connection_id,
        'walk_started_at',conn.coverage_walk_started_at,'walk_from',conn.coverage_walk_from,'cutover_date',conn.cutover_date),source_v)
    RETURNING * INTO created;
  RETURN jsonb_build_object('recorded',true,'coverage_id',created.id,'first_date',created.start_date,'last_date',created.end_date-1);
END $$;

CREATE FUNCTION public.budget_provider_coverage_extend(p_tenant uuid,p_account_connection uuid,p_since timestamptz,p_pass_started timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE conn public.account_connections%ROWTYPE; end_on date; source_v bigint; existing public.account_activity_coverage%ROWTYPE;
BEGIN
  IF p_since IS NULL OR p_pass_started IS NULL OR p_since>p_pass_started OR p_pass_started>now() THEN RAISE EXCEPTION 'budget_invalid_coverage_dates';END IF;
  SELECT * INTO conn FROM public.account_connections WHERE tenant_id=p_tenant AND id=p_account_connection FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
  IF NOT conn.backfill_done THEN RETURN jsonb_build_object('extended',false,'reason','backfill_pending');END IF;
  source_v:=public.budget_lock_source(p_tenant);
  SELECT * INTO existing FROM public.account_activity_coverage
    WHERE tenant_id=p_tenant AND account_id=conn.account_id AND provenance='verified_provider' AND revoked_at IS NULL
      AND evidence->>'account_connection_id'=conn.id::text
    ORDER BY end_date DESC,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('extended',false,'reason','no_base');END IF;
  -- Every transaction dated on or after the current end day was posted at or after
  -- that day's local midnight, so the pass must have fetched from no later than it.
  IF p_since>(existing.end_date::timestamp AT TIME ZONE 'Australia/Sydney') THEN
    RETURN jsonb_build_object('extended',false,'reason','gap','coverage_id',existing.id);
  END IF;
  end_on:=(p_pass_started AT TIME ZONE 'Australia/Sydney')::date;
  IF end_on<=existing.end_date THEN RETURN jsonb_build_object('extended',false,'reason','current','coverage_id',existing.id);END IF;
  UPDATE public.account_activity_coverage SET end_date=end_on,source_revision=source_v,
    evidence=evidence||jsonb_build_object('extended_at',now(),'extended_from',existing.end_date)
    WHERE id=existing.id;
  RETURN jsonb_build_object('extended',true,'coverage_id',existing.id,'last_date',end_on-1);
END $$;

REVOKE ALL ON FUNCTION public.budget_provider_coverage_base(uuid,uuid),public.budget_provider_coverage_extend(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_provider_coverage_base(uuid,uuid),public.budget_provider_coverage_extend(uuid,uuid,timestamptz,timestamptz) TO service_role;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(role_name) WHERE
    has_function_privilege(role_name,'public.budget_provider_coverage_base(uuid,uuid)','EXECUTE') OR
    has_function_privilege(role_name,'public.budget_provider_coverage_extend(uuid,uuid,timestamptz,timestamptz)','EXECUTE') OR
    has_table_privilege(role_name,'public.account_connections','INSERT,UPDATE,DELETE') OR
    has_table_privilege(role_name,'public.account_activity_coverage','INSERT,UPDATE,DELETE')) OR
    NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.account_connections'::regclass) OR
    NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.account_activity_coverage'::regclass) THEN
    RAISE EXCEPTION 'Budget provider coverage grants invalid';
  END IF;
END $$;
