-- Tax-awareness records are deliberately not a tax engine. They preserve a
-- user's AMMA statement workflow and expose auditable Australian financial-
-- year activity totals without attempting to calculate taxable income, CGT,
-- cost-base adjustments or tax liability.

CREATE TABLE public.investment_tax_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  financial_year  integer NOT NULL CHECK (financial_year BETWEEN 2000 AND 2200),
  amma_status     text NOT NULL DEFAULT 'awaiting'
    CHECK (amma_status IN ('awaiting', 'received', 'reviewed', 'not_required')),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, financial_year)
);

CREATE INDEX idx_investment_tax_records_tenant_year
  ON public.investment_tax_records (tenant_id, financial_year DESC);

CREATE TRIGGER handle_updated_at_investment_tax_records
  BEFORE UPDATE ON public.investment_tax_records
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.investment_tax_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read investment tax records" ON public.investment_tax_records
  FOR SELECT USING (public.is_tenant_member(tenant_id));

-- Writes are service-role only and are performed by the validated
-- update-investment-tax-record Edge Function. This prevents browser clients
-- from bypassing the app's validation and audit boundary.
GRANT SELECT ON public.investment_tax_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_tax_records TO service_role;
REVOKE ALL ON public.investment_tax_records FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.investment_tax_records FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.investment_tax_records FROM service_role;

CREATE VIEW public.investment_financial_year_summary
WITH (security_invoker = true) AS
SELECT
  a.tenant_id,
  a.account_id,
  CASE WHEN extract(month FROM a.trade_date) >= 7
    THEN extract(year FROM a.trade_date)::integer + 1
    ELSE extract(year FROM a.trade_date)::integer
  END AS financial_year,
  min(a.trade_date) AS first_activity_date,
  max(a.trade_date) AS last_activity_date,
  count(*)::integer AS activity_count,
  count(*) FILTER (WHERE a.activity_type = 'redemption')::integer AS disposal_count,
  COALESCE(sum(a.value_cents) FILTER (WHERE a.activity_type = 'purchase'), 0)::bigint
    AS purchases_cents,
  COALESCE(sum(abs(a.value_cents)) FILTER (WHERE a.activity_type = 'redemption'), 0)::bigint
    AS redemptions_cents,
  COALESCE(sum(a.value_cents) FILTER (WHERE a.activity_type = 'distribution_reinvestment'), 0)::bigint
    AS reinvested_distributions_cents,
  COALESCE(sum(a.value_cents) FILTER (WHERE a.activity_type = 'cash_distribution'), 0)::bigint
    AS cash_distributions_cents,
  COALESCE(sum(a.value_cents) FILTER (WHERE a.activity_type = 'fee'), 0)::bigint
    AS fees_cents,
  COALESCE(sum(a.brokerage_cents), 0)::bigint AS brokerage_cents
FROM public.investment_activities a
GROUP BY a.tenant_id, a.account_id,
  CASE WHEN extract(month FROM a.trade_date) >= 7
    THEN extract(year FROM a.trade_date)::integer + 1
    ELSE extract(year FROM a.trade_date)::integer
  END;

GRANT SELECT ON public.investment_financial_year_summary TO authenticated;
REVOKE ALL ON public.investment_financial_year_summary FROM anon;

DO $$
DECLARE bad_tables text; bad_views text; anon_grants text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF bad_tables IS NOT NULL THEN RAISE EXCEPTION 'public tables without RLS: %', bad_tables; END IF;

  SELECT string_agg(c.relname, ', ') INTO bad_views
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND COALESCE(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%';
  IF bad_views IS NOT NULL THEN RAISE EXCEPTION 'public views without security_invoker: %', bad_views; END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ') INTO anon_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'anon';
  IF anon_grants IS NOT NULL THEN RAISE EXCEPTION 'anon grants remain: %', anon_grants; END IF;
END $$;
