-- =============================================================================
-- NOTIFICATION SYSTEM MIGRATION
-- =============================================================================
-- Run this in your Supabase SQL Editor after the initial schema
-- Adds support for push notifications, user preferences, and A/B testing

-- =============================================================================
-- ADD NOTIFICATION COLUMNS TO USERS TABLE
-- =============================================================================

-- User timezone for optimal send times (e.g., 'America/New_York', 'Europe/London')
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Notification preferences (per category opt-out)
ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_streak_risk BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_achievements BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_referrals BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_reminders BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_results BOOLEAN DEFAULT TRUE;

-- Rate limiting: track last notification to enforce ≤1/day
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_notification_sent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_notification_type TEXT;

-- =============================================================================
-- NOTIFICATIONS TABLE
-- =============================================================================
-- Tracks all sent notifications for analytics and A/B testing

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Notification content
  notification_type TEXT NOT NULL, -- e.g., 'streak_risk', 'achievement', 'referral', etc.
  notification_subtype TEXT, -- e.g., 'streak_3_day', 'first_win', etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deep_link TEXT, -- mini_app_path for deep linking
  
  -- A/B testing
  variant TEXT DEFAULT 'A', -- 'A', 'B', 'C' for copy variants
  experiment_id TEXT, -- Group related A/B tests
  
  -- Delivery tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  
  -- Engagement tracking
  opened_at TIMESTAMPTZ, -- When user opened the notification
  clicked_at TIMESTAMPTZ, -- When user tapped through to app
  dismissed_at TIMESTAMPTZ, -- When user dismissed without opening
  
  -- World App notification API response
  world_notification_id TEXT, -- ID returned from World App API
  error_message TEXT, -- If delivery failed
  
  -- Metadata
  trigger_data JSONB, -- Context that triggered the notification (e.g., streak count, prize amount)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_notifications_experiment ON notifications(experiment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_variant ON notifications(variant);

-- =============================================================================
-- NOTIFICATION TEMPLATES TABLE
-- =============================================================================
-- Store notification copy variants for A/B testing

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Template identification
  notification_type TEXT NOT NULL, -- e.g., 'streak_risk'
  notification_subtype TEXT, -- e.g., 'streak_3_day'
  variant TEXT NOT NULL DEFAULT 'A', -- 'A', 'B', 'C'
  
  -- Copy
  title TEXT NOT NULL, -- Max ~30 chars per Worldcoin guidelines
  body TEXT NOT NULL,
  
  -- Template variables (for reference)
  -- Available: ${username}, ${streak_count}, ${prize_amount}, ${hours_left}, 
  --            ${players_count}, ${success_rate}, ${referee_username}, etc.
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Performance metrics (updated by analytics job)
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  open_rate DECIMAL(5, 4) DEFAULT 0, -- opened / sent
  click_rate DECIMAL(5, 4) DEFAULT 0, -- clicked / sent
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Each type+subtype can have multiple variants
  UNIQUE(notification_type, notification_subtype, variant)
);

-- Index for template lookups
CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON notification_templates(notification_type, notification_subtype);
CREATE INDEX IF NOT EXISTS idx_notification_templates_active ON notification_templates(is_active);

-- =============================================================================
-- NOTIFICATION SCHEDULE TABLE
-- =============================================================================
-- Queue for scheduled notifications (e.g., streak risk 6 hours before deadline)

