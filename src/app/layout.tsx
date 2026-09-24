import type { Metadata, Viewport } from 'next';
import PwaRegister from '@/components/PwaRegister';
import { SmoothCursor } from '@/components/ui/smooth-cursor';
import { MotionProvider } from '@/components/ui/motion/motion-provider';
import { themeScript } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Revisio — Learn it once',
  description: 'Spaced-repetition learning platform: daily reviews, cram, exams and leagues.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#252527' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Painted before first byte of body so dark-mode users never flash white.
            The script text comes from lib/theme, the same module the toggle reads. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
      </head>
      <body>
        <MotionProvider>
          {children}
          <SmoothCursor />
        </MotionProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
