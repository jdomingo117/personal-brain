-- At most one provider fetch/revaluation per instrument at a time. A crashed
-- run is expired by the Edge Function after five minutes before retrying.
CREATE UNIQUE INDEX uq_investment_price_sync_running
  ON public.investment_price_sync_runs (instrument_id)
  WHERE status = 'running';

