-- Bulk category corrections preserve omitted fields. This makes the UI's
-- "Mixed — leave unchanged" state a server-enforced data-integrity contract.

CREATE FUNCTION public.bulk_edit_transaction_categories(
  p_tenant_id uuid,
  p_transaction_ids uuid[],
  p_actor_id uuid,
  p_category text,
  p_subcategory text,
  p_update_category boolean,
  p_update_subcategory boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_requested integer;
  v_visible integer;
  v_updated integer;
BEGIN
  v_requested := cardinality(p_transaction_ids);
  IF v_requested IS NULL OR v_requested < 1 OR v_requested > 500 THEN
    RAISE EXCEPTION 'select between 1 and 500 transactions';
  END IF;
  IF v_requested <> (SELECT count(DISTINCT id) FROM unnest(p_transaction_ids) id) THEN
    RAISE EXCEPTION 'duplicate transaction ids';
  END IF;
  IF NOT p_update_category AND NOT p_update_subcategory THEN
    RAISE EXCEPTION 'choose a category or subcategory to update';
  END IF;
  IF p_update_category AND NOT p_update_subcategory THEN
    RAISE EXCEPTION 'choose a subcategory when changing category';
  END IF;

  PERFORM 1 FROM public.transactions
   WHERE tenant_id = p_tenant_id AND id = ANY(p_transaction_ids)
   ORDER BY id FOR UPDATE;

  SELECT count(*) INTO v_visible FROM public.transactions
   WHERE tenant_id = p_tenant_id AND id = ANY(p_transaction_ids);
  IF v_visible <> v_requested THEN RAISE EXCEPTION 'transaction not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.transactions
     WHERE tenant_id = p_tenant_id AND id = ANY(p_transaction_ids)
       AND kind = 'adjustment' AND kind_source = 'system'
  ) THEN
    RAISE EXCEPTION 'system reconciliation entries cannot be recategorised';
  END IF;

  WITH targets AS (
    SELECT t.*,
      CASE WHEN p_update_category THEN p_category ELSE t.category END AS target_category,
      CASE WHEN p_update_subcategory THEN nullif(p_subcategory, '') ELSE t.subcategory END AS target_subcategory
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.id = ANY(p_transaction_ids)
  ), recorded AS (
    INSERT INTO public.transaction_category_edits (
      tenant_id, transaction_id, actor_id, operation_id, scope,
      before_category, before_subcategory, before_source,
      before_confidence, before_needs_review,
      after_category, after_subcategory, after_source,
      after_confidence, after_needs_review
    )
    SELECT p_tenant_id, id, p_actor_id, v_operation_id, 'selection',
      category, subcategory, category_source, category_confidence, needs_review,
      target_category, target_subcategory, 'user', 1, false
    FROM targets
    WHERE (category, subcategory, category_source, category_confidence, needs_review)
          IS DISTINCT FROM
          (target_category, target_subcategory, 'user'::text, 1::real, false)
    RETURNING transaction_id, after_category, after_subcategory
  )
  UPDATE public.transactions t
     SET category = recorded.after_category,
         subcategory = recorded.after_subcategory,
         category_source = 'user',
         category_confidence = 1,
         needs_review = false
    FROM recorded
   WHERE t.tenant_id = p_tenant_id AND t.id = recorded.transaction_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'operation_id', v_operation_id,
    'selected', v_requested,
    'updated', v_updated,
    'category_updated', p_update_category,
    'subcategory_updated', p_update_subcategory
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_edit_transaction_categories(uuid, uuid[], uuid, text, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_edit_transaction_categories(uuid, uuid[], uuid, text, text, boolean, boolean)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated',
    'public.bulk_edit_transaction_categories(uuid,uuid[],uuid,text,text,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated may execute partial bulk category RPC';
  END IF;
  IF NOT has_function_privilege('service_role',
    'public.bulk_edit_transaction_categories(uuid,uuid[],uuid,text,text,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot execute partial bulk category RPC';
  END IF;
END
$$;
