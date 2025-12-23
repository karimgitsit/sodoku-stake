/**
 * Prize Distribution Cron Job
 * 
 * POST /api/cron/distribute
 * 
 * Distributes prizes for yesterday's puzzle.
 * Should run daily at 00:00 UTC via Vercel cron.
 * 
 * Security: Requires CRON_SECRET header to prevent unauthorized access.
 * 
 * Note: For complex distributions with many winners, consider running
 * the script manually: `npx tsx scripts/distribute-prizes.ts`
 */

import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYOUT_WALLET_KEY = process.env.PAYOUT_WALLET_PRIVATE_KEY;
const DEVELOPER_WALLET = process.env.NEXT_PUBLIC_DEVELOPER_WALLET;
const RPC_URL = process.env.WORLD_CHAIN_RPC_URL || 'https://worldchain-mainnet.g.alchemy.com/public';
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

// Entry fee and rates
const ENTRY_FEE = 1.00;
const BASE_REFERRAL_RATE = 0.10;

// USDC ERC-20 minimal ABI
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

// Notification API
const NOTIFICATION_API_URL = 'https://developer.worldcoin.org/api/v2/minikit/send-notification';

// =============================================================================
// TYPES
// =============================================================================

interface EntryWithUser {
  id: string;
  status: 'in_progress' | 'won' | 'lost';
  user_id: string;
  users: {
    username: string | null;
    wallet_address: string | null;
    current_streak: number;
    has_streak_insurance: boolean;
    referred_by: string | null;
  };
}

