-- Repair accounts affected by the original duplicate-import path, which
-- cleared the cached balance/date without deleting the authoritative
-- valuation snapshots. Only valuation-owned accounts with an existing latest
-- snapshot are touched; activities, prices and snapshots remain unchanged.
UPDATE public.accounts a
   SET balance = latest.value_cents,
       balance_as_of = latest.price_date::timestamptz,
       updated_at = now()
  FROM (
    SELECT DISTINCT ON (v.account_id)
      v.account_id, v.value_cents, v.price_date
    FROM public.investment_account_valuations v
    ORDER BY v.account_id, v.valuation_date DESC
  ) latest
 WHERE a.id = latest.account_id
   AND a.balance_source = 'investment_valuation'
   AND (a.balance IS DISTINCT FROM latest.value_cents
     OR a.balance_as_of IS DISTINCT FROM latest.price_date::timestamptz);
