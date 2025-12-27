/**
 * Diagnose notification issues by checking the production database
 * 
 * This script checks:
 * 1. If notifications have ever been sent
 * 2. If the cron job is working
 * 3. User notification settings
 * 4. Why a specific user might not be receiving notifications
 * 
 * Usage:
 *   npx tsx scripts/diagnose-notifications.ts
 *   npx tsx scripts/diagnose-notifications.ts <username_or_wallet>
 * 
 * Requires SUPABASE env vars (can use production values)
 */

import { createClient } from '@supabase/supabase-js';

// Allow passing env vars directly for production debugging
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function diagnose() {
  console.log('\n🔍 NOTIFICATION DIAGNOSIS\n');
  console.log('='.repeat(70));

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('\n❌ Missing Supabase credentials');
    console.log('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    console.log('\n   You can run with production values:');
    console.log('   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \\');
    console.log('   SUPABASE_SERVICE_ROLE_KEY=xxx \\');
    console.log('   npx tsx scripts/diagnose-notifications.ts');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const searchTerm = process.argv[2];

  // 1. Check if notifications table exists and has data
  console.log('\n📊 1. NOTIFICATION HISTORY\n');
  
  const { data: allNotifs, error: notifsError } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (notifsError) {
    if (notifsError.message.includes('does not exist')) {
      console.log('   ❌ notifications table does not exist!');
      console.log('   → Run the migration: supabase/migrations/001_add_notifications.sql');
    } else {
      console.log(`   ❌ Error: ${notifsError.message}`);
    }
  } else if (!allNotifs || allNotifs.length === 0) {
    console.log('   ⚠️ No notifications have ever been sent');
    console.log('   → The cron job may not be running');
    console.log('   → Or no users meet the notification criteria');
  } else {
    console.log(`   Found ${allNotifs.length} recent notifications:\n`);
    
    const statusCounts: Record<string, number> = {};
    for (const n of allNotifs) {
      statusCounts[n.status] = (statusCounts[n.status] || 0) + 1;
    }
    
    for (const [status, count] of Object.entries(statusCounts)) {
      const emoji = status === 'sent' ? '✅' : status === 'failed' ? '❌' : '⏳';
      console.log(`   ${emoji} ${status}: ${count}`);
    }

    console.log('\n   Last 5 notifications:');
    for (const n of allNotifs.slice(0, 5)) {
      console.log(`\n   - ${n.notification_type}:${n.notification_subtype}`);
      console.log(`     Status: ${n.status}`);
      console.log(`     Created: ${n.created_at}`);
      if (n.error_message) {
        console.log(`     Error: ${n.error_message}`);
      }
    }
  }

  // 2. Check users with notifications enabled
  console.log('\n\n👥 2. USERS WITH NOTIFICATIONS\n');

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username, wallet_address, notifications_enabled, last_notification_sent_at, current_streak, total_games_played')
    .order('last_notification_sent_at', { ascending: false, nullsFirst: false })
    .limit(50);

  if (usersError) {
    console.log(`   ❌ Error: ${usersError.message}`);
  } else {
    const withWallet = users?.filter(u => u.wallet_address) || [];
    const withNotifs = users?.filter(u => u.notifications_enabled !== false) || [];
    const recentlyNotified = users?.filter(u => u.last_notification_sent_at) || [];

    console.log(`   Total users checked: ${users?.length || 0}`);
    console.log(`   With wallet address: ${withWallet.length}`);
    console.log(`   With notifications on: ${withNotifs.length}`);
    console.log(`   Ever received notification: ${recentlyNotified.length}`);

    if (recentlyNotified.length > 0) {
      console.log('\n   Users who received notifications:');
      for (const u of recentlyNotified.slice(0, 5)) {
        console.log(`   - ${u.username || 'No username'}: ${u.last_notification_sent_at}`);
      }
    }
  }

  // 3. Look for specific user if provided
  if (searchTerm) {
    console.log(`\n\n🔎 3. SEARCHING FOR: "${searchTerm}"\n`);

    const { data: foundUsers } = await supabase
      .from('users')
      .select('*')
      .or(`username.ilike.%${searchTerm}%,wallet_address.ilike.%${searchTerm}%`)
      .limit(5);

    if (!foundUsers || foundUsers.length === 0) {
      console.log('   ❌ No user found with that username or wallet');
    } else {
      for (const user of foundUsers) {
        console.log(`\n   Found user: ${user.username || 'No username'}`);
        console.log(`   ─────────────────────────────────`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Wallet: ${user.wallet_address || '❌ NO WALLET - Cannot receive notifications!'}`);
        console.log(`   Notifications enabled: ${user.notifications_enabled !== false ? '✅ Yes' : '❌ No'}`);
        console.log(`   Last notification: ${user.last_notification_sent_at || 'Never'}`);
        console.log(`   Current streak: ${user.current_streak || 0} days`);
        console.log(`   Total games: ${user.total_games_played || 0}`);
        
        // Check their notification history
        const { data: userNotifs } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (userNotifs && userNotifs.length > 0) {
          console.log(`\n   Their notification history:`);
          for (const n of userNotifs) {
            console.log(`   - ${n.notification_type}: ${n.status} (${n.created_at})`);
            if (n.error_message) console.log(`     Error: ${n.error_message}`);
          }
        } else {
          console.log(`\n   ⚠️ No notifications sent to this user`);
        }

        // Diagnose why they might not get notifications
        console.log(`\n   Why might this user not receive notifications?`);
        
        if (!user.wallet_address) {
          console.log(`   ❌ No wallet address - MUST have wallet to receive push notifications`);
        }
        if (user.notifications_enabled === false) {
          console.log(`   ❌ Notifications disabled in preferences`);
        }
        if (user.last_notification_sent_at) {
          const lastSent = new Date(user.last_notification_sent_at);
          const hoursSince = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            console.log(`   ⏳ Rate limited - last notification ${hoursSince.toFixed(1)} hours ago (need 24h)`);
          }
        }
        if ((user.current_streak || 0) < 3) {
          console.log(`   📊 Streak too low for streak risk notifications (need 3+ days)`);
        }
        if ((user.total_games_played || 0) === 0) {
          console.log(`   📊 Never played - won't receive deadline/reminder notifications`);
        }
      }
    }
  } else {
    console.log('\n\n💡 Tip: Search for a specific user:');
    console.log('   npx tsx scripts/diagnose-notifications.ts YOUR_USERNAME');
  }

  // 4. Check if cron has been called recently (via notification timestamps)
  console.log('\n\n⏰ 4. CRON JOB STATUS\n');
  
  const { data: recentNotifs } = await supabase
    .from('notifications')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (recentNotifs && recentNotifs.length > 0) {
    const lastNotif = new Date(recentNotifs[0].created_at);
    const hoursSince = (Date.now() - lastNotif.getTime()) / (1000 * 60 * 60);
    
    if (hoursSince < 24) {
      console.log(`   ✅ Cron appears active - last notification ${hoursSince.toFixed(1)} hours ago`);
    } else {
      console.log(`   ⚠️ Last notification was ${hoursSince.toFixed(0)} hours ago`);
      console.log(`   → Cron might not be running`);
    }
  } else {
    console.log('   ⚠️ No notifications in database - cannot determine cron status');
    console.log('   → Check Vercel dashboard for cron job logs');
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n📋 NEXT STEPS\n');
  console.log('   1. Check Vercel dashboard → Cron Jobs to see if they\'re running');
  console.log('   2. Check Vercel logs for "[Cron]" or "[Notifications]" messages');
  console.log('   3. Verify WORLD_API_KEY is set in Vercel environment variables');
  console.log('   4. Make sure you have a wallet address in the database');
  console.log('   5. Enable notifications in World App: Settings → Notifications');
  console.log('\n' + '='.repeat(70) + '\n');
}

diagnose().catch(console.error);



