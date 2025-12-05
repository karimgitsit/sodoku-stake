/**
 * Notification Service
 * 
 * Handles sending push notifications via World App's notification API.
 * Includes rate limiting, template selection, and A/B testing support.
 * 
 * API Reference: https://docs.world.org/mini-apps/commands/send-notifications
 */

import { getServerClient } from './supabase';

// =============================================================================
// CONFIGURATION
// =============================================================================

const WORLD_APP_ID = process.env.NEXT_PUBLIC_APP_ID || '';
const WORLD_API_KEY = process.env.WORLD_API_KEY || ''; // API key from Developer Portal

// World App Notification API endpoint
const NOTIFICATION_API_URL = 'https://developer.worldcoin.org/api/v2/minikit/send-notification';

// =============================================================================
// TYPES
// =============================================================================

export type NotificationType = 
  | 'streak_risk'
  | 'achievement'
  | 'referral'
  | 'deadline'
  | 'reengagement'
  | 'results';

export type NotificationSubtype = 
  // Streak Risk
  | 'streak_active'
  | 'approaching_insurance'
  | 'has_insurance'
  // Achievement
  | 'first_win'
  | 'win_streak_3'
  | 'win_streak_7'
  | 'win_streak_14'
  | 'win_streak_30'
  | 'earnings_10'
  | 'earnings_50'
  | 'earnings_100'
  | 'personal_best'
  | 'beat_average'
  // Referral
  | 'signup'
  | 'first_play'
  | 'weekly_summary'
  // Deadline
  | 'hours_left'
  | 'puzzle_started'
  | 'new_puzzle'
  // Re-engagement
  | 'inactive_3_days'
  | 'inactive_7_days'
  | 'after_loss'
  // Results
  | 'daily_summary'
  | 'prize_sent'
  | 'weekly_summary';

export interface NotificationTemplate {
  title: string;
  body: string;
  variant: string;
}

export interface NotificationData {
  username?: string;
  streak_count?: number;
  prize_amount?: string;
  solve_time?: string;
  hours_left?: number;
  players_count?: number;
  total_players?: number;
  total_winners?: number;
  success_rate?: number;
  prize_per_winner?: string;
  yesterday_prize?: string;
  yesterday_winners?: number;
  referee_username?: string;
  referral_amount?: string;
  referral_count?: number;
  games_played?: number;
  wins?: number;
  earnings?: string;
  percentile?: number;
  date?: string;
  days_away?: number;
  week_number?: number;
}

export interface SendNotificationResult {
  success: boolean;
  notificationId?: string;
  error?: string;
}

// =============================================================================
// TEMPLATE FUNCTIONS
// =============================================================================

/**
 * Replace template variables with actual values
 */
function interpolateTemplate(template: string, data: NotificationData): string {
  let result = template;
  
  // Replace all ${variable} patterns
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    result = result.replace(regex, String(value ?? ''));
  }
  
  return result;
}

/**
 * Get a notification template from the database
 * Supports A/B testing by randomly selecting variants
 */
