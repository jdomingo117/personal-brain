-- Activity imports affect one account, whereas a new provider price can
-- affect every account holding an instrument. Give imports a scoped rebuild
-- so a genuine new row is reflected immediately without fetching the
-- provider or rebuilding every tenant. A zero-row duplicate never calls it.

CREATE FUNCTION public.rebuild_investment_account_valuations(p_account_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE rebuilt integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.investment_holdings h WHERE h.account_id = p_account_id
  ) THEN
    RETURN 0;
  END IF;

  DELETE FROM public.investment_account_valuations v
   WHERE v.account_id = p_account_id;

  WITH relevant_dates AS (
    SELECT DISTINCT h.account_id, p.price_date AS valuation_date
      FROM public.investment_holdings h
      JOIN public.instrument_prices p ON p.instrument_id = h.instrument_id
     WHERE h.account_id = p_account_id
       AND EXISTS (SELECT 1 FROM public.investment_activities a
                    WHERE a.holding_id = h.id AND a.trade_date <= p.price_date)
  ), holding_daily AS (
    SELECT d.account_id, h.tenant_id, d.valuation_date, h.id AS holding_id,
      COALESCE((SELECT sum(a.quantity_delta) FROM public.investment_activities a
                 WHERE a.holding_id = h.id AND a.trade_date <= d.valuation_date), 0::numeric) AS units,
      price.price_date, price.nav_price,
      COALESCE((SELECT sum(CASE
        WHEN a.activity_type = 'purchase' THEN a.value_cents + a.brokerage_cents
        WHEN a.activity_type = 'redemption' THEN -abs(a.value_cents) + a.brokerage_cents
        ELSE 0 END) FROM public.investment_activities a
        WHERE a.holding_id = h.id AND a.trade_date = d.valuation_date), 0)::bigint AS external_flow_cents,
      COALESCE((SELECT sum(a.value_cents) FROM public.investment_activities a
        WHERE a.holding_id = h.id AND a.trade_date = d.valuation_date
          AND a.activity_type IN ('distribution_reinvestment', 'cash_distribution')), 0)::bigint AS distribution_cents
    FROM relevant_dates d
    JOIN public.investment_holdings h ON h.account_id = d.account_id
    JOIN LATERAL (
      SELECT p.price_date, p.nav_price FROM public.instrument_prices p
       WHERE p.instrument_id = h.instrument_id AND p.price_date <= d.valuation_date
         AND p.nav_price IS NOT NULL ORDER BY p.price_date DESC LIMIT 1
    ) price ON true
  ), account_daily AS (
    SELECT tenant_id, account_id, valuation_date, max(price_date) AS price_date,
      round(sum(units * nav_price) * 100)::bigint AS value_cents,
      round(sum(units * nav_price) * 100)::bigint AS nav_value_cents,
      sum(units) AS units, sum(external_flow_cents)::bigint AS external_flow_cents,
      sum(distribution_cents)::bigint AS distribution_cents
    FROM holding_daily GROUP BY tenant_id, account_id, valuation_date
  ), with_movement AS (
    SELECT d.*, CASE WHEN lag(value_cents) OVER (PARTITION BY account_id ORDER BY valuation_date) IS NULL THEN NULL
      ELSE value_cents - lag(value_cents) OVER (PARTITION BY account_id ORDER BY valuation_date) - external_flow_cents
      END AS market_movement_cents
    FROM account_daily d
  ), inserted AS (
    INSERT INTO public.investment_account_valuations
      (tenant_id, account_id, valuation_date, price_date, value_cents, nav_value_cents,
       units, external_flow_cents, distribution_cents, market_movement_cents, status)
    SELECT tenant_id, account_id, valuation_date, price_date, value_cents, nav_value_cents,
      units, external_flow_cents, distribution_cents, market_movement_cents,
      CASE WHEN price_date < valuation_date - 4 THEN 'stale' ELSE 'current' END
    FROM with_movement RETURNING 1
  ) SELECT count(*) INTO rebuilt FROM inserted;

  UPDATE public.accounts a SET balance = latest.value_cents,
      balance_source = 'investment_valuation', balance_as_of = latest.price_date::timestamptz,
      updated_at = now()
    FROM (SELECT value_cents, price_date
            FROM public.investment_account_valuations
           WHERE account_id = p_account_id ORDER BY valuation_date DESC LIMIT 1) latest
   WHERE a.id = p_account_id;

  RETURN rebuilt;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_investment_account_valuations(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_investment_account_valuations(uuid) TO service_role;

-- Keep the provider-sync entry point, but compose it from the scoped function
-- so there is one valuation formula rather than two implementations that can
-- drift apart.
CREATE OR REPLACE FUNCTION public.rebuild_investment_valuations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_account uuid;
  account_rebuilt integer;
  rebuilt integer := 0;
BEGIN
  FOR target_account IN
    SELECT DISTINCT h.account_id FROM public.investment_holdings h
  LOOP
    account_rebuilt := public.rebuild_investment_account_valuations(target_account);
    rebuilt := rebuilt + account_rebuilt;
  END LOOP;
  RETURN rebuilt;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_investment_valuations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_investment_valuations() TO service_role;
