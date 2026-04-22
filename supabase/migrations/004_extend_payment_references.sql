-- =============================================================================
-- MIGRATION: Extend payment_references for full payment-flow persistence
-- =============================================================================
-- Persisting payment references in the DB (instead of an in-memory Map in the
-- Node process) is what actually fixes the "paid but can't play" bug: in a
-- serverless deployment, the confirm request may land on a different instance
-- than the one that handled initiate, so the in-memory reference is missing
-- and entry creation never happens even though the on-chain transfer went
-- through.
-- =============================================================================

-- Allow the extra_life payment type (already accepted at the API layer).
ALTER TABLE payment_references
  DROP CONSTRAINT IF EXISTS payment_references_type_check;
ALTER TABLE payment_references
  ADD CONSTRAINT payment_references_type_check
  CHECK (type IN ('entry', 'reveal', 'extra_life'));

-- Columns needed by the existing PaymentReference shape in the API layer.
ALTER TABLE payment_references
  ADD COLUMN IF NOT EXISTS game_entry_id UUID,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Lookup by transaction_id powers the idempotent recovery path in /api/payment/confirm.
CREATE INDEX IF NOT EXISTS idx_payment_references_transaction_id
  ON payment_references(transaction_id)
  WHERE transaction_id IS NOT NULL;
