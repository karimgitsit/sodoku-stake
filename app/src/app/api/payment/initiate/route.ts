import { NextRequest, NextResponse } from 'next/server';
import { Tokens, tokenToDecimals } from '@worldcoin/minikit-js';
import { getOrCreateUser, getUserEntry, createPaymentReference } from '@/lib/db';

/**
 * POST /api/payment/initiate
 *
 * Initiates a payment by generating a secure reference ID and persisting it
 * in Supabase. The reference is read back during /api/payment/confirm.
 *
 * Persistence (vs. an in-process Map) is what fixes the "paid but can't play"
 * bug: in a serverless deployment, initiate and confirm can run on different
 * lambda instances, and an in-memory reference would be lost between the two.
 *
 * For entry payments, this endpoint checks if the user already has an entry
 * for today and returns an error BEFORE the user pays, to prevent accidental
 * double charges.
 *
 * Body:
 * - userId: User's World ID nullifier hash
 * - type: 'entry' | 'reveal' | 'extra_life'
 * - puzzleDate: The date of the puzzle
 * - cellPosition?: { row: number, col: number } (reveal only)
 * - gameEntryId?: string (extra_life only)
 */

// Entry fee: $1.00 USDC
const ENTRY_FEE_AMOUNT = 1;
const ENTRY_FEE_USDC = tokenToDecimals(ENTRY_FEE_AMOUNT, Tokens.USDC).toString();
const ENTRY_FEE_DISPLAY = '1.00';

// Reveal fee: $0.20 USDC
const REVEAL_FEE_AMOUNT = 0.2;
const REVEAL_FEE_USDC = tokenToDecimals(REVEAL_FEE_AMOUNT, Tokens.USDC).toString();
const REVEAL_FEE_DISPLAY = '0.20';

// Extra life fee: $0.25 USDC
const EXTRA_LIFE_FEE_AMOUNT = 0.25;
const EXTRA_LIFE_FEE_USDC = tokenToDecimals(EXTRA_LIFE_FEE_AMOUNT, Tokens.USDC).toString();
const EXTRA_LIFE_FEE_DISPLAY = '0.25';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, type, puzzleDate, cellPosition, gameEntryId, username, walletAddress } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (!type || !['entry', 'reveal', 'extra_life'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid payment type (must be "entry", "reveal", or "extra_life")' },
        { status: 400 }
      );
    }

    if (!puzzleDate) {
      return NextResponse.json({ error: 'Missing puzzleDate' }, { status: 400 });
    }

    if (type === 'reveal' && (!cellPosition || cellPosition.row === undefined || cellPosition.col === undefined)) {
      return NextResponse.json(
        { error: 'Missing cellPosition for reveal payment' },
        { status: 400 }
      );
    }

    if (type === 'extra_life' && !gameEntryId) {
      return NextResponse.json(
        { error: 'Missing gameEntryId for extra_life payment' },
        { status: 400 }
      );
    }

    // For entry payments, reject up-front if the user already has an entry for
    // the day so they don't accidentally pay twice.
    if (type === 'entry') {
      try {
        const user = await getOrCreateUser(userId);
        const existingEntry = await getUserEntry(user.id, puzzleDate);

        if (existingEntry) {
          console.log(`[Payment] User ${userId.substring(0, 16)}... already has entry for ${puzzleDate}`);
          return NextResponse.json(
            {
              error: 'You already have an active game for today. Go to the puzzle screen to continue playing.',
              hasExistingEntry: true,
            },
            { status: 400 }
          );
        }
      } catch (error) {
        // If we can't verify, fail closed - better than risking a double charge.
        console.error('[Payment] Error checking existing entry - failing payment for safety:', error);
        return NextResponse.json(
          { error: 'Unable to verify game status. Please try again.' },
          { status: 503 }
        );
      }
    }

    // Unique reference ID (UUID without dashes, per Worldcoin docs).
    const reference = crypto.randomUUID().replace(/-/g, '');

    let tokenAmount: string;
    let amount: string;
    switch (type) {
      case 'entry':
        tokenAmount = ENTRY_FEE_USDC;
        amount = ENTRY_FEE_DISPLAY;
        break;
      case 'reveal':
        tokenAmount = REVEAL_FEE_USDC;
        amount = REVEAL_FEE_DISPLAY;
        break;
      case 'extra_life':
        tokenAmount = EXTRA_LIFE_FEE_USDC;
        amount = EXTRA_LIFE_FEE_DISPLAY;
        break;
      default:
        tokenAmount = ENTRY_FEE_USDC;
        amount = ENTRY_FEE_DISPLAY;
    }

    await createPaymentReference({
      reference,
      user_id: userId,
      type,
      puzzle_date: puzzleDate,
      cell_row: type === 'reveal' ? cellPosition.row : null,
      cell_col: type === 'reveal' ? cellPosition.col : null,
      game_entry_id: type === 'extra_life' ? gameEntryId : null,
      username: username ?? null,
      wallet_address: walletAddress ?? null,
      amount: parseFloat(amount),
      token_amount: tokenAmount,
      status: 'pending',
    });

    console.log(`[Payment] Initiated ${type} payment: reference=${reference}, userId=${userId.substring(0, 16)}...`);

    return NextResponse.json({
      success: true,
      reference,
      amount,
      tokenAmount,
      type,
    });
  } catch (error) {
    console.error('[Payment] Error initiating payment:', error);
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 });
  }
}
