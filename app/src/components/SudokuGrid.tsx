'use client';

import { useGameStore } from '@/store/gameStore';

export function SudokuGrid() {
  const { puzzle, selectedCell, selectCell } = useGameStore();

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
    <div className="sudoku-grid">
      {puzzle.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === colIndex;
          const isSameRowOrCol = selectedCell && 
            (selectedCell.row === rowIndex || selectedCell.col === colIndex);
          const isSameBox = selectedCell &&
            Math.floor(selectedCell.row / 3) === Math.floor(rowIndex / 3) &&
            Math.floor(selectedCell.col / 3) === Math.floor(colIndex / 3);
          
          const cellClasses = [
            'sudoku-cell',
            isSelected ? 'selected' : '',
            cell.isGiven ? 'given' : '',
            cell.hasError ? 'error' : '',
            cell.notes.size > 0 && !cell.value ? 'notes' : '',
            !isSelected && (isSameRowOrCol || isSameBox) ? 'bg-[#1f1f1f]' : '',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={cellClasses}
              onClick={() => selectCell(rowIndex, colIndex)}
            >
              {cell.value ? (
                <span>{cell.value}</span>
              ) : cell.notes.size > 0 ? (
                <div className="grid grid-cols-3 gap-0 w-full h-full p-0.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span 
                      key={n} 
                      className="text-[8px] flex items-center justify-center"
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

