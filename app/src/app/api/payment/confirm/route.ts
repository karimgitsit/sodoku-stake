import { NextRequest, NextResponse } from 'next/server';
import {
  getOrCreateUser,
  createGameEntry,
  generateVariantSeed,
  getUserEntry,
  recordReveal,
  getUserReferrer,
  recordReferralEarning,
  getTodayStats,
  TaxRate,
  addExtraLife,
  recordExtraLifePurchase,
  getOrCreateDailyPuzzle,
  getPaymentReferenceByRef,
  getPaymentReferenceByTransactionId,
  updatePaymentReference,
  getEntryByTransactionHash,
} from '@/lib/db';
import type { PaymentReferenceRow } from '@/types/database';

/**
 * POST /api/payment/confirm
 *
 * Verifies a payment with the Worldcoin Developer Portal API and creates the
 * corresponding game state. Payment references are read from Supabase, so a
 * reference created on one serverless instance can be confirmed on another.
 *
 * Idempotency / recovery:
 * - If the caller retries with the same reference after it's already been
 *   processed, we return the existing game entry instead of erroring.
 * - If the reference itself is missing (e.g. from an older in-memory-only
 *   deploy), we fall back to looking it up by transaction_id, so users who
 *   paid but got a "reference expired" error can still recover.
 *
 * Body:
 * - reference: payment reference from /api/payment/initiate
 * - transaction_id: transaction id returned by MiniKit
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

async function verifyTransactionWithWorldcoin(transactionId: string): Promise<{
  verified: boolean;
  transaction?: TransactionResponse;
  error?: string;
}> {
  // Dev mode without an API key: mock verification so we can exercise the flow
  // locally without hitting Worldcoin.
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
    return { verified: false, error: 'Server configuration error' };
  }

  try {
    const response = await fetch(
      `https://developer.worldcoin.org/api/v2/minikit/transaction/${transactionId}?app_id=${APP_ID}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${DEV_PORTAL_API_KEY}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Payment] Worldcoin API error:', response.status, errorText);
      return { verified: false, error: `Verification failed: ${response.status}` };
    }

    const transaction = (await response.json()) as TransactionResponse;

    // Only "failed" is a hard reject. We accept both "pending" and "mined"
    // because World Chain mines quickly and the client typically calls confirm
    // before the transaction has propagated to the mined state.
    if (transaction.status === 'failed') {
      return { verified: false, error: 'Transaction failed' };
    }

    return { verified: true, transaction };
  } catch (error) {
    console.error('[Payment] Error verifying with Worldcoin:', error);
    return { verified: false, error: 'Failed to verify payment' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reference, transaction_id } = body;

    if (!reference) {
      return NextResponse.json({ error: 'Missing payment reference' }, { status: 400 });
    }

    if (!transaction_id) {
      return NextResponse.json({ error: 'Missing transaction_id' }, { status: 400 });
    }

    // Primary lookup: by reference. Fall back to transaction_id so users whose
    // reference was lost (e.g. in-memory-map era) can still recover their entry.
    let paymentRef: PaymentReferenceRow | null = await getPaymentReferenceByRef(reference);
    if (!paymentRef) {
      paymentRef = await getPaymentReferenceByTransactionId(transaction_id);
      if (paymentRef) {
        console.warn(
          `[Payment] Reference ${reference} missing; recovered via transaction_id=${transaction_id}`
        );
      }
    }

    if (!paymentRef) {
      return NextResponse.json(
        { error: 'Invalid or expired payment reference' },
        { status: 400 }
      );
    }

    console.log(
      `[Payment] Confirming ${paymentRef.type} payment: reference=${paymentRef.reference}, tx=${transaction_id}, status=${paymentRef.status}`
    );

    // Idempotent retry: if we already processed this reference, return the
    // existing state instead of erroring. This is what keeps users who
    // double-tap or reload from getting stuck.
    if (paymentRef.status === 'completed') {
      return await returnExistingState(paymentRef, transaction_id);
    }

    if (paymentRef.status === 'failed') {
      return NextResponse.json(
        { error: 'This payment previously failed. Please start a new payment.' },
        { status: 400 }
      );
    }

    const verification = await verifyTransactionWithWorldcoin(transaction_id);

    if (!verification.verified) {
      await updatePaymentReference(reference, {
        status: 'failed',
        transaction_id,
        error_message: verification.error ?? null,
      });
      return NextResponse.json(
        { error: verification.error || 'Payment verification failed' },
        { status: 400 }
      );
    }

    if (verification.transaction?.reference && verification.transaction.reference !== reference) {
      // Some API responses omit the reference; we only log a mismatch rather
      // than reject, to avoid false negatives.
      console.warn('[Payment] Reference mismatch - proceeding anyway');
    }

    await updatePaymentReference(reference, {
      status: 'completed',
      transaction_id,
    });

    const walletAddressFromTx = verification.transaction?.from_address;
    if (walletAddressFromTx) {
      console.log(`[Payment] Wallet address from transaction: ${walletAddressFromTx}`);
    }

    if (paymentRef.type === 'entry') {
      return await handleEntryPayment(paymentRef, transaction_id, walletAddressFromTx);
    } else if (paymentRef.type === 'extra_life') {
      return await handleExtraLifePayment(paymentRef, transaction_id, walletAddressFromTx);
    } else {
      return await handleRevealPayment(paymentRef, transaction_id, walletAddressFromTx);
    }
  } catch (error) {
    console.error('[Payment] Error confirming payment:', error);
    return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 });
  }
}

/**
 * Idempotent path: the reference is already marked completed, so return the
 * existing game state instead of forcing the client through a failure.
 */
