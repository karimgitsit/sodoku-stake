/**
 * Worldcoin MiniKit Integration
 * 
 * Handles:
 * - World ID verification (one account per human)
 * - Payment processing ($1.00 entry, $0.20 reveal)
 * 
 * Payment flow follows Worldcoin best practices:
 * https://docs.world.org/mini-apps/commands/pay
 * 
 * 1. Backend generates payment reference (POST /api/payment/initiate)
 * 2. Frontend sends payment with reference via MiniKit
 * 3. Backend verifies payment with Worldcoin API (POST /api/payment/confirm)
 */

import { 
  MiniKit, 
  Tokens, 
  VerificationLevel,
  tokenToDecimals,
  type MiniAppVerifyActionSuccessPayload,
  type MiniAppPaymentSuccessPayload,
} from '@worldcoin/minikit-js';

// =============================================================================
// CONSTANTS
// =============================================================================

// Entry fee in USDC - using tokenToDecimals for proper conversion
export const ENTRY_FEE_AMOUNT = 1; // $1.00
export const REVEAL_FEE_AMOUNT = 0.2; // $0.20

// Convert to token decimals for MiniKit
export const ENTRY_FEE_USDC = tokenToDecimals(ENTRY_FEE_AMOUNT, Tokens.USDC).toString();
export const REVEAL_FEE_USDC = tokenToDecimals(REVEAL_FEE_AMOUNT, Tokens.USDC).toString();

// Wallet addresses - set these in environment variables
// Platform wallet receives ALL payments (entries + reveals)
// At midnight, prizes are distributed and remainder is swept to developer wallet
export const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET || '0x0000000000000000000000000000000000000000';

// App ID from World Developer Portal
export const APP_ID = process.env.NEXT_PUBLIC_APP_ID || 'app_staging_demo';

// Verification actions
export const ACTIONS = {
  DAILY_ENTRY: 'sodoku-stake-daily-entry',
  REVEAL_CELL: 'sodoku-stake-reveal',
} as const;

// =============================================================================
// TYPES
// =============================================================================

export interface VerifyResult {
  success: boolean;
  nullifierHash?: string;
  error?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  reference?: string;
  error?: string;
  // For entry payments
  puzzle?: number[][];
  date?: string;
  difficulty?: string;
  entryId?: string;
  // For reveal payments
  value?: number;
  row?: number;
  col?: number;
}

export interface InitiatePaymentResponse {
  success: boolean;
  reference?: string;
  amount?: string;
  tokenAmount?: string;
  type?: 'entry' | 'reveal';
  error?: string;
}

export interface ConfirmPaymentResponse {
  success: boolean;
  message?: string;
  error?: string;
  // For entry payments
  puzzle?: number[][];
  date?: string;
  difficulty?: string;
  entryId?: string;
  // For reveal payments
  value?: number;
  row?: number;
  col?: number;
}

// =============================================================================
// WORLD ID VERIFICATION
// =============================================================================

/**
 * Check if MiniKit is available (running inside World App)
 */
export function isMiniKitAvailable(): boolean {
  return MiniKit.isInstalled();
}

/**
 * Verify user's World ID
 * This proves the user is a unique human
 * 
 * @param action - The action being verified (e.g., 'daily-entry')
 * @param signal - Optional signal to bind to verification (e.g., puzzle date)
 */
export async function verifyWorldId(
  action: string = ACTIONS.DAILY_ENTRY,
  signal?: string
): Promise<VerifyResult> {
  try {
    // Check if MiniKit is available
    if (!MiniKit.isInstalled()) {
      console.warn('[WorldID] MiniKit not installed - running outside World App');
      // In development, return a mock success
      if (process.env.NODE_ENV === 'development') {
        return {
          success: true,
          nullifierHash: 'dev_mock_nullifier_' + Date.now(),
        };
      }
      return {
        success: false,
        error: 'Please open this app in World App to verify your identity',
      };
    }

    // Request verification
    const { finalPayload } = await MiniKit.commandsAsync.verify({
      action,
      signal,
      verification_level: VerificationLevel.Device, // Device level - phone verification only
    });

    // Check for errors
    if (!finalPayload || 'error_code' in finalPayload) {
      const errorPayload = finalPayload as { error_code: string };
      console.error('[WorldID] Verification failed:', errorPayload?.error_code);
      return {
        success: false,
        error: getVerificationErrorMessage(errorPayload?.error_code),
      };
    }

    // Success!
    const successPayload = finalPayload as MiniAppVerifyActionSuccessPayload;
    console.log('[WorldID] Verification successful');
    
    return {
      success: true,
      nullifierHash: successPayload.nullifier_hash,
    };

  } catch (error) {
    console.error('[WorldID] Verification error:', error);
    return {
      success: false,
      error: 'Verification failed. Please try again.',
    };
  }
}

