import type { Metadata } from 'next';
import { Geist, Source_Serif_4, JetBrains_Mono } from 'next/font/google';
import { ThemeInitializer } from '@/components/theme/theme-initializer';
import { ThemeProvider } from '@/components/theme/theme-provider';
import './globals.css';

// Editorial-minimalist type system, calibrated against good-ship.co.uk
// and techfreedom.eu as visual references:
//   * Geist — humanist sans for headings, UI chrome, eyebrow labels.
//     Calm and legible, slightly geometric without being cold.
//   * Source Serif 4 — refined neutral serif for prose, body copy,
//     italic callouts. Reads like a thoughtful publication.
//   * JetBrains Mono — reserved for technical strings (IDs, slugs,
//     page numbers, code). Rarely visible.
const geist = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  variable: '--font-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'open-recs-local',
  description: 'Local-first open recommendations',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeInitializer />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
