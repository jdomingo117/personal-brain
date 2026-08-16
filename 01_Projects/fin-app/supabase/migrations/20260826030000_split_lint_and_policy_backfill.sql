-- Static-checkable split implementation, legacy AI policy backfill, final grants.
CREATE OR REPLACE FUNCTION public.replace_transaction_allocations(p_tenant uuid,p_transaction uuid,p_actor uuid,p_allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.transactions%ROWTYPE;before_json jsonb;after_json jsonb;edit uuid;r record;pair record;total bigint;n int;distinct_positions int;
BEGIN
  SELECT * INTO t FROM public.transactions WHERE id=p_transaction AND tenant_id=p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found';END IF;
  IF t.pending THEN RAISE EXCEPTION 'pending transactions cannot be split';END IF;
  IF t.kind='adjustment' AND t.kind_source='system' THEN RAISE EXCEPTION 'system reconciliation classification is locked';END IF;
  IF jsonb_typeof(p_allocations)<>'array' OR jsonb_array_length(p_allocations) NOT BETWEEN 2 AND 50 THEN RAISE EXCEPTION 'a split requires 2 to 50 allocations';END IF;
  SELECT sum(x.amount),count(*),count(DISTINCT x.position) INTO total,n,distinct_positions
    FROM jsonb_to_recordset(p_allocations) AS x(position smallint,amount int,kind text,category text,subcategory text,note text);
  IF total<>t.amount THEN RAISE EXCEPTION 'allocation amounts must equal transaction amount';END IF;
  IF n<>distinct_positions THEN RAISE EXCEPTION 'allocation positions must be unique';END IF;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_allocations) AS x(position smallint,amount int,kind text,category text,subcategory text,note text) LOOP
    IF r.position<0 OR r.position>49 OR r.amount=0 OR r.kind NOT IN ('expense','income','transfer','investment','adjustment','refund','reimbursement') THEN RAISE EXCEPTION 'invalid allocation';END IF;
    PERFORM * FROM public.validate_allocation_pair(p_tenant,r.category,nullif(r.subcategory,''));
  END LOOP;
  SELECT COALESCE(jsonb_agg(to_jsonb(a)-'tenant_id' ORDER BY position),'[]'::jsonb) INTO before_json FROM public.transaction_allocations a WHERE transaction_id=p_transaction;
  DELETE FROM public.transaction_allocations WHERE transaction_id=p_transaction;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_allocations) AS x(position smallint,amount int,kind text,category text,subcategory text,note text) LOOP
    SELECT * INTO pair FROM public.validate_allocation_pair(p_tenant,r.category,nullif(r.subcategory,''));
    INSERT INTO public.transaction_allocations(tenant_id,transaction_id,position,amount,kind,category,subcategory,category_id,subcategory_id,custom_subcategory_id,note)
    VALUES(p_tenant,p_transaction,r.position,r.amount,r.kind,r.category,pair.resolved_subcategory,pair.resolved_category_id,pair.resolved_subcategory_id,pair.resolved_custom_subcategory_id,nullif(r.note,''));
  END LOOP;
  SELECT jsonb_agg(to_jsonb(a)-'tenant_id' ORDER BY position) INTO after_json FROM public.transaction_allocations a WHERE transaction_id=p_transaction;
  INSERT INTO public.transaction_allocation_edits(tenant_id,transaction_id,actor_id,before_allocations,after_allocations) VALUES(p_tenant,p_transaction,p_actor,before_json,after_json) RETURNING id INTO edit;
  RETURN jsonb_build_object('edit_id',edit,'transaction_id',p_transaction,'allocations',after_json);
END $$;

UPDATE public.transactions t
SET needs_review=t.category='Uncategorized' OR coalesce(t.category_confidence,0)<coalesce(p.ai_confidence_threshold,0.75)
  OR (coalesce(p.review_ai_missing_subcategory,true) AND t.subcategory IS NULL)
FROM (SELECT tenant.id tenant_id,policy.ai_confidence_threshold,policy.review_ai_missing_subcategory
      FROM public.tenants tenant LEFT JOIN public.classification_review_policies policy ON policy.tenant_id=tenant.id) p
WHERE t.tenant_id=p.tenant_id AND t.category_source='ai';

REVOKE ALL ON FUNCTION public.replace_transaction_allocations(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_transaction_allocations(uuid,uuid,uuid,jsonb) TO service_role;

DO $$ BEGIN
  IF has_function_privilege('authenticated','public.replace_transaction_allocations(uuid,uuid,uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.replace_transaction_allocations(uuid,uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'split RPC exposed';END IF;
END $$;
