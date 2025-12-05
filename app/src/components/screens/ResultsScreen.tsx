'use client';

import { useGameStore } from '@/store/gameStore';
import { useEffect, useState } from 'react';

export function ResultsScreen() {
  const { 
    gameStatus, 
    currentStreak,
    hasStreakInsurance,
    setScreen,
    resetGame,
  } = useGameStore();

  const [timeRemaining, setTimeRemaining] = useState('');
  const [resultsReady, setResultsReady] = useState(false);

  // For demo purposes, we'll simulate results being ready after a short countdown
  // In production, this would check against midnight UTC
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      
      if (diff <= 0) {
        setResultsReady(true);
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeRemaining(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  const isWinner = gameStatus === 'won';

  // Mock data for display (only shown when results are ready)
  const mockResults = {
    totalPlayers: 847,
    totalWinners: 392,
    successRate: 46,
    prizePool: 677.60,
    yourPrize: isWinner ? 1.73 : 0,
    solveTime: '14:32',
  };

  const handleBackToHome = () => {
    resetGame();
    setScreen('home');
  };

  const handleShare = () => {
    const shareText = isWinner 
      ? `🧩 Sodoku Stake\n\n✅ SOLVED in ${mockResults.solveTime}\n🏆 Won $${mockResults.yourPrize.toFixed(2)}\n\n${mockResults.successRate}% of players failed today!\n\n🔥 ${currentStreak}-day streak\n\nPlay on World App!`
      : `🧩 Sodoku Stake\n\n❌ Failed today's puzzle\n\n${100 - mockResults.successRate}% of players solved it\n\nCan you beat tomorrow's puzzle?\n\nPlay on World App!`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Sodoku Stake',
        text: shareText,
      });
    } else {
      navigator.clipboard.writeText(shareText);
      alert('Results copied to clipboard!');
    }
  };

  // Show pending results screen while waiting
  if (!resultsReady) {
    return (
      <div className="flex flex-col h-full p-4 pb-24">
        {/* Success Header */}
        <div className="text-center py-8">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-3xl font-bold mb-2 text-primary">
            Puzzle Submitted!
          </h1>
          <p className="text-muted">
            Your solution has been recorded
          </p>
        </div>

        {/* Countdown Card */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-2xl p-6 mb-4">
          <div className="text-center">
            <p className="text-sm text-muted mb-2">Results will be announced in</p>
            <p className="text-5xl font-mono font-bold text-primary mb-3">
              {timeRemaining}
            </p>
            <p className="text-xs text-muted">
              When the day ends at midnight UTC
            </p>
          </div>
        </div>

        {/* Explanation Card */}
        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span>🎯</span>
            <span>How it works</span>
          </h3>
          
          <div className="space-y-3 text-sm text-muted">
            <div className="flex items-start gap-3">
              <span className="text-primary font-bold">1.</span>
              <p>All players submit their solutions throughout the day</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary font-bold">2.</span>
              <p>At midnight UTC, submissions close and results are calculated</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary font-bold">3.</span>
              <p>Prize pool is split among winners (tax adjusted so you always profit)</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary font-bold">4.</span>
              <p>Winnings are automatically sent to your wallet</p>
            </div>
          </div>
        </div>

        {/* Current Streak */}
        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Your Streak</p>
              <p className="text-2xl font-bold streak-badge">
                🔥 {currentStreak} days
              </p>
            </div>
            {hasStreakInsurance && (
              <div className="text-right">
                <p className="text-xs text-green-400">🛡️ Insurance Active</p>
                <p className="text-xs text-muted">50% loss protection</p>
              </div>
            )}
          </div>
        </div>

        {/* Notification hint */}
        <div className="bg-card/50 border border-border rounded-xl p-3 mb-4">
          <p className="text-xs text-muted text-center">
            🔔 We&apos;ll notify you when results are ready
          </p>
        </div>

        {/* Back Button */}
        <div className="mt-auto">
          <button
            onClick={handleBackToHome}
            className="w-full py-3 bg-card border border-border rounded-xl font-medium hover:border-primary transition-all"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Show final results when ready
  return (
    <div className="flex flex-col h-full p-4 pb-24">
      {/* Result Header */}
      <div className="text-center py-8">
        <div className="text-6xl mb-4">
          {isWinner ? '🎉' : '😔'}
        </div>
        <h1 className={`text-3xl font-bold mb-2 ${isWinner ? 'text-success' : 'text-accent'}`}>
          {isWinner ? 'You Won!' : 'Better Luck Tomorrow'}
        </h1>
        <p className="text-muted">
          {isWinner 
            ? `Solved in ${mockResults.solveTime}` 
            : 'The puzzle deadline has passed'}
        </p>
      </div>

      {/* Prize Card (Winners) */}
      {isWinner && (
        <div className="bg-gradient-to-br from-success/15 to-success/5 border border-success/30 rounded-2xl p-6 mb-4">
          <p className="text-sm text-success mb-1">Your Winnings</p>
          <p className="text-4xl font-bold text-success">
            ${mockResults.yourPrize.toFixed(2)}
          </p>
          <p className="text-xs text-success/70 mt-2">
            Automatically sent to your wallet
          </p>
        </div>
      )}

      {/* Insurance Refund (Losers with insurance) */}
      {!isWinner && hasStreakInsurance && (
        <div className="bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 rounded-2xl p-6 mb-4">
          <p className="text-sm text-primary mb-1">🛡️ Streak Insurance Applied</p>
          <p className="text-2xl font-bold text-primary">
            $0.50 Refunded
          </p>
          <p className="text-xs text-primary/70 mt-2">
            Your 7+ day streak saved you 50%!
          </p>
        </div>
      )}

      {/* Stats Card */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <h3 className="text-sm text-muted mb-3">Today&apos;s Results</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold">{mockResults.totalPlayers}</p>
            <p className="text-xs text-muted">Total Players</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{mockResults.totalWinners}</p>
            <p className="text-xs text-muted">Winners</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-accent">{mockResults.successRate}%</p>
            <p className="text-xs text-muted">Failed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">${mockResults.prizePool.toFixed(2)}</p>
            <p className="text-xs text-muted">Prize Pool</p>
          </div>
        </div>
      </div>

      {/* Streak Update */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Your Streak</p>
            <p className="text-2xl font-bold streak-badge">
              🔥 {currentStreak} days
            </p>
          </div>
          {hasStreakInsurance && (
            <div className="text-right">
              <p className="text-xs text-success">🛡️ Insurance Active</p>
              <p className="text-xs text-muted">50% loss protection</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-auto space-y-3">
        <button
          onClick={handleShare}
          className="w-full py-3 bg-card border border-border rounded-xl font-medium hover:border-primary transition-all flex items-center justify-center gap-2"
        >
          <span>📤</span>
          <span>Share Results</span>
        </button>
        
        <button
          onClick={handleBackToHome}
          className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-all"
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}
