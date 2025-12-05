-- =============================================================================
-- SODOKU STAKE DATABASE SCHEMA
-- =============================================================================
-- Run this in your Supabase SQL Editor to create all tables
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS TABLE
-- =============================================================================
-- Stores user profiles linked to World ID

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  world_id_hash TEXT UNIQUE NOT NULL, -- World ID nullifier hash (unique per human)
  username TEXT, -- Display name from World App
  wallet_address TEXT, -- For prize distribution
  referral_code TEXT UNIQUE DEFAULT SUBSTRING(MD5(RANDOM()::TEXT), 1, 8),
  referred_by TEXT REFERENCES users(referral_code),
  total_games_played INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_earnings DECIMAL(10, 2) DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  has_streak_insurance BOOLEAN DEFAULT FALSE,
  last_played_date DATE,
  -- Referral system fields
  referral_earnings DECIMAL(10, 2) DEFAULT 0, -- Total earned from referrals
  total_referrals INTEGER DEFAULT 0, -- Count of users referred
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast World ID lookups
CREATE INDEX IF NOT EXISTS idx_users_world_id_hash ON users(world_id_hash);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- =============================================================================
-- DAILY PUZZLES TABLE
-- =============================================================================
-- Stores one puzzle per day (base puzzle before user-specific mapping)

CREATE TABLE IF NOT EXISTS daily_puzzles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE UNIQUE NOT NULL, -- YYYY-MM-DD
  base_puzzle JSONB NOT NULL, -- 9x9 grid, 0 = empty
  base_solution JSONB NOT NULL, -- Complete solution
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert')),
  daily_seed TEXT NOT NULL, -- Used for variant generation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_daily_puzzles_date ON daily_puzzles(date);

-- =============================================================================
-- GAME ENTRIES TABLE
-- =============================================================================
-- Tracks each user's entry into a daily puzzle

