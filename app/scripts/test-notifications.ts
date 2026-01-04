/**
 * Test script to verify the notification system is working
 * 
 * Usage:
 *   npx tsx scripts/test-notifications.ts
 *   npx tsx scripts/test-notifications.ts <wallet_address>
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const WORLD_API_KEY = process.env.WORLD_API_KEY;
const DEV_PORTAL_API_KEY = process.env.DEV_PORTAL_API_KEY;
const APP_ID = process.env.NEXT_PUBLIC_APP_ID;
const NOTIFICATION_API_URL = 'https://developer.worldcoin.org/api/v2/minikit/send-notification';

async function testNotificationSystem() {
  console.log('\n🔔 NOTIFICATION SYSTEM DIAGNOSTIC\n');
  console.log('='.repeat(70));

  // 1. Check environment variables
  console.log('\n📋 1. ENVIRONMENT VARIABLES CHECK\n');
  
  const checks = [
    { name: 'NEXT_PUBLIC_APP_ID', value: APP_ID, required: true },
    { name: 'WORLD_API_KEY', value: WORLD_API_KEY, required: true },
    { name: 'DEV_PORTAL_API_KEY', value: DEV_PORTAL_API_KEY, required: false },
    { name: 'CRON_SECRET', value: process.env.CRON_SECRET, required: true },
    { name: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL, required: true },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY, required: true },
  ];

  let allRequired = true;
  for (const check of checks) {
    const status = check.value 
      ? `✅ Set (${check.value.length} chars)` 
      : (check.required ? '❌ MISSING (required)' : '⚠️ Missing (optional)');
    console.log(`   ${check.name}: ${status}`);
    if (check.required && !check.value) {
      allRequired = false;
    }
  }

  if (!allRequired) {
    console.log('\n❌ Missing required environment variables!');
    console.log('   1. Copy env.example to .env.local');
    console.log('   2. Get WORLD_API_KEY from https://developer.worldcoin.org/');
    console.log('   3. Generate a CRON_SECRET with: openssl rand -hex 32');
    console.log('\n' + '='.repeat(70) + '\n');
    return;
  }

  // 2. Test API connectivity
  console.log('\n📡 2. API CONNECTIVITY TEST\n');
  
  const apiKey = WORLD_API_KEY || DEV_PORTAL_API_KEY;
  if (!apiKey) {
    console.log('   ❌ No API key available for testing');
  } else {
    // Test with a dummy request to see if API is reachable
    // We'll send to a non-existent wallet to test auth without actually sending
    try {
      const testWallet = '0x0000000000000000000000000000000000000001';
      
      const response = await fetch(NOTIFICATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: APP_ID,
          wallet_addresses: [testWallet],
          title: 'Test Notification',
          message: 'This is a test from the diagnostic script.',
          mini_app_path: '/',
        }),
      });

      const responseText = await response.text();
      
      if (response.status === 401) {
        console.log('   ❌ API returned 401 Unauthorized');
        console.log('   → Your WORLD_API_KEY may be invalid or expired');
        console.log('   → Get a new one from https://developer.worldcoin.org/');
      } else if (response.status === 400) {
        console.log('   ✅ API reachable (400 = bad request, but auth worked!)');
        console.log(`   Response: ${responseText.substring(0, 200)}`);
      } else if (response.ok) {
        console.log('   ✅ API call succeeded!');
        console.log(`   Response: ${responseText}`);
      } else {
        console.log(`   ⚠️ API returned ${response.status}: ${response.statusText}`);
        console.log(`   Response: ${responseText.substring(0, 200)}`);
      }
    } catch (error) {
      console.log(`   ❌ Network error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  // 3. Check database for user data
  console.log('\n📊 3. DATABASE CHECK\n');
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, wallet_address, notifications_enabled, last_notification_sent_at')
      .limit(10);

    if (usersError) {
      console.log(`   ❌ Error querying users: ${usersError.message}`);
    } else {
      console.log(`   Found ${users?.length || 0} users in database\n`);
      
      const usersWithWallet = users?.filter((u: { wallet_address: string | null }) => u.wallet_address) || [];
      const usersWithNotifs = users?.filter((u: { notifications_enabled: boolean | null }) => u.notifications_enabled !== false) || [];
      
      console.log(`   Users with wallet address: ${usersWithWallet.length}`);
      console.log(`   Users with notifications enabled: ${usersWithNotifs.length}`);
      
      if (users && users.length > 0) {
        console.log('\n   Sample users:');
        for (const user of users.slice(0, 3)) {
          console.log(`   - ${user.username || 'No username'}`);
          console.log(`     Wallet: ${user.wallet_address ? user.wallet_address.substring(0, 20) + '...' : '❌ No wallet'}`);
          console.log(`     Notifications: ${user.notifications_enabled !== false ? '✅ Enabled' : '❌ Disabled'}`);
          console.log(`     Last notif: ${user.last_notification_sent_at || 'Never'}`);
        }
      }
    }

    // Check notifications table
    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('\n   Recent notification attempts:');
    if (notifError) {
      console.log(`   ❌ Error querying notifications: ${notifError.message}`);
      console.log('   → Make sure the notifications migration has been run');
    } else if (!notifications || notifications.length === 0) {
      console.log('   ⚠️ No notifications have been sent yet');
    } else {
      for (const notif of notifications) {
        console.log(`\n   - Type: ${notif.notification_type}:${notif.notification_subtype}`);
        console.log(`     Status: ${notif.status}`);
        console.log(`     Sent: ${notif.sent_at || 'Not sent'}`);
        console.log(`     Error: ${notif.error_message || 'None'}`);
      }
    }
  } else {
    console.log('   ⚠️ Supabase not configured - skipping database check');
  }

  // 4. Send a real test notification
  const testWallet = process.argv[2];
  if (testWallet) {
    console.log('\n🚀 4. SENDING TEST NOTIFICATION\n');
    console.log(`   Target wallet: ${testWallet}`);
    
    const apiKey = WORLD_API_KEY || DEV_PORTAL_API_KEY;
    
    try {
      const response = await fetch(NOTIFICATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          app_id: APP_ID,
          wallet_addresses: [testWallet],
          title: '🧪 Test Notification',
          message: 'If you see this, notifications are working!',
          mini_app_path: '/',
        }),
      });

      const result = await response.text();
      
      if (response.ok) {
        console.log('   ✅ Notification sent successfully!');
        console.log(`   Response: ${result}`);
        console.log('\n   Check your World App - you should receive the notification shortly.');
      } else {
        console.log(`   ❌ Failed to send: ${response.status} ${response.statusText}`);
        console.log(`   Response: ${result}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  } else {
    console.log('\n💡 4. TEST NOTIFICATION (skipped)\n');
    console.log('   To send a test notification, run:');
    console.log('   npx tsx scripts/test-notifications.ts YOUR_WALLET_ADDRESS');
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n📋 SUMMARY\n');
  console.log('   For notifications to work, you need:');
  console.log('   1. ✓ WORLD_API_KEY from developer.worldcoin.org');
  console.log('   2. ✓ User wallet addresses stored in database');
  console.log('   3. ✓ Cron job running (Vercel deployment)');
  console.log('   4. ✓ Notifications enabled in World App settings');
  console.log('   5. ✓ User has notifications_enabled = true');
  console.log('\n' + '='.repeat(70) + '\n');
}

testNotificationSystem().catch(console.error);

