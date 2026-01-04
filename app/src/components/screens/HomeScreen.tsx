'use client';

import { useGameStore } from '@/store/gameStore';
import { useWallet } from '@/components/MiniKitProvider';
import { useEffect, useState, useRef } from 'react';
import { verifyWorldId, payEntryFee, isMiniKitAvailable, ACTIONS } from '@/lib/worldcoin';

interface YesterdayStats {
  failureRate: number;
  prizePerWinner: number;
}

interface SessionResponse {
  success: boolean;
  hasSession: boolean;
  puzzle?: number[][];
  date?: string;
  difficulty?: string;
  entryId?: string;
  status?: 'in_progress' | 'won' | 'lost';
  mistakesCount?: number;
  maxMistakes?: number;
  gameLocked?: boolean;
  error?: string;
  userStats?: {
    currentStreak: number;
    longestStreak: number;
    hasStreakInsurance: boolean;
  };
}

export function HomeScreen() {
  const { 
    setScreen, 
    setGameStatus, 
    setPuzzleFromServer,
    restoreGameSession,
    setUserInfo,
    setTodayStats,
    currentStreak, 
    hasStreakInsurance,
    todayPlayers,
    todaySuccessRate,
    prizePool,
    gameStatus,
    puzzle,
    puzzleUserId,
  } = useGameStore();
  
  // Get the actual username from MiniKit/World App
  const { username: miniKitUsername } = useWallet();

  const [timeRemaining, setTimeRemaining] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'idle' | 'verifying' | 'paying' | 'loading' | 'restoring'>('idle');
  const [yesterdayStats, setYesterdayStats] = useState<YesterdayStats | null>(null);
  const sessionCheckDone = useRef(false);

  // Get today's date for puzzle (defined early for use in session check)
  const getTodayDate = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  };

  // Check for existing game session on mount (only once)
  useEffect(() => {
    const checkExistingSession = async () => {
      // Only check once per mount
      if (sessionCheckDone.current) return;
      sessionCheckDone.current = true;
      
      // If we already have a puzzle loaded and game is in progress, no need to check
      if (puzzle && (gameStatus === 'playing' || gameStatus === 'locked')) {
        console.log('[HomeScreen] Game already in progress, skipping session check');
        return;
      }
      
      setStep('restoring');
      console.log('[HomeScreen] Checking for existing game session...');
      
      try {
        const todayDate = getTodayDate();
        
        // First, check if we have a stored userId from a previous session
        // This helps in dev mode where each verifyWorldId call generates a new mock nullifier
        let userId: string | null = null;
        
        try {
          const storedGameState = localStorage.getItem('sodoku_stake_game_state');
          if (storedGameState) {
            const parsed = JSON.parse(storedGameState);
            // Only use stored userId if it's from today
            if (parsed.puzzleDate === todayDate && parsed.puzzleUserId) {
              userId = parsed.puzzleUserId;
              console.log('[HomeScreen] Using stored userId from localStorage');
            }
          }
        } catch (e) {
          console.log('[HomeScreen] No valid stored session found');
        }
        
        // If no stored userId, verify World ID to get one
        if (!userId) {
          const verifyResult = await verifyWorldId(ACTIONS.DAILY_ENTRY, todayDate);
          
          if (!verifyResult.success || !verifyResult.nullifierHash) {
            console.log('[HomeScreen] World ID verification needed for session check');
            setStep('idle');
            return;
          }
          
          userId = verifyResult.nullifierHash;
        }
        
        // Check if user has an existing session
        const response = await fetch(`/api/game/session?userId=${encodeURIComponent(userId)}`);
        const data: SessionResponse = await response.json();
        
        if (!data.success) {
          console.error('[HomeScreen] Session check failed:', data.error);
          setStep('idle');
          return;
        }
        
        // Update user info with streak from API if available
        if (data.userStats) {
          setUserInfo({
            username: miniKitUsername || 'Player',
            walletAddress: '',
            streak: data.userStats.currentStreak,
            insurance: data.userStats.hasStreakInsurance,
          });
        }

        if (data.hasSession && data.puzzle && data.date && data.entryId) {
          console.log(`[HomeScreen] Found existing session: status=${data.status}, mistakes=${data.mistakesCount}/${data.maxMistakes}`);
          
          // Restore the game session
          restoreGameSession({
            puzzle: data.puzzle,
            date: data.date,
            userId: userId,
            entryId: data.entryId,
            status: data.status || 'in_progress',
            mistakesCount: data.mistakesCount || 0,
            maxMistakes: data.maxMistakes || 3,
            gameLocked: data.gameLocked || false,
          });
          
          // Set appropriate game status
          if (data.status === 'won') {
            setGameStatus('won');
          } else if (data.status === 'lost' || data.gameLocked) {
            setGameStatus('locked');
          } else {
            setGameStatus('playing');
          }
        } else {
          console.log('[HomeScreen] No existing session found');
        }
        
      } catch (err) {
        console.error('[HomeScreen] Error checking session:', err);
      } finally {
        setStep('idle');
      }
    };
    
    checkExistingSession();
  }, []); // Empty deps - run only once on mount
  
  // Fetch today's stats from the API
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/puzzle/stats');
        const data = await response.json();
        
        if (data.success && data.stats) {
          setTodayStats({
            players: data.stats.players,
            successRate: data.stats.failureRate, // API returns failure rate
            pool: data.stats.pool,
          });
        }
        
        // Also set yesterday's stats if available
        if (data.yesterdayStats) {
          setYesterdayStats({
            failureRate: data.yesterdayStats.failureRate,
            prizePerWinner: data.yesterdayStats.prizePerWinner,
          });
        }
      } catch (err) {
        console.error('[HomeScreen] Failed to fetch stats:', err);
      }
    };

    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [setTodayStats]);

  // Calculate time until midnight UTC
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeRemaining(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  const handlePlayClick = async () => {
    // If already playing (or locked but has puzzle), just navigate to puzzle screen
    if ((gameStatus === 'playing' || gameStatus === 'locked') && puzzle) {
      setScreen('puzzle');
      return;
    }

    setError(null);
    setGameStatus('paying');
    
    try {
      // Step 1: Verify World ID
      setStep('verifying');
      console.log('[Entry] Starting World ID verification...');
      
      const todayDate = getTodayDate();
      const verifyResult = await verifyWorldId(ACTIONS.DAILY_ENTRY, todayDate);
      
      if (!verifyResult.success) {
        throw new Error(verifyResult.error || 'World ID verification failed');
      }
      
      const userId = verifyResult.nullifierHash!;
      console.log('[Entry] World ID verified:', userId.substring(0, 16) + '...');
      
      // User info will be updated after payment confirmation (with real streak from API)
      
      // Step 2: Process payment (secure backend-first flow)
      // This now does: initiate → pay → confirm, and returns puzzle on success
      setStep('paying');
      console.log('[Entry] Processing $1.00 entry fee (secure flow)...');
      
      const payResult = await payEntryFee(userId, todayDate);
      
      if (!payResult.success) {
        throw new Error(payResult.error || 'Payment failed');
      }
      
      console.log('[Entry] Payment confirmed! Transaction:', payResult.transactionId);
      
      // The payment confirmation already returns the puzzle
      if (!payResult.puzzle || !payResult.date) {
        throw new Error('Payment confirmed but puzzle data missing');
      }
      
      setStep('loading');
      
      console.log(`🧩 Puzzle ready for ${userId.substring(0, 16)}...`);
      console.log(`📅 Date: ${payResult.date}`);
      console.log(`📊 Difficulty: ${payResult.difficulty}`);
      console.log(`🎫 Entry ID: ${payResult.entryId}`);
      
      // Update user info with streak from payment confirmation
      if (payResult.userStats) {
        setUserInfo({
          username: miniKitUsername || 'Player',
          walletAddress: '',
          streak: payResult.userStats.currentStreak,
          insurance: payResult.userStats.hasStreakInsurance,
        });
      }
      
      // Set puzzle in store (puzzle comes from payment confirmation)
      setPuzzleFromServer(payResult.puzzle, payResult.date, userId, payResult.entryId);
      setScreen('puzzle');
      
    } catch (err) {
      console.error('[Entry] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start game');
      setGameStatus('not_started');
    } finally {
      setStep('idle');
    }
  };

  const getButtonText = () => {
    if (gameStatus === 'won') return '✅ Come Back Tomorrow';
    if (gameStatus === 'locked' && puzzle) return '🔒 Game Locked - Buy Extra Life';
    if ((gameStatus === 'playing' || gameStatus === 'locked') && puzzle) return '▶️ Continue Playing';
    
    switch (step) {
      case 'restoring':
        return '🔄 Checking for saved game...';
      case 'verifying':
        return '🔐 Verifying Identity...';
      case 'paying':
        return '💳 Processing Payment...';
      case 'loading':
        return '🧩 Loading Puzzle...';
      default:
        return '🎮 Play Now - $1.00';
    }
  };

  const getStatusMessage = () => {
    switch (gameStatus) {
      case 'won':
        return { text: '✅ Solved Today!', color: 'text-success' };
      case 'lost':
        return { text: '❌ Missed Today', color: 'text-accent' };
      case 'locked':
        return { text: '🔒 Game Locked', color: 'text-accent' };
      case 'playing':
        return { text: '🎯 In Progress', color: 'text-warning' };
      default:
        return { text: '🆕 Ready to Play', color: 'text-primary' };
    }
  };

  const status = getStatusMessage();

  // Show MiniKit availability warning (helpful for dev)
  const miniKitAvailable = isMiniKitAvailable();

  return (
    <div className="flex flex-col h-full p-4 pb-24">
      {/* Header - positioned below notch */}
      <div className="text-center mb-6 pt-8">
        <h1 className="text-3xl font-bold mb-1">🧩 Sodoku Stake</h1>
        <p className="text-muted text-sm">Daily Sudoku with Real Stakes</p>
      </div>

      {/* Dev Mode Warning */}
      {!miniKitAvailable && process.env.NODE_ENV === 'development' && (
        <div className="mb-3 p-2 bg-warning/10 border border-warning/30 rounded-lg">
          <p className="text-xs text-warning text-center">
            ⚠️ Dev Mode: Running outside World App (payments mocked)
          </p>
        </div>
      )}

      {/* Today's Status Card */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-muted text-sm">Today&apos;s Puzzle</span>
          <span className={`font-semibold ${status.color}`}>{status.text}</span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{todayPlayers > 0 ? todayPlayers : '0'}</p>
            <p className="text-xs text-muted">Players</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{todayPlayers > 0 ? `${todaySuccessRate}%` : '0%'}</p>
            <p className="text-xs text-muted">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-success">${prizePool > 0 ? prizePool.toFixed(2) : '10.00'}</p>
            <p className="text-xs text-muted">Prize Pool</p>
          </div>
        </div>

        {/* Timer */}
        <div className="text-center py-2 border-t border-border">
          <p className="text-xs text-muted mb-1">Time Remaining</p>
          <p className="text-xl font-mono font-bold text-primary">{timeRemaining}</p>
        </div>
      </div>

      {/* Streak Card */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Current Streak</p>
            <p className="text-2xl font-bold streak-badge">🔥 {currentStreak} days</p>
          </div>
          {hasStreakInsurance && (
            <div className="bg-success/10 border border-success/30 rounded-lg px-3 py-2">
              <p className="text-xs text-success font-medium">🛡️ Insurance Active</p>
              <p className="text-[10px] text-success/70">50% loss protection</p>
            </div>
          )}
          {!hasStreakInsurance && currentStreak > 0 && currentStreak < 7 && (
            <div className="text-right">
              <p className="text-xs text-muted">{7 - currentStreak} days to insurance</p>
              <div className="w-24 h-2 bg-border rounded-full mt-1">
                <div 
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(currentStreak / 7) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Play Button */}
      <button
        onClick={handlePlayClick}
        disabled={gameStatus === 'won' || gameStatus === 'lost' || step !== 'idle'}
        className={`
          w-full py-4 rounded-2xl font-bold text-lg transition-all duration-200
          ${gameStatus === 'won' || gameStatus === 'lost'
            ? 'bg-success/20 text-success cursor-not-allowed' 
            : step !== 'idle'
            ? 'bg-primary cursor-wait animate-pulse'
            : (gameStatus === 'playing' || gameStatus === 'locked') && puzzle
            ? 'bg-success active:scale-98'
            : 'bg-primary active:scale-98'
          }
        `}
        style={{ color: (gameStatus === 'won' || gameStatus === 'lost') ? undefined : '#ffffff' }}
      >
        {getButtonText()}
      </button>

      {/* Entry Fee Info */}
      <p className="text-center text-xs text-muted mt-3">
        {(gameStatus === 'playing' || gameStatus === 'locked') && puzzle 
          ? 'Continue your game - no additional payment required'
          : 'Entry fee: $1.00 USDC • Winners always break even or profit'
        }
      </p>

      {/* Error Message */}
      {error && (
        <div className="mt-2 p-3 bg-accent/10 border border-accent/30 rounded-lg">
          <p className="text-xs text-accent text-center">{error}</p>
        </div>
      )}

      {/* Yesterday's Result */}
      <div className="mt-auto pt-4">
        <div className="bg-card/50 border border-border rounded-xl p-3">
          <p className="text-xs text-muted mb-1">Yesterday&apos;s Result</p>
          {yesterdayStats && yesterdayStats.prizePerWinner > 0 ? (
            <p className="text-sm">
              <span className="text-muted">{yesterdayStats.failureRate}% failed</span>
              <span className="mx-2">•</span>
              <span className="text-success">Winners earned ${yesterdayStats.prizePerWinner.toFixed(2)} each</span>
            </p>
          ) : (
            <p className="text-sm text-muted">No results yet — be the first to play!</p>
          )}
        </div>
      </div>
    </div>
  );
}
