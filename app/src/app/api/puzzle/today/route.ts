import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDailyPuzzle, getOrCreateUser, createGameEntry, getUserEntry, generateVariantSeed } from '@/lib/db';
import { getTodayDate } from '@/lib/supabase';
import { applyVariantMapping } from '@/lib/variant';

/**
 * GET /api/puzzle/today
 * 
 * Returns the user's personalized puzzle variant for today.
 * 
 * Query params:
 * - userId: User's unique identifier (World ID nullifier hash)
 * 
 * Response:
 * - puzzle: 9x9 grid with user's variant (0 = empty cell)
 * - date: The puzzle date (YYYY-MM-DD)
 * - difficulty: Puzzle difficulty level
 * 
 * NOTE: Solution is NEVER returned to the client
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
    
    // Get today's puzzle
    const { puzzle, difficulty, puzzleId } = await getOrCreateDailyPuzzle(today);
    
    // Check if user already has an entry for today
    let entry = await getUserEntry(user.id, today);
    
    if (!entry) {
      // Create new entry
      const variantSeed = generateVariantSeed(user.id, today);
      entry = await createGameEntry(user.id, puzzleId, today, variantSeed);
    }

    // Generate user's variant
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
    return NextResponse.json(
      { error: 'Failed to fetch puzzle' },
      { status: 500 }
    );
  }
}

