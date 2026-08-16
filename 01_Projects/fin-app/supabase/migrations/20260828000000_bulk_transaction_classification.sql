-- Bulk kind and attribute edits preserve every omitted value and precedence
-- source, group changed rows under one operation, and undo atomically.

ALTER TABLE public.transaction_classification_edits
  ADD COLUMN operation_id uuid,
  ADD COLUMN scope text NOT NULL DEFAULT 'transaction'
    CHECK (scope IN ('transaction', 'selection'));

CREATE INDEX idx_transaction_classification_edits_operation
  ON public.transaction_classification_edits (tenant_id, operation_id)
  WHERE operation_id IS NOT NULL;

CREATE FUNCTION public.bulk_edit_transaction_classification(
  p_tenant_id uuid,
  p_transaction_ids uuid[],
  p_actor_id uuid,
  p_update_kind boolean,
  p_kind text,
  p_update_is_recurring boolean,
  p_is_recurring boolean,
  p_update_is_subscription boolean,
  p_is_subscription boolean,
  p_update_spending_nature boolean,
  p_spending_nature text,
  p_update_is_reimbursable boolean,
  p_is_reimbursable boolean,
  p_update_is_tax_related boolean,
  p_is_tax_related boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation_id uuid := gen_random_uuid();
  v_requested integer := cardinality(p_transaction_ids);
  v_visible integer;
  v_updated integer;
BEGIN
  IF v_requested IS NULL OR v_requested < 1 OR v_requested > 500 THEN
    RAISE EXCEPTION 'select between 1 and 500 transactions';
  END IF;
  IF v_requested <> (SELECT count(DISTINCT id) FROM unnest(p_transaction_ids) id) THEN
    RAISE EXCEPTION 'duplicate transaction ids';
  END IF;
  IF NOT (p_update_kind OR p_update_is_recurring OR p_update_is_subscription OR
          p_update_spending_nature OR p_update_is_reimbursable OR p_update_is_tax_related) THEN
    RAISE EXCEPTION 'choose at least one classification field to update';
  END IF;
  IF p_update_kind AND p_kind NOT IN ('expense','income','transfer','investment','adjustment','refund','reimbursement') THEN
    RAISE EXCEPTION 'invalid transaction kind';
  END IF;
  IF p_update_spending_nature AND p_spending_nature IS NOT NULL
     AND p_spending_nature NOT IN ('essential','discretionary') THEN
    RAISE EXCEPTION 'invalid spending nature';
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
  ) THEN RAISE EXCEPTION 'system reconciliation classification is locked'; END IF;

  WITH targets AS (
    SELECT t.*,
      CASE WHEN p_update_kind THEN p_kind ELSE t.kind END target_kind,
      CASE WHEN p_update_kind THEN 'user' ELSE t.kind_source END target_kind_source,
      CASE WHEN p_update_is_recurring THEN p_is_recurring ELSE t.is_recurring END target_is_recurring,
      CASE WHEN p_update_is_recurring THEN 'user' ELSE t.recurring_source END target_recurring_source,
      CASE WHEN p_update_is_subscription THEN p_is_subscription ELSE t.is_subscription END target_is_subscription,
      CASE WHEN p_update_is_subscription THEN 'user' ELSE t.subscription_source END target_subscription_source,
      CASE WHEN p_update_spending_nature THEN p_spending_nature ELSE t.spending_nature END target_spending_nature,
      CASE WHEN p_update_is_reimbursable THEN p_is_reimbursable ELSE t.is_reimbursable END target_is_reimbursable,
      CASE WHEN p_update_is_tax_related THEN p_is_tax_related ELSE t.is_tax_related END target_is_tax_related,
      CASE WHEN p_update_kind AND p_kind = 'transfer' THEN true ELSE t.transfer_candidate END target_transfer_candidate
    FROM public.transactions t
    WHERE t.tenant_id = p_tenant_id AND t.id = ANY(p_transaction_ids)
  ), recorded AS (
    INSERT INTO public.transaction_classification_edits (
      tenant_id, transaction_id, actor_id, operation_id, scope,
      before_kind, before_kind_source, before_attributes,
      after_kind, after_kind_source, after_attributes
    )
    SELECT p_tenant_id, id, p_actor_id, v_operation_id, 'selection',
      kind, kind_source,
      jsonb_build_object(
        'is_recurring',is_recurring,'recurring_source',recurring_source,
        'is_subscription',is_subscription,'subscription_source',subscription_source,
        'spending_nature',spending_nature,'is_reimbursable',is_reimbursable,
        'is_tax_related',is_tax_related,'transfer_candidate',transfer_candidate),
      target_kind, target_kind_source,
      jsonb_build_object(
        'is_recurring',target_is_recurring,'recurring_source',target_recurring_source,
        'is_subscription',target_is_subscription,'subscription_source',target_subscription_source,
        'spending_nature',target_spending_nature,'is_reimbursable',target_is_reimbursable,
        'is_tax_related',target_is_tax_related,'transfer_candidate',target_transfer_candidate)
    FROM targets
    WHERE (kind,kind_source,is_recurring,recurring_source,is_subscription,subscription_source,
           spending_nature,is_reimbursable,is_tax_related,transfer_candidate)
          IS DISTINCT FROM
          (target_kind,target_kind_source,target_is_recurring,target_recurring_source,
           target_is_subscription,target_subscription_source,target_spending_nature,
           target_is_reimbursable,target_is_tax_related,target_transfer_candidate)
    RETURNING transaction_id, after_kind, after_kind_source, after_attributes
  )
  UPDATE public.transactions t SET
    kind = r.after_kind,
    kind_source = r.after_kind_source,
    is_recurring = (r.after_attributes->>'is_recurring')::boolean,
    recurring_source = r.after_attributes->>'recurring_source',
    is_subscription = (r.after_attributes->>'is_subscription')::boolean,
    subscription_source = r.after_attributes->>'subscription_source',
    spending_nature = r.after_attributes->>'spending_nature',
    is_reimbursable = (r.after_attributes->>'is_reimbursable')::boolean,
    is_tax_related = (r.after_attributes->>'is_tax_related')::boolean,
    transfer_candidate = (r.after_attributes->>'transfer_candidate')::boolean
  FROM recorded r
  WHERE t.tenant_id = p_tenant_id AND t.id = r.transaction_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('operation_id',v_operation_id,'selected',v_requested,'updated',v_updated);
