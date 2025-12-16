'use client';

import { useGameStore } from '@/store/gameStore';

export function SudokuGrid() {
  const { puzzle, selectedCell, selectCell, errorCells, gameLocked } = useGameStore();

  if (!puzzle) {
    return (
      <div className="sudoku-grid opacity-50">
        {Array(81).fill(null).map((_, i) => (
          <div key={i} className="sudoku-cell">
            <span className="text-muted">-</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`sudoku-grid ${gameLocked ? 'opacity-75 pointer-events-none' : ''}`}>
      {puzzle.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === colIndex;
          const isSameRowOrCol = selectedCell && 
            (selectedCell.row === rowIndex || selectedCell.col === colIndex);
          const isSameBox = selectedCell &&
            Math.floor(selectedCell.row / 3) === Math.floor(rowIndex / 3) &&
            Math.floor(selectedCell.col / 3) === Math.floor(colIndex / 3);
          
          // Check if this cell is in the error set
          const hasError = cell.hasError || errorCells.has(`${rowIndex},${colIndex}`);
          
          const cellClasses = [
            'sudoku-cell',
            isSelected ? 'selected' : '',
            cell.isGiven ? 'given' : '',
            hasError ? 'error' : '',
            !isSelected && !hasError && (isSameRowOrCol || isSameBox) ? 'bg-[var(--secondary)]' : '',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={cellClasses}
              onClick={() => !gameLocked && selectCell(rowIndex, colIndex)}
            >
              {cell.value ? (
                <span className={hasError ? 'animate-shake' : ''}>{cell.value}</span>
              ) : cell.notes.size > 0 ? (
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-0.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span 
                      key={n} 
                      className="text-[8px] text-[var(--muted)] flex items-center justify-center leading-none"
                    >
                      {cell.notes.has(n) ? n : ''}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

