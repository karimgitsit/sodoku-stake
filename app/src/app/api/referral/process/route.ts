/**
 * Process Referral API
 * 
 * POST /api/referral/process
 * 
 * Associates a new user with their referrer via referral code.
 * Should be called when a user first signs up via a referral link.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getOrCreateUser, 
  setUserReferrer,
  getUserByReferralCode,
  getUserById,
} from '@/lib/db';
import { sendReferralSignupNotification } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, referralCode } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (!referralCode) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400 }
      );
    }

    // Verify the referral code exists
    const referrer = await getUserByReferralCode(referralCode);
    if (!referrer) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 404 }
      );
    }

    // Process the referral
    const success = await setUserReferrer(userId, referralCode);

    if (success) {
      // Send notification to referrer (in background, don't block response)
      (async () => {
        try {
          // Get the referee's username
          const referee = await getUserById(userId);
          const refereeUsername = referee?.username || 'A new user';
          
          if (referrer.wallet_address) {
            console.log(`[Notifications] Sending referral signup notification to ${referrer.username}`);
            await sendReferralSignupNotification(
              referrer.id,
              referrer.wallet_address,
              referrer.username || 'Player',
              refereeUsername
            );
          }
        } catch (error) {
          console.error('[Notifications] Error sending referral notification:', error);
        }
      })();
      
      return NextResponse.json({
        success: true,
        message: 'Referral processed successfully',
        referrer: {
          username: referrer.username,
        },
      });
    } else {
      return NextResponse.json(
        { 
          success: false,
          error: 'Could not process referral. User may already have a referrer.' 
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('[API] Error processing referral:', error);
    return NextResponse.json(
      { error: 'Failed to process referral' },
      { status: 500 }
    );
  }
}

/**
 * Validate a referral code
 * 
 * GET /api/referral/process?code=XXXXX
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400 }
      );
    }

    const referrer = await getUserByReferralCode(code);

    if (!referrer) {
      return NextResponse.json(
        { valid: false, error: 'Invalid referral code' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      valid: true,
      referrer: {
        username: referrer.username,
      },
    });

  } catch (error) {
    console.error('[API] Error validating referral:', error);
    return NextResponse.json(
      { error: 'Failed to validate referral' },
      { status: 500 }
    );
  }
}

