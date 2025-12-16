'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backgroundColor: '#0f0f0f',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>💥</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Something went wrong!
            </h2>
            <p style={{ color: '#888', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              {error.message || 'A critical error occurred'}
            </p>
            <button
              onClick={reset}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#22c55e',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.75rem',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}


