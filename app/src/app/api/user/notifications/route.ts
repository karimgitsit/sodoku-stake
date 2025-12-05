import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase';

/**
 * GET /api/user/notifications
 * Fetch user's notification preferences
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const supabase = getServerClient();
    
    if (!supabase) {
      // Return default preferences in dev mode
      return NextResponse.json({
        notifications_enabled: true,
        notify_streak_risk: true,
        notify_achievements: true,
        notify_referrals: true,
        notify_reminders: true,
        notify_results: true,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    const { data: user, error } = await db
      .from('users')
      .select(`
        notifications_enabled,
        notify_streak_risk,
        notify_achievements,
        notify_referrals,
        notify_reminders,
        notify_results
      `)
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[API] Failed to fetch notification preferences:', error);
      return NextResponse.json(
        { error: 'Failed to fetch preferences' },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      notifications_enabled: user.notifications_enabled ?? true,
      notify_streak_risk: user.notify_streak_risk ?? true,
      notify_achievements: user.notify_achievements ?? true,
      notify_referrals: user.notify_referrals ?? true,
      notify_reminders: user.notify_reminders ?? true,
      notify_results: user.notify_results ?? true,
    });

  } catch (error) {
    console.error('[API] Error fetching notification preferences:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/notifications
 * Update user's notification preferences
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      userId,
      notifications_enabled,
      notify_streak_risk,
      notify_achievements,
      notify_referrals,
      notify_reminders,
      notify_results,
    } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const supabase = getServerClient();
    
    if (!supabase) {
      // Mock success in dev mode
      console.log('[API] Dev mode - notification preferences would be saved:', body);
      return NextResponse.json({ success: true });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // Build update object only with provided fields
    const updateData: Record<string, boolean> = {};
    if (notifications_enabled !== undefined) updateData.notifications_enabled = notifications_enabled;
    if (notify_streak_risk !== undefined) updateData.notify_streak_risk = notify_streak_risk;
    if (notify_achievements !== undefined) updateData.notify_achievements = notify_achievements;
    if (notify_referrals !== undefined) updateData.notify_referrals = notify_referrals;
    if (notify_reminders !== undefined) updateData.notify_reminders = notify_reminders;
    if (notify_results !== undefined) updateData.notify_results = notify_results;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No preferences to update' },
        { status: 400 }
      );
    }

    const { error } = await db
      .from('users')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('[API] Failed to update notification preferences:', error);
      return NextResponse.json(
        { error: 'Failed to update preferences' },
        { status: 500 }
      );
    }

    console.log(`[API] Updated notification preferences for user ${userId.substring(0, 8)}...`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[API] Error updating notification preferences:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

