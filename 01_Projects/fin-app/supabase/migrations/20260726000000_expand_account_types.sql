ALTER TYPE account_type ADD VALUE 'Credit Card';
ALTER TYPE account_type ADD VALUE 'Loan';
ALTER TABLE public.accounts ADD COLUMN credit_limit integer;
