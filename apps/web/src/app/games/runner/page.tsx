import Link from 'next/link';

import { RunnerCanvas } from './runner-canvas';

// iOS Safari (iPhone) refuses the element-fullscreen API. The next-best thing is the
// PWA "Add to Home Screen" hatch — these meta tags tell iOS that when the page is
// launched from the home-screen icon, it should open in a chromeless standalone window
// (effectively fullscreen). Android Chrome / Edge / Firefox already get real
// fullscreen via the ⛶ button (see toggleFullscreen in runner-canvas.tsx).
export const metadata = {
  title: 'Dino Dash',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    minimumScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
  },
  appleWebApp: {
    capable: true,
    title: 'Dino Dash',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
} as const;

export default function RunnerPage() {
  return (
    // No OrientationGate: the camera now adapts FOV per aspect ratio (see runner.ts) so
    // portrait and landscape are both first-class. Removed 2026-05-29.
    <main className="flex h-[100dvh] flex-col bg-slate-900 text-white">
      {/* Page chrome (back link + keyboard hint + footer) is hidden on phones/tablets — the game
          takes the full viewport. Desktop (lg+) keeps it for context. */}
      <header className="hidden items-center justify-between gap-4 px-4 py-2 lg:flex">
        <div className="flex items-center gap-3">
          <Link href="/games" className="text-sm font-semibold text-emerald-300 hover:underline">
            ← Games
          </Link>
          <h1 className="text-lg font-black">🦖 Dino Dash</h1>
        </div>
        <p className="text-xs text-slate-300">
          <span className="font-semibold">←/→</span> switch lane · <span className="font-semibold">↑/Space</span>{' '}
          jump · <span className="font-semibold">↓</span> slide · <span className="font-semibold">E</span> smash (📦 = 2 taps) · <span className="font-semibold">Q</span> ⚡ ability · <span className="font-semibold">P</span> pause
        </p>
      </header>

      <div className="min-h-0 flex-1">
        <RunnerCanvas />
      </div>

      <p className="hidden px-4 py-1.5 text-center text-xs text-slate-400 lg:block">
        Jump 🟫, slide under 🟦, grab 💎, tap to smash 🟨 (📦 needs two). Coins + smashes charge your ⚡ ability — your dino’s signature move when full.
      </p>
    </main>
  );
}
