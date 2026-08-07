-- ═══════════════════════════════════════════════════════════════════════
-- matchTransfers() already computes overflowedAmounts (an abs-amount bucket
-- with more than MAX_BUCKET same-value legs — skipped entirely rather than
-- scored, per the O(N) bound in match.ts/transferMatch.ts) and it already
-- reaches the audit log via link-transfers's ctx.audit call. It just never
-- reaches the user: a skipped bucket was a silent gap. This table lets
-- runLinkTransfers persist what it skipped so OskoLinker can say so.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.transfer_match_overflow (
  tenant_id    uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount_cents bigint  NOT NULL,
  leg_count    int     NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, amount_cents)
);

ALTER TABLE public.transfer_match_overflow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read transfer_match_overflow" ON public.transfer_match_overflow
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write transfer_match_overflow" ON public.transfer_match_overflow
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update transfer_match_overflow" ON public.transfer_match_overflow
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
          WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete transfer_match_overflow" ON public.transfer_match_overflow
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_match_overflow TO authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.transfer_match_overflow
  FROM anon, authenticated, service_role;
REVOKE ALL ON public.transfer_match_overflow FROM anon;

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
