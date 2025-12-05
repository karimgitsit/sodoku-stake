/**
 * Notification Scheduler Cron Job
 * 
 * POST /api/cron/notifications
 * 
 * Handles all scheduled notifications:
 * - Streak risk reminders (6 hours before midnight UTC = 18:00 UTC)
 * - Deadline reminders (4 hours before midnight UTC = 20:00 UTC)
 * - Incomplete puzzle reminders (3 hours before midnight UTC = 21:00 UTC)
 * - New puzzle available (shortly after midnight UTC = 00:05 UTC)
 * 
 * This endpoint should be called hourly by Vercel cron or similar scheduler.
 * 
 * Security: Requires CRON_SECRET header to prevent unauthorized access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTodayDate } from '@/lib/supabase';
import {
  sendStreakRiskNotification,
  sendDeadlineReminderNotification,
  sendIncompletePuzzleNotification,
  sendNewPuzzleNotification,
  getUsersForStreakRiskNotification,
  getUsersForDeadlineReminder,
  getUsersWithIncompletePuzzles,
  getEngagedUsersForNewPuzzle,
  getYesterdayResults,
  getTodayPlayerCount,
} from '@/lib/notifications';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CRON_SECRET = process.env.CRON_SECRET;

// Schedule windows (UTC hours)
const SCHEDULE = {
  NEW_PUZZLE: { startHour: 0, endHour: 1 },         // 00:00-01:00 UTC
  STREAK_RISK: { startHour: 18, endHour: 19 },      // 18:00-19:00 UTC (6h before midnight)
  DEADLINE_REMINDER: { startHour: 20, endHour: 21 }, // 20:00-21:00 UTC (4h before midnight)
  INCOMPLETE_PUZZLE: { startHour: 21, endHour: 22 }, // 21:00-22:00 UTC (3h before midnight)
};

// =============================================================================
// CRON HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  // Verify cron secret (skip in development)
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.error('[Cron] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  const startTime = Date.now();
  const now = new Date();
  const currentHour = now.getUTCHours();
  const today = getTodayDate();
  
  console.log(`\n[Cron] Starting notification scheduler`);
  console.log(`[Cron] Time: ${now.toISOString()} (Hour: ${currentHour} UTC)`);
  console.log(`[Cron] Date: ${today}`);
  
  const results = {
    hour: currentHour,
    date: today,
    notifications: {
      streakRisk: { sent: 0, skipped: 0, errors: 0 },
      deadline: { sent: 0, skipped: 0, errors: 0 },
      incomplete: { sent: 0, skipped: 0, errors: 0 },
      newPuzzle: { sent: 0, skipped: 0, errors: 0 },
    },
    totalDuration: 0,
  };
  
  try {
    // 1. NEW PUZZLE NOTIFICATIONS (00:00-01:00 UTC)
    if (isInScheduleWindow(currentHour, SCHEDULE.NEW_PUZZLE)) {
      console.log('\n[Cron] Processing new puzzle notifications...');
      results.notifications.newPuzzle = await sendNewPuzzleNotifications();
    }
    
    // 2. STREAK RISK NOTIFICATIONS (18:00-19:00 UTC)
    if (isInScheduleWindow(currentHour, SCHEDULE.STREAK_RISK)) {
      console.log('\n[Cron] Processing streak risk notifications...');
      results.notifications.streakRisk = await sendStreakRiskNotifications(today);
    }
    
    // 3. DEADLINE REMINDER NOTIFICATIONS (20:00-21:00 UTC)
    if (isInScheduleWindow(currentHour, SCHEDULE.DEADLINE_REMINDER)) {
      console.log('\n[Cron] Processing deadline reminder notifications...');
      results.notifications.deadline = await sendDeadlineNotifications(today);
    }
    
    // 4. INCOMPLETE PUZZLE NOTIFICATIONS (21:00-22:00 UTC)
    if (isInScheduleWindow(currentHour, SCHEDULE.INCOMPLETE_PUZZLE)) {
      console.log('\n[Cron] Processing incomplete puzzle notifications...');
      results.notifications.incomplete = await sendIncompleteNotifications(today);
    }
    
    results.totalDuration = Date.now() - startTime;
    
    console.log('\n[Cron] === Summary ===');
    console.log(`[Cron] Streak Risk: ${results.notifications.streakRisk.sent} sent, ${results.notifications.streakRisk.skipped} skipped`);
    console.log(`[Cron] Deadline: ${results.notifications.deadline.sent} sent, ${results.notifications.deadline.skipped} skipped`);
    console.log(`[Cron] Incomplete: ${results.notifications.incomplete.sent} sent, ${results.notifications.incomplete.skipped} skipped`);
    console.log(`[Cron] New Puzzle: ${results.notifications.newPuzzle.sent} sent, ${results.notifications.newPuzzle.skipped} skipped`);
    console.log(`[Cron] Duration: ${results.totalDuration}ms`);
    
    return NextResponse.json({
      success: true,
      results,
    });
    
  } catch (error) {
    console.error('[Cron] Error in notification scheduler:', error);
    return NextResponse.json(
      { 
        error: 'Notification scheduler failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing (in development only)
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }
  
  // Redirect to POST handler
  return POST(request);
}

// =============================================================================
// NOTIFICATION SENDERS
// =============================================================================

interface NotificationStats {
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Send streak risk notifications to users with active streaks who haven't played
 */
