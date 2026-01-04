/**
 * Backfill User Earnings Script
 * 
 * This script updates the total_earnings field for users based on 
 * their historical prize_amount values in game_entries.
 * 
 * Run with: npx tsx scripts/backfill-earnings.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface GameEntryWithPrize {
  user_id: string;
  prize_amount: number;
}

interface UserEarnings {
  userId: string;
  totalEarnings: number;
  entriesCount: number;
}

async function backfillEarnings() {
  console.log('🔄 Starting earnings backfill...\n');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase configuration');
    console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Step 1: Get all game entries with prize_amount > 0
  console.log('📊 Fetching game entries with prizes...');
  
  const { data: entries, error: entriesError } = await supabase
    .from('game_entries')
    .select('user_id, prize_amount')
    .gt('prize_amount', 0);

  if (entriesError) {
    console.error('❌ Error fetching entries:', entriesError.message);
    process.exit(1);
  }

  if (!entries || entries.length === 0) {
    console.log('ℹ️  No entries with prize_amount found. Nothing to backfill.');
    process.exit(0);
  }

  const typedEntries = entries as GameEntryWithPrize[];
  console.log(`   Found ${typedEntries.length} entries with prizes\n`);

  // Step 2: Aggregate earnings per user
  console.log('🧮 Aggregating earnings per user...');
  
  const userEarningsMap = new Map<string, UserEarnings>();

  for (const entry of typedEntries) {
    const existing = userEarningsMap.get(entry.user_id);
    if (existing) {
      existing.totalEarnings += entry.prize_amount;
      existing.entriesCount += 1;
    } else {
      userEarningsMap.set(entry.user_id, {
        userId: entry.user_id,
        totalEarnings: entry.prize_amount,
        entriesCount: 1,
      });
    }
  }

  console.log(`   Found ${userEarningsMap.size} unique users with earnings\n`);

  // Step 3: Update each user's total_earnings
  console.log('💾 Updating user earnings...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const [userId, earnings] of userEarningsMap) {
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ total_earnings: earnings.totalEarnings })
        .eq('id', userId);

      if (updateError) {
        console.error(`   ❌ Failed to update user ${userId.substring(0, 8)}...: ${updateError.message}`);
        errorCount++;
      } else {
        console.log(`   ✅ Updated user ${userId.substring(0, 8)}... → $${earnings.totalEarnings.toFixed(2)} (${earnings.entriesCount} wins)`);
        successCount++;
      }
    } catch (err) {
      console.error(`   ❌ Error updating user ${userId.substring(0, 8)}...:`, err);
      errorCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 BACKFILL SUMMARY');
  console.log('='.repeat(50));
  console.log(`   Total entries processed: ${typedEntries.length}`);
  console.log(`   Unique users: ${userEarningsMap.size}`);
  console.log(`   Successfully updated: ${successCount}`);
  console.log(`   Failed: ${errorCount}`);
  
  // Calculate total earnings distributed
  let totalDistributed = 0;
  for (const earnings of userEarningsMap.values()) {
    totalDistributed += earnings.totalEarnings;
  }
  console.log(`   Total earnings backfilled: $${totalDistributed.toFixed(2)}`);
  console.log('='.repeat(50) + '\n');

  if (errorCount > 0) {
    console.log('⚠️  Some updates failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('✅ Backfill completed successfully!');
    process.exit(0);
  }
}

// Run the script
backfillEarnings().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});


