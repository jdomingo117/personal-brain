-- Repair and formalise saved CSV layouts.
--
-- The original client looked profiles up by headers.join('|') in name, while
-- upsert-profile expected snake_case mappings and performed an unconditional
-- insert. The current client sends camelCase mappings, so every save failed and
-- the fire-and-forget caller hid it. Give layout identity its own tenant-scoped
-- SHA-256 column, retain name as a human label, normalize legacy mapping keys,
-- and make conflict-safe upserts possible.

ALTER TABLE public.static_profiles
  ADD COLUMN header_fingerprint text;

UPDATE public.static_profiles
   SET header_fingerprint = encode(
     extensions.digest(convert_to(name, 'UTF8'), 'sha256'),
     'hex'
   );

-- Preserve legacy rows but add the camelCase keys the current pipeline reads.
-- Old snake_case keys remain harmlessly alongside them for forensic clarity.
UPDATE public.static_profiles
   SET mappings = mappings || jsonb_strip_nulls(jsonb_build_object(
     'dateCol',        COALESCE(mappings->'dateCol', mappings->'date_col'),
     'descCol',        COALESCE(mappings->'descCol', mappings->'desc_col'),
     'amountCol',      COALESCE(mappings->'amountCol', mappings->'amount_col'),
     'debitCol',       COALESCE(mappings->'debitCol', mappings->'debit_col'),
     'creditCol',      COALESCE(mappings->'creditCol', mappings->'credit_col'),
     'invertAmount',   COALESCE(mappings->'invertAmount', mappings->'invert_amount'),
     'categoryCol',    COALESCE(mappings->'categoryCol', mappings->'category_col'),
     'subcategoryCol', COALESCE(mappings->'subcategoryCol', mappings->'subcategory_col'),
     'dateFormat',     COALESCE(mappings->'dateFormat', mappings->'date_format')
   ));

-- The old insert-only endpoint could create duplicate layouts. Keep the most
-- recently updated row before installing the tenant-scoped uniqueness rule.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, header_fingerprint
           ORDER BY updated_at DESC, id DESC
         ) AS position
    FROM public.static_profiles
)
DELETE FROM public.static_profiles p
 USING ranked r
 WHERE p.id = r.id AND r.position > 1;

ALTER TABLE public.static_profiles
  ALTER COLUMN header_fingerprint SET NOT NULL,
  ADD CONSTRAINT static_profiles_header_fingerprint_format
    CHECK (header_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT static_profiles_tenant_header_unique
    UNIQUE (tenant_id, header_fingerprint);

DO $$
DECLARE unprotected text; leaked text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO unprotected
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'Tables in public without RLS enabled: %', unprotected;
  END IF;

  SELECT string_agg(format('%s:%s/%s', grantee, table_name, privilege_type), ', ')
    INTO leaked
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN (
       SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     )
     AND (grantee = 'anon'
          OR (grantee IN ('authenticated', 'service_role')
              AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')));
  IF leaked IS NOT NULL THEN RAISE EXCEPTION 'Unexpected grants remain: %', leaked; END IF;
END $$;
