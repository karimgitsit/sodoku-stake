import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDailyPuzzle, getOrCreateUser, getUserEntry } from '@/lib/db';
import { getTodayDate } from '@/lib/supabase';
import { applyVariantMapping } from '@/lib/variant';

/**
 * GET /api/puzzle/today
 *
 * Returns the user's personalized puzzle variant for today if - and only if -
 * they already have a paid entry for today. Entry creation only happens via
 * /api/payment/confirm. Auto-creating an entry here would bypass payment and
 * also collide with the "already has entry" guard in /api/payment/initiate,
 * blocking legitimate payments.
 *
 * Query params:
 * - userId: User's World ID nullifier hash
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const worldIdHash = searchParams.get('userId');

    if (!worldIdHash) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    const today = getTodayDate();

    const user = await getOrCreateUser(worldIdHash);
    const entry = await getUserEntry(user.id, today);

    if (!entry) {
      return NextResponse.json(
        { error: 'No paid entry for today. Pay the entry fee to start playing.', hasEntry: false },
        { status: 404 }
      );
    }

    const { puzzle, difficulty } = await getOrCreateDailyPuzzle(today);
    const variantPuzzle = applyVariantMapping(puzzle, user.id, today);

    return NextResponse.json({
      success: true,
      puzzle: variantPuzzle,
      date: today,
      difficulty,
      entryId: entry.id,
    });
  } catch (error) {
    console.error('[API] Error fetching puzzle:', error);
    return NextResponse.json({ error: 'Failed to fetch puzzle' }, { status: 500 });
  }
}
