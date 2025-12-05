'use client';

import { useGameStore } from '@/store/gameStore';
import { SudokuGrid } from '@/components/SudokuGrid';
import { NumberPad } from '@/components/NumberPad';
import { useEffect, useState } from 'react';

export function PuzzleScreen() {
  const { 
    puzzle, 
    startTime, 
    gameStatus, 
    setScreen,
    submitSolution,
  } = useGameStore();
  
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Timer
  useEffect(() => {
    if (gameStatus !== 'playing' || !startTime) return;

    const updateTimer = () => {
      const elapsed = Date.now() - startTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      setElapsedTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [gameStatus, startTime]);

  // Submit solution to server for validation
  const handleSubmit = async () => {
    if (!puzzle || isSubmitting) return;
    
    // Check if all cells are filled
    const allFilled = puzzle.every(row => row.every(cell => cell.value !== null));
    if (!allFilled) {
      setSubmitError('Please fill in all cells before submitting!');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Submit to server for validation
      const result = await submitSolution();
      
      if (result.correct) {
        setShowSuccess(true);
        // Navigate to results after celebration
        setTimeout(() => {
          setScreen('results');
        }, 2000);
      } else {
        setSubmitError(result.message || 'Some cells are incorrect. Keep trying!');
      }
    } catch (error) {
      console.error('Submit error:', error);
      setSubmitError('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };


  if (gameStatus === 'not_started') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p className="text-muted text-center">
          No active puzzle. Go to Home to start playing!
        </p>
        <button
          onClick={() => setScreen('home')}
          className="mt-4 px-6 py-2 bg-primary text-white rounded-lg font-medium"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 pb-24">
      {/* Success Overlay */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 animate-celebrate">
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-primary mb-2">Puzzle Solved!</h2>
            <p className="text-muted">Submitting your solution...</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-bold text-lg">Daily Puzzle</h2>
          <p className="text-xs text-muted">
            {new Date().toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Timer */}
          <div className="text-right">
            <p className="text-xs text-muted">Time</p>
            <p className="font-mono font-bold text-primary">{elapsedTime}</p>
          </div>
          
        </div>
      </div>


      {/* Sudoku Grid */}
      <div className="flex-shrink-0 mb-4">
        <SudokuGrid />
      </div>

      {/* Number Pad */}
      <div className="flex-shrink-0 mb-4">
        <NumberPad />
      </div>

      {/* Error Message */}
      {submitError && (
        <div className="mb-3 p-3 bg-accent/10 border border-accent/30 rounded-lg">
          <p className="text-sm text-accent text-center">{submitError}</p>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={`
          w-full py-3 rounded-xl font-bold text-lg transition-all
          ${isSubmitting 
            ? 'bg-primary/70 cursor-wait' 
            : 'bg-primary hover:bg-primary-dark active:scale-98'
          }
        `}
        style={{ color: '#ffffff' }}
      >
        {isSubmitting ? '⏳ Validating...' : '✓ Submit Solution'}
      </button>
    </div>
  );
}

