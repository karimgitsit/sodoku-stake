import { create } from 'zustand';
import { Cell, SudokuGrid, GameStatus, AppScreen, CellValue } from '@/types';

// =============================================================================
// LOCAL STORAGE PERSISTENCE
// =============================================================================

const STORAGE_KEY = 'sodoku_stake_game_state';
const USER_ID_KEY = 'sodoku_stake_user_id';

// Persist user ID separately so it survives game resets
function saveUserId(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_ID_KEY, userId);
  } catch (error) {
    console.error('[GameStore] Failed to save user ID:', error);
  }
}

export function getPersistedUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch (error) {
    console.error('[GameStore] Failed to get user ID:', error);
    return null;
  }
}

interface PersistedGameState {
  puzzleDate: string;
  puzzleUserId: string;
  gameEntryId: string | null;
  puzzleProgress: (number | null)[][]; // Current values filled in by user
  notesGrid: number[][][]; // Notes for each cell
  mistakesCount: number;
  maxMistakes: number;
  gameLocked: boolean;
  errorCells: string[]; // Array of "row,col" strings
  gameStatus: GameStatus;
  startTime: number | null;
}

function saveGameToStorage(state: PersistedGameState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.log('[GameStore] Saved game progress to localStorage');
  } catch (error) {
    console.error('[GameStore] Failed to save game state:', error);
  }
}

function loadGameFromStorage(): PersistedGameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as PersistedGameState;
  } catch (error) {
    console.error('[GameStore] Failed to load game state:', error);
    return null;
  }
}

function clearGameStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[GameStore] Cleared game progress from localStorage');
  } catch (error) {
    console.error('[GameStore] Failed to clear game state:', error);
  }
}

