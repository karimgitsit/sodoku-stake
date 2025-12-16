-- =============================================================================
-- MIGRATION: Add Mistakes Tracking and Extra Life Feature
-- =============================================================================
-- This migration adds support for:
-- 1. Tracking mistakes per game entry (max 3 mistakes ends the attempt)
-- 2. Purchasing extra lives ($0.25 each) to continue playing
-- =============================================================================

-- Add mistakes tracking columns to game_entries
ALTER TABLE game_entries 
ADD COLUMN IF NOT EXISTS mistakes_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS extra_lives_purchased INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_mistakes INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS game_locked BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN game_entries.mistakes_count IS 'Number of incorrect cell entries made by user';
COMMENT ON COLUMN game_entries.extra_lives_purchased IS 'Number of $0.25 extra lives purchased';
COMMENT ON COLUMN game_entries.max_mistakes IS 'Current maximum allowed mistakes (3 + extra_lives_purchased)';
COMMENT ON COLUMN game_entries.game_locked IS 'Whether the game is locked due to exceeding mistakes';

-- =============================================================================
-- EXTRA LIFE TRANSACTIONS TABLE
-- =============================================================================
-- Tracks each $0.25 extra life purchase

CREATE TABLE IF NOT EXISTS extra_life_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_entry_id UUID NOT NULL REFERENCES game_entries(id) ON DELETE CASCADE,
  puzzle_date DATE NOT NULL,
  transaction_hash TEXT,
  amount DECIMAL(10, 2) DEFAULT 0.25,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_extra_life_transactions_user_id ON extra_life_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_extra_life_transactions_game_entry_id ON extra_life_transactions(game_entry_id);

-- Enable RLS
ALTER TABLE extra_life_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for extra_life_transactions
CREATE POLICY "Users can read own extra life transactions" ON extra_life_transactions
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert extra life transactions" ON extra_life_transactions
  FOR INSERT WITH CHECK (true);

-- =============================================================================
-- FUNCTION: Record mistake and check game lock
-- =============================================================================
-- Returns the updated mistake count and whether the game should be locked

CREATE OR REPLACE FUNCTION record_mistake(entry_id UUID)
RETURNS TABLE(new_mistakes_count INTEGER, is_game_locked BOOLEAN, max_allowed INTEGER) AS $$
DECLARE
  current_mistakes INTEGER;
  current_max INTEGER;
BEGIN
  -- Get current state
  SELECT mistakes_count, max_mistakes 
  INTO current_mistakes, current_max
  FROM game_entries 
  WHERE id = entry_id;
  
  -- Increment mistakes
  current_mistakes := COALESCE(current_mistakes, 0) + 1;
  
  -- Update the entry
  UPDATE game_entries SET
    mistakes_count = current_mistakes,
    game_locked = current_mistakes >= current_max,
    updated_at = NOW()
  WHERE id = entry_id;
  
  -- Return the new state
  RETURN QUERY SELECT current_mistakes, (current_mistakes >= current_max), current_max;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Add extra life
-- =============================================================================
-- Increases max_mistakes by 1 when user purchases an extra life

CREATE OR REPLACE FUNCTION add_extra_life(entry_id UUID)
RETURNS TABLE(new_max_mistakes INTEGER, is_unlocked BOOLEAN) AS $$
DECLARE
  current_max INTEGER;
  current_mistakes INTEGER;
BEGIN
  -- Get current state
  SELECT max_mistakes, mistakes_count
  INTO current_max, current_mistakes
  FROM game_entries 
  WHERE id = entry_id;
  
  -- Increment max and unlock game
  current_max := COALESCE(current_max, 3) + 1;
  
  -- Update the entry
  UPDATE game_entries SET
    max_mistakes = current_max,
    extra_lives_purchased = extra_lives_purchased + 1,
    game_locked = current_mistakes >= current_max,
    updated_at = NOW()
  WHERE id = entry_id;
  
  -- Return the new state
  RETURN QUERY SELECT current_max, (current_mistakes < current_max);
END;
$$ LANGUAGE plpgsql;


