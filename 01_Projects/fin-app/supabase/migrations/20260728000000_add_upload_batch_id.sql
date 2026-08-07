-- Add upload_batch_id to transactions table
ALTER TABLE public.transactions
ADD COLUMN upload_batch_id uuid;

-- Add index for fast querying when undoing uploads
CREATE INDEX idx_transactions_upload_batch_id ON public.transactions(upload_batch_id);
