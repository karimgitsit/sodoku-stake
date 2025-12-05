'use client';

import { useGameStore } from '@/store/gameStore';
import { useEffect, useState } from 'react';
import { verifyWorldId, payEntryFee, isMiniKitAvailable, ACTIONS } from '@/lib/worldcoin';

export function HomeScreen() {
  const { 
    setScreen, 
    setGameStatus, 
    setPuzzleFromServer,
    setUserInfo,
    currentStreak, 
    hasStreakInsurance,
    todayPlayers,
    todaySuccessRate,
    prizePool,
    gameStatus,
    username,
    puzzle,
  } = useGameStore();

  const [timeRemaining, setTimeRemaining] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'idle' | 'verifying' | 'paying' | 'loading'>('idle');

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

  // Get today's date for puzzle
  const getTodayDate = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  };

  const handlePlayClick = async () => {
    // If already playing and puzzle is loaded, just navigate to puzzle screen
    if (gameStatus === 'playing' && puzzle) {
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
      
      // Update user info in store
      setUserInfo({
        username: username || 'Player',
        walletAddress: '', // Will be populated from MiniKit
        streak: currentStreak,
        insurance: hasStreakInsurance,
      });
      
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
      
      // Set puzzle in store (puzzle comes from payment confirmation)
      setPuzzleFromServer(payResult.puzzle, payResult.date, userId);
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
    if (gameStatus === 'playing' && puzzle) return '▶️ Continue Playing';
    
    switch (step) {
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
            <p className="text-2xl font-bold">{todayPlayers || '--'}</p>
            <p className="text-xs text-muted">Players</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{todaySuccessRate ? `${todaySuccessRate}%` : '--'}</p>
            <p className="text-xs text-muted">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-success">${prizePool?.toFixed(2) || '10.00'}</p>
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
        disabled={gameStatus === 'won' || step !== 'idle'}
        className={`
          w-full py-4 rounded-2xl font-bold text-lg transition-all duration-200
          ${gameStatus === 'won' 
            ? 'bg-success/20 text-success cursor-not-allowed' 
            : step !== 'idle'
            ? 'bg-primary cursor-wait animate-pulse'
            : 'bg-primary active:scale-98'
          }
        `}
        style={{ color: gameStatus === 'won' ? undefined : '#ffffff' }}
      >
        {getButtonText()}
      </button>

      {/* Entry Fee Info */}
      <p className="text-center text-xs text-muted mt-3">
        Entry fee: $1.00 USDC • Winners always break even or profit
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
          <p className="text-sm">
            <span className="text-muted">47% failed</span>
            <span className="mx-2">•</span>
            <span className="text-success">Winners earned $1.78 each</span>
          </p>
        </div>
      </div>
    </div>
  );
}
