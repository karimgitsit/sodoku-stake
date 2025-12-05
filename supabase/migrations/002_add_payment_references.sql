-- =============================================================================
-- PAYMENT REFERENCES TABLE
-- =============================================================================
-- Stores payment references for secure payment verification
-- Following Worldcoin best practices: https://docs.world.org/mini-apps/commands/pay
--
-- Flow:
-- 1. Client requests payment initiation → Backend generates reference and stores here
-- 2. Client sends payment to World App with this reference
-- 3. Client sends transaction_id back → Backend verifies with Worldcoin API
-- 4. Backend updates status to 'completed' or 'failed'

CREATE TABLE IF NOT EXISTS payment_references (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference TEXT UNIQUE NOT NULL, -- UUID without dashes (32 chars)
  user_id TEXT NOT NULL, -- World ID nullifier hash (before user record created)
  type TEXT NOT NULL CHECK (type IN ('entry', 'reveal')),
  puzzle_date DATE NOT NULL,
  cell_row INTEGER CHECK (cell_row >= 0 AND cell_row <= 8),
  cell_col INTEGER CHECK (cell_col >= 0 AND cell_col <= 8),
  amount DECIMAL(10, 2) NOT NULL, -- Human-readable amount ($1.00 or $0.20)
  token_amount TEXT NOT NULL, -- Amount in smallest unit for MiniKit
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  transaction_id TEXT, -- Worldcoin transaction ID after payment
  error_message TEXT, -- Error message if failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour') -- References expire after 1 hour
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payment_references_reference ON payment_references(reference);
CREATE INDEX IF NOT EXISTS idx_payment_references_user_id ON payment_references(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_references_status ON payment_references(status);
CREATE INDEX IF NOT EXISTS idx_payment_references_created_at ON payment_references(created_at);

-- Index for cleanup queries (expired pending references)
CREATE INDEX IF NOT EXISTS idx_payment_references_expires_at ON payment_references(expires_at) 
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE payment_references ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Service role can read payment references" ON payment_references
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert payment references" ON payment_references
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update payment references" ON payment_references
  FOR UPDATE USING (true);

-- =============================================================================
-- CLEANUP FUNCTION
-- =============================================================================
-- Function to mark expired pending references as expired
-- Run this periodically (e.g., via cron job)

CREATE OR REPLACE FUNCTION cleanup_expired_payment_references()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE payment_references
  SET 
    status = 'expired',
    updated_at = NOW()
  WHERE 
    status = 'pending' 
    AND expires_at < NOW();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- USAGE NOTES
-- =============================================================================
-- 
-- For production, you should:
-- 1. Set up a cron job to call cleanup_expired_payment_references() periodically
-- 2. Consider adding foreign key to users table once user is created
-- 3. Add monitoring/alerting for failed payments
--
-- Example cron (via pg_cron or external scheduler):
-- SELECT cleanup_expired_payment_references();

