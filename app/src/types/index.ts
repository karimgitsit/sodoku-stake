// Puzzle difficulty types
// NO easy puzzles allowed - weighted distribution: medium=15%, hard=50%, expert=35%
export type PuzzleDifficulty = 'medium' | 'hard' | 'expert';

// Tax rate types (dynamic based on winner ratio)
export type TaxRate = 0 | 10 | 20;

// Game state types
export type CellValue = number | null;
export type Notes = Set<number>;

export interface Cell {
  value: CellValue;
  isGiven: boolean;
  notes: Notes;
  hasError: boolean;
}

export type SudokuGrid = Cell[][];

// App state
export type GameStatus = 'not_started' | 'paying' | 'playing' | 'won' | 'lost';
export type AppScreen = 'home' | 'puzzle' | 'results' | 'leaderboard' | 'profile';