interface DistributionResult {
  success: boolean;
  puzzleDate: string;
  stats: {
    totalPlayers: number;
    winners: number;
    losers: number;
    taxRate: number;
    prizePerWinner: number;
    totalDistributed: number;
    platformRevenue: number;
  };
  payouts: {
    winners: number;
    insurance: number;
    referrals: number;
    failed: number;
  };
  error?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function calculateReferralCommissionRate(taxPercent: number): number {
  return BASE_REFERRAL_RATE * (taxPercent / 20);
}

/**
 * Retry helper for blockchain transactions
 * Retries up to 3 times with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(`[Distribute] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[Distribute] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

async function sendPrizeNotification(
  walletAddress: string,
  username: string,
  prizeAmount: number
): Promise<boolean> {
  const apiKey = process.env.WORLD_API_KEY;
  const appId = process.env.NEXT_PUBLIC_APP_ID;
  
  if (!apiKey || !appId) return false;
  
  try {
    const response = await fetch(NOTIFICATION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        wallet_addresses: [walletAddress],
        title: '💸 Prize sent!',
        message: `${username || 'Hey'}, $${prizeAmount.toFixed(2)} USDC is on its way to your wallet. Congrats!`,
        mini_app_path: '/?screen=profile',
      }),
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

// =============================================================================
// MAIN DISTRIBUTION LOGIC
// =============================================================================

async function distributePrizes(puzzleDate: string): Promise<DistributionResult> {
  console.log(`[Distribute] Starting distribution for ${puzzleDate}`);
  
  // Validate configuration
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  
  if (!PAYOUT_WALLET_KEY || !DEVELOPER_WALLET) {
    throw new Error('Missing wallet configuration');
  }
  
  // Connect to Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // Get all entries for the date
  const { data: entries, error } = await supabase
    .from('game_entries')
    .select('id, status, user_id, users!inner(username, wallet_address, current_streak, has_streak_insurance, referred_by)')
    .eq('puzzle_date', puzzleDate);
  
  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }
  
  if (!entries || entries.length === 0) {
    return {
      success: true,
      puzzleDate,
      stats: { totalPlayers: 0, winners: 0, losers: 0, taxRate: 0, prizePerWinner: 0, totalDistributed: 0, platformRevenue: 0 },
      payouts: { winners: 0, insurance: 0, referrals: 0, failed: 0 },
    };
  }
  
  const typedEntries = entries as unknown as EntryWithUser[];
  
  // Calculate stats
  const totalPlayers = typedEntries.length;
  const totalPool = totalPlayers * ENTRY_FEE;
  const winners = typedEntries.filter(e => e.status === 'won');
  const losers = typedEntries.filter(e => e.status === 'lost');
  const winnerCount = winners.length;
  
  // Calculate dynamic tax rate
  const winnerRatio = winnerCount / totalPlayers;
  let platformFeePercent: number;
  
  if (winnerRatio <= 0.80) {
    platformFeePercent = 0.20;
  } else if (winnerRatio <= 0.90) {
    platformFeePercent = 0.10;
  } else {
    platformFeePercent = 0;
  }
  
  const platformFee = totalPool * platformFeePercent;
  const prizePool = totalPool - platformFee;
  const payoutPerWinner = winnerCount > 0 ? prizePool / winnerCount : 0;
  
  // Streak insurance
  const insuranceRecipients = losers.filter(e => e.users.has_streak_insurance === true);
  const insurancePayout = ENTRY_FEE * 0.50;
  
  console.log(`[Distribute] Players: ${totalPlayers}, Winners: ${winnerCount}, Tax: ${platformFeePercent * 100}%`);
  
  // Connect to blockchain
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PAYOUT_WALLET_KEY, provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
  
  // Check balance (with retry for RPC reliability)
  const balance = await withRetry(() => usdc.balanceOf(wallet.address));
  const balanceUSDC = Number(ethers.formatUnits(balance, 6));
  const totalNeeded = (winnerCount * payoutPerWinner) + (insuranceRecipients.length * insurancePayout);
  
  if (balanceUSDC < totalNeeded) {
    throw new Error(`Insufficient balance! Need $${totalNeeded.toFixed(2)}, have $${balanceUSDC.toFixed(2)}`);
  }
  
  // Distribute prizes
  let successfulPayouts = 0;
  let failedPayouts = 0;
  let insurancePayouts = 0;
  
  // Pay winners
  for (const winner of winners) {
    if (!winner.users.wallet_address) {
      console.log(`[Distribute] Skipping winner ${winner.id} - no wallet`);
      failedPayouts++;
      continue;
    }
    
    try {
      const amount = ethers.parseUnits(payoutPerWinner.toFixed(6), 6);
      
      // Use retry for blockchain transactions
      const tx = await withRetry(async () => {
        const transaction = await usdc.transfer(winner.users.wallet_address, amount);
        await transaction.wait();
        return transaction;
      });
      
      // Update database
      await supabase
        .from('game_entries')
        .update({ prize_amount: payoutPerWinner, prize_transaction_hash: tx.hash })
        .eq('id', winner.id);
      
      // Send notification
      await sendPrizeNotification(
        winner.users.wallet_address,
        winner.users.username || 'Player',
        payoutPerWinner
      );
      
      successfulPayouts++;
      console.log(`[Distribute] Paid $${payoutPerWinner.toFixed(2)} to ${winner.users.wallet_address.substring(0, 10)}...`);
    } catch (err) {
      console.error(`[Distribute] Failed to pay ${winner.id} after retries:`, err);
      failedPayouts++;
    }
  }
  
  // Pay insurance
  for (const loser of insuranceRecipients) {
    if (!loser.users.wallet_address) {
      failedPayouts++;
      continue;
    }
    
    try {
      const amount = ethers.parseUnits(insurancePayout.toFixed(6), 6);
      
      // Use retry for blockchain transactions
      const tx = await withRetry(async () => {
        const transaction = await usdc.transfer(loser.users.wallet_address, amount);
        await transaction.wait();
        return transaction;
      });
      
      // Update database
      await supabase
        .from('game_entries')
        .update({ streak_insurance_applied: true, refund_amount: insurancePayout, prize_transaction_hash: tx.hash })
        .eq('id', loser.id);
      
      // Consume insurance
      await supabase
        .from('users')
        .update({ has_streak_insurance: false })
        .eq('id', loser.user_id);
      
      insurancePayouts++;
      console.log(`[Distribute] Paid insurance $${insurancePayout.toFixed(2)} to ${loser.users.wallet_address.substring(0, 10)}...`);
    } catch (err) {
      console.error(`[Distribute] Failed insurance for ${loser.id} after retries:`, err);
      failedPayouts++;
    }
  }
  
  // Sweep remaining to developer wallet
  const remainingBalance = await withRetry(() => usdc.balanceOf(wallet.address));
  const remainingUSDC = Number(ethers.formatUnits(remainingBalance, 6));
  
  if (remainingUSDC > 0.01) {
    try {
      await withRetry(async () => {
        const tx = await usdc.transfer(DEVELOPER_WALLET, remainingBalance);
        await tx.wait();
        return tx;
      });
      console.log(`[Distribute] Swept $${remainingUSDC.toFixed(2)} to developer wallet`);
    } catch (err) {
      console.error('[Distribute] Failed to sweep after retries:', err);
    }
  }
  
  const totalDistributed = (successfulPayouts * payoutPerWinner) + (insurancePayouts * insurancePayout);
  
  return {
    success: true,
    puzzleDate,
    stats: {
      totalPlayers,
      winners: winnerCount,
      losers: losers.length,
      taxRate: platformFeePercent * 100,
      prizePerWinner: payoutPerWinner,
      totalDistributed,
      platformRevenue: remainingUSDC,
    },
    payouts: {
      winners: successfulPayouts,
      insurance: insurancePayouts,
      referrals: 0, // Simplified - referrals handled separately
      failed: failedPayouts,
    },
  };
}

// =============================================================================
// API HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  // Verify cron secret
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.error('[Distribute] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  try {
    // Calculate yesterday's date
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const puzzleDate = yesterday.toISOString().split('T')[0];
    
    console.log(`[Distribute] Starting cron job for ${puzzleDate}`);
    
    const result = await distributePrizes(puzzleDate);
    
    console.log('[Distribute] Complete:', JSON.stringify(result.stats));
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[Distribute] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Distribution failed',
      },
      { status: 500 }
    );
  }
}

// Vercel cron jobs send GET requests, so we need to handle them
export async function GET(request: NextRequest) {
  // Vercel cron jobs use GET - forward to main handler
  return POST(request);
}


