/**
 * Supabase Client Configuration
 * 
 * This module provides:
 * - Browser client (for client-side operations)
 * - Server client (for API routes with service role)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// =============================================================================
// ENVIRONMENT VARIABLES
// =============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '');
}

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
export function getTodayDate(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

// =============================================================================
// CLIENT INSTANCES
// =============================================================================

let _supabase: SupabaseClient<Database> | null = null;
let _serverClient: SupabaseClient<Database> | null = null;

/**
 * Browser/Client-side Supabase client
 * Uses anon key with Row Level Security (RLS)
 */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  
  if (!_supabase) {
    _supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  
  return _supabase;
}

/**
 * Server-side Supabase client with admin privileges
 * Uses service role key - bypasses RLS
 * Only use in API routes, never expose to client!
 */
export function getServerClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured() || !supabaseServiceKey) {
    return null;
  }
  
  if (!_serverClient) {
    _serverClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  
  return _serverClient;
}