// =============================================================================
// SECURE PAYMENT PROCESSING (Backend-First Flow)
// =============================================================================

/**
 * Step 1: Initiate payment on the backend
 * This generates a secure reference ID that we'll use to verify the payment later
 */
async function initiatePayment(
  userId: string,
  type: 'entry' | 'reveal',
  puzzleDate: string,
  cellPosition?: { row: number; col: number }
): Promise<InitiatePaymentResponse> {
  try {
    // Get user info from MiniKit (includes wallet address)
    const userInfo = getUserInfo();
    
    const response = await fetch('/api/payment/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        type,
        puzzleDate,
        cellPosition,
        username: userInfo?.username,
        walletAddress: userInfo?.walletAddress,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Failed to initiate payment',
      };
    }

    return {
      success: true,
      reference: data.reference,
      amount: data.amount,
      tokenAmount: data.tokenAmount,
      type: data.type,
    };

  } catch (error) {
    console.error('[Payment] Initiate error:', error);
    return {
      success: false,
      error: 'Failed to initiate payment',
    };
  }
}

/**
 * Step 2: Send payment via MiniKit
 * Uses the reference from step 1
 */
async function sendPayment(
  reference: string,
  tokenAmount: string,
  description: string
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  try {
    // Check if MiniKit is available
    if (!MiniKit.isInstalled()) {
      console.warn('[Payment] MiniKit not installed - running outside World App');
      // In development, return a mock success
      if (process.env.NODE_ENV === 'development') {
        return {
          success: true,
          transactionId: 'dev_mock_tx_' + Date.now(),
        };
      }
      return {
        success: false,
        error: 'Please open this app in World App to make payments',
      };
    }

    // Request payment with the backend-generated reference
    const { finalPayload } = await MiniKit.commandsAsync.pay({
      reference,
      to: PLATFORM_WALLET,
      tokens: [
        {
          symbol: Tokens.USDC,
          token_amount: tokenAmount,
        },
      ],
      description,
    });

    // Check for errors
    if (!finalPayload || 'error_code' in finalPayload) {
      const errorPayload = finalPayload as { error_code: string };
      console.error('[Payment] MiniKit payment failed:', errorPayload?.error_code);
      return {
        success: false,
        error: getPaymentErrorMessage(errorPayload?.error_code),
      };
    }

    // Success!
    const successPayload = finalPayload as MiniAppPaymentSuccessPayload;
    console.log('[Payment] MiniKit payment successful:', successPayload.transaction_id);
    
    return {
      success: true,
      transactionId: successPayload.transaction_id,
    };

  } catch (error) {
    console.error('[Payment] MiniKit error:', error);
    return {
      success: false,
      error: 'Payment failed. Please try again.',
    };
  }
}

/**
 * Step 3: Confirm payment on the backend
 * This verifies the payment with Worldcoin API and processes the action
 */
async function confirmPayment(
  reference: string,
  transactionId: string
): Promise<ConfirmPaymentResponse> {
  try {
    const response = await fetch('/api/payment/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference,
        transaction_id: transactionId,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Failed to confirm payment',
      };
    }

    return data as ConfirmPaymentResponse;

  } catch (error) {
    console.error('[Payment] Confirm error:', error);
    return {
      success: false,
      error: 'Failed to confirm payment',
    };
  }
}

/**
 * Process entry fee payment ($1.00 USDC)
 * Complete secure payment flow: initiate → pay → confirm
 * 
 * @param userId - User's World ID nullifier hash
 * @param puzzleDate - The date of the puzzle being entered
 */
export async function payEntryFee(
  userId: string,
  puzzleDate: string
): Promise<PaymentResult> {
  console.log('[Payment] Starting entry fee flow...');

  // Step 1: Initiate payment on backend
  const initResult = await initiatePayment(userId, 'entry', puzzleDate);
  if (!initResult.success) {
    return {
      success: false,
      error: initResult.error,
    };
  }

  console.log('[Payment] Initiated with reference:', initResult.reference);

  // Step 2: Send payment via MiniKit
  const payResult = await sendPayment(
    initResult.reference!,
    initResult.tokenAmount!,
    `Sodoku Stake Entry - ${puzzleDate}`
  );

  if (!payResult.success) {
    return {
      success: false,
      error: payResult.error,
    };
  }

  console.log('[Payment] Payment sent, transaction:', payResult.transactionId);

  // Step 3: Confirm payment on backend (verifies with Worldcoin API)
  const confirmResult = await confirmPayment(
    initResult.reference!,
    payResult.transactionId!
  );

  if (!confirmResult.success) {
    return {
      success: false,
      error: confirmResult.error,
    };
  }

  console.log('[Payment] Entry confirmed! Puzzle ready.');

  return {
    success: true,
    transactionId: payResult.transactionId,
    reference: initResult.reference,
    puzzle: confirmResult.puzzle,
    date: confirmResult.date,
    difficulty: confirmResult.difficulty,
    entryId: confirmResult.entryId,
  };
}

