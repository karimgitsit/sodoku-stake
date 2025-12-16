/**
 * Database Service Layer
 * 
 * Provides typed functions for all database operations.
 * Uses Supabase for persistent storage with in-memory fallback.
 * 
 * When Supabase is not configured (no env vars), uses in-memory storage.
 * This allows development without a database connection.
 */

import { getServerClient, getTodayDate } from './supabase';
import { getSudoku } from 'sudoku-gen';
import type { Difficulty } from 'sudoku-gen/dist/types/difficulty.type';
import type {
  User,
  UserUpdate,
  GameEntry,
  GameEntryUpdate,
  ReferralEarning,
  ReferralEarningInsert,
} from '@/types/database';

// =============================================================================
// IN-MEMORY FALLBACK (when Supabase is not configured)
// =============================================================================

// Use globalThis to persist memory cache across hot reloads in development
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForDb = globalThis as unknown as {
  memoryCache: {
    puzzles: Map<string, { puzzle: number[][], solution: number[][], difficulty: string }>;
    users: Map<string, User>;
    entries: Map<string, GameEntry>;
    referralEarnings: Map<string, ReferralEarning>;
  } | undefined;
};

const memoryCache = globalForDb.memoryCache ?? {
  puzzles: new Map<string, { puzzle: number[][], solution: number[][], difficulty: string }>(),
  users: new Map<string, User>(),
  entries: new Map<string, GameEntry>(),
  referralEarnings: new Map<string, ReferralEarning>(),
};

if (process.env.NODE_ENV === 'development') {
  globalForDb.memoryCache = memoryCache;
}

// Set to true to use mock data in development (avoids Supabase RLS issues)
// Set to false to use real Supabase data in development
const FORCE_MEMORY_IN_DEV = false;

function getDb() {
  if (FORCE_MEMORY_IN_DEV) return null;
  return getServerClient();
}

// =============================================================================
// USER OPERATIONS
// =============================================================================

