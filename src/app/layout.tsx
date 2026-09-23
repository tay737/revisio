import type { Metadata, Viewport } from 'next';
import PwaRegister from '@/components/PwaRegister';
import { SmoothCursor } from '@/components/ui/smooth-cursor';
import { InlineThemeScript } from '@/components/ui/inline-theme-script';
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
        <InlineThemeScript />
      </head>
      <body>
        {children}
        <SmoothCursor />
        <PwaRegister />
      </body>
    </html>
  );
}