CREATE TABLE IF NOT EXISTS game_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id UUID NOT NULL REFERENCES daily_puzzles(id) ON DELETE CASCADE,
  puzzle_date DATE NOT NULL,
  entry_paid_at TIMESTAMPTZ DEFAULT NOW(),
  transaction_hash TEXT, -- Payment transaction ID
  variant_seed TEXT NOT NULL, -- User's unique puzzle variant seed
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'won', 'lost')),
  solved_at TIMESTAMPTZ,
  solve_time_seconds INTEGER,
  streak_insurance_applied BOOLEAN DEFAULT FALSE,
  prize_amount DECIMAL(10, 2),
  refund_amount DECIMAL(10, 2), -- For streak insurance refunds
  prize_transaction_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Each user can only have one entry per puzzle
  UNIQUE(user_id, puzzle_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_game_entries_user_id ON game_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_game_entries_puzzle_date ON game_entries(puzzle_date);
CREATE INDEX IF NOT EXISTS idx_game_entries_status ON game_entries(status);

-- =============================================================================
-- DAILY RESULTS TABLE
-- =============================================================================
-- Aggregated results for each day (calculated at deadline)

CREATE TABLE IF NOT EXISTS daily_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  puzzle_id UUID UNIQUE NOT NULL REFERENCES daily_puzzles(id) ON DELETE CASCADE,
  date DATE UNIQUE NOT NULL,
  total_players INTEGER DEFAULT 0,
  total_winners INTEGER DEFAULT 0,
  total_entry_pool DECIMAL(10, 2) DEFAULT 0, -- Total entries × $1.00
  applied_tax_rate INTEGER DEFAULT 20 CHECK (applied_tax_rate IN (0, 10, 20)), -- Dynamic tax: 0%, 10%, or 20%
  platform_fee DECIMAL(10, 2) DEFAULT 0, -- Tax amount (dynamic based on winner ratio)
  prize_pool DECIMAL(10, 2) DEFAULT 0, -- Pool after tax
  prize_per_winner DECIMAL(10, 2), -- prize_pool / total_winners
  distributed_at TIMESTAMPTZ, -- When prizes were sent
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dynamic Tax Rate Logic:
-- Tax is calculated dynamically based on winner/player ratio to ensure winners always break even:
-- - 20% tax: when winners/players <= 80% (standard case with enough losers)
-- - 10% tax: when winners/players <= 90% (reduced tax to allow break-even)
-- - 0% tax: when winners/players > 90% (no tax to prevent winner losses)

-- Index for date lookups
CREATE INDEX IF NOT EXISTS idx_daily_results_date ON daily_results(date);

-- =============================================================================
-- REVEAL TRANSACTIONS TABLE
-- =============================================================================
-- Tracks paid cell reveals ($0.20 each)

CREATE TABLE IF NOT EXISTS reveal_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_date DATE NOT NULL,
  cell_row INTEGER NOT NULL CHECK (cell_row >= 0 AND cell_row <= 8),
  cell_col INTEGER NOT NULL CHECK (cell_col >= 0 AND cell_col <= 8),
  transaction_hash TEXT,
  amount DECIMAL(10, 2) DEFAULT 0.20,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_reveal_transactions_user_id ON reveal_transactions(user_id);

-- =============================================================================
-- REFERRAL EARNINGS TABLE
-- =============================================================================
-- Tracks referral commissions (10% of referee's spend, from platform's share)
-- Commission scales with dynamic tax rate:
--   - 20% tax → 10% referral commission
--   - 10% tax → 5% referral commission (halved)
--   - 0% tax → 0% referral commission (nothing to take from)

CREATE TABLE IF NOT EXISTS referral_earnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- The user who referred
  referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- The user who was referred
  source_type TEXT NOT NULL CHECK (source_type IN ('entry', 'reveal')), -- What generated the commission
  source_id TEXT, -- game_entry.id or reveal_transaction.id
  source_date DATE NOT NULL, -- Date of the transaction
  applied_tax_rate INTEGER CHECK (applied_tax_rate IN (0, 10, 20)), -- Tax rate at time of transaction
  referee_spend DECIMAL(10, 2) NOT NULL, -- What the referee paid ($1.00 or $0.20)
  commission_rate DECIMAL(5, 4) NOT NULL, -- Actual rate applied (0.10, 0.05, or 0)
  amount DECIMAL(10, 2) NOT NULL, -- Commission amount earned
  paid_out BOOLEAN DEFAULT FALSE, -- Whether this has been paid to referrer
  payout_transaction_hash TEXT, -- TX hash when paid out
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for referral lookups
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer_id ON referral_earnings(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referee_id ON referral_earnings(referee_id);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_paid_out ON referral_earnings(paid_out);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_source_date ON referral_earnings(source_date);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to update streak when user plays
CREATE OR REPLACE FUNCTION update_user_streak()
RETURNS TRIGGER AS $$
DECLARE
  last_date DATE;
  old_streak INTEGER;
  new_streak INTEGER;
  old_insurance BOOLEAN;
BEGIN
  -- Get user's current state
  SELECT last_played_date, current_streak, has_streak_insurance 
  INTO last_date, old_streak, old_insurance 
  FROM users WHERE id = NEW.user_id;
  
  -- Handle NULL old_streak (first time user)
  old_streak := COALESCE(old_streak, 0);
  old_insurance := COALESCE(old_insurance, FALSE);
  
  -- Calculate new streak
  IF last_date IS NULL OR last_date < NEW.puzzle_date - INTERVAL '1 day' THEN
    -- Streak broken or first game
    new_streak := 1;
  ELSIF last_date = NEW.puzzle_date - INTERVAL '1 day' THEN
    -- Consecutive day - increment streak
    new_streak := old_streak + 1;
  ELSE
    -- Same day - keep current streak
    new_streak := old_streak;
  END IF;
  
  -- Update user
  -- Insurance is only GRANTED when streak reaches 7 (transition from <7 to >=7)
  -- Once consumed (set to FALSE), it stays FALSE until streak drops below 7 and reaches 7 again
  UPDATE users SET
    current_streak = new_streak,
    longest_streak = GREATEST(longest_streak, new_streak),
    has_streak_insurance = CASE
      WHEN new_streak >= 7 AND old_streak < 7 THEN TRUE
      ELSE old_insurance
    END,
    last_played_date = NEW.puzzle_date,
    total_games_played = total_games_played + 1,
    updated_at = NOW()
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update streak on new game entry
DROP TRIGGER IF EXISTS trigger_update_streak ON game_entries;
CREATE TRIGGER trigger_update_streak
  AFTER INSERT ON game_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_user_streak();

-- Function to update user stats when they win
CREATE OR REPLACE FUNCTION update_winner_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'won' AND OLD.status != 'won' THEN
    UPDATE users SET
      total_wins = total_wins + 1,
      total_earnings = total_earnings + COALESCE(NEW.prize_amount, 0),
      updated_at = NOW()
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update stats when entry is marked as won
DROP TRIGGER IF EXISTS trigger_update_winner ON game_entries;
CREATE TRIGGER trigger_update_winner
  AFTER UPDATE ON game_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_winner_stats();

-- Function to atomically increment referral earnings
CREATE OR REPLACE FUNCTION increment_referral_earnings(user_id UUID, earning_amount DECIMAL)
RETURNS VOID AS $$
BEGIN
  UPDATE users SET
    referral_earnings = referral_earnings + earning_amount,
    updated_at = NOW()
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE reveal_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (true); -- Public read for leaderboard

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Puzzles are readable by all authenticated users
CREATE POLICY "Puzzles are readable" ON daily_puzzles
  FOR SELECT USING (true);

-- Game entries policies
CREATE POLICY "Users can read own entries" ON game_entries
  FOR SELECT USING (true); -- Public read for leaderboard

CREATE POLICY "Service role can insert entries" ON game_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update entries" ON game_entries
  FOR UPDATE USING (true);

-- Daily results are public
CREATE POLICY "Results are public" ON daily_results
  FOR SELECT USING (true);

-- Reveal transactions
CREATE POLICY "Users can read own reveals" ON reveal_transactions
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert reveals" ON reveal_transactions
  FOR INSERT WITH CHECK (true);

-- Referral earnings policies
ALTER TABLE referral_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own referral earnings" ON referral_earnings
  FOR SELECT USING (true); -- Public read for leaderboard

CREATE POLICY "Service role can insert referral earnings" ON referral_earnings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update referral earnings" ON referral_earnings
  FOR UPDATE USING (true);

-- =============================================================================
-- SEED DATA (Optional - for testing)
-- =============================================================================

-- Uncomment to add a test puzzle for today
-- INSERT INTO daily_puzzles (date, base_puzzle, base_solution, difficulty, daily_seed)
-- VALUES (
--   CURRENT_DATE,
--   '[[0,2,0,0,0,0,0,0,0],[0,0,0,6,0,0,0,0,3],[0,7,4,0,8,0,0,0,0],[0,0,0,0,0,3,0,0,2],[0,8,0,0,4,0,0,1,0],[6,0,0,5,0,0,0,0,0],[0,0,0,0,1,0,7,8,0],[5,0,0,0,0,9,0,0,0],[0,0,0,0,0,0,0,4,0]]',
--   '[[1,2,6,4,3,7,9,5,8],[8,9,5,6,2,1,4,7,3],[3,7,4,9,8,5,1,2,6],[4,5,7,1,9,3,8,6,2],[9,8,3,2,4,6,5,1,7],[6,1,2,5,7,8,3,9,4],[2,6,9,3,1,4,7,8,5],[5,4,8,7,6,9,2,3,1],[7,3,1,8,5,2,6,4,9]]',
--   'medium',
--   'seed_' || CURRENT_DATE::TEXT
-- );

