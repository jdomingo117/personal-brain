-- Trigger functions are invoked by PostgreSQL, never by browser roles.
-- Remove the default PUBLIC execute grant and assert both taxonomy triggers.

REVOKE EXECUTE ON FUNCTION public.sync_taxonomy_ids() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  leaked_functions text;
BEGIN
  SELECT string_agg(routine_name, ', ')
  INTO leaked_functions
  FROM information_schema.role_routine_grants
  WHERE specific_schema = 'public'
    AND routine_name IN ('sync_taxonomy_ids', 'sync_budget_taxonomy_id')
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');

  IF leaked_functions IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy trigger functions leaked to browser roles: %', leaked_functions;
  END IF;
END
$$;
