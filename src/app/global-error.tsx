'use client';

/**
 * The last-resort error surface — it replaces the *whole* document, so it may
 * not import anything from the app: no globals.css assumptions beyond inline
 * styles, no providers, no shell. Inline styles only, ink on white, one retry.
 * Ugly-but-honest beats invisible: the alternative was Next's unstyled default.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#ffffff', color: '#000000' }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              border: '1px solid #e2e2e2',
              borderRadius: '16px',
              padding: '32px 28px',
              textAlign: 'center',
            }}
          >
            <h1 style={{ fontSize: '19px', fontWeight: 700, margin: 0 }}>Something went wrong on our side</h1>
            <p style={{ fontSize: '14px', color: '#5e5e5e', lineHeight: 1.5, margin: '8px 0 0' }}>
              Your work is safe — nothing was lost. Try again in a moment.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: '24px',
                width: '100%',
                minHeight: '44px',
                border: 'none',
                borderRadius: '999px',
                background: '#000000',
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            {error.digest && (
              <p style={{ fontSize: '12px', color: '#afafaf', margin: '16px 0 0' }}>
                Error code: <span style={{ fontFamily: 'monospace' }}>{error.digest}</span>
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
