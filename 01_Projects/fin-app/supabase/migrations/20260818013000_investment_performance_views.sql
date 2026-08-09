CREATE OR REPLACE VIEW public.investment_holding_summary
WITH (security_invoker = true) AS
SELECT h.id AS holding_id, h.tenant_id, h.account_id, h.instrument_id, h.platform,
  h.account_suffix, h.reconciliation_status, h.confirmed_units,
  i.name AS instrument_name, i.identifier, i.identifier_type, i.currency,
  COALESCE(sum(a.quantity_delta), 0::numeric) AS calculated_units,
  COALESCE(sum(CASE
    WHEN a.activity_type = 'purchase' THEN a.value_cents + a.brokerage_cents
    WHEN a.activity_type = 'redemption' THEN -abs(a.value_cents) + a.brokerage_cents
    ELSE 0 END), 0)::bigint AS net_external_contributions_cents,
  COALESCE(sum(CASE WHEN a.activity_type = 'distribution_reinvestment' THEN a.value_cents ELSE 0 END), 0)::bigint AS reinvested_distributions_cents,
  count(a.id)::integer AS activity_count, min(a.trade_date) AS first_activity_date,
  max(a.trade_date) AS last_activity_date,
  COALESCE(sum(CASE WHEN a.activity_type = 'cash_distribution' THEN a.value_cents ELSE 0 END), 0)::bigint AS cash_distributions_cents
FROM public.investment_holdings h
JOIN public.investment_instruments i ON i.id = h.instrument_id
LEFT JOIN public.investment_activities a ON a.holding_id = h.id
GROUP BY h.id, i.id;

-- The foundation originally exposed the summary through s.*. Drop this
-- dependent view before rebuilding it with an explicit stable column order;
-- PostgreSQL does not permit CREATE OR REPLACE VIEW to reorder columns.
DROP VIEW public.investment_account_overview;

CREATE VIEW public.investment_account_overview
WITH (security_invoker = true) AS
SELECT s.holding_id, s.tenant_id, s.account_id, s.instrument_id, s.platform,
  s.account_suffix, s.reconciliation_status, s.confirmed_units,
  s.instrument_name, s.identifier, s.identifier_type, s.currency,
  s.calculated_units, s.net_external_contributions_cents,
  s.reinvested_distributions_cents, s.activity_count, s.first_activity_date,
  s.last_activity_date,
  latest.valuation_date, latest.price_date, latest.value_cents,
  latest.nav_value_cents, latest.market_movement_cents,
  latest.status AS valuation_status, p.nav_price, p.buy_price, p.sell_price,
  s.cash_distributions_cents
FROM public.investment_holding_summary s
LEFT JOIN LATERAL (
  SELECT v.* FROM public.investment_account_valuations v
   WHERE v.account_id = s.account_id ORDER BY v.valuation_date DESC LIMIT 1
) latest ON true
LEFT JOIN public.instrument_prices p
  ON p.instrument_id = s.instrument_id AND p.price_date = latest.price_date;

CREATE VIEW public.investment_account_monthly
WITH (security_invoker = true) AS
WITH running AS (
  SELECT v.*,
    sum(v.external_flow_cents) OVER (PARTITION BY v.account_id ORDER BY v.valuation_date) AS cumulative_contributions_cents
  FROM public.investment_account_valuations v
), latest_month AS (
  SELECT DISTINCT ON (account_id, date_trunc('month', valuation_date::timestamp))
    tenant_id, account_id, valuation_date, value_cents, cumulative_contributions_cents,
    market_movement_cents, status
  FROM running
  ORDER BY account_id, date_trunc('month', valuation_date::timestamp), valuation_date DESC
)
SELECT * FROM latest_month;

GRANT SELECT ON public.investment_holding_summary, public.investment_account_overview,
  public.investment_account_monthly TO authenticated;
REVOKE ALL ON public.investment_holding_summary, public.investment_account_overview,
  public.investment_account_monthly FROM anon;
