-- Transactions own kind/attribute synchronization; merchant rules only own
-- taxonomy IDs. Keeping these trigger row shapes separate prevents either
-- function from referencing columns the other table does not have.

CREATE OR REPLACE FUNCTION public.sync_taxonomy_ids()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_category_id text;v_subcategory_id text;
BEGIN
  IF current_setting('halcyon.taxonomy_revert',true)='on' THEN NEW.category_id:=NULL;NEW.subcategory_id:=NULL;RETURN NEW;END IF;
  SELECT id INTO v_category_id FROM public.taxonomy_categories WHERE display_name=NEW.category AND active;
  IF v_category_id IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',NEW.category;END IF;
  IF NEW.subcategory IS NOT NULL THEN
    SELECT id INTO v_subcategory_id FROM public.taxonomy_subcategories WHERE category_id=v_category_id AND display_name=NEW.subcategory AND active;
    IF v_subcategory_id IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',NEW.subcategory,NEW.category;END IF;
  END IF;
  NEW.category_id:=v_category_id;NEW.subcategory_id:=v_subcategory_id;RETURN NEW;
END $$;

CREATE FUNCTION public.sync_transaction_taxonomy_and_classification()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_category_id text;v_subcategory_id text;
BEGIN
  IF current_setting('halcyon.taxonomy_revert',true)='on' THEN NEW.category_id:=NULL;NEW.subcategory_id:=NULL;RETURN NEW;END IF;
  IF TG_OP='UPDATE' AND OLD.kind='adjustment' AND OLD.kind_source='system' AND OLD.subcategory='Reconciliation'
     AND (NEW.category IS DISTINCT FROM OLD.category OR NEW.subcategory IS DISTINCT FROM OLD.subcategory) THEN
    RAISE EXCEPTION 'system reconciliation classification is locked';
  END IF;
  SELECT id INTO v_category_id FROM public.taxonomy_categories WHERE display_name=NEW.category AND active;
  IF v_category_id IS NULL THEN RAISE EXCEPTION 'unknown taxonomy category: %',NEW.category;END IF;
  IF NEW.subcategory IS NOT NULL THEN
    SELECT id INTO v_subcategory_id FROM public.taxonomy_subcategories WHERE category_id=v_category_id AND display_name=NEW.subcategory AND active;
    IF v_subcategory_id IS NULL THEN RAISE EXCEPTION 'subcategory % does not belong to %',NEW.subcategory,NEW.category;END IF;
  END IF;
  NEW.category_id:=v_category_id;NEW.subcategory_id:=v_subcategory_id;
  IF NEW.kind_source IS DISTINCT FROM 'user' THEN
    NEW.kind:=public.default_transaction_kind(NEW.category,NEW.subcategory,NEW.amount);
    NEW.kind_source:=CASE WHEN NEW.kind='adjustment' THEN 'system' ELSE 'derived' END;
  END IF;
  IF NEW.subscription_source IS DISTINCT FROM 'user' THEN
    NEW.is_subscription:=NEW.category='Lifestyle' AND NEW.subcategory IN ('Streaming','Software & digital services','Memberships');
    NEW.subscription_source:='derived';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER transactions_sync_taxonomy ON public.transactions;
CREATE TRIGGER transactions_sync_taxonomy
BEFORE INSERT OR UPDATE OF category,subcategory,amount ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_transaction_taxonomy_and_classification();

REVOKE EXECUTE ON FUNCTION public.sync_transaction_taxonomy_and_classification() FROM PUBLIC,anon,authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon','public.sync_transaction_taxonomy_and_classification()','EXECUTE')
     OR has_function_privilege('authenticated','public.sync_transaction_taxonomy_and_classification()','EXECUTE') THEN
    RAISE EXCEPTION 'transaction classification trigger leaked to browser roles';
  END IF;
END $$;
