/**
 * Referral Stats API
 * 
 * GET /api/referral/stats?userId=XXXXX
 * 
 * Returns referral statistics for a user including:
 * - Total referrals
 * - Total earnings from referrals
 * - Unpaid earnings
 * - Recent earnings history
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getReferralStats,
  getUserById,
} from '@/lib/db';

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

    // Verify user exists
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get referral stats
    const stats = await getReferralStats(userId);

    return NextResponse.json({
      referralCode: user.referral_code,
      totalReferrals: stats.totalReferrals,
      totalEarnings: stats.totalEarnings,
      unpaidEarnings: stats.unpaidEarnings,
      recentEarnings: stats.recentEarnings.map(e => ({
        id: e.id,
        sourceType: e.source_type,
        amount: e.amount,
        commissionRate: e.commission_rate,
        date: e.source_date,
        paidOut: e.paid_out,
      })),
    });

  } catch (error) {
    console.error('[API] Error fetching referral stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referral stats' },
      { status: 500 }
    );
  }
}


