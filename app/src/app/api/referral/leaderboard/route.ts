/**
 * Referral Leaderboard API
 * 
 * GET /api/referral/leaderboard?limit=10
 * 
 * Returns top referral earners
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReferralLeaderboard } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    const leaders = await getReferralLeaderboard(limit);

    return NextResponse.json({
      leaderboard: leaders.map((user, index) => ({
        rank: index + 1,
        username: user.username || 'Anonymous',
        referralEarnings: user.referral_earnings,
        totalReferrals: user.total_referrals,
      })),
    });

  } catch (error) {
    console.error('[API] Error fetching referral leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referral leaderboard' },
      { status: 500 }
    );
  }
}


