import { NextRequest, NextResponse } from 'next/server';
import { Tokens, tokenToDecimals } from '@worldcoin/minikit-js';

/**
 * POST /api/payment/initiate
 * 
 * Initiates a payment by generating a secure reference ID.
 * This reference is stored server-side and used to verify the payment later.
 * 
 * Following Worldcoin best practices:
 * https://docs.world.org/mini-apps/commands/pay
 * 
 * Body:
 * - userId: User's World ID nullifier hash
 * - type: 'entry' | 'reveal'
 * - puzzleDate: The date of the puzzle (for entry)
 * - cellPosition?: { row: number, col: number } (for reveal)
 * 
 * Response:
 * - reference: Unique payment reference ID
 * - amount: Amount to pay (in human-readable format)
 * - tokenAmount: Amount in smallest unit (for MiniKit)
 */

// In-memory storage for payment references (use Redis/database in production)
// Map<reference, PaymentReference>
const paymentReferences = new Map<string, {
  userId: string;
  type: 'entry' | 'reveal';
  puzzleDate: string;
  cellPosition?: { row: number; col: number };
  amount: string;
  tokenAmount: string;
  createdAt: number;
  status: 'pending' | 'completed' | 'failed';
  transactionId?: string;
  username?: string;
  walletAddress?: string;
}>();

// Clean up old references (older than 1 hour)
function cleanupOldReferences() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [ref, data] of paymentReferences.entries()) {
    if (data.createdAt < oneHourAgo && data.status === 'pending') {
      paymentReferences.delete(ref);
    }
  }
}

// Export for use in confirm route
export function getPaymentReference(reference: string) {
  return paymentReferences.get(reference);
}

export function updatePaymentReference(
  reference: string, 
  updates: { status?: 'pending' | 'completed' | 'failed'; transactionId?: string }
) {
  const existing = paymentReferences.get(reference);
  if (existing) {
    paymentReferences.set(reference, { ...existing, ...updates });
  }
}

// Entry fee: $1.00 USDC - using tokenToDecimals for proper conversion
const ENTRY_FEE_AMOUNT = 1; // $1.00
const ENTRY_FEE_USDC = tokenToDecimals(ENTRY_FEE_AMOUNT, Tokens.USDC).toString();
const ENTRY_FEE_DISPLAY = '1.00';

// Reveal fee: $0.20 USDC
const REVEAL_FEE_AMOUNT = 0.2; // $0.20
const REVEAL_FEE_USDC = tokenToDecimals(REVEAL_FEE_AMOUNT, Tokens.USDC).toString();
const REVEAL_FEE_DISPLAY = '0.20';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, type, puzzleDate, cellPosition, username, walletAddress } = body;

    // Validate request
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    if (!type || !['entry', 'reveal'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid payment type (must be "entry" or "reveal")' },
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

    // Clean up old references periodically
    cleanupOldReferences();

    // Generate a unique reference ID (UUID without dashes, as per Worldcoin docs)
    const reference = crypto.randomUUID().replace(/-/g, '');

    // Determine amount based on type
    const tokenAmount = type === 'entry' ? ENTRY_FEE_USDC : REVEAL_FEE_USDC;
    const amount = type === 'entry' ? ENTRY_FEE_DISPLAY : REVEAL_FEE_DISPLAY;

    // Store the reference for later verification
    paymentReferences.set(reference, {
      userId,
      type,
      puzzleDate,
      cellPosition: type === 'reveal' ? cellPosition : undefined,
      amount,
      tokenAmount,
      createdAt: Date.now(),
      status: 'pending',
      username,
      walletAddress,
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
    return NextResponse.json(
      { error: 'Failed to initiate payment' },
      { status: 500 }
    );
  }
}