// =============================================================================
// TYPES
// =============================================================================

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
  gameEntryId: string | null;
  
  // Mistakes tracking
  mistakesCount: number;
  maxMistakes: number;
  gameLocked: boolean;
  errorCells: Set<string>; // Set of "row,col" strings for cells with errors
  lastMistakeMessage: string | null;
  
  // Actions
  setPuzzle: (puzzle: number[][], solution: number[][]) => void;
  setPuzzleFromServer: (puzzle: number[][], date: string, userId: string, entryId?: string) => void;
  restoreGameSession: (params: {
    puzzle: number[][];
    date: string;
    userId: string;
    entryId: string;
    status: 'in_progress' | 'won' | 'lost';
    mistakesCount: number;
    maxMistakes: number;
    gameLocked: boolean;
  }) => void;
  selectCell: (row: number, col: number) => void;
  clearSelection: () => void;
  setNumber: (num: number, forceValue?: boolean) => void;
  setNumberWithValidation: (num: number) => Promise<{ correct: boolean; message?: string }>;
  clearCell: () => void;
  toggleNotesMode: () => void;
  toggleNote: (num: number) => void;
  undo: () => void;
  checkSolution: () => boolean;
  submitSolution: () => Promise<{ correct: boolean; message: string }>;
  resetGame: () => void;
  getCurrentGrid: () => number[][] | null;
  saveProgress: () => void;
  
  // Mistakes actions
  setMistakesState: (state: { mistakesCount: number; maxMistakes: number; gameLocked: boolean }) => void;
  addErrorCell: (row: number, col: number) => void;
  removeErrorCell: (row: number, col: number) => void;
  setLastMistakeMessage: (message: string | null) => void;
  unlockGame: () => void;

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
  gameEntryId: null,
  
  // Mistakes tracking
  mistakesCount: 0,
  maxMistakes: 3,
  gameLocked: false,
  errorCells: new Set<string>(),
  lastMistakeMessage: null,

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
    mistakesCount: 0,
    maxMistakes: 3,
    gameLocked: false,
    errorCells: new Set<string>(),
    lastMistakeMessage: null,
  }),

  // Set puzzle from server (no solution - validation is server-side)
  setPuzzleFromServer: (puzzle, date, userId, entryId) => {
    // Persist the userId separately so it survives game resets
    saveUserId(userId);
    
    const startTime = Date.now();
    set({
      puzzle: numberGridToCellGrid(puzzle),
      solution: null, // Server keeps the solution secret
      puzzleDate: date,
      puzzleUserId: userId,
      gameEntryId: entryId || null,
      startTime,
      gameStatus: 'playing',
      history: [],
      mistakesCount: 0,
      maxMistakes: 3,
      gameLocked: false,
      errorCells: new Set<string>(),
      lastMistakeMessage: null,
    });
    
    // Save initial state to localStorage
    saveGameToStorage({
      puzzleDate: date,
      puzzleUserId: userId,
      gameEntryId: entryId || null,
      puzzleProgress: puzzle.map(row => row.map(v => v === 0 ? null : v)),
      notesGrid: puzzle.map(row => row.map(() => [])),
      mistakesCount: 0,
      maxMistakes: 3,
      gameLocked: false,
      errorCells: [],
      gameStatus: 'playing',
      startTime,
    });
  },

  // Restore a game session (e.g., when user comes back after quitting)
  restoreGameSession: (params) => {
    const { puzzle, date, userId, entryId, status, mistakesCount, maxMistakes, gameLocked } = params;
    
    // Persist the userId separately so it survives game resets
    saveUserId(userId);
    
    // Try to load saved progress from localStorage
    const savedState = loadGameFromStorage();
    
    let cellGrid = numberGridToCellGrid(puzzle);
    let errorCellsSet = new Set<string>();
    let gameStatus: GameStatus = status === 'won' ? 'won' : status === 'lost' ? 'lost' : gameLocked ? 'locked' : 'playing';
    let startTime = Date.now();
    
    // If we have saved progress for the same game, restore it
    if (savedState && savedState.puzzleDate === date && savedState.puzzleUserId === userId) {
      console.log('[GameStore] Restoring saved progress from localStorage');
      
      // Apply saved progress to the puzzle grid
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          const baseValue = puzzle[row][col];
          if (baseValue === 0) {
            // This is an empty cell - check if user filled it
            const savedValue = savedState.puzzleProgress[row][col];
            if (savedValue !== null) {
              cellGrid[row][col].value = savedValue;
            }
            // Restore notes
            const savedNotes = savedState.notesGrid[row]?.[col] || [];
            cellGrid[row][col].notes = new Set(savedNotes);
          }
        }
      }
      
      // Restore error cells
      errorCellsSet = new Set(savedState.errorCells);
      for (const cellKey of savedState.errorCells) {
        const [row, col] = cellKey.split(',').map(Number);
        if (cellGrid[row] && cellGrid[row][col]) {
          cellGrid[row][col].hasError = true;
        }
      }
      
      // Restore start time if available
      if (savedState.startTime) {
        startTime = savedState.startTime;
      }
    }
    
    set({
      puzzle: cellGrid,
      solution: null,
      puzzleDate: date,
      puzzleUserId: userId,
      gameEntryId: entryId,
      startTime,
      gameStatus,
      history: [],
      mistakesCount,
      maxMistakes,
      gameLocked,
      errorCells: errorCellsSet,
      lastMistakeMessage: null,
    });
    
    console.log(`[GameStore] Restored game session: status=${gameStatus}, mistakes=${mistakesCount}/${maxMistakes}`);
  },

  // Save current puzzle progress to localStorage
  saveProgress: () => {
    const state = get();
    if (!state.puzzle || !state.puzzleDate || !state.puzzleUserId) return;
    
    // Extract current values and notes from the puzzle grid
    const puzzleProgress: (number | null)[][] = [];
    const notesGrid: number[][][] = [];
    
    for (let row = 0; row < 9; row++) {
      puzzleProgress.push([]);
      notesGrid.push([]);
      for (let col = 0; col < 9; col++) {
        const cell = state.puzzle[row][col];
        puzzleProgress[row].push(cell.value);
        notesGrid[row].push(Array.from(cell.notes));
      }
    }
    
    saveGameToStorage({
      puzzleDate: state.puzzleDate,
      puzzleUserId: state.puzzleUserId,
      gameEntryId: state.gameEntryId,
      puzzleProgress,
      notesGrid,
      mistakesCount: state.mistakesCount,
      maxMistakes: state.maxMistakes,
      gameLocked: state.gameLocked,
      errorCells: Array.from(state.errorCells),
      gameStatus: state.gameStatus,
      startTime: state.startTime,
    });
  },

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
        // Save the winning state
        get().saveProgress();
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

  setNumber: (num, forceValue = false) => {
    const { puzzle, selectedCell, notesMode, gameLocked } = get();
    if (!puzzle || !selectedCell || gameLocked) return;

    const { row, col } = selectedCell;
    if (puzzle[row][col].isGiven) return;

    get().pushHistory();

    // forceValue bypasses notes mode (used by REVEAL feature)
    if (notesMode && !forceValue) {
      get().toggleNote(num);
    } else {
      const newPuzzle = cloneGrid(puzzle);
      newPuzzle[row][col].value = num;
      newPuzzle[row][col].notes.clear();
      newPuzzle[row][col].hasError = false;
      
      // Remove from error cells if it was there
      const errorCells = new Set(get().errorCells);
      errorCells.delete(`${row},${col}`);
      
      set({ puzzle: newPuzzle, errorCells });
      
      // Save progress after each move
      get().saveProgress();
    }
  },

  // Set number with server validation - returns validation result
  setNumberWithValidation: async (num) => {
    const { puzzle, selectedCell, notesMode, gameLocked, puzzleUserId } = get();
    if (!puzzle || !selectedCell || gameLocked) {
      return { correct: false, message: gameLocked ? 'Game is locked' : 'No cell selected' };
    }

    const { row, col } = selectedCell;
    if (puzzle[row][col].isGiven) {
      return { correct: true };
    }

    // If in notes mode, just toggle the note without validation
    if (notesMode) {
      get().toggleNote(num);
      return { correct: true };
    }

    get().pushHistory();

    // Optimistically update the cell
    const newPuzzle = cloneGrid(puzzle);
    newPuzzle[row][col].value = num;
    newPuzzle[row][col].notes.clear();
    set({ puzzle: newPuzzle });

    // Validate with server
    try {
      const response = await fetch('/api/puzzle/validate-cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: puzzleUserId,
          row,
          col,
          value: num,
        }),
      });

      const data = await response.json();

      if (!data.correct) {
        // Mark cell as error
        const errorPuzzle = cloneGrid(get().puzzle!);
        errorPuzzle[row][col].hasError = true;
        
        const errorCells = new Set(get().errorCells);
        errorCells.add(`${row},${col}`);
        
        set({
          puzzle: errorPuzzle,
          errorCells,
          mistakesCount: data.mistakesCount,
          maxMistakes: data.maxMistakes,
          gameLocked: data.gameLocked,
          lastMistakeMessage: data.message,
          gameStatus: data.gameLocked ? 'locked' : get().gameStatus,
        });
      } else {
        // Remove from error cells if correct (in case user corrected a mistake)
        const errorCells = new Set(get().errorCells);
        errorCells.delete(`${row},${col}`);
        
        const correctPuzzle = cloneGrid(get().puzzle!);
        correctPuzzle[row][col].hasError = false;
        
        set({
          puzzle: correctPuzzle,
          errorCells,
          lastMistakeMessage: null,
        });
      }
      
      // Save progress after validation
      get().saveProgress();

      return {
        correct: data.correct,
        message: data.message,
      };
    } catch (error) {
      console.error('Error validating cell:', error);
      return { correct: false, message: 'Failed to validate cell' };
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
    
    // Remove from error cells set
    const errorCells = new Set(get().errorCells);
    errorCells.delete(`${row},${col}`);
    
    set({ puzzle: newPuzzle, errorCells });
    
    // Save progress after clearing
    get().saveProgress();
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
    
    // Save progress after toggling notes
    get().saveProgress();
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
    
    // Rebuild errorCells from the restored puzzle state
    const newErrorCells = new Set<string>();
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (previousState[row][col].hasError) {
          newErrorCells.add(`${row},${col}`);
        }
      }
    }
    
    set({
      puzzle: previousState,
      history: history.slice(0, -1),
      errorCells: newErrorCells,
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

  resetGame: () => {
    // Clear localStorage when resetting game
    clearGameStorage();
    
    set({
      puzzle: null,
      solution: null,
      selectedCell: null,
      notesMode: false,
      startTime: null,
      gameStatus: 'not_started',
      history: [],
      puzzleDate: null,
      puzzleUserId: null,
      gameEntryId: null,
      mistakesCount: 0,
      maxMistakes: 3,
      gameLocked: false,
      errorCells: new Set<string>(),
      lastMistakeMessage: null,
    });
  },

  // Mistakes actions
  setMistakesState: (state) => set({
    mistakesCount: state.mistakesCount,
    maxMistakes: state.maxMistakes,
    gameLocked: state.gameLocked,
    gameStatus: state.gameLocked ? 'locked' : get().gameStatus,
  }),

  addErrorCell: (row, col) => {
    const errorCells = new Set(get().errorCells);
    errorCells.add(`${row},${col}`);
    set({ errorCells });
  },

  removeErrorCell: (row, col) => {
    const errorCells = new Set(get().errorCells);
    errorCells.delete(`${row},${col}`);
    set({ errorCells });
  },

  setLastMistakeMessage: (message) => set({ lastMistakeMessage: message }),

  unlockGame: () => set({
    gameLocked: false,
    gameStatus: 'playing',
    lastMistakeMessage: null,
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

