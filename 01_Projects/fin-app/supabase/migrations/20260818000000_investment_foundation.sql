-- Generic managed-investment foundation. Vanguard Personal Investor is the
-- first adapter, but no tenant row or calculation is keyed to a Vanguard name
-- or to VAN0111AU. Instruments/prices are global reference data; holdings,
-- activities and valuations remain tenant-owned.

ALTER TABLE public.accounts
  ADD COLUMN balance_source text NOT NULL DEFAULT 'manual'
    CHECK (balance_source IN ('manual', 'bank_provider', 'investment_valuation')),
  ADD COLUMN balance_as_of timestamptz;

UPDATE public.accounts a
   SET balance_source = 'bank_provider',
       balance_as_of = ac.balance_as_of
  FROM public.account_connections ac
 WHERE ac.account_id = a.id;

CREATE TABLE public.investment_instruments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  instrument_type     text NOT NULL CHECK (instrument_type IN ('managed_fund', 'etf', 'equity')),
  identifier_type     text NOT NULL CHECK (identifier_type IN ('APIR', 'ASX', 'ISIN')),
  identifier          text NOT NULL,
  currency            text NOT NULL DEFAULT 'AUD' CHECK (currency ~ '^[A-Z]{3}$'),
  price_provider      text NOT NULL,
  provider_product_id text,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identifier_type, identifier)
);

INSERT INTO public.investment_instruments
  (name, instrument_type, identifier_type, identifier, currency, price_provider, provider_product_id)
VALUES
  ('Vanguard High Growth Index Fund', 'managed_fund', 'APIR', 'VAN0111AU', 'AUD', 'vanguard_au', '8134');

CREATE TABLE public.investment_holdings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id              uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  instrument_id           uuid NOT NULL REFERENCES public.investment_instruments(id),
  platform                text NOT NULL,
  account_suffix          text CHECK (account_suffix IS NULL OR account_suffix ~ '^[0-9]{1,4}$'),
  reconciliation_status   text NOT NULL DEFAULT 'unconfirmed'
    CHECK (reconciliation_status IN ('unconfirmed', 'confirmed', 'adjusted')),
  confirmed_units         numeric(28,10),
  confirmed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, instrument_id)
);

CREATE TABLE public.investment_activities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id         uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  holding_id         uuid NOT NULL REFERENCES public.investment_holdings(id) ON DELETE CASCADE,
  instrument_id      uuid NOT NULL REFERENCES public.investment_instruments(id),
  trade_date         date NOT NULL,
  activity_type      text NOT NULL CHECK (activity_type IN (
    'purchase', 'redemption', 'distribution_reinvestment', 'cash_distribution',
    'fee', 'opening_units', 'unit_adjustment', 'cost_base_adjustment'
  )),
  quantity_delta     numeric(28,10) NOT NULL DEFAULT 0,
  unit_price         numeric(28,10),
  value_cents        bigint NOT NULL DEFAULT 0,
  brokerage_cents    bigint NOT NULL DEFAULT 0,
  source_label       text NOT NULL,
  source_adapter     text NOT NULL,
  source_version     integer NOT NULL DEFAULT 1,
  source_hash        text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  occurrence         integer NOT NULL DEFAULT 0 CHECK (occurrence >= 0),
  upload_batch_id    uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holding_id, source_hash, occurrence),
  CHECK (activity_type <> 'redemption' OR quantity_delta <= 0),
  CHECK (activity_type NOT IN ('purchase', 'distribution_reinvestment') OR quantity_delta >= 0)
);

CREATE TABLE public.instrument_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id  uuid NOT NULL REFERENCES public.investment_instruments(id) ON DELETE CASCADE,
  price_date     date NOT NULL,
  nav_price      numeric(28,10),
  buy_price      numeric(28,10),
  sell_price     numeric(28,10),
  currency       text NOT NULL DEFAULT 'AUD' CHECK (currency ~ '^[A-Z]{3}$'),
  status         text NOT NULL DEFAULT 'final' CHECK (status IN ('estimated', 'final', 'corrected')),
  source         text NOT NULL,
  source_version integer NOT NULL DEFAULT 1,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, price_date),
  CHECK (nav_price IS NOT NULL OR buy_price IS NOT NULL OR sell_price IS NOT NULL)
);

