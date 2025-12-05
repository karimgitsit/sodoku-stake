/**
 * Daily Prize Distribution Script
 * 
 * Runs at 00:00 UTC to distribute prizes for the previous day's puzzle.
 * Also handles referral commission payouts.
 * After all payouts, sweeps remaining balance (platform revenue) to developer wallet.
 * 
 * Usage:
 *   npx tsx scripts/distribute-prizes.ts                         # Run actual distribution for yesterday
 *   npx tsx scripts/distribute-prizes.ts --dry-run               # Test without sending transactions
 *   npx tsx scripts/distribute-prizes.ts --date=2025-12-01       # Run for a specific date
 *   npx tsx scripts/distribute-prizes.ts --dry-run --date=2025-12-01  # Combine options
 * 
 * Required environment variables:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - PAYOUT_WALLET_PRIVATE_KEY       (private key of the platform wallet that holds entry fees)
 *   - NEXT_PUBLIC_DEVELOPER_WALLET    (your wallet where platform revenue is swept to)
 *   - WORLD_CHAIN_RPC_URL             (World Chain RPC - default: https://worldchain-mainnet.g.alchemy.com/public)
 *   - USDC_CONTRACT_ADDRESS           (USDC on World Chain)
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// NOTIFICATION INTEGRATION
// =============================================================================

// World App Notification API
const NOTIFICATION_API_URL = 'https://developer.worldcoin.org/api/v2/minikit/send-notification';

/**
 * Send a "prize sent" notification to a winner
 */
