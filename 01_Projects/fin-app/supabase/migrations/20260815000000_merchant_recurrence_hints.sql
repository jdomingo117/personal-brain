-- ═══════════════════════════════════════════════════════════════════════
-- Recurring Hub Phase 2: AI early-detection cache.
--
-- The deterministic detector (app/src/lib/recurring.ts) needs >= 3 charges
-- from one merchant before it can call anything "recurring" — a brand-new
-- subscription is invisible for two full billing cycles. This table caches
-- a per-merchant Gemini classification ("does this look like a subscription
-- archetype") so a 1-2-observation merchant can surface as a low-confidence
-- candidate, kept strictly separate from confirmed series (see Recurring
-- .candidates in recurring.ts — never merged into monthlyCommitment/
-- annualBurn/pressure).
--
-- Mirrors merchant_rules' shape/RLS/grant pattern exactly (see
-- 20260804010000_ingestion_engine.sql) — same cache discipline, same
-- tenant-scoped identity, same reasoning for why an upsert never overwrites.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.merchant_recurrence_hints (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  merchant_key      text NOT NULL,      -- normalizeMerchant().key — same identity as merchant_rules
  merchant_display  text NOT NULL,
  is_recurring      boolean NOT NULL,
  -- Matches app/src/lib/cadence.ts's Cadence union exactly — the client reads
  -- this straight into that type with no translation step.
  suggested_cadence text CHECK (suggested_cadence IN ('Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annual')),
  confidence        real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  -- Only 'ai' today, but a text CHECK (not a bare boolean) mirrors
  -- merchant_rules' source column shape in case a future non-AI heuristic
  -- ever wants to write this same cache.
  source            text NOT NULL DEFAULT 'ai' CHECK (source = 'ai'),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, merchant_key)
);

CREATE INDEX idx_merchant_recurrence_hints_lookup ON public.merchant_recurrence_hints (tenant_id, merchant_key);

CREATE TRIGGER handle_updated_at_merchant_recurrence_hints
  BEFORE UPDATE ON public.merchant_recurrence_hints
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.merchant_recurrence_hints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read merchant_recurrence_hints" ON public.merchant_recurrence_hints
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write merchant_recurrence_hints" ON public.merchant_recurrence_hints
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update merchant_recurrence_hints" ON public.merchant_recurrence_hints
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete merchant_recurrence_hints" ON public.merchant_recurrence_hints
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

-- ── Grants ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_recurrence_hints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_recurrence_hints TO service_role;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.merchant_recurrence_hints
  FROM anon, authenticated, service_role;
REVOKE ALL ON public.merchant_recurrence_hints FROM anon;

-- ── Assertions (same guards every migration in this repo installs) ─────

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
