import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateDailyPuzzle, getOrCreateUser, getUserEntry, markEntryAsWon, getTodayStats, calculateTaxBreakdown, updateUser, getUserReferrer, getUserById } from '@/lib/db';
import { getTodayDate } from '@/lib/supabase';
import { applyVariantMapping } from '@/lib/variant';
import { 
  sendFirstWinNotification, 
  sendWinStreakNotification, 
  sendEarningsMilestoneNotification,
  sendReferralFirstPlayNotification 
} from '@/lib/notifications';

/**
 * POST /api/puzzle/submit
 * 
 * Validates and submits a user's puzzle solution.
 * 
 * Body:
 * - userId: User's unique identifier (World ID nullifier hash)
 * - solution: 9x9 grid of the user's solution
 * - solveTimeSeconds: Time taken to solve (optional)
 * 
 * Response:
 * - correct: Whether the solution is correct
 * - message: Success/error message
 * - prizeAmount: Amount won (if correct)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId: worldIdHash, solution, solveTimeSeconds } = body;

    // Validate request
    if (!worldIdHash) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    if (!solution || !Array.isArray(solution)) {
      return NextResponse.json(
        { error: 'Missing or invalid solution' },
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
        success: true,
        correct: true,
        message: 'You already solved this puzzle!',
        alreadySolved: true,
      });
    }

    // Get today's puzzle and validate solution
    const { solution: baseSolution } = await getOrCreateDailyPuzzle(today);
    
    // Apply user's variant mapping to the solution for comparison
    const expectedSolution = applyVariantMapping(baseSolution, user.id, today);
    
    // Validate
    const result = validateSolution(solution, expectedSolution);

    if (!result.valid) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    if (result.correct) {
      // Mark entry as won
      await markEntryAsWon(entry.id, solveTimeSeconds || 0);
      
      // Get current stats for prize estimate (including this new winner)
      const stats = await getTodayStats(today);
      const estimatedWinners = stats.winners + 1;
      
      // Calculate tax breakdown with the updated winner count
      const taxBreakdown = calculateTaxBreakdown(stats.players, estimatedWinners);
      
      // ===========================================================================
      // UPDATE USER STATS (synchronous - must complete before response)
      // ===========================================================================
      // Increment total_wins immediately to ensure it's tracked
      // NOTE: current_streak, longest_streak, last_played_date, and has_streak_insurance
      // are handled by the database trigger on game entry creation
      const newTotalWins = (user.total_wins || 0) + 1;
      try {
        await updateUser(user.id, {
          total_wins: newTotalWins,
        });
        console.log(`[Submit] Updated total_wins for user ${user.id.substring(0, 8)}... to ${newTotalWins}`);
      } catch (error) {
        console.error(`[Submit] Failed to update total_wins for user ${user.id.substring(0, 8)}...:`, error);
        // Don't fail the response - the win is still recorded in game_entries
      }
      
      // ===========================================================================
      // ACHIEVEMENT NOTIFICATIONS (async - don't block response)
      // ===========================================================================
      (async () => {
        try {
          // Refresh user to get updated stats
          const updatedUser = await getUserById(user.id);
          if (!updatedUser || !updatedUser.wallet_address) return;
          
          const username = updatedUser.username || 'Player';
          const walletAddress = updatedUser.wallet_address;
          const totalWins = updatedUser.total_wins; // Already updated above
          const currentStreak = updatedUser.current_streak;
          const estimatedNewEarnings = updatedUser.total_earnings + taxBreakdown.prizePerWinner;
          
          // 1. First win notification
          if (totalWins === 1) {
            console.log(`[Notifications] Sending first win notification to ${username}`);
            await sendFirstWinNotification(
              user.id,
              walletAddress,
              username,
              taxBreakdown.prizePerWinner
            );
            
            // Also notify the referrer if this user was referred
            const referrer = await getUserReferrer(user.id);
            if (referrer && referrer.wallet_address) {
              console.log(`[Notifications] Sending referral first play notification to ${referrer.username}`);
              await sendReferralFirstPlayNotification(
                referrer.id,
                referrer.wallet_address,
                referrer.username || 'Player',
                username
              );
            }
            return; // Don't stack notifications on first win
          }
          
          // 2. Win streak milestones (3, 7, 14, 30)
          const winStreakMilestones = [3, 7, 14, 30] as const;
          for (const milestone of winStreakMilestones) {
            if (currentStreak === milestone) {
              console.log(`[Notifications] Sending ${milestone}-win streak notification to ${username}`);
              await sendWinStreakNotification(
                user.id,
                walletAddress,
                username,
                milestone
              );
              return; // One notification at a time
            }
          }
          
          // 3. Earnings milestones ($10, $50, $100)
          const earningsMilestones = [10, 50, 100] as const;
          const previousEarnings = updatedUser.total_earnings;
          for (const milestone of earningsMilestones) {
            // Check if we crossed this milestone with this win
            if (previousEarnings < milestone && estimatedNewEarnings >= milestone) {
              console.log(`[Notifications] Sending $${milestone} earnings milestone notification to ${username}`);
              await sendEarningsMilestoneNotification(
                user.id,
                walletAddress,
                username,
                milestone
              );
              return; // One notification at a time
            }
          }
        } catch (error) {
          console.error('[Notifications] Error sending achievement notification:', error);
        }
      })();
      // ===========================================================================
      
      return NextResponse.json({
        success: true,
        correct: true,
        message: 'Congratulations! Puzzle solved correctly!',
        solveTimeSeconds,
        prizeEstimate: {
          note: 'Final prize calculated after daily deadline (00:00 UTC)',
          currentPool: taxBreakdown.prizePool,
          estimatedWinners,
          estimatedPrize: taxBreakdown.prizePerWinner,
          taxRate: taxBreakdown.taxRate,
          taxExplanation: taxBreakdown.taxRate === 0
            ? 'No platform fee applied (too many winners to break even with tax)'
            : taxBreakdown.taxRate === 10
            ? '10% platform fee (reduced from 20% to ensure winners break even)'
            : '20% platform fee',
        },
      });
    } else {
      return NextResponse.json({
        success: true,
        correct: false,
        message: result.message,
      });
    }

  } catch (error) {
    console.error('[API] Error submitting solution:', error);
    return NextResponse.json(
      { error: 'Failed to submit solution' },
      { status: 500 }
    );
  }
}

// =============================================================================
// VALIDATION LOGIC
// =============================================================================

interface ValidationResult {
  valid: boolean;
  correct: boolean;
  message: string;
}

function validateSolution(submitted: number[][], expected: number[][]): ValidationResult {
  // Validate grid structure
  if (!submitted || submitted.length !== 9) {
    return { valid: false, correct: false, message: 'Invalid grid structure' };
  }
  
  for (let row = 0; row < 9; row++) {
    if (!submitted[row] || submitted[row].length !== 9) {
      return { valid: false, correct: false, message: 'Invalid row structure' };
    }
    
    for (let col = 0; col < 9; col++) {
      const value = submitted[row][col];
      
      // Check for incomplete cells
      if (value === 0 || value === null) {
        return { valid: true, correct: false, message: 'Puzzle is incomplete' };
      }
      
      // Check for incorrect cells
      if (value !== expected[row][col]) {
        return { valid: true, correct: false, message: 'Solution contains errors' };
      }
    }
  }
  
  return { valid: true, correct: true, message: 'Correct!' };
}

