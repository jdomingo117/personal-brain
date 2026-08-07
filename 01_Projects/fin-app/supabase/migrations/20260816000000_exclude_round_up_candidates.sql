-- ═══════════════════════════════════════════════════════════════════════
-- Round Up sweep rows never belong in the transfer-review queue.
--
-- Up's round-up-to-savings feature always writes original_description
-- exactly as "Round Up" — a structurally one-sided transaction with no
-- counterpart to ever pair against. isTransferCandidateText() (both
-- _shared/transferMatch.ts and app/src/lib/transfers/classify.ts) now
-- excludes it going forward; this backfills the rows already flagged
-- transfer_candidate=true from before that fix, so today's backlog clears
-- too, not just future ingests.
--
-- Safe by construction: this only flips transfer_candidate, which
-- transactions_analytic uses solely to compute transfer_state (the review
-- queue). is_transfer — the column that actually gates income/expense
-- analytics — is untouched, and stays true for these rows via
-- category='Transfer' regardless. None of these rows have ever appeared in
-- transfer_links (confirmed against production data before writing this
-- migration), so there is nothing to unwind on that side.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE public.transactions
   SET transfer_candidate = false
 WHERE transfer_candidate = true
   AND original_description = 'Round Up';