async function sendStreakRiskNotifications(today: string): Promise<NotificationStats> {
  const stats: NotificationStats = { sent: 0, skipped: 0, errors: 0 };
  
  const users = await getUsersForStreakRiskNotification(today);
  console.log(`[Cron] Found ${users.length} users with streak risk`);
  
  for (const user of users) {
    if (!user.wallet_address) {
      stats.skipped++;
      continue;
    }
    
    try {
      const result = await sendStreakRiskNotification(
        user.id,
        user.wallet_address,
        user.username || 'Player',
        user.current_streak,
        user.has_streak_insurance
      );
      
      if (result.success) {
        stats.sent++;
        console.log(`[Cron] ✅ Streak risk sent to ${user.username || user.id.substring(0, 8)}`);
      } else {
        stats.skipped++;
        console.log(`[Cron] ⏭️ Skipped ${user.username || user.id.substring(0, 8)}: ${result.error}`);
      }
    } catch (error) {
      stats.errors++;
      console.error(`[Cron] ❌ Error for ${user.id.substring(0, 8)}:`, error);
    }
  }
  
  return stats;
}

/**
 * Send deadline reminder notifications to users who haven't started today's puzzle
 */
async function sendDeadlineNotifications(today: string): Promise<NotificationStats> {
  const stats: NotificationStats = { sent: 0, skipped: 0, errors: 0 };
  
  const users = await getUsersForDeadlineReminder(today);
  const playerCount = await getTodayPlayerCount(today);
  const hoursLeft = 24 - new Date().getUTCHours();
  
  console.log(`[Cron] Found ${users.length} users for deadline reminder`);
  
  for (const user of users) {
    if (!user.wallet_address) {
      stats.skipped++;
      continue;
    }
    
    try {
      const result = await sendDeadlineReminderNotification(
        user.id,
        user.wallet_address,
        user.username || 'Player',
        hoursLeft,
        playerCount
      );
      
      if (result.success) {
        stats.sent++;
        console.log(`[Cron] ✅ Deadline reminder sent to ${user.username || user.id.substring(0, 8)}`);
      } else {
        stats.skipped++;
        console.log(`[Cron] ⏭️ Skipped ${user.username || user.id.substring(0, 8)}: ${result.error}`);
      }
    } catch (error) {
      stats.errors++;
      console.error(`[Cron] ❌ Error for ${user.id.substring(0, 8)}:`, error);
    }
  }
  
  return stats;
}

/**
 * Send incomplete puzzle notifications to users who started but didn't submit
 */
async function sendIncompleteNotifications(today: string): Promise<NotificationStats> {
  const stats: NotificationStats = { sent: 0, skipped: 0, errors: 0 };
  
  const users = await getUsersWithIncompletePuzzles(today);
  console.log(`[Cron] Found ${users.length} users with incomplete puzzles`);
  
  for (const user of users) {
    if (!user.wallet_address) {
      stats.skipped++;
      continue;
    }
    
    try {
      const result = await sendIncompletePuzzleNotification(
        user.id,
        user.wallet_address,
        user.username || 'Player'
      );
      
      if (result.success) {
        stats.sent++;
        console.log(`[Cron] ✅ Incomplete puzzle reminder sent to ${user.username || user.id.substring(0, 8)}`);
      } else {
        stats.skipped++;
        console.log(`[Cron] ⏭️ Skipped ${user.username || user.id.substring(0, 8)}: ${result.error}`);
      }
    } catch (error) {
      stats.errors++;
      console.error(`[Cron] ❌ Error for ${user.id.substring(0, 8)}:`, error);
    }
  }
  
  return stats;
}

/**
 * Send new puzzle notifications to most engaged users
 */
async function sendNewPuzzleNotifications(): Promise<NotificationStats> {
  const stats: NotificationStats = { sent: 0, skipped: 0, errors: 0 };
  
  const users = await getEngagedUsersForNewPuzzle();
  const yesterdayResults = await getYesterdayResults();
  
  console.log(`[Cron] Found ${users.length} engaged users for new puzzle notification`);
  
  if (!yesterdayResults) {
    console.log('[Cron] No yesterday results - skipping new puzzle notifications');
    return stats;
  }
  
  // Format date for notification (e.g., "December 4")
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  
  for (const user of users) {
    if (!user.wallet_address) {
      stats.skipped++;
      continue;
    }
    
    try {
      const result = await sendNewPuzzleNotification(
        user.id,
        user.wallet_address,
        user.username || 'Player',
        yesterdayResults.prizePerWinner,
        yesterdayResults.totalWinners,
        dateStr
      );
      
      if (result.success) {
        stats.sent++;
        console.log(`[Cron] ✅ New puzzle notification sent to ${user.username || user.id.substring(0, 8)}`);
      } else {
        stats.skipped++;
        console.log(`[Cron] ⏭️ Skipped ${user.username || user.id.substring(0, 8)}: ${result.error}`);
      }
    } catch (error) {
      stats.errors++;
      console.error(`[Cron] ❌ Error for ${user.id.substring(0, 8)}:`, error);
    }
  }
  
  return stats;
}

// =============================================================================
// HELPERS
// =============================================================================

function isInScheduleWindow(currentHour: number, window: { startHour: number; endHour: number }): boolean {
  return currentHour >= window.startHour && currentHour < window.endHour;
}