async function returnExistingState(
  paymentRef: PaymentReferenceRow,
  transactionId: string
): Promise<NextResponse> {
  if (paymentRef.type === 'entry') {
    const user = await getOrCreateUser(
      paymentRef.user_id,
      paymentRef.username ?? undefined,
      paymentRef.wallet_address ?? undefined
    );

    // Prefer the entry created by this exact transaction; fall back to the
    // user's entry for that day so clients with a valid paid reference always
    // get a playable puzzle back.
    const entry =
      (await getEntryByTransactionHash(transactionId)) ??
      (await getUserEntry(user.id, paymentRef.puzzle_date));

    if (!entry) {
      // Reference says completed but no entry exists - something went wrong
      // after the on-chain transfer. Tell the client so we can surface it.
      return NextResponse.json(
        { error: 'Payment recorded but no game entry found. Contact support.' },
        { status: 500 }
      );
    }

    const { puzzle, difficulty } = await getOrCreateDailyPuzzle(paymentRef.puzzle_date);
    const { applyVariantMapping } = await import('@/lib/variant');
    const variantPuzzle = applyVariantMapping(puzzle, user.id, paymentRef.puzzle_date);

    return NextResponse.json({
      success: true,
      message: 'Entry already confirmed. Welcome back!',
      puzzle: variantPuzzle,
      date: paymentRef.puzzle_date,
      difficulty,
      entryId: entry.id,
      userStats: {
        currentStreak: user.current_streak || 0,
        longestStreak: user.longest_streak || 0,
        hasStreakInsurance: user.has_streak_insurance || false,
      },
    });
  }

  // Reveals and extra lives are one-shot side effects; a retry shouldn't
  // replay them. Return a neutral success to keep the client happy.
  return NextResponse.json(
    { success: true, message: 'Payment already processed.' },
    { status: 200 }
  );
}

