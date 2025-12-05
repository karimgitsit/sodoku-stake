'use client';

import { useGameStore } from '@/store/gameStore';
import { useState } from 'react';
import { payRevealFee } from '@/lib/worldcoin';

export function NumberPad() {
  const { 
    setNumber, 
    clearCell, 
    toggleNotesMode, 
    undo, 
    notesMode, 
    selectedCell, 
    puzzle, 
    puzzleUserId,
    puzzleDate 
  } = useGameStore();
  
  const [showHintConfirm, setShowHintConfirm] = useState(false);
  const [isProcessingReveal, setIsProcessingReveal] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const isDisabled = !selectedCell;

  const handleHint = () => {
    if (!selectedCell || !puzzle) return;
    
    // Show confirmation dialog for paid hint
    setRevealError(null);
    setShowHintConfirm(true);
  };

  const confirmHint = async () => {
    if (!selectedCell || !puzzle || !puzzleUserId || !puzzleDate) {
      setRevealError('Missing puzzle data. Please try again.');
      return;
    }
    
    const { row, col } = selectedCell;
    setIsProcessingReveal(true);
    setRevealError(null);
    
    try {
      // New secure payment flow: initiate → pay → confirm
      // The payRevealFee function now handles everything and returns the value directly
      console.log('[Reveal] Processing $0.20 payment (secure flow)...');
      
      const payResult = await payRevealFee(puzzleUserId, puzzleDate, { row, col });
      
      if (!payResult.success) {
        throw new Error(payResult.error || 'Payment failed');
      }
      
      console.log('[Reveal] Payment confirmed! Transaction:', payResult.transactionId);
      
      // The value is returned directly from the payment confirmation
      if (payResult.value === undefined) {
        throw new Error('Payment confirmed but reveal value missing');
      }
      
      // Set the revealed number in the puzzle
      setNumber(payResult.value);
      setShowHintConfirm(false);
      console.log('[Reveal] Cell revealed:', payResult.value);
      
    } catch (err) {
      console.error('[Reveal] Error:', err);
      setRevealError(err instanceof Error ? err.message : 'Failed to reveal cell');
    } finally {
      setIsProcessingReveal(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Reveal Confirmation Modal */}
      {showHintConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">💡</div>
              <h3 className="text-lg font-bold mb-2">Reveal Square?</h3>
              <p className="text-muted text-sm">
                This will reveal the correct number for the selected cell
              </p>
            </div>
            
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 mb-4">
              <p className="text-center text-sm font-medium text-warning">
                Cost: $0.20 USDC
              </p>
            </div>
            
            {/* Error message */}
            {revealError && (
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 mb-4">
                <p className="text-center text-sm text-accent">{revealError}</p>
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowHintConfirm(false)}
                disabled={isProcessingReveal}
                className="flex-1 py-3 bg-card border border-border rounded-xl font-medium hover:border-muted transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmHint}
                disabled={isProcessingReveal}
                className={`
                  flex-1 py-3 rounded-xl font-bold transition-all
                  ${isProcessingReveal 
                    ? 'bg-primary/70 cursor-wait animate-pulse' 
                    : 'bg-primary hover:bg-primary-dark'
                  }
                `}
                style={{ color: '#ffffff' }}
              >
                {isProcessingReveal ? '⏳ Processing...' : '💳 Pay & Reveal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Numbers 1-9 */}
      <div className="grid grid-cols-9 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => setNumber(num)}
            disabled={isDisabled}
            className={`
              aspect-square flex items-center justify-center
              bg-card border border-border rounded-lg
              text-xl font-semibold
              transition-all duration-150
              ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary active:scale-95 active:bg-primary active:text-white'}
            `}
          >
            {num}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={undo}
          className="flex items-center justify-center gap-1 py-3 bg-card border border-border rounded-lg text-sm font-medium hover:border-primary transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
          <span>Undo</span>
        </button>
        
        <button
          onClick={clearCell}
          disabled={isDisabled}
          className={`
            flex items-center justify-center gap-1 py-3
            bg-card border border-border rounded-lg text-sm font-medium
            transition-all
            ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent hover:text-accent'}
          `}
        >
          <span>✕</span>
          <span>Clear</span>
        </button>
        
        <button
          onClick={toggleNotesMode}
          className={`
            flex items-center justify-center gap-1 py-3
            border rounded-lg text-sm font-medium
            transition-all
            ${notesMode 
              ? 'bg-primary text-white border-primary' 
              : 'bg-card border-border hover:border-primary'
            }
          `}
        >
          <span>✎</span>
          <span>Notes</span>
        </button>

        <button
          onClick={handleHint}
          disabled={isDisabled}
          className={`
            flex items-center justify-center gap-1 py-3
            bg-card border border-border rounded-lg text-sm font-medium
            transition-all
            ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-warning hover:text-warning'}
          `}
        >
          <span>💡</span>
          <span>Reveal</span>
        </button>
      </div>
    </div>
  );
}
