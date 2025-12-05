import { create } from 'zustand';
import { Cell, SudokuGrid, GameStatus, AppScreen, CellValue } from '@/types';

interface GameState {
  // Navigation
  currentScreen: AppScreen;
  setScreen: (screen: AppScreen) => void;

  // Game state
  gameStatus: GameStatus;
  setGameStatus: (status: GameStatus) => void;

  // Puzzle
  puzzle: SudokuGrid | null;
  solution: number[][] | null;
  selectedCell: { row: number; col: number } | null;
  notesMode: boolean;
  startTime: number | null;
  
  // Server-side puzzle info
  puzzleDate: string | null;
  puzzleUserId: string | null;
  
  // Actions
  setPuzzle: (puzzle: number[][], solution: number[][]) => void;
  setPuzzleFromServer: (puzzle: number[][], date: string, userId: string) => void;
  selectCell: (row: number, col: number) => void;
  clearSelection: () => void;
  setNumber: (num: number) => void;
  clearCell: () => void;
  toggleNotesMode: () => void;
  toggleNote: (num: number) => void;
  undo: () => void;
  checkSolution: () => boolean;
  submitSolution: () => Promise<{ correct: boolean; message: string }>;
  resetGame: () => void;
  getCurrentGrid: () => number[][] | null;

  // History for undo
  history: SudokuGrid[];
  pushHistory: () => void;

  // User info
  username: string | null;
  walletAddress: string | null;
  currentStreak: number;
  hasStreakInsurance: boolean;
  referralCode: string | null;
  referralEarnings: number;
  totalReferrals: number;
  setUserInfo: (info: { 
    username: string; 
    walletAddress: string; 
    streak: number; 
    insurance: boolean;
    referralCode?: string;
    referralEarnings?: number;
    totalReferrals?: number;
  }) => void;

  // Stats
  todayPlayers: number;
  todaySuccessRate: number;
  prizePool: number;
  setTodayStats: (stats: { players: number; successRate: number; pool: number }) => void;
}

// Helper to create empty grid
const createEmptyGrid = (): SudokuGrid => {
  return Array(9).fill(null).map(() =>
    Array(9).fill(null).map(() => ({
      value: null,
      isGiven: false,
      notes: new Set<number>(),
      hasError: false,
    }))
  );
};

// Helper to convert number grid to Cell grid
const numberGridToCellGrid = (puzzle: number[][]): SudokuGrid => {
  return puzzle.map(row =>
    row.map(value => ({
      value: value === 0 ? null : value,
      isGiven: value !== 0,
      notes: new Set<number>(),
      hasError: false,
    }))
  );
};

// Deep clone grid
const cloneGrid = (grid: SudokuGrid): SudokuGrid => {
  return grid.map(row =>
    row.map(cell => ({
      ...cell,
      notes: new Set(cell.notes),
    }))
  );
};