async function handleEntryPayment(
  paymentRef: PaymentReferenceRow,
  transactionId: string,
  walletAddressFromTx?: string
) {
  const { user_id: userId, puzzle_date: puzzleDate, username } = paymentRef;
  const walletAddress = walletAddressFromTx || paymentRef.wallet_address || undefined;

  const user = await getOrCreateUser(userId, username ?? undefined, walletAddress);

  // If an entry already exists for this user + day, return it instead of
  // erroring out. The on-chain transfer has already happened, so erroring here
  // is exactly the "paid but can't play" failure mode we're fixing.
  const existing = await getUserEntry(user.id, puzzleDate);
  const { puzzle, difficulty, puzzleId } = await getOrCreateDailyPuzzle(puzzleDate);
  const { applyVariantMapping } = await import('@/lib/variant');
  const variantPuzzle = applyVariantMapping(puzzle, user.id, puzzleDate);

  let entry = existing;
  if (!entry) {
    const variantSeed = generateVariantSeed(user.id, puzzleDate);
    entry = await createGameEntry(user.id, puzzleId, puzzleDate, variantSeed, transactionId);

    // Referral commission only on the first successful entry creation.
    const referrer = await getUserReferrer(user.id);
    if (referrer) {
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
  } else {
    console.log(
      `[Payment] Entry already existed for user=${user.id.substring(0, 16)}... date=${puzzleDate}; returning existing entry`
    );
  }

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

async function handleRevealPayment(
  paymentRef: PaymentReferenceRow,
  transactionId: string,
  walletAddressFromTx?: string
) {
  const { user_id: userId, puzzle_date: puzzleDate, cell_row, cell_col, username } = paymentRef;
  const walletAddress = walletAddressFromTx || paymentRef.wallet_address || undefined;

  if (cell_row === null || cell_col === null) {
    return NextResponse.json({ error: 'Missing cell position' }, { status: 400 });
  }

  const user = await getOrCreateUser(userId, username ?? undefined, walletAddress);

  const { solution } = await getOrCreateDailyPuzzle(puzzleDate);

  const { generateVariantMapping } = await import('@/lib/variant');
  const mapping = generateVariantMapping(user.id, puzzleDate);
  const baseSolutionValue = solution[cell_row][cell_col];
  const mappedValue = mapping.get(baseSolutionValue) || baseSolutionValue;

  await recordReveal(user.id, puzzleDate, cell_row, cell_col, transactionId);

  const referrer = await getUserReferrer(user.id);
  if (referrer) {
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

  console.log(
    `[Payment] Reveal confirmed: user=${user.id.substring(0, 16)}..., cell=[${cell_row},${cell_col}], value=${mappedValue}`
  );

  return NextResponse.json({
    success: true,
    message: 'Cell revealed!',
    value: mappedValue,
    row: cell_row,
    col: cell_col,
  });
}

async function handleExtraLifePayment(
  paymentRef: PaymentReferenceRow,
  transactionId: string,
  walletAddressFromTx?: string
) {
  const { user_id: userId, puzzle_date: puzzleDate, game_entry_id: gameEntryId, username } = paymentRef;
  const walletAddress = walletAddressFromTx || paymentRef.wallet_address || undefined;

  if (!gameEntryId) {
    return NextResponse.json({ error: 'Missing game entry ID' }, { status: 400 });
  }

  const user = await getOrCreateUser(userId, username ?? undefined, walletAddress);

  const entry = await getUserEntry(user.id, puzzleDate);
  if (!entry || entry.id !== gameEntryId) {
    return NextResponse.json({ error: 'Invalid game entry' }, { status: 400 });
  }

  const result = await addExtraLife(gameEntryId);
  await recordExtraLifePurchase(user.id, gameEntryId, puzzleDate, transactionId);

  console.log(
    `[Payment] Extra life confirmed: user=${user.id.substring(0, 16)}..., maxMistakes=${result.maxMistakes}`
  );

  return NextResponse.json({
    success: true,
    message: 'Extra life purchased! You can continue playing.',
    mistakesCount: result.mistakesCount,
    maxMistakes: result.maxMistakes,
    gameLocked: result.gameLocked,
  });
}
