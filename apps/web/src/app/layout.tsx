import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'DinoVerse',
  description: 'A world where dinosaurs never went extinct — learn, watch, and play together.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (Scribe, Grammarly, dark-mode, …) inject
    // attributes onto <html>/<body> before React hydrates. This silences those benign,
    // extension-only attribute mismatches — it does NOT hide real mismatches in our own markup.
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-slate-50 text-slate-900 antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
