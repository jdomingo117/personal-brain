-- M0 experiment only. Never a migration or a model of all production constraints.
-- Executed only in the runner's new, networkless, ephemeral PostgreSQL container.
CREATE TABLE public.transactions (
  id text PRIMARY KEY, tenant_id text NOT NULL, account_id text NOT NULL,
  date date NOT NULL, amount integer NOT NULL, kind text NOT NULL,
  kind_source text NOT NULL, pending boolean NOT NULL,
  dedupe_hash text NOT NULL, occurrence integer NOT NULL DEFAULT 0,
  transfer_candidate boolean NOT NULL DEFAULT false
);
CREATE TABLE public.transfer_links (id text, from_txn_id text, to_txn_id text, state text);
CREATE INDEX ON public.transfer_links(from_txn_id);
CREATE INDEX ON public.transfer_links(to_txn_id);
CREATE TABLE public.investment_cash_links (id text, transaction_id text, state text);
CREATE INDEX ON public.investment_cash_links(transaction_id);
CREATE TABLE public.transfer_decisions (
  tenant_id text, from_account_id text, from_hash text, from_occurrence integer,
  to_account_id text, to_hash text, to_occurrence integer, verdict text, decided_at timestamptz
);
CREATE TABLE public.investment_cash_decisions (
  tenant_id text, transaction_account_id text, transaction_hash text,
  transaction_occurrence integer, verdict text, decided_at timestamptz
);
-- Equivalent lookup shapes already present in the migration chain (not new proposals).
CREATE INDEX ON public.transfer_decisions(tenant_id,from_account_id,from_hash,from_occurrence);
CREATE INDEX ON public.transfer_decisions(tenant_id,to_account_id,to_hash,to_occurrence);
CREATE INDEX ON public.investment_cash_decisions(tenant_id,transaction_account_id,transaction_hash,transaction_occurrence,decided_at DESC);
CREATE TABLE public.transaction_allocations (
  id text PRIMARY KEY, tenant_id text, transaction_id text, amount integer,
  kind text, category_id text, subcategory_id text, custom_subcategory_id text
);
CREATE INDEX ON public.transaction_allocations(tenant_id,transaction_id);
CREATE TABLE public.coverage (
  account_id text, start_date date, end_date date,
  provenance text, revoked boolean DEFAULT false
);

-- A transactional invalidation-gate experiment, not production trigger DDL.
CREATE TABLE public.source_gate (tenant_id text PRIMARY KEY, revision bigint NOT NULL);
INSERT INTO public.source_gate VALUES ('A',0);
CREATE TABLE public.source_probe (id integer PRIMARY KEY, amount integer);
INSERT INTO public.source_probe VALUES (1,100);
CREATE FUNCTION public.bump_probe_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.source_gate SET revision=revision+1 WHERE tenant_id='A';
  RETURN NULL;
END $$;
CREATE TRIGGER source_probe_changed AFTER INSERT OR UPDATE OR DELETE ON public.source_probe
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_probe_revision();
