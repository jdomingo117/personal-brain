-- Keep Budget V1 reads behind the authenticated, access-scoped Edge endpoints.
-- The legacy public.budgets table is outside this boundary.
DO $$
DECLARE
  relation record;
BEGIN
  FOR relation IN
    SELECT c.oid, c.relname, c.relkind, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')
      AND (starts_with(c.relname, 'budget_') OR c.relname = 'account_activity_coverage')
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC, anon, authenticated', relation.relname);
    IF has_any_column_privilege('anon', relation.oid, 'SELECT')
      OR has_any_column_privilege('authenticated', relation.oid, 'SELECT')
      OR (relation.relkind IN ('r', 'p') AND NOT relation.relrowsecurity)
    THEN
      RAISE EXCEPTION 'Unsafe Budget relation grants or RLS: %', relation.relname;
    END IF;
  END LOOP;
END $$;
