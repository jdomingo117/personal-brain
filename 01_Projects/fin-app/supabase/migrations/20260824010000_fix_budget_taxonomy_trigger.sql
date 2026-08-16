-- Budgets have a category but no subcategory. A dedicated trigger avoids
-- compiling the transaction-oriented NEW.subcategory references for that row.

DROP TRIGGER budgets_sync_taxonomy ON public.budgets;

CREATE FUNCTION public.sync_budget_taxonomy_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category_id text;
BEGIN
  IF current_setting('halcyon.taxonomy_revert', true) = 'on' THEN
    NEW.category_id := NULL;
    RETURN NEW;
  END IF;

  SELECT id INTO v_category_id
  FROM public.taxonomy_categories
  WHERE display_name = NEW.category AND active;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'unknown taxonomy category: %', NEW.category;
  END IF;

  NEW.category_id := v_category_id;
  RETURN NEW;
END
$$;

CREATE TRIGGER budgets_sync_taxonomy
BEFORE INSERT OR UPDATE OF category ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.sync_budget_taxonomy_id();

REVOKE EXECUTE ON FUNCTION public.sync_budget_taxonomy_id() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.sync_budget_taxonomy_id()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sync_budget_taxonomy_id()', 'EXECUTE') THEN
    RAISE EXCEPTION 'budget taxonomy trigger function leaked to browser roles';
  END IF;
END
$$;
