/**
 * Test script to verify what the Worldcoin transaction API returns
 * 
 * Usage:
 *   npx tsx scripts/test-worldcoin-api.ts <transaction_hash>
 *   npx tsx scripts/test-worldcoin-api.ts   # Uses a sample transaction from DB
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

const DEV_PORTAL_API_KEY = process.env.DEV_PORTAL_API_KEY;
const APP_ID = process.env.NEXT_PUBLIC_APP_ID;

async function testApi() {
  console.log('\n🔬 WORLDCOIN API TEST\n');
  console.log('='.repeat(70));

  // Check if API key is present
  console.log('\n📋 Configuration:');
  console.log(`   APP_ID: ${APP_ID ? APP_ID.substring(0, 20) + '...' : '❌ MISSING'}`);
  console.log(`   DEV_PORTAL_API_KEY: ${DEV_PORTAL_API_KEY ? '✅ Present (' + DEV_PORTAL_API_KEY.length + ' chars)' : '❌ MISSING'}`);

  if (!DEV_PORTAL_API_KEY || !APP_ID) {
    console.log('\n❌ Cannot test - missing credentials');
    console.log('   Add DEV_PORTAL_API_KEY to your .env.local file');
    console.log('   Get it from: https://developer.worldcoin.org/');
    return;
  }

  // Get a transaction to test
  let txHash = process.argv[2];
  
  if (!txHash) {
    console.log('\n📊 Fetching a sample transaction from database...');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: entries } = await supabase
      .from('game_entries')
      .select('transaction_hash')
      .not('transaction_hash', 'is', null)
      .not('transaction_hash', 'like', 'dev_mock%')
      .limit(1);
    
    if (entries && entries.length > 0) {
      txHash = entries[0].transaction_hash;
      console.log(`   Found: ${txHash}`);
    } else {
      console.log('   No valid transactions found in database');
      return;
    }
  }

  console.log(`\n🔍 Testing transaction: ${txHash}\n`);

  try {
    const url = `https://developer.worldcoin.org/api/v2/minikit/transaction/${txHash}?app_id=${APP_ID}`;
    console.log(`   URL: ${url.substring(0, 80)}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${DEV_PORTAL_API_KEY}`,
      },
    });

    console.log(`\n📥 Response Status: ${response.status} ${response.statusText}`);
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.log(`\n❌ API Error:`);
      console.log(responseText);
      return;
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.log(`\n❌ Invalid JSON response:`);
      console.log(responseText);
      return;
    }

    console.log('\n✅ API Response (parsed):');
    console.log(JSON.stringify(data, null, 2));

    console.log('\n📋 Key Fields:');
    console.log(`   transaction_id: ${data.transaction_id || '❌ MISSING'}`);
    console.log(`   status: ${data.status || '❌ MISSING'}`);
    console.log(`   from_address: ${data.from_address || '❌ MISSING'}`);
    console.log(`   to_address: ${data.to_address || '❌ MISSING'}`);
    console.log(`   token_amount: ${data.token_amount || '❌ MISSING'}`);

    if (data.from_address) {
      console.log('\n✅ SUCCESS: API returns from_address!');
      console.log('   Wallet address can be captured from transactions.');
    } else {
      console.log('\n⚠️ WARNING: API does NOT return from_address!');
      console.log('   Need alternative method to capture wallet addresses.');
    }

  } catch (error) {
    console.log('\n❌ Request failed:', error);
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

testApi().catch(console.error);
