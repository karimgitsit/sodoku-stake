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
 * Timeout wrapper - rejects if operation takes too long
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
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
  
  // Connect to blockchain first to get actual balance
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PAYOUT_WALLET_KEY, provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
  
  // Get actual USDC balance in prize pool wallet
  const balance = await withRetry(() => usdc.balanceOf(wallet.address));
  const balanceUSDC = Number(ethers.formatUnits(balance, 6));
  
  console.log(`[Distribute] Prize pool balance: $${balanceUSDC.toFixed(2)} USDC`);
  
  // Count winners (status === 'won')
  const totalPlayers = typedEntries.length;
  const winners = typedEntries.filter(e => e.status === 'won');
  const nonWinners = typedEntries.filter(e => e.status !== 'won');
  const winnerCount = winners.length;
  
  // Streak insurance - calculate obligation first (reserved from balance)
  const insuranceRecipients = nonWinners.filter(e => e.users.has_streak_insurance === true);
  const insurancePerPerson = ENTRY_FEE * 0.50;
  const totalInsuranceNeeded = insuranceRecipients.length * insurancePerPerson;
  
  // Reserve insurance from balance first, then calculate prizes from remainder
  // If balance can't cover full insurance, reduce proportionally
  let actualInsurancePayout = insurancePerPerson;
  let insuranceReserve = totalInsuranceNeeded;
  
  if (balanceUSDC < totalInsuranceNeeded) {
    // Not enough for full insurance - pay what we can proportionally
    insuranceReserve = balanceUSDC;
    actualInsurancePayout = insuranceRecipients.length > 0 
      ? balanceUSDC / insuranceRecipients.length 
      : 0;
    console.log(`[Distribute] ⚠️ Insufficient balance for full insurance. Reduced to $${actualInsurancePayout.toFixed(2)} per person`);
  }
  
  // Available balance for winners after insurance is reserved
  const availableForWinners = Math.max(0, balanceUSDC - insuranceReserve);
  
  // Calculate dynamic platform fee based on winner ratio
  const winnerRatio = totalPlayers > 0 ? winnerCount / totalPlayers : 0;
  let platformFeePercent: number;
  
  if (winnerRatio <= 0.80) {
    platformFeePercent = 0.20;
  } else if (winnerRatio <= 0.90) {
    platformFeePercent = 0.10;
  } else {
    platformFeePercent = 0;
  }
  
  // Calculate prize distribution from available balance (after insurance)
  const platformFee = availableForWinners * platformFeePercent;
  const prizePool = availableForWinners - platformFee;
  const payoutPerWinner = winnerCount > 0 ? prizePool / winnerCount : 0;
  
  console.log(`[Distribute] Players: ${totalPlayers}, Winners: ${winnerCount}, Tax: ${platformFeePercent * 100}%`);
  console.log(`[Distribute] Balance: $${balanceUSDC.toFixed(2)}, Insurance reserve: $${insuranceReserve.toFixed(2)}, Available for winners: $${availableForWinners.toFixed(2)}`);
  console.log(`[Distribute] Prize per winner: $${payoutPerWinner.toFixed(2)}, Insurance per person: $${actualInsurancePayout.toFixed(2)}`)
  
  // Distribute prizes
  let successfulPayouts = 0;
  let failedPayouts = 0;
  let insurancePayouts = 0;
  
  // Pay winners
  for (const winner of winners) {
    const walletAddr = winner.users.wallet_address;
    
    if (!walletAddr) {
      console.log(`[Distribute] Skipping winner ${winner.id} - no wallet`);
      failedPayouts++;
      continue;
    }
    
    console.log(`[Distribute] Processing winner ${winner.id.substring(0, 8)}... -> ${walletAddr.substring(0, 10)}...`);
    
    try {
      const amount = ethers.parseUnits(payoutPerWinner.toFixed(6), 6);
      console.log(`[Distribute] Amount: ${amount.toString()} (${payoutPerWinner.toFixed(6)} USDC)`);
      
      // Send transaction with timeout (60 seconds per attempt)
      const tx = await withRetry(async () => {
        console.log(`[Distribute] Sending transfer transaction...`);
        
        // Send with explicit gas limit to avoid estimation hanging
        const transaction = await withTimeout(
          usdc.transfer(walletAddr, amount, { gasLimit: 100000 }),
          30000,
          'transfer'
        );
        
        console.log(`[Distribute] Transaction sent: ${transaction.hash}`);
        console.log(`[Distribute] Waiting for confirmation...`);
        
        await withTimeout(
          transaction.wait(1), // Wait for 1 confirmation
          60000,
          'confirmation'
        );
        
        console.log(`[Distribute] Transaction confirmed!`);
        return transaction;
      });
      
      // Update game entry
      await supabase
        .from('game_entries')
        .update({ prize_amount: payoutPerWinner, prize_transaction_hash: tx.hash })
        .eq('id', winner.id);
      
      // Update user's total earnings
      const { data: userData } = await supabase
        .from('users')
        .select('total_earnings')
        .eq('id', winner.user_id)
        .single();
      
      const currentEarnings = userData?.total_earnings || 0;
      await supabase
        .from('users')
        .update({ total_earnings: currentEarnings + payoutPerWinner })
        .eq('id', winner.user_id);
      
      // Send notification
      await sendPrizeNotification(
        walletAddr,
        winner.users.username || 'Player',
        payoutPerWinner
      );
      
      successfulPayouts++;
      console.log(`[Distribute] ✅ Paid $${payoutPerWinner.toFixed(2)} to ${walletAddr.substring(0, 10)}...`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Distribute] ❌ Failed to pay ${winner.id}: ${errorMsg}`);
      failedPayouts++;
    }
  }
  
  // Pay insurance
  for (const loser of insuranceRecipients) {
    const walletAddr = loser.users.wallet_address;
    
    if (!walletAddr) {
      failedPayouts++;
      continue;
    }
    
    console.log(`[Distribute] Processing insurance for ${loser.id.substring(0, 8)}...`);
    
    try {
      const amount = ethers.parseUnits(actualInsurancePayout.toFixed(6), 6);
      
      // Use retry for blockchain transactions with timeout
      const tx = await withRetry(async () => {
        const transaction = await withTimeout(
          usdc.transfer(walletAddr, amount, { gasLimit: 100000 }),
          30000,
          'insurance transfer'
        );
        console.log(`[Distribute] Insurance tx sent: ${transaction.hash}`);
        await withTimeout(transaction.wait(1), 60000, 'insurance confirmation');
        return transaction;
      });
      
      // Update database
      await supabase
        .from('game_entries')
        .update({ streak_insurance_applied: true, refund_amount: actualInsurancePayout, prize_transaction_hash: tx.hash })
        .eq('id', loser.id);
      
      // Consume insurance and reset insurance_streak counter
      await supabase
        .from('users')
        .update({ has_streak_insurance: false, insurance_streak: 0 })
        .eq('id', loser.user_id);
      
      insurancePayouts++;
      console.log(`[Distribute] ✅ Paid insurance $${actualInsurancePayout.toFixed(2)} to ${walletAddr.substring(0, 10)}...`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Distribute] ❌ Failed insurance for ${loser.id}: ${errorMsg}`);
      failedPayouts++;
    }
  }
  
  // Sweep remaining to developer wallet
  console.log(`[Distribute] Checking remaining balance for sweep...`);
  const remainingBalance = await withRetry(() => usdc.balanceOf(wallet.address));
  const remainingUSDC = Number(ethers.formatUnits(remainingBalance, 6));
  console.log(`[Distribute] Remaining balance: $${remainingUSDC.toFixed(2)}`);
  
  if (remainingUSDC > 0.01) {
    try {
      console.log(`[Distribute] Sweeping to developer wallet: ${DEVELOPER_WALLET?.substring(0, 10)}...`);
      await withRetry(async () => {
        const tx = await withTimeout(
          usdc.transfer(DEVELOPER_WALLET, remainingBalance, { gasLimit: 100000 }),
          30000,
          'sweep transfer'
        );
        console.log(`[Distribute] Sweep tx sent: ${tx.hash}`);
        await withTimeout(tx.wait(1), 60000, 'sweep confirmation');
        return tx;
      });
      console.log(`[Distribute] ✅ Swept $${remainingUSDC.toFixed(2)} to developer wallet`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Distribute] ❌ Failed to sweep: ${errorMsg}`);
    }
  }
  
  const totalDistributed = (successfulPayouts * payoutPerWinner) + (insurancePayouts * actualInsurancePayout);
  
  return {
    success: true,
    puzzleDate,
    stats: {
      totalPlayers,
      winners: winnerCount,
      losers: nonWinners.length,
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


