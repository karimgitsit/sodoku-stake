import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

async function checkWallets() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('\n📊 DATABASE STATUS REPORT\n');
  console.log('='.repeat(60));

  // Get all users with wallet info
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username, wallet_address, total_games_played, total_wins, total_earnings, created_at')
    .order('created_at', { ascending: false });

  if (usersError) {
    console.error('Error fetching users:', usersError);
    return;
  }

  console.log(`\n👥 USERS (${users?.length || 0} total)\n`);
  const usersWithWallet = users?.filter(u => u.wallet_address) || [];
  const usersWithoutWallet = users?.filter(u => !u.wallet_address) || [];
  
  console.log(`   ✅ With wallet address: ${usersWithWallet.length}`);
  console.log(`   ❌ Without wallet address: ${usersWithoutWallet.length}`);
  
  if (usersWithoutWallet.length > 0) {
    console.log('\n   Users missing wallet addresses:');
    for (const u of usersWithoutWallet.slice(0, 5)) {
      console.log(`   - ${u.id.substring(0, 8)}... | ${u.username || 'no username'} | ${u.total_games_played} games | $${u.total_earnings} earned`);
    }
  }

  // Get all game entries with prize info
  const { data: entries, error: entriesError } = await supabase
    .from('game_entries')
    .select('id, user_id, puzzle_date, status, prize_amount, prize_transaction_hash')
    .order('puzzle_date', { ascending: false });

  if (entriesError) {
    console.error('Error fetching entries:', entriesError);
    return;
  }

  console.log(`\n🎮 GAME ENTRIES (${entries?.length || 0} total)\n`);
  
  const wonEntries = entries?.filter(e => e.status === 'won') || [];
  const lostEntries = entries?.filter(e => e.status === 'lost') || [];
  const inProgress = entries?.filter(e => e.status === 'in_progress') || [];
  const paidEntries = entries?.filter(e => e.prize_transaction_hash) || [];
  const unpaidWinners = entries?.filter(e => e.status === 'won' && !e.prize_transaction_hash) || [];

  console.log(`   Won: ${wonEntries.length}`);
  console.log(`   Lost: ${lostEntries.length}`);
  console.log(`   In progress: ${inProgress.length}`);
  console.log(`   Paid out: ${paidEntries.length}`);
  console.log(`   Winners NOT paid: ${unpaidWinners.length}`);

  if (unpaidWinners.length > 0) {
    console.log('\n   Unpaid winners:');
    for (const e of unpaidWinners.slice(0, 5)) {
      console.log(`   - Entry ${e.id.substring(0, 8)}... | Date: ${e.puzzle_date} | Prize: $${e.prize_amount || 'not calculated'}`);
    }
  }

  // Group entries by date
  const byDate = new Map<string, typeof entries>();
  for (const e of entries || []) {
    if (!byDate.has(e.puzzle_date)) byDate.set(e.puzzle_date, []);
    byDate.get(e.puzzle_date)!.push(e);
  }

  console.log('\n📅 ENTRIES BY DATE:\n');
  const sortedDates = [...byDate.keys()].sort().reverse();
  for (const date of sortedDates.slice(0, 7)) {
    const dayEntries = byDate.get(date)!;
    const dayWon = dayEntries.filter(e => e.status === 'won').length;
    const dayLost = dayEntries.filter(e => e.status === 'lost').length;
    const dayInProgress = dayEntries.filter(e => e.status === 'in_progress').length;
    console.log(`   ${date}: ${dayEntries.length} entries (W:${dayWon} L:${dayLost} IP:${dayInProgress})`);
  }

  // Check referral earnings
  const { data: referralEarnings } = await supabase
    .from('referral_earnings')
    .select('id, paid_out, amount')
    .eq('paid_out', false);

  console.log(`\n🎁 UNPAID REFERRAL EARNINGS: ${referralEarnings?.length || 0} records`);
  if (referralEarnings && referralEarnings.length > 0) {
    const total = referralEarnings.reduce((sum, e) => sum + (e.amount || 0), 0);
    console.log(`   Total unpaid: $${total.toFixed(2)}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('END OF REPORT\n');
}

checkWallets().catch(console.error);
