'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center">
        <div className="text-6xl mb-4">😵</div>
        <h2 className="text-xl font-bold mb-2">Something went wrong!</h2>
        <p className="text-muted mb-6 text-sm">
          {error.message || 'An unexpected error occurred'}
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-dark transition-all"
        >
          Try again
        </button>
      </div>
    </div>
  );
}


