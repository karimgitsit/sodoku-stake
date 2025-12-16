/**
 * Diagnostic script to understand wallet address capture issues
 * and identify which winners can be paid
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

async function diagnoseWallets() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('\n🔍 WALLET ADDRESS DIAGNOSTIC REPORT\n');
  console.log('='.repeat(70));

  // ========================================================================
  // 1. GET ALL USERS WITH THEIR WALLET STATUS
  // ========================================================================
  const { data: users } = await supabase
    .from('users')
    .select('id, username, wallet_address, total_games_played, total_wins, total_earnings, created_at')
    .order('created_at', { ascending: false });

  console.log('\n📊 USER WALLET STATUS\n');
  
  const usersWithWallet = users?.filter(u => u.wallet_address) || [];
  const usersWithoutWallet = users?.filter(u => !u.wallet_address) || [];
  
  console.log(`Total Users: ${users?.length || 0}`);
  console.log(`✅ With wallet: ${usersWithWallet.length} (${((usersWithWallet.length / (users?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`❌ Without wallet: ${usersWithoutWallet.length} (${((usersWithoutWallet.length / (users?.length || 1)) * 100).toFixed(1)}%)`);

  // ========================================================================
  // 2. GET ALL WINNERS (with and without wallets)
  // ========================================================================
  const { data: winners } = await supabase
    .from('game_entries')
    .select(`
      id,
      puzzle_date,
      status,
      prize_amount,
      prize_transaction_hash,
      user_id,
      transaction_hash,
      users!inner(id, username, wallet_address)
    `)
    .eq('status', 'won')
    .order('puzzle_date', { ascending: false });

  console.log('\n🏆 WINNER ANALYSIS\n');
  
  const winnersWithWallet = winners?.filter(w => (w.users as any)?.wallet_address) || [];
  const winnersWithoutWallet = winners?.filter(w => !(w.users as any)?.wallet_address) || [];
  const paidWinners = winners?.filter(w => w.prize_transaction_hash) || [];
  const unpaidWithWallet = winnersWithWallet.filter(w => !w.prize_transaction_hash);
  const unpaidWithoutWallet = winnersWithoutWallet.filter(w => !w.prize_transaction_hash);

  console.log(`Total Winners: ${winners?.length || 0}`);
  console.log(`  ✅ With wallet address: ${winnersWithWallet.length}`);
  console.log(`  ❌ Without wallet address: ${winnersWithoutWallet.length}`);
  console.log(`  💰 Already paid: ${paidWinners.length}`);
  console.log(`  ⏳ Unpaid WITH wallet (PAYABLE): ${unpaidWithWallet.length}`);
  console.log(`  ❌ Unpaid WITHOUT wallet (BLOCKED): ${unpaidWithoutWallet.length}`);

  // ========================================================================
  // 3. PAYABLE WINNERS DETAIL
  // ========================================================================
  if (unpaidWithWallet.length > 0) {
    console.log('\n✅ PAYABLE WINNERS (have wallet, not yet paid):\n');
    for (const w of unpaidWithWallet) {
      const user = w.users as any;
      console.log(`  📅 ${w.puzzle_date} | User: ${user.username || 'anonymous'} | Wallet: ${user.wallet_address.substring(0, 12)}...`);
      console.log(`     Entry TX: ${w.transaction_hash?.substring(0, 16) || 'no tx recorded'}...`);
    }
  }

  // ========================================================================
  // 4. BLOCKED WINNERS (no wallet)
  // ========================================================================
  if (unpaidWithoutWallet.length > 0) {
    console.log('\n❌ BLOCKED WINNERS (no wallet address):\n');
    for (const w of unpaidWithoutWallet) {
      const user = w.users as any;
      console.log(`  📅 ${w.puzzle_date} | User: ${user.username || 'anonymous'} | ID: ${user.id.substring(0, 12)}...`);
      console.log(`     Entry TX: ${w.transaction_hash || 'NONE'}`);
    }
  }

  // ========================================================================
  // 5. TRANSACTION ANALYSIS - Do any entry transactions have wallet info?
  // ========================================================================
  console.log('\n📝 ENTRY TRANSACTION ANALYSIS:\n');
  
  const { data: entriesWithTx } = await supabase
    .from('game_entries')
    .select('id, puzzle_date, transaction_hash, user_id')
    .not('transaction_hash', 'is', null)
    .order('puzzle_date', { ascending: false })
    .limit(10);

  console.log(`Entries with transaction hashes: ${entriesWithTx?.length || 0}`);
  
  if (entriesWithTx && entriesWithTx.length > 0) {
    console.log('\nRecent entry transactions:');
    for (const e of entriesWithTx.slice(0, 5)) {
      console.log(`  ${e.puzzle_date}: ${e.transaction_hash?.substring(0, 40)}...`);
    }
  }

  // ========================================================================
  // 6. CHECK USERS WITH ENTRY TX BUT NO WALLET
  // ========================================================================
  console.log('\n🔎 USERS WITH ENTRY TX BUT NO WALLET:\n');
  
  const usersWithTxNoWallet: any[] = [];
  for (const w of unpaidWithoutWallet) {
    if (w.transaction_hash && w.transaction_hash !== 'dev_mock_tx_') {
      usersWithTxNoWallet.push({
        userId: w.user_id,
        date: w.puzzle_date,
        tx: w.transaction_hash,
      });
    }
  }

  if (usersWithTxNoWallet.length > 0) {
    console.log(`Found ${usersWithTxNoWallet.length} users who paid (have tx) but no wallet captured:`);
    for (const u of usersWithTxNoWallet) {
      console.log(`  User ${u.userId.substring(0, 12)}... | Date: ${u.date}`);
      console.log(`  TX: ${u.tx}`);
      console.log(`  → This TX can be queried via Worldcoin API to recover wallet address!`);
      console.log('');
    }
  } else {
    console.log('  All users without wallets also have no valid transaction hashes.');
    console.log('  They likely used dev mode or payment verification failed.');
  }

  // ========================================================================
  // 7. CHECK IF DEV MODE TRANSACTIONS
  // ========================================================================
  console.log('\n⚙️ DEV MODE ANALYSIS:\n');
  
  const devModeEntries = winners?.filter(w => 
    w.transaction_hash?.startsWith('dev_mock_tx_')
  ) || [];
  
  console.log(`Entries with dev mode transactions: ${devModeEntries.length}`);
  if (devModeEntries.length > 0) {
    console.log('  These are TEST entries that cannot receive real payouts.');
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('📋 SUMMARY\n');
  
  console.log(`✅ PAYABLE NOW: ${unpaidWithWallet.length} winners`);
  console.log(`❌ BLOCKED (no wallet): ${unpaidWithoutWallet.length} winners`);
  console.log(`💰 ALREADY PAID: ${paidWinners.length} winners`);
  
  if (unpaidWithWallet.length > 0) {
    console.log('\n💡 ACTION: Run the distribution script to pay the payable winners');
    console.log('   npx tsx scripts/distribute-prizes.ts');
  }
  
  if (usersWithTxNoWallet.length > 0) {
    console.log('\n💡 ACTION: Can recover wallet addresses from transaction history');
    console.log('   Use Worldcoin API: GET /api/v2/minikit/transaction/{txId}?app_id={appId}');
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

diagnoseWallets().catch(console.error);