async function sendPrizeNotification(
  walletAddress: string,
  username: string,
  prizeAmount: number
): Promise<boolean> {
  const apiKey = process.env.WORLD_API_KEY;
  const appId = process.env.NEXT_PUBLIC_APP_ID;
  
  if (!apiKey || !appId) {
    console.log('   ⚠️  Notification skipped - WORLD_API_KEY or APP_ID not set');
    return false;
  }
  
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
    
    if (!response.ok) {
      console.log(`   ⚠️  Notification failed: ${response.status}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.log('   ⚠️  Notification error:', error);
    return false;
  }
}

// USDC ERC-20 minimal ABI
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

// Entry fee constant
const ENTRY_FEE = 1.00; // $1.00 USDC
const BASE_REFERRAL_RATE = 0.10; // 10% base referral rate

// Check for dry-run mode
const DRY_RUN = process.argv.includes('--dry-run');

// Check for custom date (for testing)
const dateArg = process.argv.find(arg => arg.startsWith('--date='));
const CUSTOM_DATE = dateArg ? dateArg.split('=')[1] : null;

if (DRY_RUN) {
  console.log('\n🧪 DRY RUN MODE - No transactions will be sent\n');
}

if (CUSTOM_DATE) {
  console.log(`📅 Using custom date: ${CUSTOM_DATE}\n`);
}

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

interface ReferrerInfo {
  id: string;
  wallet_address: string | null;
}

/**
 * Calculate referral commission rate based on tax rate
 * Commission scales proportionally with the tax rate.
 */
function calculateReferralCommissionRate(taxPercent: number): number {
  // Commission rate = base rate × (taxRate / 20)
  // When tax is 20% → 0.10 × (20/20) = 0.10 (10%)
  // When tax is 10% → 0.10 × (10/20) = 0.05 (5%)
  // When tax is 0% → 0.10 × (0/20) = 0.00 (0%)
  return BASE_REFERRAL_RATE * (taxPercent / 20);
}

async function distributePrizes() {
  // Calculate puzzle date (yesterday by default, or custom date if specified)
  let puzzleDate: string;
  if (CUSTOM_DATE) {
    puzzleDate = CUSTOM_DATE;
  } else {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    puzzleDate = yesterday.toISOString().split('T')[0]; // e.g., "2025-12-02"
  }
  
  console.log(`\n🎮 Prize Distribution for ${puzzleDate}`);
  console.log('='.repeat(50));
  
  // Validate environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  
  // These are only required for actual transactions (not dry run)
  const transactionEnvVars = [
    'PAYOUT_WALLET_PRIVATE_KEY',
    'NEXT_PUBLIC_DEVELOPER_WALLET', // Where platform revenue goes after distribution
    'WORLD_CHAIN_RPC_URL',
    'USDC_CONTRACT_ADDRESS',
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
  
  if (!DRY_RUN) {
    for (const envVar of transactionEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }
  }
  
  // 1. Connect to Supabase
  console.log('\n📊 Fetching entries from database...');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // 2. Get all entries for yesterday with user and referrer info
  const { data: entries, error } = await supabase
    .from('game_entries')
    .select('id, status, user_id, users!inner(username, wallet_address, current_streak, has_streak_insurance, referred_by)')
    .eq('puzzle_date', puzzleDate);
  
  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }
  
  if (!entries || entries.length === 0) {
    console.log('ℹ️  No entries found for', puzzleDate);
    return;
  }
  
  const typedEntries = entries as unknown as EntryWithUser[];
  
  // Get all referral codes and their owner IDs for quick lookup
  const referralCodes = [...new Set(
    typedEntries
      .filter(e => e.users.referred_by)
      .map(e => e.users.referred_by as string)
  )];
  
  let referrerMap = new Map<string, ReferrerInfo>();
  
  if (referralCodes.length > 0) {
    const { data: referrers } = await supabase
      .from('users')
      .select('id, wallet_address, referral_code')
      .in('referral_code', referralCodes);
    
    if (referrers) {
      for (const r of referrers) {
        referrerMap.set(r.referral_code, { id: r.id, wallet_address: r.wallet_address });
      }
    }
  }
  
  console.log(`   Found ${referralCodes.length} unique referrers`);
  
  // 3. Calculate pool and winners
  const totalPlayers = typedEntries.length;
  const totalPool = totalPlayers * ENTRY_FEE;
  
  const winners = typedEntries.filter(e => e.status === 'won');
  const losers = typedEntries.filter(e => e.status === 'lost');
  const winnerCount = winners.length;
  
  console.log(`\n📈 Statistics:`);
  console.log(`   Total players: ${totalPlayers}`);
  console.log(`   Winners: ${winnerCount} (${((winnerCount / totalPlayers) * 100).toFixed(1)}%)`);
  console.log(`   Losers: ${losers.length}`);
  
  // 4. Calculate dynamic tax rate
  const winnerRatio = winnerCount / totalPlayers;
  let platformFeePercent: number;
  let taxLabel: string;
  
  if (winnerRatio <= 0.80) {
    platformFeePercent = 0.20; // 20% tax
    taxLabel = '20% (standard)';
  } else if (winnerRatio <= 0.90) {
    platformFeePercent = 0.10; // 10% tax
    taxLabel = '10% (reduced)';
  } else {
    platformFeePercent = 0;    // 0% tax
    taxLabel = '0% (waived)';
  }
  
  const platformFee = totalPool * platformFeePercent;
  const prizePool = totalPool - platformFee;
  
  // 5. Calculate per-winner payout
  const payoutPerWinner = winnerCount > 0 ? prizePool / winnerCount : 0;
  
  console.log(`\n💰 Financials:`);
  console.log(`   Total pool: $${totalPool.toFixed(2)}`);
  console.log(`   Platform fee: $${platformFee.toFixed(2)} (${taxLabel})`);
  console.log(`   Prize pool: $${prizePool.toFixed(2)}`);
  console.log(`   Per winner: $${payoutPerWinner.toFixed(2)}`);
  
  // 6. Calculate streak insurance (50% refund - one-time use protection)
  // Insurance is earned at 7-day streak and consumed on first loss
  const streakInsuranceRecipients = losers.filter(
    e => e.users.has_streak_insurance === true
  );
  const insurancePayout = ENTRY_FEE * 0.50; // $0.50 refund
  
  if (streakInsuranceRecipients.length > 0) {
    console.log(`\n🛡️  Streak Insurance:`);
    console.log(`   Eligible losers (has insurance): ${streakInsuranceRecipients.length}`);
    console.log(`   Refund per person: $${insurancePayout.toFixed(2)}`);
  }
  
  // 6.5 Calculate referral commissions for entry fees
  // Commission rate scales with the tax rate
  const referralCommissionRate = calculateReferralCommissionRate(platformFeePercent * 100);
  const referralCommissionPerEntry = ENTRY_FEE * referralCommissionRate;
  
  // Find all referred users and their referrers
  const referredEntries = typedEntries.filter(e => e.users.referred_by && referrerMap.has(e.users.referred_by));
  
  console.log(`\n🎁 Referral Commissions:`);
  console.log(`   Tax rate: ${(platformFeePercent * 100).toFixed(0)}%`);
  console.log(`   Commission rate: ${(referralCommissionRate * 100).toFixed(1)}%`);
  console.log(`   Commission per entry: $${referralCommissionPerEntry.toFixed(2)}`);
  console.log(`   Referred entries: ${referredEntries.length}`);
  
  // Group referral earnings by referrer
  const referralEarningsByReferrer = new Map<string, {
    referrerId: string;
    walletAddress: string | null;
    totalAmount: number;
    entryIds: string[];
    refereeIds: string[];
  }>();
  
  for (const entry of referredEntries) {
    const referralCode = entry.users.referred_by!;
    const referrer = referrerMap.get(referralCode);
    
    if (!referrer) continue;
    
    let existing = referralEarningsByReferrer.get(referrer.id);
    if (!existing) {
      existing = {
        referrerId: referrer.id,
        walletAddress: referrer.wallet_address,
        totalAmount: 0,
        entryIds: [],
        refereeIds: [],
      };
      referralEarningsByReferrer.set(referrer.id, existing);
    }
    
    existing.totalAmount += referralCommissionPerEntry;
    existing.entryIds.push(entry.id);
    existing.refereeIds.push(entry.user_id);
  }
  
  const totalReferralPayouts = Array.from(referralEarningsByReferrer.values())
    .reduce((sum, r) => sum + r.totalAmount, 0);
  
  console.log(`   Total referral payouts: $${totalReferralPayouts.toFixed(2)}`);
  console.log(`   Unique referrers to pay: ${referralEarningsByReferrer.size}`);
  
  // Record referral earnings in database
  if (referralCommissionRate > 0 && referredEntries.length > 0) {
    console.log('\n📝 Recording referral earnings...');
    
    for (const entry of referredEntries) {
      const referralCode = entry.users.referred_by!;
      const referrer = referrerMap.get(referralCode);
      
      if (!referrer) continue;
      
      await supabase.from('referral_earnings').insert({
        referrer_id: referrer.id,
        referee_id: entry.user_id,
        source_type: 'entry',
        source_id: entry.id,
        source_date: puzzleDate,
        applied_tax_rate: platformFeePercent * 100,
        referee_spend: ENTRY_FEE,
        commission_rate: referralCommissionRate,
        amount: referralCommissionPerEntry,
        paid_out: false,
      });
    }
    
    console.log(`   ✅ Recorded ${referredEntries.length} referral earnings`);
  }
  
  // Get any unpaid referral earnings (including from reveals)
  const { data: unpaidReferralEarnings } = await supabase
    .from('referral_earnings')
    .select('id, referrer_id, amount')
    .eq('paid_out', false);
  
  // Group unpaid earnings by referrer with wallet addresses
  const unpaidByReferrer = new Map<string, {
    referrerId: string;
    walletAddress: string | null;
    totalAmount: number;
    earningIds: string[];
  }>();
  
  if (unpaidReferralEarnings && unpaidReferralEarnings.length > 0) {
    // Get wallet addresses for all referrers with unpaid earnings
    const referrerIds = [...new Set(unpaidReferralEarnings.map(e => e.referrer_id))];
    const { data: referrerWallets } = await supabase
      .from('users')
      .select('id, wallet_address')
      .in('id', referrerIds);
    
    const walletMap = new Map(referrerWallets?.map(r => [r.id, r.wallet_address]) || []);
    
    for (const earning of unpaidReferralEarnings) {
      let existing = unpaidByReferrer.get(earning.referrer_id);
      if (!existing) {
        existing = {
          referrerId: earning.referrer_id,
          walletAddress: walletMap.get(earning.referrer_id) || null,
          totalAmount: 0,
          earningIds: [],
        };
        unpaidByReferrer.set(earning.referrer_id, existing);
      }
      existing.totalAmount += earning.amount;
      existing.earningIds.push(earning.id);
    }
  }
  
  const totalUnpaidReferrals = Array.from(unpaidByReferrer.values())
    .reduce((sum, r) => sum + r.totalAmount, 0);
  
  if (totalUnpaidReferrals > 0) {
    console.log(`\n💸 Unpaid Referral Earnings:`);
    console.log(`   Total to distribute: $${totalUnpaidReferrals.toFixed(2)}`);
    console.log(`   Referrers to pay: ${unpaidByReferrer.size}`);
  }
  
  // 7. Connect to World Chain (skip in dry-run mode)
  let provider: ethers.JsonRpcProvider | null = null;
  let wallet: ethers.Wallet | null = null;
  let usdc: ethers.Contract | null = null;
  let balanceUSDC = 0;
  
  const totalNeeded = (winnerCount * payoutPerWinner) + (streakInsuranceRecipients.length * insurancePayout) + totalUnpaidReferrals;
  
  if (DRY_RUN) {
    console.log('\n🔗 World Chain connection (SKIPPED - dry run)');
    console.log(`   Would need: $${totalNeeded.toFixed(2)} USDC`);
  } else {
    console.log('\n🔗 Connecting to World Chain...');
    provider = new ethers.JsonRpcProvider(process.env.WORLD_CHAIN_RPC_URL);
    wallet = new ethers.Wallet(process.env.PAYOUT_WALLET_PRIVATE_KEY!, provider);
    usdc = new ethers.Contract(process.env.USDC_CONTRACT_ADDRESS!, USDC_ABI, wallet);
    
    // Check wallet balance
    const balance = await usdc.balanceOf(wallet.address);
    balanceUSDC = Number(ethers.formatUnits(balance, 6));
    console.log(`   Payout wallet: ${wallet.address}`);
    console.log(`   USDC balance: $${balanceUSDC.toFixed(2)}`);
    
    if (balanceUSDC < totalNeeded) {
      throw new Error(`Insufficient balance! Need $${totalNeeded.toFixed(2)}, have $${balanceUSDC.toFixed(2)}`);
    }
  }
  
  // 8. Send payouts to winners
  console.log('\n🏆 Sending winner payouts...');
  let successCount = 0;
  let failCount = 0;
  
  for (const winner of winners) {
    if (!winner.users.wallet_address) {
      console.log(`   ⚠️  Skipping winner ${winner.id} - no wallet address`);
      continue;
    }
    
    if (DRY_RUN) {
      console.log(`   🧪 Would send $${payoutPerWinner.toFixed(2)} to ${winner.users.wallet_address}`);
      successCount++;
      continue;
    }
    
    const amount = ethers.parseUnits(payoutPerWinner.toFixed(6), 6); // USDC has 6 decimals
    
    try {
      const tx = await usdc!.transfer(winner.users.wallet_address, amount);
      console.log(`   ⏳ Sending $${payoutPerWinner.toFixed(2)} to ${winner.users.wallet_address}...`);
      await tx.wait();
      
      // Record payout in database
      await supabase
        .from('game_entries')
        .update({ 
          prize_amount: payoutPerWinner,
          prize_transaction_hash: tx.hash 
        })
        .eq('id', winner.id);
        
      console.log(`   ✅ Paid! TX: ${tx.hash}`);
      
      // Send push notification
      const notifSent = await sendPrizeNotification(
        winner.users.wallet_address,
        winner.users.username || 'Player',
        payoutPerWinner
      );
      if (notifSent) {
        console.log(`   📱 Notification sent!`);
      }
      
      successCount++;
    } catch (error) {
      console.error(`   ❌ Failed to pay ${winner.users.wallet_address}:`, error);
      failCount++;
    }
  }
  
  // 9. Send streak insurance refunds (one-time use - consume after applying)
  if (streakInsuranceRecipients.length > 0) {
    console.log('\n🛡️  Sending streak insurance refunds...');
    
    for (const loser of streakInsuranceRecipients) {
      if (!loser.users.wallet_address) {
        console.log(`   ⚠️  Skipping ${loser.id} - no wallet address`);
        continue;
      }
      
      if (DRY_RUN) {
        console.log(`   🧪 Would send $${insurancePayout.toFixed(2)} insurance to ${loser.users.wallet_address}`);
        successCount++;
        continue;
      }
      
      const amount = ethers.parseUnits(insurancePayout.toFixed(6), 6);
      
      try {
        const tx = await usdc!.transfer(loser.users.wallet_address, amount);
        console.log(`   ⏳ Sending $${insurancePayout.toFixed(2)} insurance to ${loser.users.wallet_address}...`);
        await tx.wait();
        
        // Record insurance payout on the game entry
        await supabase
          .from('game_entries')
          .update({ 
            streak_insurance_applied: true,
            refund_amount: insurancePayout,
            prize_transaction_hash: tx.hash 
          })
          .eq('id', loser.id);
        
        // Consume the insurance (one-time use)
        await supabase
          .from('users')
          .update({ 
            has_streak_insurance: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', loser.user_id);
          
        console.log(`   ✅ Paid! TX: ${tx.hash} (insurance consumed)`);
        
        // Send notification for insurance refund
        const notifSent = await sendPrizeNotification(
          loser.users.wallet_address,
          loser.users.username || 'Player',
          insurancePayout
        );
        if (notifSent) {
          console.log(`   📱 Notification sent!`);
        }
        
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed insurance for ${loser.users.wallet_address}:`, error);
        failCount++;
      }
    }
  }
  
  // 10. Send referral commission payouts
  if (unpaidByReferrer.size > 0) {
    console.log('\n🎁 Sending referral commission payouts...');
    
    for (const [referrerId, data] of unpaidByReferrer) {
      if (!data.walletAddress) {
        console.log(`   ⚠️  Skipping referrer ${referrerId.substring(0, 8)}... - no wallet address`);
        continue;
      }
      
      if (DRY_RUN) {
        console.log(`   🧪 Would send $${data.totalAmount.toFixed(2)} referral earnings to ${data.walletAddress}`);
        successCount++;
        continue;
      }
      
      const amount = ethers.parseUnits(data.totalAmount.toFixed(6), 6);
      
      try {
        const tx = await usdc!.transfer(data.walletAddress, amount);
        console.log(`   ⏳ Sending $${data.totalAmount.toFixed(2)} referral earnings to ${data.walletAddress}...`);
        await tx.wait();
        
        // Mark all earnings as paid
        await supabase
          .from('referral_earnings')
          .update({ 
            paid_out: true,
            payout_transaction_hash: tx.hash 
          })
          .in('id', data.earningIds);
        
        // Update user's referral_earnings total
        const { data: currentUser } = await supabase
          .from('users')
          .select('referral_earnings')
          .eq('id', referrerId)
          .single();
        
        if (currentUser) {
          await supabase
            .from('users')
            .update({ 
              referral_earnings: (currentUser.referral_earnings || 0) + data.totalAmount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', referrerId);
        }
          
        console.log(`   ✅ Paid ${data.earningIds.length} earnings! TX: ${tx.hash}`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed referral payout for ${data.walletAddress}:`, error);
        failCount++;
      }
    }
  }
  
  // 11. Sweep remaining balance to Developer Wallet
  // The platform fee (minus referral commissions) stays in the payout wallet
  // We sweep it to the developer wallet so the platform wallet is empty
  console.log('\n💼 Sweeping platform revenue to Developer Wallet...');
  
  let remainingUSDC = 0;
  
  if (DRY_RUN) {
    // In dry-run, estimate remaining balance
    remainingUSDC = platformFee - totalUnpaidReferrals;
    if (remainingUSDC > 0) {
      console.log(`   🧪 Would sweep ~$${remainingUSDC.toFixed(2)} to developer wallet`);
    } else {
      console.log(`   ℹ️  No balance to sweep (estimated)`);
    }
  } else {
    const remainingBalance = await usdc!.balanceOf(wallet!.address);
    remainingUSDC = Number(ethers.formatUnits(remainingBalance, 6));
    
    if (remainingUSDC > 0.01) { // Only sweep if more than 1 cent (to cover dust)
      const developerWallet = process.env.NEXT_PUBLIC_DEVELOPER_WALLET!;
      
      try {
        // Leave a tiny amount for gas if needed, sweep the rest
        const sweepAmount = remainingBalance; // Sweep everything
        const tx = await usdc!.transfer(developerWallet, sweepAmount);
        console.log(`   ⏳ Sweeping $${remainingUSDC.toFixed(2)} to ${developerWallet}...`);
        await tx.wait();
        console.log(`   ✅ Platform revenue transferred! TX: ${tx.hash}`);
        console.log(`   💰 Your revenue: $${remainingUSDC.toFixed(2)}`);
      } catch (error) {
        console.error(`   ❌ Failed to sweep to developer wallet:`, error);
        console.log(`   ⚠️  $${remainingUSDC.toFixed(2)} remains in platform wallet`);
      }
    } else {
      console.log(`   ℹ️  No significant balance to sweep ($${remainingUSDC.toFixed(2)})`);
    }
  }
  
  // 12. Summary
  console.log('\n' + '='.repeat(50));
  if (DRY_RUN) {
    console.log(`🧪 DRY RUN SUMMARY (no transactions sent)`);
  } else {
    console.log(`✨ Distribution complete!`);
  }
  console.log(`   Successful payments: ${successCount}`);
  console.log(`   Failed payments: ${failCount}`);
  console.log(`   Winner payouts: ${winners.filter(w => w.users.wallet_address).length}`);
  console.log(`   Insurance payouts: ${streakInsuranceRecipients.filter(l => l.users.wallet_address).length}`);
  console.log(`   Referral payouts: ${Array.from(unpaidByReferrer.values()).filter(r => r.walletAddress).length}`);
  console.log(`   Platform revenue: $${remainingUSDC.toFixed(2)}`);
  console.log(`   Total distributed: $${totalNeeded.toFixed(2)}`);
  console.log('='.repeat(50) + '\n');
}

// Run the script
distributePrizes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Distribution failed:', error);
    process.exit(1);
  });