export async function getOrCreateUser(
  worldIdHash: string, 
  username?: string,
  walletAddress?: string
): Promise<User> {
  const supabase = getDb();
  
  if (!supabase) {
    let user = memoryCache.users.get(worldIdHash);
    if (!user) {
      user = {
        id: worldIdHash,
        world_id_hash: worldIdHash,
        username: username || null,
        wallet_address: walletAddress || null,
        referral_code: Math.random().toString(36).substring(2, 10),
        referred_by: null,
        total_games_played: 0,
        total_wins: 0,
        total_earnings: 0,
        current_streak: 0,
        longest_streak: 0,
        has_streak_insurance: false,
        last_played_date: null,
        referral_earnings: 0,
        total_referrals: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryCache.users.set(worldIdHash, user);
    } else {
      // Update wallet address and/or username if provided and not already set
      let updated = false;
      if (walletAddress && !user.wallet_address) {
        user.wallet_address = walletAddress;
        updated = true;
      }
      if (username && !user.username) {
        user.username = username;
        updated = true;
      }
      if (updated) {
        user.updated_at = new Date().toISOString();
      }
    }
    return user;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  const { data: existingUser } = await db
    .from('users')
    .select('*')
    .eq('world_id_hash', worldIdHash)
    .single();
  
  if (existingUser) {
    // Check if we need to update wallet address or username
    const needsWalletUpdate = walletAddress && !existingUser.wallet_address;
    const needsUsernameUpdate = username && !existingUser.username;
    
    if (needsWalletUpdate || needsUsernameUpdate) {
      const updates: { wallet_address?: string; username?: string; updated_at: string } = {
        updated_at: new Date().toISOString(),
      };
      
      if (needsWalletUpdate) {
        updates.wallet_address = walletAddress;
      }
      if (needsUsernameUpdate) {
        updates.username = username;
      }
      
      const { data: updatedUser } = await db
        .from('users')
        .update(updates)
        .eq('id', existingUser.id)
        .select()
        .single();
      
      if (updatedUser) {
        const updateDetails = [];
        if (needsWalletUpdate) updateDetails.push('wallet');
        if (needsUsernameUpdate) updateDetails.push('username');
        console.log(`[DB] Updated ${updateDetails.join(' and ')} for user ${existingUser.id.substring(0, 8)}...`);
        return updatedUser as User;
      }
    }
    return existingUser as User;
  }
  
  const { data: newUser, error } = await db
    .from('users')
    .insert({ 
      world_id_hash: worldIdHash, 
      username,
      wallet_address: walletAddress,
    })
    .select()
    .single();
  
  if (error) {
    console.error('[DB] Error creating user:', error);
    throw new Error('Failed to create user');
  }
  
  return newUser as User;
}

export async function getUserById(userId: string): Promise<User | null> {
  const supabase = getDb();
  
  if (!supabase) {
    return memoryCache.users.get(userId) || null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db.from('users').select('*').eq('id', userId).single();
  return data as User | null;
}

export async function updateUser(userId: string, updates: UserUpdate): Promise<User | null> {
  const supabase = getDb();
  
  if (!supabase) {
    const user = memoryCache.users.get(userId);
    if (user) Object.assign(user, updates, { updated_at: new Date().toISOString() });
    return user || null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  
  if (error) {
    console.error('[DB] Error updating user:', error);
    return null;
  }
  return data as User;
}

// =============================================================================
// PUZZLE OPERATIONS
// =============================================================================

// Difficulty weights for random selection
// We want harder puzzles to ensure ~45-55% success rate
// NO easy puzzles allowed - only medium, hard, and expert
const DIFFICULTY_WEIGHTS: { difficulty: Difficulty; weight: number }[] = [
  { difficulty: 'medium', weight: 15 },  // 15% chance
  { difficulty: 'hard', weight: 50 },    // 50% chance  
  { difficulty: 'expert', weight: 35 },  // 35% chance
];

/**
 * Selects a random difficulty based on weighted probabilities.
 * Uses the date as a seed for deterministic selection (same difficulty all day).
 * 
 * Weights: medium=15%, hard=50%, expert=35%
 * NO easy puzzles are ever generated.
 */
function selectDailyDifficulty(date: string): Difficulty {
  // Use date as seed for deterministic daily difficulty
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    const char = date.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  // Get a value between 0-100 based on the date
  const roll = Math.abs(hash) % 100;
  
  let cumulative = 0;
  for (const { difficulty, weight } of DIFFICULTY_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) {
      return difficulty;
    }
  }
  
  // Fallback to hard (shouldn't happen)
  return 'hard';
}

export async function getOrCreateDailyPuzzle(
  date: string = getTodayDate()
): Promise<{ puzzle: number[][], solution: number[][], difficulty: string, puzzleId: string }> {
  const supabase = getDb();
  
  // Select difficulty based on the date (deterministic per day)
  const selectedDifficulty = selectDailyDifficulty(date);
  
  if (!supabase) {
    let cached = memoryCache.puzzles.get(date);
    if (!cached) {
      const sudoku = getSudoku(selectedDifficulty);
      cached = {
        puzzle: stringTo2DArray(sudoku.puzzle),
        solution: stringTo2DArray(sudoku.solution),
        difficulty: sudoku.difficulty,
      };
      memoryCache.puzzles.set(date, cached);
      console.log(`[DB] Generated ${sudoku.difficulty} puzzle for ${date} (in-memory)`);
    }
    return { ...cached, puzzleId: `memory_${date}` };
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  const { data: existingPuzzle } = await db
    .from('daily_puzzles')
    .select('*')
    .eq('date', date)
    .single();
  
  if (existingPuzzle) {
    return {
      puzzle: existingPuzzle.base_puzzle as number[][],
      solution: existingPuzzle.base_solution as number[][],
      difficulty: existingPuzzle.difficulty,
      puzzleId: existingPuzzle.id,
    };
  }
  
  console.log(`[DB] Generating new ${selectedDifficulty} puzzle for ${date}`);
  const sudoku = getSudoku(selectedDifficulty);
  const puzzleGrid = stringTo2DArray(sudoku.puzzle);
  const solutionGrid = stringTo2DArray(sudoku.solution);
  
  const { data: newPuzzle, error } = await db
    .from('daily_puzzles')
    .insert({
      date,
      base_puzzle: puzzleGrid,
      base_solution: solutionGrid,
      difficulty: sudoku.difficulty,
      daily_seed: `seed_${date}_${Date.now()}`,
    })
    .select()
    .single();
  
  if (error) {
    console.error('[DB] Error creating puzzle:', error);
    throw new Error('Failed to create puzzle');
  }
  
  return {
    puzzle: puzzleGrid,
    solution: solutionGrid,
    difficulty: sudoku.difficulty,
    puzzleId: newPuzzle.id,
  };
}

// =============================================================================
// GAME ENTRY OPERATIONS
// =============================================================================

export async function createGameEntry(
  userId: string,
  puzzleId: string,
  puzzleDate: string,
  variantSeed: string,
  transactionHash?: string
): Promise<GameEntry> {
  const supabase = getDb();
  
  if (!supabase) {
    const entry: GameEntry = {
      id: `entry_${userId}_${puzzleDate}`,
      user_id: userId,
      puzzle_id: puzzleId,
      puzzle_date: puzzleDate,
      entry_paid_at: new Date().toISOString(),
      transaction_hash: transactionHash || null,
      variant_seed: variantSeed,
      status: 'in_progress',
      solved_at: null,
      solve_time_seconds: null,
      streak_insurance_applied: false,
      prize_amount: null,
      refund_amount: null,
      prize_transaction_hash: null,
      mistakes_count: 0,
      extra_lives_purchased: 0,
      max_mistakes: 3,
      game_locked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryCache.entries.set(entry.id, entry);
    return entry;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  const { data, error } = await db
    .from('game_entries')
    .insert({
      user_id: userId,
      puzzle_id: puzzleId,
      puzzle_date: puzzleDate,
      variant_seed: variantSeed,
      transaction_hash: transactionHash,
    })
    .select()
    .single();
  
  if (error) {
    console.error('[DB] Error creating entry:', error);
    throw new Error('Failed to create game entry');
  }
  
  return data as GameEntry;
}

export async function getUserEntry(userId: string, puzzleDate: string): Promise<GameEntry | null> {
  const supabase = getDb();
  
  if (!supabase) {
    const entryId = `entry_${userId}_${puzzleDate}`;
    return memoryCache.entries.get(entryId) || null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from('game_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('puzzle_date', puzzleDate)
    .single();
  
  return data as GameEntry | null;
}

export async function markEntryAsWon(entryId: string, solveTimeSeconds: number): Promise<GameEntry | null> {
  const supabase = getDb();
  
  const updates: GameEntryUpdate = {
    status: 'won',
    solved_at: new Date().toISOString(),
    solve_time_seconds: solveTimeSeconds,
    updated_at: new Date().toISOString(),
  };

  if (!supabase) {
    const entry = memoryCache.entries.get(entryId);
    if (entry) Object.assign(entry, updates);
    return entry || null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from('game_entries')
    .update(updates)
    .eq('id', entryId)
    .select()
    .single();
  
  if (error) {
    console.error('[DB] Error marking entry as won:', error);
    return null;
  }
  
  return data as GameEntry;
}

export async function markEntryAsLost(entryId: string): Promise<GameEntry | null> {
  const supabase = getDb();
  
  if (!supabase) {
    const entry = memoryCache.entries.get(entryId);
    if (entry) {
      entry.status = 'lost';
      entry.updated_at = new Date().toISOString();
    }
    return entry || null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from('game_entries')
    .update({ status: 'lost', updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .select()
    .single();
  
  if (error) {
    console.error('[DB] Error marking entry as lost:', error);
    return null;
  }
  
  return data as GameEntry;
}

// =============================================================================
// MISTAKES TRACKING OPERATIONS
// =============================================================================

export interface MistakeResult {
  mistakesCount: number;
  maxMistakes: number;
  gameLocked: boolean;
}

/**
 * Record a mistake for a game entry and return the updated state.
 */
export async function recordMistake(entryId: string): Promise<MistakeResult> {
  const supabase = getDb();
  
  if (!supabase) {
    // In-memory fallback
    const entry = memoryCache.entries.get(entryId);
    if (!entry) {
      return { mistakesCount: 0, maxMistakes: 3, gameLocked: false };
    }
    
    // Increment mistakes
    entry.mistakes_count = (entry.mistakes_count || 0) + 1;
    entry.max_mistakes = entry.max_mistakes || 3;
    entry.game_locked = entry.mistakes_count >= entry.max_mistakes;
    entry.updated_at = new Date().toISOString();
    
    return {
      mistakesCount: entry.mistakes_count,
      maxMistakes: entry.max_mistakes,
      gameLocked: entry.game_locked,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // First, get current state
  const { data: currentEntry } = await db
    .from('game_entries')
    .select('mistakes_count, max_mistakes')
    .eq('id', entryId)
    .single();
  
  const currentMistakes = (currentEntry?.mistakes_count || 0) + 1;
  const maxMistakes = currentEntry?.max_mistakes || 3;
  const gameLocked = currentMistakes >= maxMistakes;
  
  // Update the entry
  await db
    .from('game_entries')
    .update({ 
      mistakes_count: currentMistakes,
      game_locked: gameLocked,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId);
  
  return {
    mistakesCount: currentMistakes,
    maxMistakes,
    gameLocked,
  };
}

/**
 * Add an extra life to a game entry (called after $0.25 payment).
 * Increases max_mistakes by 1 and unlocks the game if it was locked.
 */
export async function addExtraLife(entryId: string): Promise<MistakeResult> {
  const supabase = getDb();
  
  if (!supabase) {
    // In-memory fallback
    const entry = memoryCache.entries.get(entryId);
    if (!entry) {
      return { mistakesCount: 0, maxMistakes: 4, gameLocked: false };
    }
    
    entry.max_mistakes = (entry.max_mistakes || 3) + 1;
    entry.extra_lives_purchased = (entry.extra_lives_purchased || 0) + 1;
    entry.game_locked = (entry.mistakes_count || 0) >= entry.max_mistakes;
    entry.updated_at = new Date().toISOString();
    
    return {
      mistakesCount: entry.mistakes_count || 0,
      maxMistakes: entry.max_mistakes,
      gameLocked: entry.game_locked,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // First, get current state
  const { data: currentEntry } = await db
    .from('game_entries')
    .select('mistakes_count, max_mistakes, extra_lives_purchased')
    .eq('id', entryId)
    .single();
  
  const currentMistakes = currentEntry?.mistakes_count || 0;
  const newMaxMistakes = (currentEntry?.max_mistakes || 3) + 1;
  const newExtraLives = (currentEntry?.extra_lives_purchased || 0) + 1;
  const gameLocked = currentMistakes >= newMaxMistakes;
  
  // Update the entry
  await db
    .from('game_entries')
    .update({ 
      max_mistakes: newMaxMistakes,
      extra_lives_purchased: newExtraLives,
      game_locked: gameLocked,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId);
  
  return {
    mistakesCount: currentMistakes,
    maxMistakes: newMaxMistakes,
    gameLocked,
  };
}

/**
 * Record an extra life purchase transaction.
 */
export async function recordExtraLifePurchase(
  userId: string,
  gameEntryId: string,
  puzzleDate: string,
  transactionHash?: string
): Promise<void> {
  const supabase = getDb();
  
  if (!supabase) {
    console.log(`[DB] Extra life purchase recorded (in-memory): user=${userId}, entry=${gameEntryId}`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  await db.from('extra_life_transactions').insert({
    user_id: userId,
    game_entry_id: gameEntryId,
    puzzle_date: puzzleDate,
    transaction_hash: transactionHash,
  });
}

// =============================================================================
// DYNAMIC TAX CALCULATION
// =============================================================================
// Tax is applied dynamically based on winner/player ratio:
// - 20% tax: when winners can still break even (winners/players <= 80%)
// - 10% tax: when 20% is too high but 10% works (winners/players <= 90%)
// - 0% tax: when even 10% tax would cause winners to lose money

export type TaxRate = 0 | 10 | 20;

export interface TaxCalculation {
  taxRate: TaxRate;          // The tax percentage (0, 10, or 20)
  taxAmount: number;         // Total tax collected
  prizePool: number;         // Amount available for winners
  prizePerWinner: number;    // Amount each winner receives
  winnerProfit: number;      // Profit per winner (prizePerWinner - entry fee)
}

const ENTRY_FEE = 1.00;
const MIN_PRIZE_POOL = 10.00;

/**
 * Calculates the appropriate tax rate based on player/winner counts.
 * 
 * The goal is to ensure winners always at least break even (get their $1 back).
 * 
 * For winners to break even: prizePool / numWinners >= $1.00
 * Where prizePool = totalPool × (1 - taxRate)
 * 
 * This means: taxRate <= 1 - (numWinners / totalPlayers)
 * 
 * @param totalPlayers - Total number of players who paid entry fee
 * @param numWinners - Number of players who solved the puzzle
 * @returns The appropriate tax rate (0, 10, or 20)
 */
export function calculateDynamicTaxRate(totalPlayers: number, numWinners: number): TaxRate {
  if (totalPlayers === 0 || numWinners === 0) {
    return 20; // Default to 20% when no data
  }

  const winnerRatio = numWinners / totalPlayers;

  // For 20% tax: winners need to be <= 80% of players
  // Pool after tax = totalPlayers × 0.80
  // Per winner = (totalPlayers × 0.80) / numWinners >= 1.00
  // This works when: numWinners <= totalPlayers × 0.80
  if (winnerRatio <= 0.80) {
    return 20;
  }

  // For 10% tax: winners need to be <= 90% of players
  // Pool after tax = totalPlayers × 0.90
  // Per winner = (totalPlayers × 0.90) / numWinners >= 1.00
  // This works when: numWinners <= totalPlayers × 0.90
  if (winnerRatio <= 0.90) {
    return 10;
  }

  // If more than 90% of players won, no tax can be applied
  // without causing winners to lose money
  return 0;
}

/**
 * Calculates the full tax breakdown for a given player/winner count.
 * Includes minimum prize pool guarantee ($10).
 */
export function calculateTaxBreakdown(totalPlayers: number, numWinners: number): TaxCalculation {
  const totalEntryPool = totalPlayers * ENTRY_FEE;
  const taxRate = calculateDynamicTaxRate(totalPlayers, numWinners);
  
  const taxDecimal = taxRate / 100;
  const taxAmount = totalEntryPool * taxDecimal;
  let prizePool = totalEntryPool * (1 - taxDecimal);

  // Apply minimum prize pool guarantee ($10)
  // Platform subsidizes if needed
  if (prizePool < MIN_PRIZE_POOL && totalPlayers > 0) {
    prizePool = Math.min(MIN_PRIZE_POOL, totalEntryPool); // Can't subsidize more than total pool
  }

  const prizePerWinner = numWinners > 0 ? prizePool / numWinners : 0;
  const winnerProfit = prizePerWinner - ENTRY_FEE;

  return {
    taxRate,
    taxAmount,
    prizePool,
    prizePerWinner,
    winnerProfit,
  };
}

// =============================================================================
// STATS & LEADERBOARD
// =============================================================================

export async function getTodayStats(date: string = getTodayDate()): Promise<{
  players: number;
  winners: number;
  pool: number;
  successRate: number;
  taxRate: TaxRate;
  prizePerWinner: number;
}> {
  const supabase = getDb();
  
  if (!supabase) {
    // No database configured - return empty stats (not fake data)
    return { 
      players: 0, 
      winners: 0, 
      pool: 10.00, // Minimum guaranteed pool
      successRate: 0,
      taxRate: 20,
      prizePerWinner: 0,
    };
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  const { count: totalPlayers } = await db
    .from('game_entries')
    .select('*', { count: 'exact', head: true })
    .eq('puzzle_date', date);
  
  const { count: winners } = await db
    .from('game_entries')
    .select('*', { count: 'exact', head: true })
    .eq('puzzle_date', date)
    .eq('status', 'won');
  
  const players = totalPlayers || 0;
  const winnerCount = winners || 0;
  
  // Use dynamic tax calculation
  const taxBreakdown = calculateTaxBreakdown(players, winnerCount);
  
  // Success rate = percentage of players who DIDN'T solve (losers)
  const successRate = players > 0 ? Math.round((1 - winnerCount / players) * 100) : 0;
  
  return { 
    players, 
    winners: winnerCount, 
    pool: taxBreakdown.prizePool, 
    successRate,
    taxRate: taxBreakdown.taxRate,
    prizePerWinner: taxBreakdown.prizePerWinner,
  };
}

export async function getLeaderboard(limit: number = 10): Promise<User[]> {
  const supabase = getDb();
  if (!supabase) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from('users')
    .select('*')
    .order('total_earnings', { ascending: false })
    .limit(limit);
  
  return (data || []) as User[];
}

export async function getFastestSolvers(date: string = getTodayDate(), limit: number = 10) {
  const supabase = getDb();
  if (!supabase) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from('game_entries')
    .select('*, users (id, username)')
    .eq('puzzle_date', date)
    .eq('status', 'won')
    .not('solve_time_seconds', 'is', null)
    .order('solve_time_seconds', { ascending: true })
    .limit(limit);
  
  return data || [];
}

// =============================================================================
// REVEAL OPERATIONS
// =============================================================================

export async function recordReveal(
  userId: string,
  puzzleDate: string,
  row: number,
  col: number,
  transactionHash?: string
): Promise<void> {
  const supabase = getDb();
  
  if (!supabase) {
    console.log(`[DB] Reveal recorded (in-memory): user=${userId}, cell=[${row},${col}]`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  await db.from('reveal_transactions').insert({
    user_id: userId,
    puzzle_date: puzzleDate,
    cell_row: row,
    cell_col: col,
    transaction_hash: transactionHash,
  });
}

// =============================================================================
// REFERRAL OPERATIONS
// =============================================================================

// Constants for referral system
const ENTRY_FEE_AMOUNT = 1.00;
const REVEAL_FEE_AMOUNT = 0.20;

// Referral commission is 10% of referee's spend, but scaled by tax rate:
// - 20% tax → 10% commission (full commission, platform has plenty)
// - 10% tax → 5% commission (halved, platform share is smaller)
// - 0% tax → 0% commission (nothing to take from platform)
const BASE_REFERRAL_RATE = 0.10; // 10%

/**
 * Calculate the effective referral commission rate based on the current tax rate.
 * Commission scales proportionally with the tax rate.
 * 
 * @param taxRate - The current tax rate (0, 10, or 20)
 * @returns The commission rate to apply (0.00, 0.05, or 0.10)
 */
export function calculateReferralCommissionRate(taxRate: TaxRate): number {
  // Commission rate = base rate × (taxRate / 20)
  // When tax is 20% → 0.10 × (20/20) = 0.10 (10%)
  // When tax is 10% → 0.10 × (10/20) = 0.05 (5%)
  // When tax is 0% → 0.10 × (0/20) = 0.00 (0%)
  return BASE_REFERRAL_RATE * (taxRate / 20);
}

/**
 * Get user by their referral code
 */
export async function getUserByReferralCode(referralCode: string): Promise<User | null> {
  const supabase = getDb();
  
  if (!supabase) {
    // In-memory fallback: search through all users
    for (const user of memoryCache.users.values()) {
      if (user.referral_code === referralCode) {
        return user;
      }
    }
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from('users')
    .select('*')
    .eq('referral_code', referralCode)
    .single();
  
  return data as User | null;
}

/**
 * Set the referrer for a user (process referral link)
 */
export async function setUserReferrer(userId: string, referralCode: string): Promise<boolean> {
  const supabase = getDb();
  
  // Find the referrer
  const referrer = await getUserByReferralCode(referralCode);
  if (!referrer) {
    console.log(`[Referral] Invalid referral code: ${referralCode}`);
    return false;
  }
  
  // Don't allow self-referral
  if (referrer.id === userId) {
    console.log('[Referral] Self-referral not allowed');
    return false;
  }
  
  if (!supabase) {
    const user = memoryCache.users.get(userId);
    if (user && !user.referred_by) {
      user.referred_by = referralCode;
      user.updated_at = new Date().toISOString();
      
      // Increment referrer's total_referrals
      referrer.total_referrals = (referrer.total_referrals || 0) + 1;
      referrer.updated_at = new Date().toISOString();
      
      console.log(`[Referral] User ${userId} referred by ${referrer.id}`);
      return true;
    }
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // Check if user already has a referrer
  const { data: existingUser } = await db
    .from('users')
    .select('referred_by')
    .eq('id', userId)
    .single();
  
  if (existingUser?.referred_by) {
    console.log('[Referral] User already has a referrer');
    return false;
  }
  
  // Set the referrer
  const { error } = await db
    .from('users')
    .update({ 
      referred_by: referralCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  
  if (error) {
    console.error('[Referral] Error setting referrer:', error);
    return false;
  }
  
  // Increment referrer's total_referrals
  await db
    .from('users')
    .update({ 
      total_referrals: referrer.total_referrals + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', referrer.id);
  
  console.log(`[Referral] User ${userId} referred by ${referrer.id}`);
  return true;
}

/**
 * Record a referral earning and update the referrer's total
 */
export async function recordReferralEarning(
  referrerId: string,
  refereeId: string,
  sourceType: 'entry' | 'reveal',
  sourceId: string | null,
  sourceDate: string,
  taxRate: TaxRate
): Promise<ReferralEarning | null> {
  const commissionRate = calculateReferralCommissionRate(taxRate);
  
  // If commission rate is 0, don't record anything
  if (commissionRate === 0) {
    console.log('[Referral] No commission (0% tax rate)');
    return null;
  }
  
  const refereeSpend = sourceType === 'entry' ? ENTRY_FEE_AMOUNT : REVEAL_FEE_AMOUNT;
  const amount = refereeSpend * commissionRate;
  
  const supabase = getDb();
  
  if (!supabase) {
    // In-memory fallback
    const earning: ReferralEarning = {
      id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      referrer_id: referrerId,
      referee_id: refereeId,
      source_type: sourceType,
      source_id: sourceId,
      source_date: sourceDate,
      applied_tax_rate: taxRate,
      referee_spend: refereeSpend,
      commission_rate: commissionRate,
      amount,
      paid_out: false,
      payout_transaction_hash: null,
      created_at: new Date().toISOString(),
    };
    memoryCache.referralEarnings.set(earning.id, earning);
    
    // Update referrer's total earnings
    const referrer = memoryCache.users.get(referrerId);
    if (referrer) {
      referrer.referral_earnings = (referrer.referral_earnings || 0) + amount;
      referrer.updated_at = new Date().toISOString();
    }
    
    console.log(`[Referral] Recorded ${sourceType} commission: $${amount.toFixed(2)} for referrer ${referrerId}`);
    return earning;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // Insert the referral earning
  const { data, error } = await db
    .from('referral_earnings')
    .insert({
      referrer_id: referrerId,
      referee_id: refereeId,
      source_type: sourceType,
      source_id: sourceId,
      source_date: sourceDate,
      applied_tax_rate: taxRate,
      referee_spend: refereeSpend,
      commission_rate: commissionRate,
      amount,
    })
    .select()
    .single();
  
  if (error) {
    console.error('[Referral] Error recording earning:', error);
    return null;
  }
  
  // Update the referrer's total referral earnings
  await db.rpc('increment_referral_earnings', { 
    user_id: referrerId, 
    earning_amount: amount 
  }).catch(() => {
    // Fallback if RPC doesn't exist - do manual update
    db.from('users')
      .select('referral_earnings')
      .eq('id', referrerId)
      .single()
      .then(({ data: user }: { data: { referral_earnings: number } | null }) => {
        if (user) {
          return db
            .from('users')
            .update({ 
              referral_earnings: (user.referral_earnings || 0) + amount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', referrerId);
        }
      });
  });
  
  console.log(`[Referral] Recorded ${sourceType} commission: $${amount.toFixed(2)} for referrer ${referrerId}`);
  return data as ReferralEarning;
}

/**
 * Get referral earnings for a user (as referrer)
 */
export async function getReferralEarnings(referrerId: string): Promise<ReferralEarning[]> {
  const supabase = getDb();
  
  if (!supabase) {
    return Array.from(memoryCache.referralEarnings.values())
      .filter(e => e.referrer_id === referrerId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from('referral_earnings')
    .select('*')
    .eq('referrer_id', referrerId)
    .order('created_at', { ascending: false });
  
  return (data || []) as ReferralEarning[];
}

/**
 * Get unpaid referral earnings for prize distribution
 */
export async function getUnpaidReferralEarnings(date?: string): Promise<ReferralEarning[]> {
  const supabase = getDb();
  
  if (!supabase) {
    let earnings = Array.from(memoryCache.referralEarnings.values())
      .filter(e => !e.paid_out);
    
    if (date) {
      earnings = earnings.filter(e => e.source_date === date);
    }
    
    return earnings;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  let query = db
    .from('referral_earnings')
    .select('*')
    .eq('paid_out', false);
  
  if (date) {
    query = query.eq('source_date', date);
  }
  
  const { data } = await query;
  return (data || []) as ReferralEarning[];
}

/**
 * Mark referral earnings as paid
 */
export async function markReferralEarningsPaid(
  earningIds: string[],
  transactionHash: string
): Promise<void> {
  const supabase = getDb();
  
  if (!supabase) {
    for (const id of earningIds) {
      const earning = memoryCache.referralEarnings.get(id);
      if (earning) {
        earning.paid_out = true;
        earning.payout_transaction_hash = transactionHash;
      }
    }
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  await db
    .from('referral_earnings')
    .update({ 
      paid_out: true,
      payout_transaction_hash: transactionHash,
    })
    .in('id', earningIds);
}

/**
 * Get referral stats for a user
 */
export async function getReferralStats(userId: string): Promise<{
  totalReferrals: number;
  totalEarnings: number;
  unpaidEarnings: number;
  recentEarnings: ReferralEarning[];
}> {
  const supabase = getDb();
  
  if (!supabase) {
    const user = memoryCache.users.get(userId);
    const earnings = Array.from(memoryCache.referralEarnings.values())
      .filter(e => e.referrer_id === userId);
    
    return {
      totalReferrals: user?.total_referrals || 0,
      totalEarnings: user?.referral_earnings || 0,
      unpaidEarnings: earnings.filter(e => !e.paid_out).reduce((sum, e) => sum + e.amount, 0),
      recentEarnings: earnings.slice(0, 10),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // Get user stats
  const { data: user } = await db
    .from('users')
    .select('total_referrals, referral_earnings')
    .eq('id', userId)
    .single();
  
  // Get unpaid earnings total
  const { data: unpaidData } = await db
    .from('referral_earnings')
    .select('amount')
    .eq('referrer_id', userId)
    .eq('paid_out', false);
  
  const unpaidEarnings = (unpaidData || []).reduce(
    (sum: number, e: { amount: number }) => sum + e.amount, 
    0
  );
  
  // Get recent earnings
  const { data: recentEarnings } = await db
    .from('referral_earnings')
    .select('*')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  
  return {
    totalReferrals: user?.total_referrals || 0,
    totalEarnings: user?.referral_earnings || 0,
    unpaidEarnings,
    recentEarnings: (recentEarnings || []) as ReferralEarning[],
  };
}

/**
 * Get streak leaderboard (users with longest current streaks)
 */
export async function getStreakLeaderboard(limit: number = 10): Promise<User[]> {
  const supabase = getDb();
  
  if (!supabase) {
    return Array.from(memoryCache.users.values())
      .filter(u => (u.current_streak || 0) > 0)
      .sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0))
      .slice(0, limit);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from('users')
    .select('*')
    .gt('current_streak', 0)
    .order('current_streak', { ascending: false })
    .limit(limit);
  
  return (data || []) as User[];
}

/**
 * Get weekly earnings leaderboard (earnings from last 7 days based on won entries)
 */
export async function getWeeklyEarningsLeaderboard(limit: number = 10): Promise<Array<{ user: User; weeklyEarnings: number }>> {
  const supabase = getDb();
  
  // Calculate date 7 days ago
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const weekAgoStr = `${weekAgo.getUTCFullYear()}-${String(weekAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(weekAgo.getUTCDate()).padStart(2, '0')}`;
  
  if (!supabase) {
    // In-memory: just return all-time for now as we don't track weekly in memory
    const users = Array.from(memoryCache.users.values())
      .filter(u => (u.total_earnings || 0) > 0)
      .sort((a, b) => (b.total_earnings || 0) - (a.total_earnings || 0))
      .slice(0, limit);
    return users.map(u => ({ user: u, weeklyEarnings: u.total_earnings || 0 }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // Get won entries from the past week with their prize amounts
  const { data: weeklyWinners } = await db
    .from('game_entries')
    .select('user_id, prize_amount, users(*)')
    .eq('status', 'won')
    .gte('puzzle_date', weekAgoStr)
    .not('prize_amount', 'is', null);
  
  if (!weeklyWinners || weeklyWinners.length === 0) {
    return [];
  }

  // Aggregate earnings by user
  const userEarnings = new Map<string, { user: User; total: number }>();
  
  for (const entry of weeklyWinners) {
    if (!entry.users) continue;
    const userId = entry.user_id;
    const current = userEarnings.get(userId);
    const prizeAmount = entry.prize_amount || 0;
    
    if (current) {
      current.total += prizeAmount;
    } else {
      userEarnings.set(userId, { 
        user: entry.users as User, 
        total: prizeAmount 
      });
    }
  }
  
  // Sort by weekly earnings and return top N
  return Array.from(userEarnings.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map(({ user, total }) => ({ user, weeklyEarnings: total }));
}

/**
 * Get referral leaderboard (top earners from referrals)
 */
export async function getReferralLeaderboard(limit: number = 10): Promise<User[]> {
  const supabase = getDb();
  
  if (!supabase) {
    return Array.from(memoryCache.users.values())
      .filter(u => (u.referral_earnings || 0) > 0)
      .sort((a, b) => (b.referral_earnings || 0) - (a.referral_earnings || 0))
      .slice(0, limit);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from('users')
    .select('*')
    .gt('referral_earnings', 0)
    .order('referral_earnings', { ascending: false })
    .limit(limit);
  
  return (data || []) as User[];
}

/**
 * Get the referrer ID for a user (if they were referred)
 */
export async function getUserReferrer(userId: string): Promise<User | null> {
  const supabase = getDb();
  
  if (!supabase) {
    const user = memoryCache.users.get(userId);
    if (!user?.referred_by) return null;
    
    for (const u of memoryCache.users.values()) {
      if (u.referral_code === user.referred_by) {
        return u;
      }
    }
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  
  // Get the user's referral code
  const { data: user } = await db
    .from('users')
    .select('referred_by')
    .eq('id', userId)
    .single();
  
  if (!user?.referred_by) return null;
  
  // Get the referrer
  const { data: referrer } = await db
    .from('users')
    .select('*')
    .eq('referral_code', user.referred_by)
    .single();
  
  return referrer as User | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function stringTo2DArray(str: string): number[][] {
  const grid: number[][] = [];
  for (let row = 0; row < 9; row++) {
    const rowArray: number[] = [];
    for (let col = 0; col < 9; col++) {
      const char = str[row * 9 + col];
      rowArray.push(char === '-' ? 0 : parseInt(char, 10));
    }
    grid.push(rowArray);
  }
  return grid;
}

export function generateVariantSeed(userId: string, date: string): string {
  return `${userId}_${date}_sodoku_stake`;
}
