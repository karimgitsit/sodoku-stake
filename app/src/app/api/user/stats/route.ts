/**
 * User Stats API
 * 
 * GET /api/user/stats?userId=XXXXX
 * 
 * Returns user statistics including:
 * - Total games played
 * - Total wins
 * - Win rate
 * - Total earnings
 * - Current streak
 * - Longest streak
 * - Global rank
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/db';
import { getServerClient } from '@/lib/supabase';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get user from database
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Calculate win rate
    const totalGames = user.total_games_played || 0;
    const totalWins = user.total_wins || 0;
    const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

    // Get user's global rank (based on total earnings)
    let rank = 0;
    const supabase = getServerClient();
    
    if (supabase) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      
      // Count users with higher earnings
      const { count } = await db
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gt('total_earnings', user.total_earnings || 0);
      
      rank = (count || 0) + 1; // User's rank is count of users above them + 1
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalGames,
        totalWins,
        winRate,
        totalEarnings: user.total_earnings || 0,
        currentStreak: user.current_streak || 0,
        longestStreak: user.longest_streak || 0,
        rank,
        referralCode: user.referral_code,
        totalReferrals: user.total_referrals || 0,
        referralEarnings: user.referral_earnings || 0,
      },
    });

  } catch (error) {
    console.error('[API] Error fetching user stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user stats' },
      { status: 500 }
    );
  }
}