export const useGameStore = create<GameState>((set, get) => ({
  // Navigation
  currentScreen: 'home',
  setScreen: (screen) => set({ currentScreen: screen }),

  // Game state
  gameStatus: 'not_started',
  setGameStatus: (status) => set({ gameStatus: status }),

  // Puzzle
  puzzle: null,
  solution: null,
  selectedCell: null,
  notesMode: false,
  startTime: null,
  
  // Server-side puzzle info
  puzzleDate: null,
  puzzleUserId: null,

  // History
  history: [],

  // User info
  username: null,
  walletAddress: null,
  currentStreak: 0,
  hasStreakInsurance: false,
  referralCode: null,
  referralEarnings: 0,
  totalReferrals: 0,

  // Stats
  todayPlayers: 0,
  todaySuccessRate: 0,
  prizePool: 0,

  // Actions
  setPuzzle: (puzzle, solution) => set({
    puzzle: numberGridToCellGrid(puzzle),
    solution,
    startTime: Date.now(),
    gameStatus: 'playing',
    history: [],
  }),

  // Set puzzle from server (no solution - validation is server-side)
  setPuzzleFromServer: (puzzle, date, userId) => set({
    puzzle: numberGridToCellGrid(puzzle),
    solution: null, // Server keeps the solution secret
    puzzleDate: date,
    puzzleUserId: userId,
    startTime: Date.now(),
    gameStatus: 'playing',
    history: [],
  }),

  // Get current grid as number array for submission
  getCurrentGrid: () => {
    const { puzzle } = get();
    if (!puzzle) return null;
    
    return puzzle.map(row =>
      row.map(cell => cell.value || 0)
    );
  },

  // Submit solution to server for validation
  submitSolution: async () => {
    const { puzzle, puzzleUserId, startTime } = get();
    if (!puzzle || !puzzleUserId) {
      return { correct: false, message: 'No active puzzle' };
    }

    // Convert puzzle grid to number array
    const solutionGrid = puzzle.map(row =>
      row.map(cell => cell.value || 0)
    );

    // Calculate solve time
    const solveTimeSeconds = startTime 
      ? Math.floor((Date.now() - startTime) / 1000)
      : undefined;

    try {
      const response = await fetch('/api/puzzle/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: puzzleUserId,
          solution: solutionGrid,
          solveTimeSeconds,
        }),
      });

      const data = await response.json();

      if (data.correct) {
        set({ gameStatus: 'won' });
      }

      return {
        correct: data.correct || false,
        message: data.message || data.error || 'Unknown error',
      };
    } catch (error) {
      console.error('Error submitting solution:', error);
      return {
        correct: false,
        message: 'Failed to submit solution. Please try again.',
      };
    }
  },

  selectCell: (row, col) => {
    const { puzzle } = get();
    if (puzzle && !puzzle[row][col].isGiven) {
      set({ selectedCell: { row, col } });
    }
  },

  clearSelection: () => set({ selectedCell: null }),

  setNumber: (num) => {
    const { puzzle, selectedCell, notesMode } = get();
    if (!puzzle || !selectedCell) return;

    const { row, col } = selectedCell;
    if (puzzle[row][col].isGiven) return;

    get().pushHistory();

    if (notesMode) {
      get().toggleNote(num);
    } else {
      const newPuzzle = cloneGrid(puzzle);
      newPuzzle[row][col].value = num;
      newPuzzle[row][col].notes.clear();
      
      // Don't highlight errors - players shouldn't get hints about wrong answers
      newPuzzle[row][col].hasError = false;
      
      set({ puzzle: newPuzzle });
    }
  },

  clearCell: () => {
    const { puzzle, selectedCell } = get();
    if (!puzzle || !selectedCell) return;

    const { row, col } = selectedCell;
    if (puzzle[row][col].isGiven) return;

    get().pushHistory();

    const newPuzzle = cloneGrid(puzzle);
    newPuzzle[row][col].value = null;
    newPuzzle[row][col].notes.clear();
    newPuzzle[row][col].hasError = false;
    set({ puzzle: newPuzzle });
  },

  toggleNotesMode: () => set((state) => ({ notesMode: !state.notesMode })),

  toggleNote: (num) => {
    const { puzzle, selectedCell } = get();
    if (!puzzle || !selectedCell) return;

    const { row, col } = selectedCell;
    if (puzzle[row][col].isGiven || puzzle[row][col].value !== null) return;

    const newPuzzle = cloneGrid(puzzle);
    const notes = newPuzzle[row][col].notes;
    
    if (notes.has(num)) {
      notes.delete(num);
    } else {
      notes.add(num);
    }
    
    set({ puzzle: newPuzzle });
  },

  pushHistory: () => {
    const { puzzle, history } = get();
    if (!puzzle) return;
    
    const newHistory = [...history, cloneGrid(puzzle)].slice(-50); // Keep last 50 states
    set({ history: newHistory });
  },

  undo: () => {
    const { history } = get();
    if (history.length === 0) return;

    const previousState = history[history.length - 1];
    set({
      puzzle: previousState,
      history: history.slice(0, -1),
    });
  },

  checkSolution: () => {
    const { puzzle, solution } = get();
    if (!puzzle || !solution) return false;

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (puzzle[row][col].value !== solution[row][col]) {
          return false;
        }
      }
    }
    return true;
  },

  resetGame: () => set({
    puzzle: null,
    solution: null,
    selectedCell: null,
    notesMode: false,
    startTime: null,
    gameStatus: 'not_started',
    history: [],
    puzzleDate: null,
    puzzleUserId: null,
  }),

  setUserInfo: (info) => set({
    username: info.username,
    walletAddress: info.walletAddress,
    currentStreak: info.streak,
    hasStreakInsurance: info.insurance,
    referralCode: info.referralCode || null,
    referralEarnings: info.referralEarnings || 0,
    totalReferrals: info.totalReferrals || 0,
  }),

  setTodayStats: (stats) => set({
    todayPlayers: stats.players,
    todaySuccessRate: stats.successRate,
    prizePool: stats.pool,
  }),
}));

