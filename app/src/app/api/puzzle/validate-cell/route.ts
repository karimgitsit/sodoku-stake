import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDailyPuzzle, getOrCreateUser, getUserEntry, recordMistake } from '@/lib/db';
import { getTodayDate } from '@/lib/supabase';
import { generateVariantMapping } from '@/lib/variant';

/**
 * POST /api/puzzle/validate-cell
 * 
 * Validates a single cell entry and tracks mistakes.
 * 
 * Body:
 * - userId: User's unique identifier (World ID nullifier hash)
 * - row: Row index (0-8)
 * - col: Column index (0-8)
 * - value: The value entered by the user (1-9)
 * 
 * Response:
 * - correct: Whether the value is correct
 * - mistakesCount: Current number of mistakes
 * - maxMistakes: Maximum allowed mistakes
 * - gameLocked: Whether the game is now locked
 * - message: Informational message
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId: worldIdHash, row, col, value } = body;

    // Validate request
    if (!worldIdHash) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    if (row === undefined || col === undefined || row < 0 || row > 8 || col < 0 || col > 8) {
      return NextResponse.json(
        { error: 'Invalid cell position' },
        { status: 400 }
      );
    }

    if (!value || value < 1 || value > 9) {
      return NextResponse.json(
        { error: 'Invalid cell value' },
        { status: 400 }
      );
    }

    const today = getTodayDate();

    // Get user and their entry
    const user = await getOrCreateUser(worldIdHash);
    const entry = await getUserEntry(user.id, today);

    if (!entry) {
      return NextResponse.json(
        { error: 'No active game entry found' },
        { status: 404 }
      );
    }

    if (entry.status === 'won') {
      return NextResponse.json({
        correct: true,
        message: 'Puzzle already solved',
        mistakesCount: entry.mistakes_count,
        maxMistakes: entry.max_mistakes,
        gameLocked: false,
      });
    }

    if (entry.game_locked) {
      return NextResponse.json({
        correct: false,
        message: 'Game is locked due to too many mistakes. Purchase an extra life to continue.',
        mistakesCount: entry.mistakes_count,
        maxMistakes: entry.max_mistakes,
        gameLocked: true,
      });
    }

    // Get today's puzzle solution
    const { solution: baseSolution } = await getOrCreateDailyPuzzle(today);
    
    // Apply user's variant mapping to get the correct value
    const mapping = generateVariantMapping(user.id, today);
    const baseSolutionValue = baseSolution[row][col];
    const expectedValue = mapping.get(baseSolutionValue) || baseSolutionValue;

    // Check if the value is correct
    const isCorrect = value === expectedValue;

    if (isCorrect) {
      // Value is correct - no mistake recorded
      return NextResponse.json({
        correct: true,
        message: 'Correct!',
        mistakesCount: entry.mistakes_count,
        maxMistakes: entry.max_mistakes,
        gameLocked: false,
      });
    }

    // Value is incorrect - record the mistake
    const mistakeResult = await recordMistake(entry.id);
    
    // Calculate remaining chances
    const chancesLeft = mistakeResult.maxMistakes - mistakeResult.mistakesCount;
    
    // Determine the appropriate message
    let message: string;
    if (mistakeResult.gameLocked) {
      message = "Oh no! You've made too many mistakes and cannot continue. Purchase an extra life to keep playing!";
    } else if (chancesLeft === 1) {
      // On last life - show warning
      message = "⚠️ Watch out! You have 1 chance left. If you make one more mistake, you cannot continue today's attempt.";
    } else {
      message = `Incorrect! You have ${chancesLeft} chances left.`;
    }

    console.log(`[Validate] User ${user.id.substring(0, 16)}... made mistake ${mistakeResult.mistakesCount}/${mistakeResult.maxMistakes} at [${row},${col}], ${chancesLeft} chances left`);

    return NextResponse.json({
      correct: false,
      message,
      mistakesCount: mistakeResult.mistakesCount,
      maxMistakes: mistakeResult.maxMistakes,
      gameLocked: mistakeResult.gameLocked,
    });

  } catch (error) {
    console.error('[API] Error validating cell:', error);
    return NextResponse.json(
      { error: 'Failed to validate cell' },
      { status: 500 }
    );
  }
}

