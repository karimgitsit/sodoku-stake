import { NextResponse } from 'next/server';
import { getTodayStats, getLeaderboard, getFastestSolvers } from '@/lib/db';
import { getTodayDate, isSupabaseConfigured } from '@/lib/supabase';

/**
 * GET /api/puzzle/stats
 * 
 * Returns stats about today's puzzle
 */
export async function GET() {
  try {
    const today = getTodayDate();
    const stats = await getTodayStats(today);
    const leaderboard = await getLeaderboard(10);
    const fastestSolvers = await getFastestSolvers(today, 5);

    return NextResponse.json({
      success: true,
      date: today,
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

