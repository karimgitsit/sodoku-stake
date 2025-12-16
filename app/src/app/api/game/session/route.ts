import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, getUserEntry, getOrCreateDailyPuzzle } from '@/lib/db';
import { getTodayDate } from '@/lib/supabase';
import { applyVariantMapping } from '@/lib/variant';

/**
 * GET /api/game/session
 * 
 * Checks if the user has an existing game session for today.
 * If they do, returns the puzzle and game state so they can continue.
 * 
 * This prevents users from having to pay again if they quit mid-game.
 * 
 * Query params:
 * - userId: User's unique identifier (World ID nullifier hash)
 * 
 * Response:
 * - hasSession: boolean - whether user has an active game today
 * - If hasSession is true, also returns:
 *   - puzzle: 9x9 grid with user's variant
 *   - date: The puzzle date
 *   - difficulty: Puzzle difficulty level
 *   - entryId: Game entry ID
 *   - status: 'in_progress' | 'won' | 'lost'
 *   - mistakesCount: Number of mistakes made
 *   - maxMistakes: Maximum mistakes allowed
 *   - gameLocked: Whether game is locked due to mistakes
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const worldIdHash = searchParams.get('userId');

    // Validate userId
    if (!worldIdHash) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    const today = getTodayDate();

    // Get or create user
    const user = await getOrCreateUser(worldIdHash);
    
    // Check if user already has an entry for today
    const entry = await getUserEntry(user.id, today);
    
    if (!entry) {
      // No active session - user needs to pay to start a new game
      return NextResponse.json({
        success: true,
        hasSession: false,
      });
    }

    // User has an existing entry - return their puzzle and state
    const { puzzle, difficulty } = await getOrCreateDailyPuzzle(today);
    
    // Generate user's variant
    const variantPuzzle = applyVariantMapping(puzzle, user.id, today);

    console.log(`[Session] Restored session for user ${user.id.substring(0, 16)}... - status: ${entry.status}`);

    return NextResponse.json({
      success: true,
      hasSession: true,
      puzzle: variantPuzzle,
      date: today,
      difficulty,
      entryId: entry.id,
      status: entry.status,
      mistakesCount: entry.mistakes_count || 0,
      maxMistakes: entry.max_mistakes || 3,
      gameLocked: entry.game_locked || false,
    });

  } catch (error) {
    console.error('[API] Error checking game session:', error);
    return NextResponse.json(
      { error: 'Failed to check game session' },
      { status: 500 }
    );
  }
}

