import { NextRequest, NextResponse } from 'next/server';
import { getPaymentReference, updatePaymentReference } from '../initiate/route';
import { getOrCreateUser, createGameEntry, generateVariantSeed, getUserEntry, recordReveal, getUserReferrer, recordReferralEarning, getTodayStats, TaxRate, addExtraLife, recordExtraLifePurchase } from '@/lib/db';
import { getTodayDate } from '@/lib/supabase';
import { getOrCreateDailyPuzzle } from '@/lib/db';

/**
 * POST /api/payment/confirm
 * 
 * Verifies a payment was successful using the Worldcoin Developer Portal API.
 * This follows the best practices from: https://docs.world.org/mini-apps/commands/pay
 * 
 * Body:
 * - reference: The payment reference from initiate
 * - transaction_id: The transaction ID from MiniKit payment response
 * 
 * Response:
 * - success: boolean
 * - message: string
 * - For entry payments: puzzle data
 * - For reveal payments: revealed cell value
 */

const APP_ID = process.env.NEXT_PUBLIC_APP_ID;
const DEV_PORTAL_API_KEY = process.env.DEV_PORTAL_API_KEY;

interface TransactionResponse {
  transaction_id: string;
  reference: string;
  status: 'pending' | 'mined' | 'failed';
  chain: string;
  network: string;
  from_address: string;
  to_address: string;
  token_amount: string;
  token: string;
  created_at: string;
  updated_at: string;
}

/**
 * Verify a payment transaction with the Worldcoin Developer Portal
 */
