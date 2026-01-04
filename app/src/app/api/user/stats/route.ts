/**
 * User Stats API
 * 
 * GET /api/user/stats?userId=XXXXX
 * 
 * Returns comprehensive user statistics including:
 * - Total games played
 * - Total wins
 * - Win rate
 * - Total earnings
 * - Current streak
 * - Longest streak
 * - Global rank (by total earnings)
 * - Has streak insurance
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserById, getLeaderboard } from '@/lib/db';

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

    // Calculate global rank by total earnings
    // Get top earners and find user's position
    const topEarners = await getLeaderboard(1000); // Get top 1000 to find rank
    let rank = 0;
    
    for (let i = 0; i < topEarners.length; i++) {
      if (topEarners[i].id === userId) {
        rank = i + 1;
        break;
      }
    }
    
    // If user not in top 1000, estimate rank based on earnings
    if (rank === 0 && (user.total_earnings || 0) > 0) {
      // Count how many users have more earnings
      rank = topEarners.filter(u => (u.total_earnings || 0) > (user.total_earnings || 0)).length + 1;
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
        hasStreakInsurance: user.has_streak_insurance || false,
        rank: rank > 0 ? rank : null, // null if user has no games/earnings
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


