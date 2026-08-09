-- Set-based investment valuation engine. Rebuilds all affected daily account
-- snapshots from activities + the global price catalogue; no per-user price
-- fetch and no browser-side reductions.

CREATE TABLE public.investment_price_sync_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id   uuid REFERENCES public.investment_instruments(id) ON DELETE CASCADE,
  provider        text NOT NULL,
  trigger         text NOT NULL CHECK (trigger IN ('manual', 'stale', 'scheduled')),
  status          text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  prices_seen     integer NOT NULL DEFAULT 0,
  prices_written  integer NOT NULL DEFAULT 0,
  newest_price_at date,
  error_code      text
);

ALTER TABLE public.investment_price_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read investment price sync runs" ON public.investment_price_sync_runs
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.investment_price_sync_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_price_sync_runs TO service_role;
REVOKE ALL ON public.investment_price_sync_runs FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.investment_price_sync_runs FROM authenticated, service_role;

CREATE INDEX idx_investment_price_sync_runs_instrument_started
  ON public.investment_price_sync_runs (instrument_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.rebuild_investment_valuations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE rebuilt integer;
BEGIN
  DELETE FROM public.investment_account_valuations v
   WHERE EXISTS (SELECT 1 FROM public.investment_holdings h WHERE h.account_id = v.account_id);

  WITH relevant_dates AS (
    SELECT DISTINCT h.account_id, p.price_date AS valuation_date
      FROM public.investment_holdings h
      JOIN public.instrument_prices p ON p.instrument_id = h.instrument_id
     WHERE EXISTS (
       SELECT 1 FROM public.investment_activities a
        WHERE a.holding_id = h.id AND a.trade_date <= p.price_date
     )
  ),
  holding_daily AS (
    SELECT
      d.account_id,
      h.tenant_id,
      d.valuation_date,
      h.id AS holding_id,
      COALESCE((SELECT sum(a.quantity_delta) FROM public.investment_activities a
                 WHERE a.holding_id = h.id AND a.trade_date <= d.valuation_date), 0::numeric) AS units,
      price.price_date,
      price.nav_price,
      COALESCE((SELECT sum(CASE
        WHEN a.activity_type = 'purchase' THEN a.value_cents + a.brokerage_cents
        WHEN a.activity_type = 'redemption' THEN -abs(a.value_cents) + a.brokerage_cents
        ELSE 0 END)
        FROM public.investment_activities a
        WHERE a.holding_id = h.id AND a.trade_date = d.valuation_date), 0)::bigint AS external_flow_cents,
      COALESCE((SELECT sum(a.value_cents) FROM public.investment_activities a
        WHERE a.holding_id = h.id AND a.trade_date = d.valuation_date
          AND a.activity_type IN ('distribution_reinvestment', 'cash_distribution')), 0)::bigint AS distribution_cents
    FROM relevant_dates d
    JOIN public.investment_holdings h ON h.account_id = d.account_id
    JOIN LATERAL (
      SELECT p.price_date, p.nav_price
        FROM public.instrument_prices p
       WHERE p.instrument_id = h.instrument_id
         AND p.price_date <= d.valuation_date
         AND p.nav_price IS NOT NULL
       ORDER BY p.price_date DESC LIMIT 1
    ) price ON true
  ),
  account_daily AS (
    SELECT
      tenant_id, account_id, valuation_date, max(price_date) AS price_date,
      round(sum(units * nav_price) * 100)::bigint AS value_cents,
      round(sum(units * nav_price) * 100)::bigint AS nav_value_cents,
      sum(units) AS units,
      sum(external_flow_cents)::bigint AS external_flow_cents,
      sum(distribution_cents)::bigint AS distribution_cents
    FROM holding_daily
    GROUP BY tenant_id, account_id, valuation_date
  ),
  with_movement AS (
    SELECT d.*,
      CASE WHEN lag(value_cents) OVER (PARTITION BY account_id ORDER BY valuation_date) IS NULL THEN NULL
           ELSE value_cents
              - lag(value_cents) OVER (PARTITION BY account_id ORDER BY valuation_date)
              - external_flow_cents
      END AS market_movement_cents
    FROM account_daily d
  ), inserted AS (
    INSERT INTO public.investment_account_valuations
      (tenant_id, account_id, valuation_date, price_date, value_cents, nav_value_cents,
       units, external_flow_cents, distribution_cents, market_movement_cents, status)
    SELECT tenant_id, account_id, valuation_date, price_date, value_cents, nav_value_cents,
      units, external_flow_cents, distribution_cents, market_movement_cents,
      CASE WHEN price_date < valuation_date - 4 THEN 'stale' ELSE 'current' END
    FROM with_movement
    RETURNING 1
  ) SELECT count(*) INTO rebuilt FROM inserted;

  UPDATE public.accounts a
     SET balance = latest.value_cents,
         balance_source = 'investment_valuation',
         balance_as_of = latest.price_date::timestamptz,
         updated_at = now()
    FROM (
      SELECT DISTINCT ON (account_id) account_id, value_cents, price_date
        FROM public.investment_account_valuations
       ORDER BY account_id, valuation_date DESC
    ) latest
   WHERE a.id = latest.account_id;

  RETURN rebuilt;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_investment_valuations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_investment_valuations() TO service_role;

CREATE VIEW public.investment_account_overview
WITH (security_invoker = true) AS
SELECT
  s.*,
  latest.valuation_date,
  latest.price_date,
  latest.value_cents,
  latest.nav_value_cents,
  latest.market_movement_cents,
  latest.status AS valuation_status,
  p.nav_price,
  p.buy_price,
  p.sell_price
FROM public.investment_holding_summary s
LEFT JOIN LATERAL (
  SELECT v.* FROM public.investment_account_valuations v
   WHERE v.account_id = s.account_id ORDER BY v.valuation_date DESC LIMIT 1
) latest ON true
LEFT JOIN public.instrument_prices p
  ON p.instrument_id = s.instrument_id AND p.price_date = latest.price_date;

GRANT SELECT ON public.investment_account_overview TO authenticated;
REVOKE ALL ON public.investment_account_overview FROM anon;

DO $$
DECLARE bad_tables text; bad_views text;
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
END $$;
