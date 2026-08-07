-- ═══════════════════════════════════════════════════════════════════════
-- Ingestion engine: merchant categorisation cache + deduplication.
--
-- Two jobs:
--   1. merchant_rules — the cache that makes AI categorisation affordable.
--      Categorisation is keyed on the normalised MERCHANT, not the
--      transaction, so a 3000-row file asks about ~200 merchants once and
--      never again.
--   2. Deduplication — closes the worst defect in the old pipeline, where
--      re-importing a file doubled the ledger while the balance-anchor row
--      recalculated to keep the displayed balance looking correct.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Merchant → category cache ──────────────────────────────────────────

CREATE TABLE public.merchant_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  merchant_key     text NOT NULL,      -- normalizeMerchant().key
  merchant_display text NOT NULL,
  category         text NOT NULL,
  subcategory      text,
  -- Precedence, highest first: user > bank > ai > seed. A human correction
  -- must outrank a model guess permanently, or the next import silently
  -- reverts the fix and the user stops trusting the feature.
  source           text NOT NULL CHECK (source IN ('user', 'bank', 'ai', 'seed')),
  confidence       real,
  hit_count        int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, merchant_key)
);

CREATE INDEX idx_merchant_rules_lookup ON public.merchant_rules (tenant_id, merchant_key);

CREATE TRIGGER handle_updated_at_merchant_rules
  BEFORE UPDATE ON public.merchant_rules
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read merchant_rules" ON public.merchant_rules
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write merchant_rules" ON public.merchant_rules
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update merchant_rules" ON public.merchant_rules
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete merchant_rules" ON public.merchant_rules
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

-- ── Deduplication + review state on transactions ───────────────────────

ALTER TABLE public.transactions
  ADD COLUMN dedupe_hash     bytea,
  -- Ordinal within an identical (account, date, amount, description) group.
  -- Without it, two genuinely separate $4.50 coffees bought at the same shop
  -- on the same day collide and one is discarded as a false duplicate.
  ADD COLUMN occurrence      int NOT NULL DEFAULT 0,
  ADD COLUMN needs_review    boolean NOT NULL DEFAULT false,
  ADD COLUMN category_source text CHECK (category_source IN ('user', 'bank', 'ai', 'seed'));

-- Deliberately NOT a partial index. Two reasons:
--
--  1. PostgREST's `onConflict` can only name columns, so it cannot infer a
--     partial index — an ON CONFLICT against one fails with 42P10.
--  2. The predicate is unnecessary: Postgres treats NULLs as distinct in a
--     unique index (NULLS DISTINCT is the default), so the rows predating
--     this migration, which all carry a NULL dedupe_hash, never collide with
--     each other or with anything else.
CREATE UNIQUE INDEX idx_transactions_dedupe
  ON public.transactions (account_id, dedupe_hash, occurrence);

CREATE INDEX idx_transactions_needs_review
  ON public.transactions (tenant_id) WHERE needs_review;

-- Note on occurrence semantics: the ordinal is assigned WITHIN AN IMPORT
-- BATCH, always starting at 0 — never continued from the count already in the
-- account. Continuing from the existing count would mean a re-import lands on
-- ordinals 1, 2, 3… and never collides, which defeats the entire mechanism.
-- Counting from 0 makes the same file reproduce the same pairs, so a
-- re-import conflicts on every row. See supabase/functions/upsert-transactions.

-- ── Apply a user rule to existing rows ─────────────────────────────────
--
-- Backs "apply to all transactions from this merchant". Runs as the caller so
-- RLS confines the update to their own tenant.
CREATE OR REPLACE FUNCTION public.apply_merchant_rule(
  p_tenant_id    uuid,
  p_merchant_key text,
  p_category     text,
  p_subcategory  text
)
RETURNS int
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.transactions t
     SET category        = p_category,
         subcategory     = p_subcategory,
         category_source = 'user',
         needs_review    = false
   WHERE t.tenant_id = p_tenant_id
     AND lower(t.merchant) = lower(p_merchant_key);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_merchant_rule(uuid, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_merchant_rule(uuid, text, text, text) FROM anon;

-- ── Grants ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_rules TO service_role;

-- Mirrors the auth migration: TRUNCATE is not filtered by RLS, so no role
-- that goes through PostgREST may hold it.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.merchant_rules
  FROM anon, authenticated, service_role;
REVOKE ALL ON public.merchant_rules FROM anon;

-- ── Assertions (same guards the auth migration installs) ───────────────

DO $$
DECLARE
  unprotected text;
  leaked      text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO unprotected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'Tables in public without RLS enabled: %', unprotected;
  END IF;

  SELECT string_agg(format('%s:%s/%s', grantee, table_name, privilege_type), ', ')
    INTO leaked
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND (grantee = 'anon'
          OR (grantee IN ('authenticated', 'service_role')
              AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')));
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected grants remain: %', leaked;
  END IF;
END $$;
