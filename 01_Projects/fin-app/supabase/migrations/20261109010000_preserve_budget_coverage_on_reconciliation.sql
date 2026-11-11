-- Replacing a system balance adjustment changes the source revision, but does
-- not remove real activity from an owner-confirmed range.
CREATE OR REPLACE FUNCTION public.budget_invalidate_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE query text; item record;
BEGIN
  query:=CASE TG_OP WHEN 'INSERT' THEN 'SELECT to_jsonb(r) j FROM new_rows r'
    WHEN 'DELETE' THEN 'SELECT to_jsonb(r) j FROM old_rows r'
    ELSE 'SELECT to_jsonb(r) j FROM old_rows r UNION ALL SELECT to_jsonb(r) j FROM new_rows r' END;
  FOR item IN EXECUTE 'SELECT (j->>''tenant_id'')::uuid tenant_id,min((j->>''date'')::date) dirty_from FROM ('||query||') s GROUP BY 1 ORDER BY 1' LOOP
    IF item.tenant_id IS NULL THEN
      -- Global taxonomy changes invalidate existing Budget users, not an arbitrary user's tenant.
      PERFORM public.budget_touch_source(v.tenant_id,NULL) FROM public.budget_source_versions v ORDER BY v.tenant_id;
    ELSE
      PERFORM public.budget_touch_source(item.tenant_id,item.dirty_from);
    END IF;
  END LOOP;
  IF TG_TABLE_NAME='transactions' AND TG_OP='DELETE' THEN
    -- Gate was acquired above. Never take source row locks after that gate.
    UPDATE public.account_activity_coverage c SET revoked_at=now(),revoked_reason='source_activity_deleted'
    WHERE c.revoked_at IS NULL AND EXISTS(SELECT 1 FROM old_rows r WHERE r.tenant_id=c.tenant_id AND r.account_id=c.account_id
      AND NOT r.pending
      AND (r.kind IS DISTINCT FROM 'adjustment' OR r.kind_source IS DISTINCT FROM 'system')
      AND r.date>=c.start_date AND r.date<c.end_date);
  END IF;
  IF TG_TABLE_NAME='accounts' AND TG_OP='DELETE' THEN
    UPDATE public.budget_account_memberships m SET account_id=NULL WHERE EXISTS(SELECT 1 FROM old_rows r WHERE r.id=m.account_id AND r.tenant_id=m.tenant_id);
    UPDATE public.account_activity_coverage c SET account_id=NULL,revoked_at=coalesce(c.revoked_at,now()),revoked_reason=coalesce(c.revoked_reason,'account_deleted')
      WHERE EXISTS(SELECT 1 FROM old_rows r WHERE r.id=c.account_id AND r.tenant_id=c.tenant_id);
  END IF;
  IF TG_TABLE_NAME='account_connections' AND TG_OP='DELETE' THEN
    UPDATE public.account_activity_coverage c SET revoked_at=now(),revoked_reason='account_mapping_removed'
      WHERE c.revoked_at IS NULL AND EXISTS(SELECT 1 FROM old_rows r WHERE r.tenant_id=c.tenant_id AND r.account_id=c.original_account_id);
  ELSIF TG_TABLE_NAME='account_connections' AND TG_OP='UPDATE' THEN
    UPDATE public.account_activity_coverage c SET revoked_at=now(),revoked_reason='account_mapping_changed'
      WHERE c.revoked_at IS NULL AND EXISTS(SELECT 1 FROM old_rows o JOIN new_rows n ON n.id=o.id
        WHERE o.tenant_id=c.tenant_id AND c.original_account_id IN(o.account_id,n.account_id)
          AND (o.account_id IS DISTINCT FROM n.account_id OR o.provider_account_id IS DISTINCT FROM n.provider_account_id OR o.cutover_date IS DISTINCT FROM n.cutover_date));
  END IF;
  RETURN NULL;
END $$;

DO $$ BEGIN
  IF has_function_privilege('anon','public.budget_invalidate_source()','EXECUTE')
    OR has_function_privilege('authenticated','public.budget_invalidate_source()','EXECUTE') THEN
    RAISE EXCEPTION 'Budget source trigger grants invalid';
  END IF;
END $$;
