-- All callers now use the metadata-aware signature. Removing the old overload
-- prevents a direct RPC caller from bypassing durable upload-batch recording.
DROP FUNCTION public.import_transactions_atomic(uuid, uuid, jsonb, uuid, integer);
