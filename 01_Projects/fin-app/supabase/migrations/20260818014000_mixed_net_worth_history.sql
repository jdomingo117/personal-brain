-- One tenant-safe monthly series combining reconstructed cash balances with
-- actual investment valuation snapshots. Investment contributions therefore
-- move cash into an asset without masquerading as a gain or a net-worth loss.
CREATE VIEW public.net_worth_monthly
WITH (security_invoker = true) AS
WITH months AS (
  SELECT generate_series(
    date_trunc('month', current_date)::date - interval '23 months',
    date_trunc('month', current_date)::date,
    interval '1 month'
  )::date AS month
), account_months AS (
  SELECT a.tenant_id, a.id AS account_id, a.balance_source, a.balance, m.month,
    (m.month + interval '1 month - 1 day')::date AS month_end
  FROM public.accounts a CROSS JOIN months m
), values_by_account AS (
  SELECT am.tenant_id, am.account_id, am.month,
    CASE WHEN am.balance_source = 'investment_valuation' THEN
      COALESCE((SELECT v.value_cents FROM public.investment_account_valuations v
        WHERE v.account_id = am.account_id
          AND v.valuation_date <= LEAST(am.month_end, current_date)
        ORDER BY v.valuation_date DESC LIMIT 1), 0)
    ELSE am.balance - COALESCE((SELECT sum(t.amount) FROM public.transactions t
      WHERE t.account_id = am.account_id AND NOT t.pending
        AND t.date > LEAST(am.month_end, current_date)), 0)
    END::bigint AS value_cents
  FROM account_months am
)
SELECT tenant_id, month, sum(value_cents)::bigint AS value_cents
FROM values_by_account GROUP BY tenant_id, month;

GRANT SELECT ON public.net_worth_monthly TO authenticated;
REVOKE ALL ON public.net_worth_monthly FROM anon;