/**
 * Process reveal payment ($0.20 USDC)
 * Complete secure payment flow: initiate → pay → confirm
 * 
 * @param userId - User's World ID nullifier hash
 * @param puzzleDate - The date of the puzzle
 * @param cellPosition - The cell being revealed (for reference)
 */
export async function payRevealFee(
  userId: string,
  puzzleDate: string,
  cellPosition: { row: number; col: number }
): Promise<PaymentResult> {
  console.log('[Payment] Starting reveal fee flow...');

  // Step 1: Initiate payment on backend
  const initResult = await initiatePayment(userId, 'reveal', puzzleDate, cellPosition);
  if (!initResult.success) {
    return {
      success: false,
      error: initResult.error,
    };
  }

  console.log('[Payment] Initiated reveal with reference:', initResult.reference);

  // Step 2: Send payment via MiniKit
  const payResult = await sendPayment(
    initResult.reference!,
    initResult.tokenAmount!,
    `Sodoku Stake - Reveal Cell`
  );

  if (!payResult.success) {
    return {
      success: false,
      error: payResult.error,
    };
  }

  console.log('[Payment] Reveal payment sent, transaction:', payResult.transactionId);

  // Step 3: Confirm payment on backend (verifies with Worldcoin API)
  const confirmResult = await confirmPayment(
    initResult.reference!,
    payResult.transactionId!
  );

  if (!confirmResult.success) {
    return {
      success: false,
      error: confirmResult.error,
    };
  }

  console.log('[Payment] Reveal confirmed! Value:', confirmResult.value);

  return {
    success: true,
    transactionId: payResult.transactionId,
    reference: initResult.reference,
    value: confirmResult.value,
    row: confirmResult.row,
    col: confirmResult.col,
  };
}

// =============================================================================
// ERROR MESSAGES
// =============================================================================

function getVerificationErrorMessage(errorCode: string | undefined): string {
  const messages: Record<string, string> = {
    'verification_rejected': 'Verification was rejected. Please try again.',
    'already_verified': 'You have already verified for this action.',
    'max_verifications_reached': 'Maximum verifications reached for this action.',
    'credential_expired': 'Your World ID credentials have expired.',
    'invalid_signal': 'Invalid verification signal.',
    'generic_error': 'Verification failed. Please try again.',
  };
  return messages[errorCode || ''] || 'Verification failed. Please try again.';
}

function getPaymentErrorMessage(errorCode: string | undefined): string {
  const messages: Record<string, string> = {
    'user_rejected': 'Payment was cancelled.',
    'insufficient_balance': 'Insufficient balance. Please add funds to your wallet.',
    'payment_rejected': 'Payment was rejected. Please try again.',
    'invalid_receiver': 'Invalid payment recipient. Please contact support.',
    'transaction_failed': 'Transaction failed. Please try again.',
    'input_error': 'Invalid payment details. Please try again.',
    'generic_error': 'Payment failed. Please try again.',
  };
  return messages[errorCode || ''] || 'Payment failed. Please try again.';
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format USDC amount for display
 */
export function formatUSDC(amountInSmallestUnit: string): string {
  const amount = parseInt(amountInSmallestUnit, 10) / 1_000_000;
  return `$${amount.toFixed(2)}`;
}

/**
 * Get user info from MiniKit (if available)
 * 
 * Per World App docs: https://docs.world.org/mini-apps/commands/wallet-auth
 * - Wallet address: MiniKit.walletAddress (NOT MiniKit.user.walletAddress)
 * - Username: MiniKit.user?.username
 */
export function getUserInfo(): { username?: string; walletAddress?: string } | null {
  if (!MiniKit.isInstalled()) {
    console.log('[MiniKit] Not installed, cannot get user info');
    return null;
  }
  
  // Get wallet address directly from MiniKit (not from user object)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const minikit = MiniKit as any;
  const walletAddress = minikit.walletAddress || (typeof window !== 'undefined' && (window as any).MiniKit?.walletAddress);
  
  // Get username from user object
  const user = MiniKit.user;
  const username = user?.username;
  
  console.log('[MiniKit] User info:', {
    username: username || 'null',
    walletAddress: walletAddress ? `${walletAddress.substring(0, 10)}...` : 'null',
  });
  
  return {
    username: username,
    walletAddress: walletAddress,
  };
}