END;
$$;

CREATE FUNCTION public.undo_transaction_classification_operation(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_restored integer;
BEGIN
  PERFORM 1 FROM public.transaction_classification_edits
   WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id
   ORDER BY transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'classification operation not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.transaction_classification_edits
     WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id AND undone_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'classification operation already undone'; END IF;

  PERFORM 1 FROM public.transactions t
   JOIN public.transaction_classification_edits e
     ON e.transaction_id = t.id AND e.tenant_id = t.tenant_id
   WHERE e.tenant_id = p_tenant_id AND e.operation_id = p_operation_id
   ORDER BY t.id FOR UPDATE OF t;

  IF EXISTS (
    SELECT 1 FROM public.transaction_classification_edits e
    JOIN public.transactions t ON t.id = e.transaction_id AND t.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id AND e.operation_id = p_operation_id
      AND (t.kind,t.kind_source,t.is_recurring,t.recurring_source,t.is_subscription,
           t.subscription_source,t.spending_nature,t.is_reimbursable,t.is_tax_related,
           t.transfer_candidate)
          IS DISTINCT FROM
          (e.after_kind,e.after_kind_source,(e.after_attributes->>'is_recurring')::boolean,
           e.after_attributes->>'recurring_source',(e.after_attributes->>'is_subscription')::boolean,
           e.after_attributes->>'subscription_source',e.after_attributes->>'spending_nature',
           (e.after_attributes->>'is_reimbursable')::boolean,(e.after_attributes->>'is_tax_related')::boolean,
           (e.after_attributes->>'transfer_candidate')::boolean)
  ) THEN RAISE EXCEPTION 'transaction changed after this classification operation'; END IF;

  UPDATE public.transactions t SET
    kind = e.before_kind,
    kind_source = e.before_kind_source,
    is_recurring = (e.before_attributes->>'is_recurring')::boolean,
    recurring_source = e.before_attributes->>'recurring_source',
    is_subscription = (e.before_attributes->>'is_subscription')::boolean,
    subscription_source = e.before_attributes->>'subscription_source',
    spending_nature = e.before_attributes->>'spending_nature',
    is_reimbursable = (e.before_attributes->>'is_reimbursable')::boolean,
    is_tax_related = (e.before_attributes->>'is_tax_related')::boolean,
    transfer_candidate = (e.before_attributes->>'transfer_candidate')::boolean
  FROM public.transaction_classification_edits e
  WHERE e.tenant_id = p_tenant_id AND e.operation_id = p_operation_id
    AND t.tenant_id = e.tenant_id AND t.id = e.transaction_id;
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  UPDATE public.transaction_classification_edits SET undone_at = now(), undone_by = p_actor_id
   WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id;
  RETURN jsonb_build_object('operation_id',p_operation_id,'restored',v_restored,'undone',true);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_edit_transaction_classification(uuid,uuid[],uuid,boolean,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,boolean,boolean),
  public.undo_transaction_classification_operation(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_edit_transaction_classification(uuid,uuid[],uuid,boolean,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,boolean,boolean),
  public.undo_transaction_classification_operation(uuid,uuid,uuid)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated',
    'public.bulk_edit_transaction_classification(uuid,uuid[],uuid,boolean,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated may execute bulk classification RPC';
  END IF;
  IF has_function_privilege('authenticated',
    'public.undo_transaction_classification_operation(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated may execute bulk classification undo RPC';
  END IF;
  IF NOT has_function_privilege('service_role',
    'public.bulk_edit_transaction_classification(uuid,uuid[],uuid,boolean,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot execute bulk classification RPC';
  END IF;
END
$$;