CREATE TABLE IF NOT EXISTS notification_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- What to send
  notification_type TEXT NOT NULL,
  notification_subtype TEXT,
  trigger_data JSONB, -- Data to pass to template
  
  -- When to send
  scheduled_for TIMESTAMPTZ NOT NULL,
  scheduled_date DATE NOT NULL, -- Extracted date for unique constraint (set from scheduled_for)
  
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled', 'skipped')),
  processed_at TIMESTAMPTZ,
  skip_reason TEXT, -- Why it was skipped (e.g., 'user_already_played', 'daily_limit_reached')
  
  -- Link to actual notification if sent
  notification_id UUID REFERENCES notifications(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for scheduler queries
CREATE INDEX IF NOT EXISTS idx_notification_schedule_pending ON notification_schedule(scheduled_for) 
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_notification_schedule_user ON notification_schedule(user_id);

-- Prevent duplicate scheduling (same user, same type, same day)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_schedule_unique 
  ON notification_schedule(user_id, notification_type, COALESCE(notification_subtype, ''), scheduled_date);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to check if user can receive a notification today
CREATE OR REPLACE FUNCTION can_send_notification(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  last_sent TIMESTAMPTZ;
  notifications_on BOOLEAN;
BEGIN
  SELECT last_notification_sent_at, notifications_enabled 
  INTO last_sent, notifications_on
  FROM users WHERE id = p_user_id;
  
  -- Check if notifications are enabled
  IF NOT COALESCE(notifications_on, TRUE) THEN
    RETURN FALSE;
  END IF;
  
  -- Check if we've already sent today (≤1 per day rule)
  IF last_sent IS NOT NULL AND last_sent > NOW() - INTERVAL '24 hours' THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to record notification sent
CREATE OR REPLACE FUNCTION record_notification_sent(
  p_user_id UUID,
  p_notification_type TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE users SET
    last_notification_sent_at = NOW(),
    last_notification_type = p_notification_type,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update template metrics
CREATE OR REPLACE FUNCTION update_template_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update metrics when notification is opened or clicked
  IF NEW.opened_at IS NOT NULL AND OLD.opened_at IS NULL THEN
    UPDATE notification_templates SET
      total_opened = total_opened + 1,
      open_rate = (total_opened + 1)::DECIMAL / NULLIF(total_sent, 0),
      updated_at = NOW()
    WHERE notification_type = NEW.notification_type
      AND COALESCE(notification_subtype, '') = COALESCE(NEW.notification_subtype, '')
      AND variant = NEW.variant;
  END IF;
  
  IF NEW.clicked_at IS NOT NULL AND OLD.clicked_at IS NULL THEN
    UPDATE notification_templates SET
      total_clicked = total_clicked + 1,
      click_rate = (total_clicked + 1)::DECIMAL / NULLIF(total_sent, 0),
      updated_at = NOW()
    WHERE notification_type = NEW.notification_type
      AND COALESCE(notification_subtype, '') = COALESCE(NEW.notification_subtype, '')
      AND variant = NEW.variant;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update template metrics
DROP TRIGGER IF EXISTS trigger_update_template_metrics ON notifications;
CREATE TRIGGER trigger_update_template_metrics
  AFTER UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_template_metrics();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_schedule ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (true);

-- Service role can manage all notification tables
CREATE POLICY "Service role can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update notifications" ON notifications
  FOR UPDATE USING (true);

CREATE POLICY "Templates are readable" ON notification_templates
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage templates" ON notification_templates
  FOR ALL USING (true);

CREATE POLICY "Schedule is readable by service" ON notification_schedule
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage schedule" ON notification_schedule
  FOR ALL USING (true);

-- =============================================================================
-- SEED NOTIFICATION TEMPLATES
-- =============================================================================
-- Initial templates - you can edit the copy in the notification_templates table

-- Streak Risk Notifications
INSERT INTO notification_templates (notification_type, notification_subtype, variant, title, body) VALUES
  ('streak_risk', 'streak_active', 'A', '🔥 Don''t lose your streak!', '${username}, your ${streak_count}-day streak ends at midnight. Today''s puzzle awaits.'),
  ('streak_risk', 'streak_active', 'B', '🔥 ${streak_count} days strong!', 'Keep it going, ${username}. Play today''s puzzle before midnight.'),
  ('streak_risk', 'approaching_insurance', 'A', '🛡️ 1 day from protection', 'Play tomorrow and unlock 50% loss insurance for your 7-day streak!'),
  ('streak_risk', 'approaching_insurance', 'B', '🛡️ Almost there!', '${username}, one more day unlocks streak insurance. Don''t stop now!'),
  ('streak_risk', 'has_insurance', 'A', '🛡️ You''re protected today', 'Your 7-day streak means 50% refund if you lose. Worth the risk?'),
  ('streak_risk', 'has_insurance', 'B', '🛡️ Safety net active', '${username}, your streak insurance is ready. Play with confidence!')
ON CONFLICT (notification_type, notification_subtype, variant) DO NOTHING;

-- Achievement Notifications
INSERT INTO notification_templates (notification_type, notification_subtype, variant, title, body) VALUES
  ('achievement', 'first_win', 'A', '🎉 First victory!', '${username}, you just won your first puzzle and earned $${prize_amount}!'),
  ('achievement', 'first_win', 'B', '🏆 You did it!', 'First win unlocked! $${prize_amount} coming your way, ${username}.'),
  ('achievement', 'win_streak_3', 'A', '🔥 3-win streak!', 'Three in a row! You''re on fire, ${username}.'),
  ('achievement', 'win_streak_7', 'A', '🔥 7-win streak!', 'A full week of wins! You''re unstoppable, ${username}.'),
  ('achievement', 'win_streak_14', 'A', '🔥 14-win streak!', 'Two weeks of dominance! Legend status, ${username}.'),
  ('achievement', 'win_streak_30', 'A', '👑 30-win streak!', 'A month undefeated. You''re a Sudoku master, ${username}!'),
  ('achievement', 'earnings_10', 'A', '💰 $10 earned!', 'Double digits! Your puzzle skills are paying off, ${username}.'),
  ('achievement', 'earnings_50', 'A', '💰 $50 earned!', 'Halfway to $100! Keep solving, ${username}.'),
  ('achievement', 'earnings_100', 'A', '💰 $100 earned!', 'Triple digits! You''ve mastered Sodoku Stake, ${username}.'),
  ('achievement', 'personal_best', 'A', '⚡ New personal best!', 'You solved today''s puzzle in just ${solve_time}. Can you beat it tomorrow?'),
  ('achievement', 'personal_best', 'B', '⚡ Fastest solve yet!', '${solve_time} - your new record, ${username}! Challenge it tomorrow.'),
  ('achievement', 'beat_average', 'A', '📊 Above average!', 'You beat ${success_rate}% of today''s players. You''re getting good at this.'),
  ('achievement', 'beat_average', 'B', '📊 Top performer!', 'Faster than ${success_rate}% of players today. Nice work, ${username}!')
ON CONFLICT (notification_type, notification_subtype, variant) DO NOTHING;

-- Referral Notifications
INSERT INTO notification_templates (notification_type, notification_subtype, variant, title, body) VALUES
  ('referral', 'signup', 'A', '🎉 New referral joined!', '${referee_username} just joined using your code. You earn 10% of their spend!'),
  ('referral', 'signup', 'B', '👋 Welcome aboard!', '${referee_username} signed up with your link. Watch those commissions grow!'),
  ('referral', 'first_play', 'A', '💸 You just earned $0.10', '${referee_username} played their first puzzle. Keep sharing!'),
  ('referral', 'first_play', 'B', '💰 Commission earned!', '$0.10 from ${referee_username}''s first game. Nice!'),
  ('referral', 'weekly_summary', 'A', '💰 Weekly referral update', 'You earned $${referral_amount} from ${referral_count} referrals this week.'),
  ('referral', 'weekly_summary', 'B', '📊 Your referrals this week', '${referral_count} plays, $${referral_amount} earned. Share more to earn more!')
ON CONFLICT (notification_type, notification_subtype, variant) DO NOTHING;

-- Deadline/Urgency Notifications
INSERT INTO notification_templates (notification_type, notification_subtype, variant, title, body) VALUES
  ('deadline', 'hours_left', 'A', '⏰ ${hours_left} hours left!', '${username}, today''s puzzle ends at midnight. ${players_count} players already entered.'),
  ('deadline', 'hours_left', 'B', '⏰ Clock is ticking!', 'Only ${hours_left}h to play today. ${players_count} are already in the pool.'),
  ('deadline', 'puzzle_started', 'A', '⚠️ Finish your puzzle!', 'You started but didn''t submit. Don''t forfeit your $1.00 entry!'),
  ('deadline', 'puzzle_started', 'B', '⚠️ Don''t leave $1 behind!', '${username}, your puzzle is waiting. Submit before midnight!'),
  ('deadline', 'new_puzzle', 'A', '🧩 Today''s puzzle is live', '${date} puzzle is ready. Yesterday''s winners got $${yesterday_prize} each.'),
  ('deadline', 'new_puzzle', 'B', '🧩 Fresh puzzle awaits!', 'New day, new challenge. Yesterday: ${yesterday_winners} winners, $${yesterday_prize} each.')
ON CONFLICT (notification_type, notification_subtype, variant) DO NOTHING;

-- Re-engagement Notifications
INSERT INTO notification_templates (notification_type, notification_subtype, variant, title, body) VALUES
  ('reengagement', 'inactive_3_days', 'A', '🚀 We miss you!', '${username}, come back for a fresh puzzle. Your skills are waiting.'),
  ('reengagement', 'inactive_3_days', 'B', '🧩 Puzzles await!', 'It''s been a few days, ${username}. Ready for a challenge?'),
  ('reengagement', 'inactive_7_days', 'A', '🎁 Welcome back?', 'It''s been a while. Today''s puzzle has ${players_count} players in the pool!'),
  ('reengagement', 'inactive_7_days', 'B', '👋 Long time no solve!', '${username}, the puzzles miss you. ${players_count} playing today.'),
  ('reengagement', 'after_loss', 'A', '💪 Try again today!', 'Yesterday was tough (only ${success_rate}% won). Today could be your day.'),
  ('reengagement', 'after_loss', 'B', '🔄 Fresh start!', 'New puzzle, new chance. Only ${success_rate}% won yesterday. Beat the odds!')
ON CONFLICT (notification_type, notification_subtype, variant) DO NOTHING;

-- Results Notifications
INSERT INTO notification_templates (notification_type, notification_subtype, variant, title, body) VALUES
  ('results', 'daily_summary', 'A', '📊 Results are in!', 'Yesterday: ${total_players} played, ${success_rate}% won. Winners got $${prize_per_winner} each.'),
  ('results', 'daily_summary', 'B', '📊 Yesterday''s numbers', '${total_players} players, ${total_winners} winners, $${prize_per_winner} each. Did you win?'),
  ('results', 'prize_sent', 'A', '💸 Prize sent!', '${username}, $${prize_amount} USDC is on its way to your wallet. Congrats!'),
  ('results', 'prize_sent', 'B', '🎉 Payday!', '$${prize_amount} sent to your wallet, ${username}. Well earned!'),
  ('results', 'weekly_summary', 'A', '📈 Your week in review', '${games_played} puzzles, ${wins} wins, $${earnings} earned. You''re in the top ${percentile}%!'),
  ('results', 'weekly_summary', 'B', '📊 Weekly stats', 'This week: ${games_played} games, ${wins} wins, $${earnings} profit. Nice work!')
ON CONFLICT (notification_type, notification_subtype, variant) DO NOTHING;