CREATE TABLE public.investment_account_valuations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id            uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  valuation_date        date NOT NULL,
  price_date            date NOT NULL,
  value_cents           bigint NOT NULL,
  nav_value_cents       bigint,
  units                 numeric(28,10) NOT NULL,
  external_flow_cents   bigint NOT NULL DEFAULT 0,
  distribution_cents    bigint NOT NULL DEFAULT 0,
  market_movement_cents bigint,
  status                text NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'stale', 'partial')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, valuation_date)
);

CREATE INDEX idx_investment_holdings_tenant_account ON public.investment_holdings (tenant_id, account_id);
CREATE INDEX idx_investment_activities_holding_date ON public.investment_activities (holding_id, trade_date);
CREATE INDEX idx_investment_activities_batch ON public.investment_activities (tenant_id, upload_batch_id);
CREATE INDEX idx_instrument_prices_instrument_date ON public.instrument_prices (instrument_id, price_date DESC);
CREATE INDEX idx_investment_valuations_account_date ON public.investment_account_valuations (account_id, valuation_date DESC);

CREATE TRIGGER handle_updated_at_investment_instruments
  BEFORE UPDATE ON public.investment_instruments
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER handle_updated_at_investment_holdings
  BEFORE UPDATE ON public.investment_holdings
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER handle_updated_at_investment_valuations
  BEFORE UPDATE ON public.investment_account_valuations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE VIEW public.investment_holding_summary
WITH (security_invoker = true) AS
SELECT
  h.id AS holding_id,
  h.tenant_id,
  h.account_id,
  h.instrument_id,
  h.platform,
  h.account_suffix,
  h.reconciliation_status,
  h.confirmed_units,
  i.name AS instrument_name,
  i.identifier,
  i.identifier_type,
  i.currency,
  COALESCE(sum(a.quantity_delta), 0::numeric) AS calculated_units,
  COALESCE(sum(CASE
    WHEN a.activity_type = 'purchase' THEN a.value_cents + a.brokerage_cents
    WHEN a.activity_type = 'redemption' THEN -abs(a.value_cents) + a.brokerage_cents
    ELSE 0 END), 0)::bigint AS net_external_contributions_cents,
  COALESCE(sum(CASE WHEN a.activity_type = 'distribution_reinvestment' THEN a.value_cents ELSE 0 END), 0)::bigint AS reinvested_distributions_cents,
  count(a.id)::integer AS activity_count,
  min(a.trade_date) AS first_activity_date,
  max(a.trade_date) AS last_activity_date,
  COALESCE(sum(CASE WHEN a.activity_type = 'cash_distribution' THEN a.value_cents ELSE 0 END), 0)::bigint AS cash_distributions_cents
FROM public.investment_holdings h
JOIN public.investment_instruments i ON i.id = h.instrument_id
LEFT JOIN public.investment_activities a ON a.holding_id = h.id
GROUP BY h.id, i.id;

ALTER TABLE public.investment_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_account_valuations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read investment instruments" ON public.investment_instruments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read instrument prices" ON public.instrument_prices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tenant members read investment holdings" ON public.investment_holdings
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write investment holdings" ON public.investment_holdings
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update investment holdings" ON public.investment_holdings
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete investment holdings" ON public.investment_holdings
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

CREATE POLICY "tenant members read investment activities" ON public.investment_activities
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write investment activities" ON public.investment_activities
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete investment activities" ON public.investment_activities
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

CREATE POLICY "tenant members read investment valuations" ON public.investment_account_valuations
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant members write investment valuations" ON public.investment_account_valuations
  FOR INSERT WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members update investment valuations" ON public.investment_account_valuations
  FOR UPDATE USING (public.has_tenant_role(tenant_id, 'member'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'member'));
CREATE POLICY "tenant members delete investment valuations" ON public.investment_account_valuations
  FOR DELETE USING (public.has_tenant_role(tenant_id, 'member'));

GRANT SELECT ON public.investment_instruments, public.instrument_prices,
  public.investment_holdings, public.investment_activities,
  public.investment_account_valuations, public.investment_holding_summary TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.investment_holdings, public.investment_activities,
  public.investment_account_valuations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_instruments, public.instrument_prices TO service_role;

REVOKE ALL ON public.investment_instruments, public.instrument_prices,
  public.investment_holdings, public.investment_activities,
  public.investment_account_valuations, public.investment_holding_summary FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.investment_instruments, public.instrument_prices,
  public.investment_holdings, public.investment_activities,
  public.investment_account_valuations FROM authenticated, service_role;

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
