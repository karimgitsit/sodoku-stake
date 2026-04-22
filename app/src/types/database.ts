/**
 * Supabase Database Types
 * 
 * These types mirror the database schema for type safety.
 * Update these when you modify the database schema.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          world_id_hash: string;
          username: string | null;
          wallet_address: string | null;
          referral_code: string;
          referred_by: string | null;
          total_games_played: number;
          total_wins: number;
          total_earnings: number;
          current_streak: number;
          longest_streak: number;
          has_streak_insurance: boolean;
          insurance_streak: number;
          last_played_date: string | null;
          referral_earnings: number;
          total_referrals: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          world_id_hash: string;
          username?: string | null;
          wallet_address?: string | null;
          referral_code?: string;
          referred_by?: string | null;
          total_games_played?: number;
          total_wins?: number;
          total_earnings?: number;
          current_streak?: number;
          longest_streak?: number;
          has_streak_insurance?: boolean;
          insurance_streak?: number;
          last_played_date?: string | null;
          referral_earnings?: number;
          total_referrals?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          world_id_hash?: string;
          username?: string | null;
          wallet_address?: string | null;
          referral_code?: string;
          referred_by?: string | null;
          total_games_played?: number;
          total_wins?: number;
          total_earnings?: number;
          current_streak?: number;
          longest_streak?: number;
          has_streak_insurance?: boolean;
          insurance_streak?: number;
          last_played_date?: string | null;
          referral_earnings?: number;
          total_referrals?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      daily_puzzles: {
        Row: {
          id: string;
          date: string;
          base_puzzle: Json;
          base_solution: Json;
          difficulty: string;
          daily_seed: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          base_puzzle: Json;
          base_solution: Json;
          difficulty?: string;
          daily_seed?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          base_puzzle?: Json;
          base_solution?: Json;
          difficulty?: string;
          daily_seed?: string;
          created_at?: string;
        };
      };
      game_entries: {
        Row: {
          id: string;
          user_id: string;
          puzzle_id: string;
          puzzle_date: string;
          entry_paid_at: string;
          transaction_hash: string | null;
          variant_seed: string;
          status: 'in_progress' | 'won' | 'lost';
          solved_at: string | null;
          solve_time_seconds: number | null;
          streak_insurance_applied: boolean;
          prize_amount: number | null;
          refund_amount: number | null;
          prize_transaction_hash: string | null;
          mistakes_count: number;
          extra_lives_purchased: number;
          max_mistakes: number;
          game_locked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          puzzle_id: string;
          puzzle_date: string;
          entry_paid_at?: string;
          transaction_hash?: string | null;
          variant_seed: string;
          status?: 'in_progress' | 'won' | 'lost';
          solved_at?: string | null;
          solve_time_seconds?: number | null;
          streak_insurance_applied?: boolean;
          prize_amount?: number | null;
          refund_amount?: number | null;
          prize_transaction_hash?: string | null;
          mistakes_count?: number;
          extra_lives_purchased?: number;
          max_mistakes?: number;
          game_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          puzzle_id?: string;
          puzzle_date?: string;
          entry_paid_at?: string;
          transaction_hash?: string | null;
          variant_seed?: string;
          status?: 'in_progress' | 'won' | 'lost';
          solved_at?: string | null;
          solve_time_seconds?: number | null;
          streak_insurance_applied?: boolean;
          prize_amount?: number | null;
          refund_amount?: number | null;
          prize_transaction_hash?: string | null;
          mistakes_count?: number;
          extra_lives_purchased?: number;
          max_mistakes?: number;
          game_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      daily_results: {
        Row: {
          id: string;
          puzzle_id: string;
          date: string;
          total_players: number;
          total_winners: number;
          total_entry_pool: number;
          platform_fee: number;
          prize_pool: number;
          prize_per_winner: number | null;
          distributed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          puzzle_id: string;
          date: string;
          total_players?: number;
          total_winners?: number;
          total_entry_pool?: number;
          platform_fee?: number;
          prize_pool?: number;
          prize_per_winner?: number | null;
          distributed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          puzzle_id?: string;
          date?: string;
          total_players?: number;
          total_winners?: number;
          total_entry_pool?: number;
          platform_fee?: number;
          prize_pool?: number;
          prize_per_winner?: number | null;
          distributed_at?: string | null;
          created_at?: string;
        };
      };
      reveal_transactions: {
        Row: {
          id: string;
          user_id: string;
          puzzle_date: string;
          cell_row: number;
          cell_col: number;
          transaction_hash: string | null;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          puzzle_date: string;
          cell_row: number;
          cell_col: number;
          transaction_hash?: string | null;
          amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          puzzle_date?: string;
          cell_row?: number;
          cell_col?: number;
          transaction_hash?: string | null;
          amount?: number;
          created_at?: string;
        };
      };
      referral_earnings: {
        Row: {
          id: string;
          referrer_id: string;
          referee_id: string;
          source_type: 'entry' | 'reveal';
          source_id: string | null;
          source_date: string;
          applied_tax_rate: 0 | 10 | 20 | null;
          referee_spend: number;
          commission_rate: number;
          amount: number;
          paid_out: boolean;
          payout_transaction_hash: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          referrer_id: string;
          referee_id: string;
          source_type: 'entry' | 'reveal';
          source_id?: string | null;
          source_date: string;
          applied_tax_rate?: 0 | 10 | 20 | null;
          referee_spend: number;
          commission_rate: number;
          amount: number;
          paid_out?: boolean;
          payout_transaction_hash?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          referrer_id?: string;
          referee_id?: string;
          source_type?: 'entry' | 'reveal';
          source_id?: string | null;
          source_date?: string;
          applied_tax_rate?: 0 | 10 | 20 | null;
          referee_spend?: number;
          commission_rate?: number;
          amount?: number;
          paid_out?: boolean;
          payout_transaction_hash?: string | null;
          created_at?: string;
        };
      };
      extra_life_transactions: {
        Row: {
          id: string;
          user_id: string;
          game_entry_id: string;
          puzzle_date: string;
          transaction_hash: string | null;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          game_entry_id: string;
          puzzle_date: string;
          transaction_hash?: string | null;
          amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          game_entry_id?: string;
          puzzle_date?: string;
          transaction_hash?: string | null;
          amount?: number;
          created_at?: string;
        };
      };
      payment_references: {
        Row: {
          id: string;
          reference: string;
          user_id: string;
          type: 'entry' | 'reveal' | 'extra_life';
          puzzle_date: string;
          cell_row: number | null;
          cell_col: number | null;
          game_entry_id: string | null;
          username: string | null;
          wallet_address: string | null;
          amount: number;
          token_amount: string;
          status: 'pending' | 'completed' | 'failed' | 'expired';
          transaction_id: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          reference: string;
          user_id: string;
          type: 'entry' | 'reveal' | 'extra_life';
          puzzle_date: string;
          cell_row?: number | null;
          cell_col?: number | null;
          game_entry_id?: string | null;
          username?: string | null;
          wallet_address?: string | null;
          amount: number;
          token_amount: string;
          status?: 'pending' | 'completed' | 'failed' | 'expired';
          transaction_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          reference?: string;
          user_id?: string;
          type?: 'entry' | 'reveal' | 'extra_life';
          puzzle_date?: string;
          cell_row?: number | null;
          cell_col?: number | null;
          game_entry_id?: string | null;
          username?: string | null;
          wallet_address?: string | null;
          amount?: number;
          token_amount?: string;
          status?: 'pending' | 'completed' | 'failed' | 'expired';
          transaction_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// =============================================================================
// CONVENIENCE TYPES
// =============================================================================

export type User = Database['public']['Tables']['users']['Row'];
export type UserInsert = Database['public']['Tables']['users']['Insert'];
export type UserUpdate = Database['public']['Tables']['users']['Update'];

export type DailyPuzzle = Database['public']['Tables']['daily_puzzles']['Row'];
export type DailyPuzzleInsert = Database['public']['Tables']['daily_puzzles']['Insert'];

export type GameEntry = Database['public']['Tables']['game_entries']['Row'];
export type GameEntryInsert = Database['public']['Tables']['game_entries']['Insert'];
export type GameEntryUpdate = Database['public']['Tables']['game_entries']['Update'];

export type DailyResult = Database['public']['Tables']['daily_results']['Row'];
export type DailyResultInsert = Database['public']['Tables']['daily_results']['Insert'];

export type RevealTransaction = Database['public']['Tables']['reveal_transactions']['Row'];
export type RevealTransactionInsert = Database['public']['Tables']['reveal_transactions']['Insert'];

export type ReferralEarning = Database['public']['Tables']['referral_earnings']['Row'];
export type ReferralEarningInsert = Database['public']['Tables']['referral_earnings']['Insert'];
export type ReferralEarningUpdate = Database['public']['Tables']['referral_earnings']['Update'];

export type ExtraLifeTransaction = Database['public']['Tables']['extra_life_transactions']['Row'];
export type ExtraLifeTransactionInsert = Database['public']['Tables']['extra_life_transactions']['Insert'];

export type PaymentReferenceRow = Database['public']['Tables']['payment_references']['Row'];
export type PaymentReferenceInsert = Database['public']['Tables']['payment_references']['Insert'];
export type PaymentReferenceUpdate = Database['public']['Tables']['payment_references']['Update'];

