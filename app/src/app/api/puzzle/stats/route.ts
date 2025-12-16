import { NextResponse } from 'next/server';
import { getTodayStats, getLeaderboard, getFastestSolvers } from '@/lib/db';
import { getTodayDate, isSupabaseConfigured } from '@/lib/supabase';

// Disable caching for this route - we want fresh stats every time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Get yesterday's date in YYYY-MM-DD format (UTC)
 */
function getYesterdayDate(): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - 1);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

/**
 * GET /api/puzzle/stats
 * 
 * Returns stats about today's puzzle and yesterday's results
 */
export async function GET() {
  try {
    const today = getTodayDate();
    const yesterday = getYesterdayDate();
    
    const stats = await getTodayStats(today);
    const yesterdayStats = await getTodayStats(yesterday);
    const leaderboard = await getLeaderboard(10);
    const fastestSolvers = await getFastestSolvers(today, 5);

    return NextResponse.json({
      success: true,
      date: today,
      timestamp: Date.now(), // Cache buster
      supabaseConfigured: isSupabaseConfigured(),
      stats: {
        players: stats.players,
        winners: stats.winners,
        pool: stats.pool,
        failureRate: stats.successRate,
        taxRate: stats.taxRate,
        prizePerWinner: stats.prizePerWinner,
        taxExplanation: stats.taxRate === 0
          ? 'No platform fee (too many winners)'
          : stats.taxRate === 10
          ? '10% fee (reduced to ensure break-even)'
          : '20% platform fee (standard)',
      },
      yesterdayStats: {
        players: yesterdayStats.players,
        winners: yesterdayStats.winners,
        pool: yesterdayStats.pool,
        failureRate: yesterdayStats.successRate,
        prizePerWinner: yesterdayStats.prizePerWinner,
      },
      leaderboard: leaderboard.map(u => ({
        username: u.username || 'Anonymous',
        earnings: u.total_earnings,
        wins: u.total_wins,
        streak: u.current_streak,
      })),
      fastestToday: fastestSolvers.map((e: { solve_time_seconds: number | null; users: { username: string | null } | null }) => ({
        username: e.users?.username || 'Anonymous',
        solveTime: e.solve_time_seconds,
      })),
    });

  } catch (error) {
    console.error('[API] Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

