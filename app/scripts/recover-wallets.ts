/**
 * Wallet Address Recovery Script
 * 
 * Recovers wallet addresses from existing transaction hashes by querying
 * the Worldcoin Developer Portal API.
 * 
 * Usage:
 *   npx tsx scripts/recover-wallets.ts --dry-run   # Preview changes
 *   npx tsx scripts/recover-wallets.ts             # Actually update database
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

interface TransactionResponse {
  transaction_id: string;
  reference: string;
  status: 'pending' | 'mined' | 'failed';
  chain: string;
  network: string;
  from_address: string;
  to_address: string;
  token_amount: string;
  token: string;
  created_at: string;
  updated_at: string;
}

async function queryTransaction(txId: string): Promise<TransactionResponse | null> {
  const apiKey = process.env.DEV_PORTAL_API_KEY;
  const appId = process.env.NEXT_PUBLIC_APP_ID;
  
  if (!apiKey || !appId) {
    console.error('Missing DEV_PORTAL_API_KEY or NEXT_PUBLIC_APP_ID');
    return null;
  }

  try {
    const response = await fetch(
      `https://developer.worldcoin.org/api/v2/minikit/transaction/${txId}?app_id=${appId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`API error for ${txId}: ${response.status}`);
      const text = await response.text();
      console.error('Response:', text);
      return null;
    }

    return await response.json() as TransactionResponse;
  } catch (error) {
    console.error(`Error querying ${txId}:`, error);
    return null;
  }
}

async function recoverWallets() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN MODE - No database changes will be made\n');
  }

  console.log('\n🔄 WALLET ADDRESS RECOVERY\n');
  console.log('='.repeat(70));

  // Get all users without wallet addresses who have game entries with transaction hashes
  const { data: entries } = await supabase
    .from('game_entries')
    .select(`
      id,
      user_id,
      transaction_hash,
      puzzle_date,
      users!inner(id, wallet_address)
    `)
    .not('transaction_hash', 'is', null)
    .order('puzzle_date', { ascending: false });

  if (!entries || entries.length === 0) {
    console.log('No entries with transaction hashes found.');
    return;
  }

  // Filter to entries where user has no wallet address
  const entriesNeedingRecovery = entries.filter(e => {
    const user = e.users as any;
    return !user.wallet_address && 
           e.transaction_hash && 
           !e.transaction_hash.startsWith('dev_mock_');
  });

  console.log(`\nFound ${entriesNeedingRecovery.length} entries needing wallet recovery\n`);

  let recovered = 0;
  let failed = 0;
  const recoveredWallets = new Map<string, string>(); // userId -> walletAddress

  for (const entry of entriesNeedingRecovery) {
    const txHash = entry.transaction_hash!;
    console.log(`\n📝 Entry ${entry.id.substring(0, 8)}... (${entry.puzzle_date})`);
    console.log(`   TX: ${txHash}`);

    // Skip if we already recovered this user's wallet
    if (recoveredWallets.has(entry.user_id)) {
      console.log(`   ✓ Already recovered wallet for this user`);
      continue;
    }

    // Query the Worldcoin API
    console.log(`   ⏳ Querying Worldcoin API...`);
    const txData = await queryTransaction(txHash);

    if (!txData) {
      console.log(`   ❌ Failed to query transaction`);
      failed++;
      continue;
    }

    if (!txData.from_address) {
      console.log(`   ❌ Transaction has no from_address`);
      console.log(`   Response:`, JSON.stringify(txData, null, 2));
      failed++;
      continue;
    }

    console.log(`   ✅ Found wallet: ${txData.from_address}`);
    recoveredWallets.set(entry.user_id, txData.from_address);

    if (!DRY_RUN) {
      // Update user's wallet address
      const { error } = await supabase
        .from('users')
        .update({ 
          wallet_address: txData.from_address,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.user_id);

      if (error) {
        console.log(`   ❌ Failed to update database: ${error.message}`);
        failed++;
      } else {
        console.log(`   💾 Updated user ${entry.user_id.substring(0, 8)}... in database`);
        recovered++;
      }
    } else {
      console.log(`   🧪 Would update user ${entry.user_id.substring(0, 8)}...`);
      recovered++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n' + '='.repeat(70));
  console.log('📋 RECOVERY SUMMARY\n');
  console.log(`✅ Recovered: ${recovered} wallet addresses`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Unique users: ${recoveredWallets.size}`);

  if (DRY_RUN && recovered > 0) {
    console.log('\n💡 Run without --dry-run to apply changes:');
    console.log('   npx tsx scripts/recover-wallets.ts');
  }

  if (recovered > 0 && !DRY_RUN) {
    console.log('\n💡 Now run the distribution script to pay winners:');
    console.log('   npx tsx scripts/distribute-prizes.ts --dry-run');
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

recoverWallets().catch(console.error);
