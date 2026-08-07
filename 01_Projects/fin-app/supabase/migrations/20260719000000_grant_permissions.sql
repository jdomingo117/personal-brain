-- Table-level privileges for the PostgREST roles.
--
-- These grants are the OUTER gate; RLS policies are the inner one. The
-- previous version of this migration ran:
--
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated;
--
-- which was safe only for exactly as long as every table happened to have RLS
-- enabled. The default-privileges line made that a standing trap: any table
-- added later without ENABLE ROW LEVEL SECURITY would be readable AND writable
-- by unauthenticated `anon` from the moment it was created. Both are removed.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- `anon` is a pre-login browser. It needs no access to application data;
-- every read path in this app requires a session.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- `authenticated` gets DML but never DDL-adjacent rights (no TRUNCATE, no
-- REFERENCES, no TRIGGER). RLS then narrows every statement to the caller's
-- own rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- Belt and braces: fail the migration if any table in `public` is exposed
-- without RLS. Grants alone do not isolate tenants — RLS does — so a table
-- that reaches this point unprotected is a data leak, not a warning.
DO $$
DECLARE
  unprotected text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO unprotected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'Tables in public without RLS enabled: %', unprotected;
  END IF;
END $$;
