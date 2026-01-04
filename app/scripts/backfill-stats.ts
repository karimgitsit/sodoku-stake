/**
 * Backfill User Stats Script
 * 
 * This script recalculates and updates user statistics based on 
 * their historical game_entries data:
 * - total_wins: Count of entries with status = 'won'
 * - total_earnings: Sum of prize_amount from all entries
 * - total_games_played: Count of all entries
 * 
 * Run with: npx tsx scripts/backfill-stats.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface GameEntry {
  user_id: string;
  status: 'in_progress' | 'won' | 'lost';
  prize_amount: number | null;
}

interface UserStats {
  userId: string;
  totalGames: number;
  totalWins: number;
  totalEarnings: number;
}

async function backfillStats() {
  console.log('🔄 Starting comprehensive stats backfill...\n');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase configuration');
    console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Step 1: Get ALL game entries
  console.log('📊 Fetching all game entries...');
  
  const { data: entries, error: entriesError } = await supabase
    .from('game_entries')
    .select('user_id, status, prize_amount');

  if (entriesError) {
    console.error('❌ Error fetching entries:', entriesError.message);
    process.exit(1);
  }

  if (!entries || entries.length === 0) {
    console.log('ℹ️  No game entries found. Nothing to backfill.');
    process.exit(0);
  }

  const typedEntries = entries as GameEntry[];
  console.log(`   Found ${typedEntries.length} total game entries\n`);

  // Step 2: Aggregate stats per user
  console.log('🧮 Aggregating stats per user...');
  
  const userStatsMap = new Map<string, UserStats>();

  for (const entry of typedEntries) {
    const existing = userStatsMap.get(entry.user_id);
    const isWin = entry.status === 'won';
    const earnings = entry.prize_amount || 0;
    
    if (existing) {
      existing.totalGames += 1;
      existing.totalWins += isWin ? 1 : 0;
      existing.totalEarnings += earnings;
    } else {
      userStatsMap.set(entry.user_id, {
        userId: entry.user_id,
        totalGames: 1,
        totalWins: isWin ? 1 : 0,
        totalEarnings: earnings,
      });
    }
  }

  console.log(`   Found ${userStatsMap.size} unique users with game history\n`);

  // Step 3: Get current user stats for comparison
  console.log('📋 Fetching current user records...');
  
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, total_games_played, total_wins, total_earnings');
  
  if (usersError) {
    console.error('❌ Error fetching users:', usersError.message);
    process.exit(1);
  }

  const currentStats = new Map<string, { games: number; wins: number; earnings: number }>();
  for (const user of users || []) {
    currentStats.set(user.id, {
      games: user.total_games_played || 0,
      wins: user.total_wins || 0,
      earnings: user.total_earnings || 0,
    });
  }

  // Step 4: Update each user's stats
  console.log('💾 Updating user stats...\n');

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let changesCount = 0;

  for (const [userId, stats] of userStatsMap) {
    const current = currentStats.get(userId);
    
    // Check if update is needed
    const needsUpdate = !current || 
      current.games !== stats.totalGames ||
      current.wins !== stats.totalWins ||
      Math.abs(current.earnings - stats.totalEarnings) > 0.001;
    
    if (!needsUpdate) {
      skippedCount++;
      continue;
    }

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          total_games_played: stats.totalGames,
          total_wins: stats.totalWins,
          total_earnings: stats.totalEarnings,
        })
        .eq('id', userId);

      if (updateError) {
        console.error(`   ❌ Failed to update user ${userId.substring(0, 8)}...: ${updateError.message}`);
        errorCount++;
      } else {
        const changes: string[] = [];
        if (!current || current.games !== stats.totalGames) {
          changes.push(`games: ${current?.games || 0} → ${stats.totalGames}`);
        }
        if (!current || current.wins !== stats.totalWins) {
          changes.push(`wins: ${current?.wins || 0} → ${stats.totalWins}`);
        }
        if (!current || Math.abs(current.earnings - stats.totalEarnings) > 0.001) {
          changes.push(`earnings: $${(current?.earnings || 0).toFixed(2)} → $${stats.totalEarnings.toFixed(2)}`);
        }
        
        console.log(`   ✅ Updated user ${userId.substring(0, 8)}... [${changes.join(', ')}]`);
        successCount++;
        changesCount++;
      }
    } catch (err) {
      console.error(`   ❌ Error updating user ${userId.substring(0, 8)}...:`, err);
      errorCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 BACKFILL SUMMARY');
  console.log('='.repeat(60));
  console.log(`   Total game entries processed: ${typedEntries.length}`);
  console.log(`   Unique users found: ${userStatsMap.size}`);
  console.log(`   Users updated: ${successCount}`);
  console.log(`   Users already correct (skipped): ${skippedCount}`);
  console.log(`   Failed updates: ${errorCount}`);
  
  // Calculate totals
  let totalGames = 0;
  let totalWins = 0;
  let totalEarnings = 0;
  for (const stats of userStatsMap.values()) {
    totalGames += stats.totalGames;
    totalWins += stats.totalWins;
    totalEarnings += stats.totalEarnings;
  }
  
  console.log('');
  console.log('   📊 Aggregate Statistics:');
  console.log(`      Total games played: ${totalGames}`);
  console.log(`      Total wins: ${totalWins}`);
  console.log(`      Total earnings: $${totalEarnings.toFixed(2)}`);
  console.log(`      Overall win rate: ${totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : 0}%`);
  console.log('='.repeat(60) + '\n');

  if (errorCount > 0) {
    console.log('⚠️  Some updates failed. Check the errors above.');
    process.exit(1);
  } else if (changesCount > 0) {
    console.log('✅ Backfill completed successfully!');
    console.log(`   ${changesCount} user(s) had their stats corrected.`);
  } else {
    console.log('✅ All user stats were already correct. No changes needed.');
  }
  
  process.exit(0);
}

// Run the script
backfillStats().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});

