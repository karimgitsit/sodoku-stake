import { NextRequest, NextResponse } from 'next/server';
import { Tokens, tokenToDecimals } from '@worldcoin/minikit-js';
import { getOrCreateUser, getUserEntry } from '@/lib/db';
import { getServerClient } from '@/lib/supabase';

/**
 * POST /api/payment/initiate
 *
 * Initiates a payment by generating a secure reference ID.
 * This reference is stored in Supabase and used to verify the payment later.
 *
 * IMPORTANT: For entry payments, this endpoint checks if the user already has
 * an entry for today. If they do, it returns an error BEFORE they can pay,
 * preventing accidental double payments.
 *
 * Following Worldcoin best practices:
 * https://docs.world.org/mini-apps/commands/pay
 */

// Payment reference type (matches Supabase payment_references table)
export type PaymentReference = {
  userId: string;
  type: 'entry' | 'reveal' | 'extra_life';
  puzzleDate: string;
  cellPosition?: { row: number; col: number };
  gameEntryId?: string;
  amount: string;
  tokenAmount: string;
  status: 'pending' | 'completed' | 'failed';
  transactionId?: string;
  username?: string;
  walletAddress?: string;
};

// Row shape returned by Supabase for payment_references
interface PaymentReferenceRow {
  reference: string;
  user_id: string;
  type: string;
  puzzle_date: string;
  cell_row: number | null;
  cell_col: number | null;
  game_entry_id: string | null;
  amount: number;
  token_amount: string;
  status: string;
  transaction_id: string | null;
}

/**
 * Get a payment reference from Supabase
 */
export async function getPaymentReference(reference: string): Promise<PaymentReference | null> {
  const supabase = getServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('payment_references')
    .select('*')
    .eq('reference', reference)
    .single();

  if (error || !data) return null;

  const row = data as unknown as PaymentReferenceRow;

  return {
    userId: row.user_id,
    type: row.type as PaymentReference['type'],
    puzzleDate: row.puzzle_date,
    cellPosition: row.cell_row !== null && row.cell_col !== null
      ? { row: row.cell_row, col: row.cell_col }
      : undefined,
    gameEntryId: row.game_entry_id ?? undefined,
    amount: String(row.amount),
    tokenAmount: row.token_amount,
    status: row.status as PaymentReference['status'],
    transactionId: row.transaction_id ?? undefined,
  };
}

/**
 * Update a payment reference in Supabase
 */
export async function updatePaymentReference(
  reference: string,
  updates: { status?: 'pending' | 'completed' | 'failed'; transactionId?: string }
) {
  const supabase = getServerClient();
  if (!supabase) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.status) updateData.status = updates.status;
  if (updates.transactionId) updateData.transaction_id = updates.transactionId;

  await supabase
    .from('payment_references')
    .update(updateData as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .eq('reference', reference);
}

// Entry fee: $1.00 USDC - using tokenToDecimals for proper conversion
const ENTRY_FEE_AMOUNT = 1; // $1.00
const ENTRY_FEE_USDC = tokenToDecimals(ENTRY_FEE_AMOUNT, Tokens.USDC).toString();
const ENTRY_FEE_DISPLAY = '1.00';

// Reveal fee: $0.20 USDC
const REVEAL_FEE_AMOUNT = 0.2; // $0.20
const REVEAL_FEE_USDC = tokenToDecimals(REVEAL_FEE_AMOUNT, Tokens.USDC).toString();
const REVEAL_FEE_DISPLAY = '0.20';

// Extra life fee: $0.25 USDC
const EXTRA_LIFE_FEE_AMOUNT = 0.25; // $0.25
const EXTRA_LIFE_FEE_USDC = tokenToDecimals(EXTRA_LIFE_FEE_AMOUNT, Tokens.USDC).toString();
const EXTRA_LIFE_FEE_DISPLAY = '0.25';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, type, puzzleDate, cellPosition, gameEntryId, username, walletAddress } = body;

    // Validate request
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    if (!type || !['entry', 'reveal', 'extra_life'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid payment type (must be "entry", "reveal", or "extra_life")' },
        { status: 400 }
      );
    }

    if (!puzzleDate) {
      return NextResponse.json(
        { error: 'Missing puzzleDate' },
        { status: 400 }
      );
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

    // IMPORTANT: For entry payments, check if user already has an entry for today
    // This prevents users from accidentally paying twice if they already started a game
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
        // SECURITY: If we can't verify whether user already has an entry,
        // we must fail the payment to prevent potential double charges
        console.error('[Payment] Error checking existing entry - failing payment for safety:', error);
        return NextResponse.json(
          { error: 'Unable to verify game status. Please try again.' },
          { status: 503 }
        );
      }
    }

    // Generate a unique reference ID (UUID without dashes, as per Worldcoin docs)
    const reference = crypto.randomUUID().replace(/-/g, '');

    // Determine amount based on type
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

    // Store the reference in Supabase for persistent cross-instance access
    const supabase = getServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await supabase
      .from('payment_references')
      .insert({
        reference,
        user_id: userId,
        type,
        puzzle_date: puzzleDate,
        cell_row: type === 'reveal' ? cellPosition?.row : null,
        cell_col: type === 'reveal' ? cellPosition?.col : null,
        game_entry_id: type === 'extra_life' ? gameEntryId : null,
        amount: parseFloat(amount),
        token_amount: tokenAmount,
        status: 'pending',
      } as any);

    if (insertError) {
      console.error('[Payment] Failed to store payment reference:', insertError);
      return NextResponse.json(
        { error: 'Failed to initiate payment' },
        { status: 500 }
      );
    }

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
    return NextResponse.json(
      { error: 'Failed to initiate payment' },
      { status: 500 }
    );
  }
}
