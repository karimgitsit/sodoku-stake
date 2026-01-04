import { NextRequest, NextResponse } from 'next/server';
import { 
  getLeaderboard, 
  getFastestSolvers, 
  getStreakLeaderboard,
  getWeeklyEarningsLeaderboard,
  getReferralLeaderboard,
  getTotalPlayersCount 
} from '@/lib/db';
import { getTodayDate } from '@/lib/supabase';

// Disable caching for this route - we want fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Format seconds into MM:SS string
 */
function formatTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * GET /api/leaderboard?type=fastest|weekly|alltime|streaks|referrals
 * 
 * Returns leaderboard data based on the type requested
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'fastest';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50; // Increased default from 10 to 50

    switch (type) {
      case 'fastest': {
        const today = getTodayDate();
        const fastestSolvers = await getFastestSolvers(today, limit);
        
        return NextResponse.json({
          success: true,
          type: 'fastest',
          title: 'Fastest Today',
          metric: 'Time',
          data: fastestSolvers.map((entry: { solve_time_seconds: number | null; users: { username: string | null } | null }, index: number) => ({
            rank: index + 1,
            username: entry.users?.username || 'Anonymous',
            value: formatTime(entry.solve_time_seconds),
            rawValue: entry.solve_time_seconds,
          })),
        });
      }

      case 'weekly': {
        const weeklyLeaders = await getWeeklyEarningsLeaderboard(limit);
        
        return NextResponse.json({
          success: true,
          type: 'weekly',
          title: 'Top Earners (Week)',
          metric: 'Earnings',
          data: weeklyLeaders.map(({ user, weeklyEarnings }, index) => ({
            rank: index + 1,
            username: user.username || 'Anonymous',
            value: `$${weeklyEarnings.toFixed(2)}`,
            rawValue: weeklyEarnings,
          })),
        });
      }

      case 'alltime': {
        const allTimeLeaders = await getLeaderboard(limit);
        const totalPlayers = await getTotalPlayersCount();
        
        return NextResponse.json({
          success: true,
          type: 'alltime',
          title: 'Highest Earners (All Time)',
          metric: 'Total Earnings',
          totalCount: totalPlayers,
          data: allTimeLeaders.map((user, index) => ({
            rank: index + 1,
            username: user.username || 'Anonymous',
            value: `$${(user.total_earnings || 0).toFixed(2)}`,
            rawValue: user.total_earnings || 0,
            subValue: `${user.total_wins || 0} wins`,
          })),
        });
      }

      case 'streaks': {
        const streakLeaders = await getStreakLeaderboard(limit);
        
        return NextResponse.json({
          success: true,
          type: 'streaks',
          title: 'Longest Streaks',
          metric: 'Days',
          data: streakLeaders.map((user, index) => ({
            rank: index + 1,
            username: user.username || 'Anonymous',
            value: `${user.current_streak || 0} 🔥`,
            rawValue: user.current_streak || 0,
            subValue: `Best: ${user.longest_streak || 0} days`,
          })),
        });
      }

      case 'referrals': {
        const referralLeaders = await getReferralLeaderboard(limit);
        
        return NextResponse.json({
          success: true,
          type: 'referrals',
          title: 'Top Referral Earners',
          metric: 'Referral Earnings',
          data: referralLeaders.map((user, index) => ({
            rank: index + 1,
            username: user.username || 'Anonymous',
            value: `$${(user.referral_earnings || 0).toFixed(2)}`,
            rawValue: user.referral_earnings || 0,
            subValue: `${user.total_referrals || 0} referrals`,
          })),
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid leaderboard type' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('[API] Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}






