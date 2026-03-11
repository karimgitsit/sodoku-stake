/**
 * Investigation Script: Verify Rewards Distribution for a Specific Date
 *
 * Checks both on-chain USDC transfers and database records to verify
 * whether rewards were distributed correctly or all sent to one address.
 *
 * Usage:
 *   npx tsx scripts/check-distribution.ts                    # Check March 9, 2026
 *   npx tsx scripts/check-distribution.ts --date=2026-03-09  # Check specific date
 *
 * Required environment variables (in .env.local):
 *   - WORLD_CHAIN_RPC_URL (or uses public default)
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

const RPC_URL = process.env.WORLD_CHAIN_RPC_URL || 'https://worldchain-mainnet.g.alchemy.com/public';
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';
const DISTRIBUTOR = '0x26C4F10B1a123d6a7656a47DCDD1C422ff41628e';
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

// Parse --date argument
const dateArg = process.argv.find(arg => arg.startsWith('--date='));
const TARGET_DATE = dateArg ? dateArg.split('=')[1] : '2026-03-09';

interface Transfer {
  date: string;
  to: string;
  amount: number;
  txHash: string;
  block: number;
}

async function checkOnChain() {
  console.log('\n' + '='.repeat(60));
  console.log('PART 1: ON-CHAIN USDC TRANSFERS');
  console.log('='.repeat(60));
  console.log(`\nDistributor address: ${DISTRIBUTOR}`);
  console.log(`Target date: ${TARGET_DATE}`);
  console.log(`RPC: ${RPC_URL}`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);

  // World Chain ~2s block time. Search wider range to be safe.
  const blocksBack = 200000; // ~4.5 days
  const fromBlock = currentBlock - blocksBack;

  console.log(`Searching blocks ${fromBlock} to ${currentBlock}...`);

  const fromPadded = ethers.zeroPadValue(DISTRIBUTOR, 32);

  // Get outgoing transfers
  const outLogs = await provider.getLogs({
    address: USDC_ADDRESS,
    topics: [TRANSFER_TOPIC, fromPadded],
    fromBlock,
    toBlock: currentBlock,
  });

  console.log(`\nFound ${outLogs.length} total outgoing USDC transfers`);

  // Parse transfers
  const transfers: Transfer[] = [];
  for (const log of outLogs) {
    const to = ethers.getAddress('0x' + log.topics[2].slice(26));
    const amount = Number(ethers.formatUnits(BigInt(log.data), 6));
    const block = await provider.getBlock(log.blockNumber);
    const date = block ? new Date(block.timestamp * 1000).toISOString() : 'unknown';
    transfers.push({ date, to, amount, txHash: log.transactionHash, block: log.blockNumber });
  }

  transfers.sort((a, b) => a.date.localeCompare(b.date));

  // Group by date
  const byDate: Record<string, Transfer[]> = {};
  for (const t of transfers) {
    const day = t.date.split('T')[0];
    if (byDate[day] === undefined) {
      byDate[day] = [];
    }
    byDate[day].push(t);
  }

  // Show all dates but highlight target
  for (const [day, txs] of Object.entries(byDate)) {
    const isTarget = day === TARGET_DATE;
    const marker = isTarget ? ' 👈 TARGET DATE' : '';

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📅 ${day} (${txs.length} transfers)${marker}`);

    const recipients = new Set(txs.map(t => t.to));
    console.log(`   Unique recipients: ${recipients.size}`);

    const recipientCounts: Record<string, number> = {};
    const recipientAmounts: Record<string, number> = {};
    for (const t of txs) {
      recipientCounts[t.to] = (recipientCounts[t.to] || 0) + 1;
      recipientAmounts[t.to] = (recipientAmounts[t.to] || 0) + t.amount;
    }

    console.log('\n   Recipient breakdown:');
    for (const [addr, count] of Object.entries(recipientCounts)) {
      console.log(`     ${addr}: ${count} transfers, total $${recipientAmounts[addr].toFixed(2)}`);
    }

    // Flag anomalies
    if (recipients.size === 1 && txs.length > 1) {
      console.log(`\n   ⚠️  ANOMALY: ALL ${txs.length} transfers went to the SAME address!`);
      console.log(`   ⚠️  Address: ${txs[0].to}`);
    }

    if (isTarget) {
      console.log('\n   All transactions on target date:');
      for (const t of txs) {
        console.log(`     ${t.date} -> ${t.to} $${t.amount.toFixed(6)} tx:${t.txHash}`);
      }
    }
  }

  // Summary comparison
  console.log(`\n${'─'.repeat(50)}`);
  console.log('COMPARISON ACROSS DATES:');
  for (const [day, txs] of Object.entries(byDate)) {
    const recipients = new Set(txs.map(t => t.to));
    const totalAmount = txs.reduce((sum, t) => sum + t.amount, 0);
    const isTarget = day === TARGET_DATE;
    const flag = (recipients.size === 1 && txs.length > 1) ? ' ⚠️ SINGLE RECIPIENT' : ' ✅';
    const marker = isTarget ? ' 👈' : '';
    console.log(`  ${day}: ${txs.length} transfers, ${recipients.size} recipients, $${totalAmount.toFixed(2)} total${flag}${marker}`);
  }

  return transfers;
}

async function checkDatabase() {
  console.log('\n' + '='.repeat(60));
  console.log('PART 2: DATABASE RECORDS');
  console.log('='.repeat(60));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('\n⚠️  Supabase credentials not found in .env.local');
    console.log('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to check database records.');
    return;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Check game entries for the target date
  console.log(`\nChecking game entries for ${TARGET_DATE}...`);
  const { data: entries, error } = await supabase
    .from('game_entries')
    .select('id, status, user_id, prize_amount, prize_transaction_hash, refund_amount, streak_insurance_applied, users!inner(username, wallet_address)')
    .eq('puzzle_date', TARGET_DATE);

  if (error) {
    console.log(`   ❌ Database error: ${error.message}`);
    return;
  }

  if (!entries || entries.length === 0) {
    console.log(`   ℹ️  No entries found for ${TARGET_DATE}`);
    return;
  }

  console.log(`\n   Total entries: ${entries.length}`);
  const winners = entries.filter((e: any) => e.status === 'won');
  const losers = entries.filter((e: any) => e.status === 'lost');
  console.log(`   Winners: ${winners.length}`);
  console.log(`   Losers: ${losers.length}`);

  // Check wallet addresses
  const walletAddresses = new Set(entries.map((e: any) => (e.users as any)?.wallet_address).filter(Boolean));
  console.log(`   Unique wallet addresses across all players: ${walletAddresses.size}`);

  if (walletAddresses.size === 1) {
    const addr = [...walletAddresses][0];
    console.log(`   ⚠️  ALL players have the SAME wallet address: ${addr}`);
  }

  // Check winners' wallet addresses specifically
  const winnerWallets = new Set(winners.map((e: any) => (e.users as any)?.wallet_address).filter(Boolean));
  console.log(`\n   Winner wallet addresses: ${winnerWallets.size} unique`);
  for (const addr of winnerWallets) {
    const count = winners.filter((e: any) => (e.users as any)?.wallet_address === addr).length;
    console.log(`     ${addr}: ${count} winners`);
  }

  // Check prize payouts
  const paidEntries = entries.filter((e: any) => e.prize_transaction_hash);
  console.log(`\n   Entries with transaction hashes: ${paidEntries.length}`);

  // Check if all tx hashes point to same transaction
  const txHashes = new Set(paidEntries.map((e: any) => e.prize_transaction_hash));
  console.log(`   Unique transaction hashes: ${txHashes.size}`);

  if (paidEntries.length > 0) {
    console.log('\n   Payout details:');
    for (const e of paidEntries) {
      const user = e.users as any;
      const type = e.status === 'won' ? 'PRIZE' : (e.streak_insurance_applied ? 'INSURANCE' : 'OTHER');
      const amount = e.prize_amount || e.refund_amount || 0;
      console.log(`     [${type}] ${user?.username || 'anon'} (${user?.wallet_address || 'no wallet'}) $${amount.toFixed(2)} tx:${e.prize_transaction_hash}`);
    }
  }

  // Check referral earnings for that date
  const { data: referralEarnings } = await supabase
    .from('referral_earnings')
    .select('id, referrer_id, amount, paid_out, payout_transaction_hash')
    .eq('source_date', TARGET_DATE);

  if (referralEarnings && referralEarnings.length > 0) {
    console.log(`\n   Referral earnings for ${TARGET_DATE}: ${referralEarnings.length}`);
    const paidReferrals = referralEarnings.filter(e => e.paid_out);
    console.log(`   Paid out: ${paidReferrals.length}`);
  }
}

async function main() {
  console.log('🔍 REWARDS DISTRIBUTION INVESTIGATION');
  console.log(`Target date: ${TARGET_DATE}`);
  console.log(`Distributor: ${DISTRIBUTOR}`);

  try {
    await checkOnChain();
  } catch (e) {
    console.log(`\n⚠️  On-chain check failed: ${e instanceof Error ? e.message : e}`);
    console.log('   This may be due to RPC rate limiting. Try setting WORLD_CHAIN_RPC_URL to a private RPC endpoint.');
  }

  try {
    await checkDatabase();
  } catch (e) {
    console.log(`\n⚠️  Database check failed: ${e instanceof Error ? e.message : e}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('INVESTIGATION COMPLETE');
  console.log('='.repeat(60));
}

main().catch(e => console.error('Fatal error:', e));
