import { ImageResponse } from 'next/og';

/**
 * The link-preview card (#24). Every shared Revisio URL — landing, subject
 * pages, profiles — unfurls to this unless a route overrides it. Near-black
 * ground, white ink, the same "R" tile the nav uses: recognisable at
 * notification-preview size, honest at full card size.
 */
export const alt = 'Revisio — spaced repetition for GCSE, A-level and university';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#000000',
          color: '#ffffff',
          padding: '72px 80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: '#ffffff',
              color: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            R
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}>Revisio</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', maxWidth: 900 }}>
            Spaced repetition for GCSE, A-level and university.
          </div>
          <div style={{ fontSize: 30, color: '#afafaf' }}>
            The queue is the product. Ten minutes a day.
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 24, color: '#afafaf' }}>
          revisio-srs.vercel.app
        </div>
      </div>
    ),
    size,
  );
}