async function getTemplate(
  type: NotificationType,
  subtype: NotificationSubtype,
  forceVariant?: string
): Promise<NotificationTemplate | null> {
  const supabase = getServerClient();
  
  if (!supabase) {
    // Fallback templates for development
    return getHardcodedTemplate(type, subtype);
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  if (forceVariant) {
    // Get specific variant
    const { data } = await db
      .from('notification_templates')
      .select('title, body, variant')
      .eq('notification_type', type)
      .eq('notification_subtype', subtype)
      .eq('variant', forceVariant)
      .eq('is_active', true)
      .single();
    
    return data;
  }
  
  // Get all active variants for A/B testing
  const { data: templates } = await db
    .from('notification_templates')
    .select('title, body, variant')
    .eq('notification_type', type)
    .eq('notification_subtype', subtype)
    .eq('is_active', true);
  
  if (!templates || templates.length === 0) {
    return getHardcodedTemplate(type, subtype);
  }
  
  // Random A/B selection
  const randomIndex = Math.floor(Math.random() * templates.length);
  return templates[randomIndex];
}

/**
 * Hardcoded fallback templates for when DB is not available
 */
function getHardcodedTemplate(
  type: NotificationType,
  subtype: NotificationSubtype
): NotificationTemplate | null {
  const templates: Record<string, NotificationTemplate> = {
    // Prize sent
    'results:prize_sent': {
      title: '💸 Prize sent!',
      body: '${username}, $${prize_amount} USDC is on its way to your wallet. Congrats!',
      variant: 'A',
    },
    // Streak risk
    'streak_risk:streak_active': {
      title: "🔥 Don't lose your streak!",
      body: '${username}, your ${streak_count}-day streak ends at midnight. Today\'s puzzle awaits.',
      variant: 'A',
    },
    // First win
    'achievement:first_win': {
      title: '🎉 First victory!',
      body: '${username}, you just won your first puzzle and earned $${prize_amount}!',
      variant: 'A',
    },
    // Deadline
    'deadline:hours_left': {
      title: '⏰ ${hours_left} hours left!',
      body: '${username}, today\'s puzzle ends at midnight. ${players_count} players already entered.',
      variant: 'A',
    },
  };
  
  return templates[`${type}:${subtype}`] || null;
}

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Check if we can send a notification to this user (≤1 per day)
 */
async function canSendNotification(userId: string): Promise<boolean> {
  const supabase = getServerClient();
  
  if (!supabase) {
    return true; // Allow in dev mode
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  const { data: user } = await db
    .from('users')
    .select('notifications_enabled, last_notification_sent_at')
    .eq('id', userId)
    .single();
  
  if (!user) return false;
  
  // Check if notifications are enabled
  if (user.notifications_enabled === false) {
    return false;
  }
  
  // Check rate limit (1 per day)
  if (user.last_notification_sent_at) {
    const lastSent = new Date(user.last_notification_sent_at);
    const now = new Date();
    const hoursSinceLast = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceLast < 24) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if user has opted out of a specific notification category
 */
async function isNotificationCategoryEnabled(
  userId: string,
  type: NotificationType
): Promise<boolean> {
  const supabase = getServerClient();
  
  if (!supabase) {
    return true; // Allow all in dev mode
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  const categoryColumns: Record<NotificationType, string> = {
    streak_risk: 'notify_streak_risk',
    achievement: 'notify_achievements',
    referral: 'notify_referrals',
    deadline: 'notify_reminders',
    reengagement: 'notify_reminders',
    results: 'notify_results',
  };
  
  const column = categoryColumns[type];
  
  const { data: user } = await db
    .from('users')
    .select(column)
    .eq('id', userId)
    .single();
  
  return user?.[column] !== false;
}

/**
 * Record that we sent a notification to a user
 */
async function recordNotificationSent(
  userId: string,
  type: NotificationType,
  notificationId: string
): Promise<void> {
  const supabase = getServerClient();
  
  if (!supabase) return;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  await db
    .from('users')
    .update({
      last_notification_sent_at: new Date().toISOString(),
      last_notification_type: type,
    })
    .eq('id', userId);
}

// =============================================================================
// NOTIFICATION SENDING
// =============================================================================

/**
 * Send a notification to a user via World App
 * 
 * @param walletAddress - User's wallet address (World App uses this to route notifications)
 * @param title - Notification title
 * @param body - Notification body
 * @param miniAppPath - Deep link path within the mini app (e.g., '/?screen=results')
 */
async function sendToWorldApp(
  walletAddress: string,
  title: string,
  body: string,
  miniAppPath?: string
): Promise<SendNotificationResult> {
  if (!WORLD_API_KEY) {
    console.warn('[Notifications] No WORLD_API_KEY set - skipping notification');
    return { success: false, error: 'API key not configured' };
  }
  
  if (!WORLD_APP_ID) {
    console.warn('[Notifications] No WORLD_APP_ID set - skipping notification');
    return { success: false, error: 'App ID not configured' };
  }
  
  try {
    const response = await fetch(NOTIFICATION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WORLD_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: WORLD_APP_ID,
        wallet_addresses: [walletAddress],
        title,
        message: body,
        mini_app_path: miniAppPath || '/',
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Notifications] API error:', response.status, errorText);
      return { success: false, error: `API error: ${response.status}` };
    }
    
    const result = await response.json();
    
    return {
      success: true,
      notificationId: result.id || 'sent',
    };
    
  } catch (error) {
    console.error('[Notifications] Failed to send:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Log notification to database for analytics
 */
async function logNotification(
  userId: string,
  walletAddress: string,
  type: NotificationType,
  subtype: NotificationSubtype,
  title: string,
  body: string,
  variant: string,
  result: SendNotificationResult,
  triggerData?: NotificationData
): Promise<string | null> {
  const supabase = getServerClient();
  
  if (!supabase) return null;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  const { data, error } = await db
    .from('notifications')
    .insert({
      user_id: userId,
      notification_type: type,
      notification_subtype: subtype,
      title,
      body,
      variant,
      status: result.success ? 'sent' : 'failed',
      sent_at: result.success ? new Date().toISOString() : null,
      world_notification_id: result.notificationId,
      error_message: result.error,
      trigger_data: triggerData,
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('[Notifications] Failed to log:', error);
    return null;
  }
  
  // Update template metrics
  if (result.success) {
    await db
      .from('notification_templates')
      .update({
        total_sent: db.raw('total_sent + 1'),
      })
      .eq('notification_type', type)
      .eq('notification_subtype', subtype)
      .eq('variant', variant);
  }
  
  return data?.id || null;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Send a notification to a user
 * 
 * This is the main entry point for sending notifications.
 * It handles:
 * - Template lookup and A/B testing
 * - Variable interpolation
 * - Rate limiting
 * - Category opt-outs
 * - Logging for analytics
 * 
 * @param userId - Database user ID (UUID)
 * @param walletAddress - User's wallet address
 * @param type - Notification type (e.g., 'results')
 * @param subtype - Notification subtype (e.g., 'prize_sent')
 * @param data - Variables to interpolate into the template
 * @param options - Additional options
 */
export async function sendNotification(
  userId: string,
  walletAddress: string,
  type: NotificationType,
  subtype: NotificationSubtype,
  data: NotificationData,
  options?: {
    forceVariant?: string;
    skipRateLimit?: boolean;
    deepLink?: string;
  }
): Promise<SendNotificationResult> {
  console.log(`[Notifications] Sending ${type}:${subtype} to user ${userId.substring(0, 8)}...`);
  
  // Check rate limit (unless skipped for high-priority notifications)
  if (!options?.skipRateLimit) {
    const canSend = await canSendNotification(userId);
    if (!canSend) {
      console.log('[Notifications] Rate limited - skipping');
      return { success: false, error: 'Rate limited (1 per day)' };
    }
  }
  
  // Check category opt-out
  const categoryEnabled = await isNotificationCategoryEnabled(userId, type);
  if (!categoryEnabled) {
    console.log('[Notifications] Category disabled by user - skipping');
    return { success: false, error: 'Category disabled by user' };
  }
  
  // Get template
  const template = await getTemplate(type, subtype, options?.forceVariant);
  if (!template) {
    console.error(`[Notifications] No template found for ${type}:${subtype}`);
    return { success: false, error: 'Template not found' };
  }
  
  // Interpolate variables
  const title = interpolateTemplate(template.title, data);
  const body = interpolateTemplate(template.body, data);
  
  // Determine deep link
  const deepLinks: Record<NotificationType, string> = {
    streak_risk: '/?screen=home',
    achievement: '/?screen=profile',
    referral: '/?screen=profile',
    deadline: '/?screen=puzzle',
    reengagement: '/?screen=home',
    results: '/?screen=results',
  };
  const deepLink = options?.deepLink || deepLinks[type];
  
  // Send notification
  const result = await sendToWorldApp(walletAddress, title, body, deepLink);
  
  // Log to database
  const notificationId = await logNotification(
    userId,
    walletAddress,
    type,
    subtype,
    title,
    body,
    template.variant,
    result,
    data
  );
  
  // Record rate limit timestamp if successful
  if (result.success && notificationId) {
    await recordNotificationSent(userId, type, notificationId);
  }
  
  if (result.success) {
    console.log(`[Notifications] ✅ Sent ${type}:${subtype}`);
  } else {
    console.log(`[Notifications] ❌ Failed: ${result.error}`);
  }
  
  return {
    ...result,
    notificationId: notificationId || result.notificationId,
  };
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Send a "prize sent" notification after distributing winnings
 */
export async function sendPrizeSentNotification(
  userId: string,
  walletAddress: string,
  username: string,
  prizeAmount: number
): Promise<SendNotificationResult> {
  return sendNotification(
    userId,
    walletAddress,
    'results',
    'prize_sent',
    {
      username,
      prize_amount: prizeAmount.toFixed(2),
    },
    {
      skipRateLimit: true, // Prize notifications are high priority
      deepLink: '/?screen=profile',
    }
  );
}

/**
 * Send a "first win" notification
 */
export async function sendFirstWinNotification(
  userId: string,
  walletAddress: string,
  username: string,
  prizeAmount: number
): Promise<SendNotificationResult> {
  return sendNotification(
    userId,
    walletAddress,
    'achievement',
    'first_win',
    {
      username,
      prize_amount: prizeAmount.toFixed(2),
    },
    {
      skipRateLimit: true,
    }
  );
}

/**
 * Send a streak risk notification
 */
export async function sendStreakRiskNotification(
  userId: string,
  walletAddress: string,
  username: string,
  streakCount: number,
  hasInsurance: boolean
): Promise<SendNotificationResult> {
  const subtype = hasInsurance 
    ? 'has_insurance' 
    : streakCount === 6 
      ? 'approaching_insurance' 
      : 'streak_active';
  
  return sendNotification(
    userId,
    walletAddress,
    'streak_risk',
    subtype,
    {
      username,
      streak_count: streakCount,
    }
  );
}

/**
 * Send a deadline reminder notification
 */
export async function sendDeadlineReminderNotification(
  userId: string,
  walletAddress: string,
  username: string,
  hoursLeft: number,
  playersCount: number
): Promise<SendNotificationResult> {
  return sendNotification(
    userId,
    walletAddress,
    'deadline',
    'hours_left',
    {
      username,
      hours_left: hoursLeft,
      players_count: playersCount,
    }
  );
}

/**
 * Send a referral signup notification
 */
export async function sendReferralSignupNotification(
  referrerId: string,
  referrerWallet: string,
  referrerUsername: string,
  refereeUsername: string
): Promise<SendNotificationResult> {
  return sendNotification(
    referrerId,
    referrerWallet,
    'referral',
    'signup',
    {
      username: referrerUsername,
      referee_username: refereeUsername,
    },
    {
      skipRateLimit: true, // Referral notifications are time-sensitive
    }
  );
}

/**
 * Send a referral first play notification (when referee plays their first puzzle)
 */
export async function sendReferralFirstPlayNotification(
  referrerId: string,
  referrerWallet: string,
  referrerUsername: string,
  refereeUsername: string
): Promise<SendNotificationResult> {
  return sendNotification(
    referrerId,
    referrerWallet,
    'referral',
    'first_play',
    {
      username: referrerUsername,
      referee_username: refereeUsername,
    },
    {
      skipRateLimit: true,
    }
  );
}

/**
 * Send a win streak notification (3, 7, 14, or 30 consecutive wins)
 */
export async function sendWinStreakNotification(
  userId: string,
  walletAddress: string,
  username: string,
  streakCount: 3 | 7 | 14 | 30
): Promise<SendNotificationResult> {
  const subtypeMap: Record<number, NotificationSubtype> = {
    3: 'win_streak_3',
    7: 'win_streak_7',
    14: 'win_streak_14',
    30: 'win_streak_30',
  };
  
  return sendNotification(
    userId,
    walletAddress,
    'achievement',
    subtypeMap[streakCount],
    {
      username,
    },
    {
      skipRateLimit: true, // Achievement notifications are special moments
    }
  );
}

/**
 * Send an earnings milestone notification ($10, $50, or $100)
 */
export async function sendEarningsMilestoneNotification(
  userId: string,
  walletAddress: string,
  username: string,
  milestone: 10 | 50 | 100
): Promise<SendNotificationResult> {
  const subtypeMap: Record<number, NotificationSubtype> = {
    10: 'earnings_10',
    50: 'earnings_50',
    100: 'earnings_100',
  };
  
  return sendNotification(
    userId,
    walletAddress,
    'achievement',
    subtypeMap[milestone],
    {
      username,
    },
    {
      skipRateLimit: true,
    }
  );
}

/**
 * Send a personal best time notification
 */
export async function sendPersonalBestNotification(
  userId: string,
  walletAddress: string,
  username: string,
  solveTime: string // formatted time string like "12:34"
): Promise<SendNotificationResult> {
  return sendNotification(
    userId,
    walletAddress,
    'achievement',
    'personal_best',
    {
      username,
      solve_time: solveTime,
    },
    {
      skipRateLimit: true,
    }
  );
}

/**
 * Send a new puzzle available notification (for engaged users)
 */
export async function sendNewPuzzleNotification(
  userId: string,
  walletAddress: string,
  username: string,
  yesterdayPrize: number,
  yesterdayWinners: number,
  date: string // formatted date like "December 4"
): Promise<SendNotificationResult> {
  return sendNotification(
    userId,
    walletAddress,
    'deadline',
    'new_puzzle',
    {
      username,
      yesterday_prize: yesterdayPrize.toFixed(2),
      yesterday_winners: yesterdayWinners,
      date,
    }
  );
}

/**
 * Send an incomplete puzzle reminder
 */
export async function sendIncompletePuzzleNotification(
  userId: string,
  walletAddress: string,
  username: string
): Promise<SendNotificationResult> {
  return sendNotification(
    userId,
    walletAddress,
    'deadline',
    'puzzle_started',
    {
      username,
    }
  );
}

// =============================================================================
// BATCH/SCHEDULED NOTIFICATION FUNCTIONS
// =============================================================================

/**
 * Get users who need streak risk notifications
 * Returns users with active streaks (3+ days) who haven't played today
 */
export async function getUsersForStreakRiskNotification(today: string): Promise<Array<{
  id: string;
  username: string | null;
  wallet_address: string | null;
  current_streak: number;
  has_streak_insurance: boolean;
}>> {
  const supabase = getServerClient();
  
  if (!supabase) {
    console.log('[Notifications] No Supabase client - returning empty array');
    return [];
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // Get users with 3+ day streaks who haven't played today
  const { data: usersWithStreaks } = await db
    .from('users')
    .select('id, username, wallet_address, current_streak, has_streak_insurance, notifications_enabled, notify_streak_risk')
    .gte('current_streak', 3)
    .eq('notifications_enabled', true)
    .eq('notify_streak_risk', true);
  
  if (!usersWithStreaks || usersWithStreaks.length === 0) {
    return [];
  }
  
  // Check which users have already played today
  const userIds = usersWithStreaks.map((u: { id: string }) => u.id);
  
  const { data: todaysEntries } = await db
    .from('game_entries')
    .select('user_id')
    .eq('puzzle_date', today)
    .in('user_id', userIds);
  
  const playedTodayIds = new Set((todaysEntries || []).map((e: { user_id: string }) => e.user_id));
  
  // Filter to users who haven't played today
  return usersWithStreaks.filter((u: { id: string }) => !playedTodayIds.has(u.id));
}

/**
 * Get users who need deadline reminder notifications
 * Returns users who haven't started today's puzzle
 */
export async function getUsersForDeadlineReminder(today: string): Promise<Array<{
  id: string;
  username: string | null;
  wallet_address: string | null;
}>> {
  const supabase = getServerClient();
  
  if (!supabase) {
    return [];
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // Get users who have played before but not today
  const { data: activeUsers } = await db
    .from('users')
    .select('id, username, wallet_address, notifications_enabled, notify_reminders')
    .gt('total_games_played', 0)
    .eq('notifications_enabled', true)
    .eq('notify_reminders', true);
  
  if (!activeUsers || activeUsers.length === 0) {
    return [];
  }
  
  const userIds = activeUsers.map((u: { id: string }) => u.id);
  
  // Check which users have already played today
  const { data: todaysEntries } = await db
    .from('game_entries')
    .select('user_id')
    .eq('puzzle_date', today)
    .in('user_id', userIds);
  
  const playedTodayIds = new Set((todaysEntries || []).map((e: { user_id: string }) => e.user_id));
  
  return activeUsers.filter((u: { id: string }) => !playedTodayIds.has(u.id));
}

/**
 * Get users with incomplete puzzles (started but not submitted)
 */
export async function getUsersWithIncompletePuzzles(today: string): Promise<Array<{
  id: string;
  username: string | null;
  wallet_address: string | null;
}>> {
  const supabase = getServerClient();
  
  if (!supabase) {
    return [];
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // Get entries that are in_progress for today
  const { data: incompleteEntries } = await db
    .from('game_entries')
    .select('user_id, users!inner(id, username, wallet_address, notifications_enabled, notify_reminders)')
    .eq('puzzle_date', today)
    .eq('status', 'in_progress');
  
  if (!incompleteEntries) {
    return [];
  }
  
  // Filter to users with notifications enabled
  return incompleteEntries
    .filter((e: { users: { notifications_enabled: boolean; notify_reminders: boolean } }) => 
      e.users.notifications_enabled && e.users.notify_reminders)
    .map((e: { users: { id: string; username: string | null; wallet_address: string | null } }) => ({
      id: e.users.id,
      username: e.users.username,
      wallet_address: e.users.wallet_address,
    }));
}

/**
 * Get engaged users for new puzzle notification
 * "Engaged" = played 5+ games in the last 7 days
 */
export async function getEngagedUsersForNewPuzzle(): Promise<Array<{
  id: string;
  username: string | null;
  wallet_address: string | null;
}>> {
  const supabase = getServerClient();
  
  if (!supabase) {
    return [];
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // Get date 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
  
  // Count entries per user in last 7 days
  const { data: recentEntries } = await db
    .from('game_entries')
    .select('user_id')
    .gte('puzzle_date', sevenDaysAgoStr);
  
  if (!recentEntries || recentEntries.length === 0) {
    return [];
  }
  
  // Count entries per user
  const entryCounts = new Map<string, number>();
  for (const entry of recentEntries) {
    const count = entryCounts.get(entry.user_id) || 0;
    entryCounts.set(entry.user_id, count + 1);
  }
  
  // Get users who played 5+ times
  const engagedUserIds = Array.from(entryCounts.entries())
    .filter(([, count]) => count >= 5)
    .map(([userId]) => userId);
  
  if (engagedUserIds.length === 0) {
    return [];
  }
  
  // Fetch user details
  const { data: users } = await db
    .from('users')
    .select('id, username, wallet_address, notifications_enabled, notify_reminders')
    .in('id', engagedUserIds)
    .eq('notifications_enabled', true)
    .eq('notify_reminders', true);
  
  return users || [];
}

/**
 * Get yesterday's results for notification data
 */
export async function getYesterdayResults(): Promise<{
  totalPlayers: number;
  totalWinners: number;
  prizePerWinner: number;
} | null> {
  const supabase = getServerClient();
  
  if (!supabase) {
    return null;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  const { data: result } = await db
    .from('daily_results')
    .select('total_players, total_winners, prize_per_winner')
    .eq('date', yesterdayStr)
    .single();
  
  if (!result) {
    return null;
  }
  
  return {
    totalPlayers: result.total_players,
    totalWinners: result.total_winners,
    prizePerWinner: result.prize_per_winner || 0,
  };
}

/**
 * Get today's player count for notifications
 */
export async function getTodayPlayerCount(today: string): Promise<number> {
  const supabase = getServerClient();
  
  if (!supabase) {
    return 0;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  const { count } = await db
    .from('game_entries')
    .select('*', { count: 'exact', head: true })
    .eq('puzzle_date', today);
  
  return count || 0;
}
