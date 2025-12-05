/**
 * Variant Generation Utilities
 * 
 * These functions create user-specific puzzle variants by shuffling
 * the number mappings (1-9) based on the user's ID and the date.
 * 
 * This prevents answer sharing since each user sees different numbers
 * in the same positions.
 */

/**
 * Simple hash function for creating deterministic seeds
 */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Seeded random number generator for deterministic shuffling
 */
export function seededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle an array using a seeded random number generator
 */
export function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate a deterministic mapping from original numbers (1-9) to shuffled numbers
 * based on the user's ID and the puzzle date.
 * 
 * @param userId - User's unique identifier (World ID nullifier hash)
 * @param date - Puzzle date (YYYY-MM-DD format)
 * @returns Map from original number to user's variant number
 */
export function generateVariantMapping(userId: string, date: string): Map<number, number> {
  const combinedSeed = simpleHash(userId + date + 'sodoku-stake-v1');
  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const shuffled = seededShuffle(original, combinedSeed);
  
  const mapping = new Map<number, number>();
  for (let i = 0; i < 9; i++) {
    mapping.set(original[i], shuffled[i]);
  }
  return mapping;
}

/**
 * Apply the variant mapping to a puzzle grid
 * 
 * @param grid - 9x9 puzzle grid (0 = empty cell)
 * @param userId - User's unique identifier
 * @param date - Puzzle date
 * @returns New grid with user's variant numbers
 */
export function applyVariantMapping(grid: number[][], userId: string, date: string): number[][] {
  const mapping = generateVariantMapping(userId, date);
  return grid.map(row =>
    row.map(cell => {
      if (cell === 0) return 0;
      return mapping.get(cell) || cell;
    })
  );
}

