-- SQL boolean expressions return NULL when a nullable operand is NULL.
-- Lifestyle rows without a subcategory therefore produced
-- is_subscription=NULL in the classification trigger and failed the table's
-- NOT NULL invariant during real CSV imports. Derived subscription state must
-- always be a concrete boolean.

CREATE OR REPLACE FUNCTION public.sync_transaction_taxonomy_and_classification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category_id text;
  v_subcategory_id text;
  v_custom_id uuid;
  v_display text;
BEGIN
  IF current_setting('halcyon.taxonomy_revert', true) = 'on' THEN
    NEW.category_id := NULL;
    NEW.subcategory_id := NULL;
    NEW.custom_subcategory_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.kind = 'adjustment'
     AND OLD.kind_source = 'system'
     AND OLD.subcategory = 'Reconciliation'
     AND (NEW.category IS DISTINCT FROM OLD.category OR NEW.subcategory IS DISTINCT FROM OLD.subcategory) THEN
    RAISE EXCEPTION 'system reconciliation classification is locked';
  END IF;

  SELECT tc.id INTO v_category_id
  FROM public.taxonomy_categories tc
  WHERE tc.display_name = NEW.category AND tc.active;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'unknown taxonomy category: %', NEW.category;
  END IF;

  IF NEW.subcategory IS NOT NULL THEN
    SELECT ts.id INTO v_subcategory_id
    FROM public.taxonomy_subcategories ts
    WHERE ts.category_id = v_category_id
      AND ts.display_name = NEW.subcategory
      AND ts.active;

    IF v_subcategory_id IS NULL THEN
      SELECT cs.id, cs.display_name INTO v_custom_id, v_display
      FROM public.tenant_subcategories cs
      WHERE cs.tenant_id = NEW.tenant_id
        AND cs.category_id = v_category_id
        AND lower(cs.display_name) = lower(NEW.subcategory)
        AND cs.active;
      IF v_custom_id IS NULL THEN
        RAISE EXCEPTION 'subcategory % does not belong to %', NEW.subcategory, NEW.category;
      END IF;
      NEW.subcategory := v_display;
    END IF;
  END IF;

  NEW.category_id := v_category_id;
  NEW.subcategory_id := v_subcategory_id;
  NEW.custom_subcategory_id := v_custom_id;

  IF NEW.kind_source IS DISTINCT FROM 'user' THEN
    NEW.kind := public.default_transaction_kind(NEW.category, NEW.subcategory, NEW.amount);
    NEW.kind_source := CASE WHEN NEW.kind = 'adjustment' THEN 'system' ELSE 'derived' END;
  END IF;

  IF NEW.subscription_source IS DISTINCT FROM 'user' THEN
    NEW.is_subscription := COALESCE(
      NEW.category = 'Lifestyle'
        AND NEW.subcategory IN ('Streaming', 'Software & digital services', 'Memberships'),
      false
    );
    NEW.subscription_source := 'derived';
  END IF;

  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.sync_transaction_taxonomy_and_classification()
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.sync_transaction_taxonomy_and_classification()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sync_transaction_taxonomy_and_classification()', 'EXECUTE') THEN
    RAISE EXCEPTION 'transaction classification trigger leaked to browser roles';
  END IF;
END
$$;