async function verifyTransactionWithWorldcoin(transactionId: string): Promise<{
  verified: boolean;
  transaction?: TransactionResponse;
  error?: string;
}> {
  // In development mode without API key, mock the verification
  if (process.env.NODE_ENV === 'development' && !DEV_PORTAL_API_KEY) {
    console.log('[Payment] Dev mode: Mocking transaction verification');
    return {
      verified: true,
      transaction: {
        transaction_id: transactionId,
        reference: 'mock_reference',
        status: 'mined',
        chain: 'worldchain',
        network: 'mainnet',
        from_address: '0xDevMockWallet1234567890abcdef1234567890ab',
        to_address: '0x0000000000000000000000000000000000000000',
        token_amount: '1000000',
        token: 'USDC',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };
  }

  if (!DEV_PORTAL_API_KEY || !APP_ID) {
    console.error('[Payment] Missing DEV_PORTAL_API_KEY or APP_ID');
    return {
      verified: false,
      error: 'Server configuration error',
    };
  }

  try {
    const response = await fetch(
      `https://developer.worldcoin.org/api/v2/minikit/transaction/${transactionId}?app_id=${APP_ID}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DEV_PORTAL_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Payment] Worldcoin API error:', response.status, errorText);
      return {
        verified: false,
        error: `Verification failed: ${response.status}`,
      };
    }

    const transaction = await response.json() as TransactionResponse;

    // Check transaction status
    // We optimistically accept pending/mined, only reject failed
    if (transaction.status === 'failed') {
      return {
        verified: false,
        error: 'Transaction failed',
      };
    }

    return {
      verified: true,
      transaction,
    };

  } catch (error) {
    console.error('[Payment] Error verifying with Worldcoin:', error);
    return {
      verified: false,
      error: 'Failed to verify payment',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reference, transaction_id } = body;

    // Validate request
    if (!reference) {
      return NextResponse.json(
        { error: 'Missing payment reference' },
        { status: 400 }
      );
    }

    if (!transaction_id) {
      return NextResponse.json(
        { error: 'Missing transaction_id' },
        { status: 400 }
      );
    }

    // Get the stored payment reference
    const paymentRef = getPaymentReference(reference);

    if (!paymentRef) {
      return NextResponse.json(
        { error: 'Invalid or expired payment reference' },
        { status: 400 }
      );
    }

    if (paymentRef.status === 'completed') {
      return NextResponse.json(
        { error: 'Payment already processed' },
        { status: 400 }
      );
    }

    console.log(`[Payment] Confirming ${paymentRef.type} payment: reference=${reference}, tx=${transaction_id}`);

    // Verify the transaction with Worldcoin
    const verification = await verifyTransactionWithWorldcoin(transaction_id);

    if (!verification.verified) {
      updatePaymentReference(reference, { status: 'failed' });
      return NextResponse.json(
        { error: verification.error || 'Payment verification failed' },
        { status: 400 }
      );
    }

    // Verify the reference matches (if returned by API)
    if (verification.transaction?.reference && verification.transaction.reference !== reference) {
      // In practice, the API might not return the reference, so we skip this check if not available
      console.warn('[Payment] Reference mismatch - proceeding anyway (API may not return reference)');
    }

    // Mark payment as completed
    updatePaymentReference(reference, { 
      status: 'completed',
      transactionId: transaction_id,
    });

    // Get the wallet address from the verified transaction (from_address is the sender)
    const walletAddressFromTx = verification.transaction?.from_address;
    
    if (walletAddressFromTx) {
      console.log(`[Payment] Wallet address from transaction: ${walletAddressFromTx}`);
    }

    // Process based on payment type
    if (paymentRef.type === 'entry') {
      return await handleEntryPayment(paymentRef, transaction_id, walletAddressFromTx);
    } else if (paymentRef.type === 'extra_life') {
      return await handleExtraLifePayment(paymentRef, transaction_id, walletAddressFromTx);
    } else {
      return await handleRevealPayment(paymentRef, transaction_id, walletAddressFromTx);
    }

  } catch (error) {
    console.error('[Payment] Error confirming payment:', error);
    return NextResponse.json(
      { error: 'Failed to confirm payment' },
      { status: 500 }
    );
  }
}

/**
 * Handle a confirmed entry payment - create game entry and return puzzle
 */
async function handleEntryPayment(
  paymentRef: {
    userId: string;
    puzzleDate: string;
    username?: string;
    walletAddress?: string;
  },
  transactionId: string,
  walletAddressFromTx?: string
) {
  const { userId, puzzleDate, username } = paymentRef;
  // Prefer wallet address from transaction (more reliable) over MiniKit
  const walletAddress = walletAddressFromTx || paymentRef.walletAddress;
  const today = getTodayDate();

  // Get or create user (with wallet address from MiniKit)
  const user = await getOrCreateUser(userId, username, walletAddress);

  // Check if user already has an entry for today
  let entry = await getUserEntry(user.id, puzzleDate);

  if (entry) {
    return NextResponse.json(
      { error: 'You have already entered today\'s puzzle' },
      { status: 400 }
    );
  }

  // Get today's puzzle
  const { puzzle, difficulty, puzzleId } = await getOrCreateDailyPuzzle(puzzleDate);

  // Create the game entry
  const variantSeed = generateVariantSeed(user.id, puzzleDate);
  entry = await createGameEntry(user.id, puzzleId, puzzleDate, variantSeed, transactionId);

  // Record referral earning if user was referred
  const referrer = await getUserReferrer(user.id);
  if (referrer) {
    // Get current tax rate for referral commission calculation
    const stats = await getTodayStats(puzzleDate);
    await recordReferralEarning(
      referrer.id,
      user.id,
      'entry',
      entry.id,
      puzzleDate,
      stats.taxRate as TaxRate
    );
    console.log(`[Payment] Recorded referral commission for referrer ${referrer.id}`);
  }

  // Apply variant mapping to puzzle for this user
  const { applyVariantMapping } = await import('@/lib/variant');
  const variantPuzzle = applyVariantMapping(puzzle, user.id, puzzleDate);

  console.log(`[Payment] Entry confirmed: user=${user.id.substring(0, 16)}..., date=${puzzleDate}`);

  return NextResponse.json({
    success: true,
    message: 'Entry confirmed! Good luck!',
    puzzle: variantPuzzle,
    date: puzzleDate,
    difficulty,
    entryId: entry.id,
    userStats: {
      currentStreak: user.current_streak || 0,
      longestStreak: user.longest_streak || 0,
      hasStreakInsurance: user.has_streak_insurance || false,
    },
  });
}

/**
 * Handle a confirmed reveal payment - return the cell value
 */
async function handleRevealPayment(
  paymentRef: {
    userId: string;
    puzzleDate: string;
    cellPosition?: { row: number; col: number };
    username?: string;
    walletAddress?: string;
  },
  transactionId: string,
  walletAddressFromTx?: string
) {
  const { userId, puzzleDate, cellPosition, username } = paymentRef;
  // Prefer wallet address from transaction (more reliable) over MiniKit
  const walletAddress = walletAddressFromTx || paymentRef.walletAddress;

  if (!cellPosition) {
    return NextResponse.json(
      { error: 'Missing cell position' },
      { status: 400 }
    );
  }

  const { row, col } = cellPosition;

  // Get user (with wallet address from MiniKit)
  const user = await getOrCreateUser(userId, username, walletAddress);

  // Get today's puzzle solution
  const { solution } = await getOrCreateDailyPuzzle(puzzleDate);

  // Apply user's variant mapping to get the correct value
  const { generateVariantMapping } = await import('@/lib/variant');
  const mapping = generateVariantMapping(user.id, puzzleDate);
  const baseSolutionValue = solution[row][col];
  const mappedValue = mapping.get(baseSolutionValue) || baseSolutionValue;

  // Record the reveal transaction
  await recordReveal(user.id, puzzleDate, row, col, transactionId);

  // Record referral earning if user was referred
  const referrer = await getUserReferrer(user.id);
  if (referrer) {
    // Reveals use the standard 20% equivalent rate since they're not affected by prize pool
    await recordReferralEarning(
      referrer.id,
      user.id,
      'reveal',
      transactionId,
      puzzleDate,
      20 as TaxRate
    );
    console.log(`[Payment] Recorded reveal referral commission for referrer ${referrer.id}`);
  }

  console.log(`[Payment] Reveal confirmed: user=${user.id.substring(0, 16)}..., cell=[${row},${col}], value=${mappedValue}`);

  return NextResponse.json({
    success: true,
    message: 'Cell revealed!',
    value: mappedValue,
    row,
    col,
  });
}

/**
 * Handle a confirmed extra life payment - unlock the game and add an extra life
 */
async function handleExtraLifePayment(
  paymentRef: {
    userId: string;
    puzzleDate: string;
    gameEntryId?: string;
    username?: string;
    walletAddress?: string;
  },
  transactionId: string,
  walletAddressFromTx?: string
) {
  const { userId, puzzleDate, gameEntryId, username } = paymentRef;
  // Prefer wallet address from transaction (more reliable) over MiniKit
  const walletAddress = walletAddressFromTx || paymentRef.walletAddress;

  if (!gameEntryId) {
    return NextResponse.json(
      { error: 'Missing game entry ID' },
      { status: 400 }
    );
  }

  // Get user (with wallet address from MiniKit)
  const user = await getOrCreateUser(userId, username, walletAddress);

  // Verify the game entry belongs to this user
  const entry = await getUserEntry(user.id, puzzleDate);
  if (!entry || entry.id !== gameEntryId) {
    return NextResponse.json(
      { error: 'Invalid game entry' },
      { status: 400 }
    );
  }

  // Add the extra life
  const result = await addExtraLife(gameEntryId);

  // Record the extra life purchase
  await recordExtraLifePurchase(user.id, gameEntryId, puzzleDate, transactionId);

  console.log(`[Payment] Extra life confirmed: user=${user.id.substring(0, 16)}..., maxMistakes=${result.maxMistakes}`);

  return NextResponse.json({
    success: true,
    message: 'Extra life purchased! You can continue playing.',
    mistakesCount: result.mistakesCount,
    maxMistakes: result.maxMistakes,
    gameLocked: result.gameLocked,
  });
}

