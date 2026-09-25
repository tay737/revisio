import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import PwaRegister from '@/components/PwaRegister';
import { MotionProvider } from '@/components/ui/motion/motion-provider';
import { Toaster } from '@/components/ui/sonner';
import { themeScript } from '@/lib/theme';
import './globals.css';

/**
 * One typeface, two roles.
 *
 * docs/DESIGN-UBER.md runs a custom pair (UberMove for display, UberMoveText for
 * body) and names Inter weight 700 with `ss01` as the closest open substitute for
 * the display face, with weights 400/500 matching the text face's width and
 * x-height. Using one variable family for both roles keeps the download at a
 * single file while the *scale* — the thing anyone actually perceives — still
 * follows the spec exactly: 700 display in sentence case, 400/500 for everything
 * else, no letter-spacing on the display face.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Revisio — Learn it once',
  description: 'Spaced repetition, a daily queue and a rank worth defending.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Revisio',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // Without `cover` the safe-area insets resolve to 0 and the bottom bar sits
  // under the iOS home indicator.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        {/* Painted before the first byte of body so dark-mode users never see a
            white flash. The script text comes from lib/theme — the same module
            the toggle reads, so the key exists in exactly one place. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
      </head>
      <body className="min-h-screen">
        <MotionProvider>
          {children}
          <Toaster />
        </MotionProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
