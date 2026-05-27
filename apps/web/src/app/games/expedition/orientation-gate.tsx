'use client';

import { useEffect, useState } from 'react';

/**
 * On small screens (< 1024px, i.e. phones/tablets) the 16:9 game is tiny in portrait.
 * We present it in landscape:
 *  - best-effort: ask the browser to lock to landscape (works on Android/Chrome in fullscreen;
 *    iOS Safari ignores it — Apple doesn't allow web pages to force rotation),
 *  - always: when the device is still in portrait, cover the game with a "turn sideways" prompt
 *    so it's never shown as a tiny strip. In landscape the game fills the screen.
 * This only renders on the game page, so the rest of the app is unaffected.
 */
export function OrientationGate() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const check = () => {
      const small = window.innerWidth < 1024;
      const portrait = window.matchMedia('(orientation: portrait)').matches;
      setShowPrompt(small && portrait);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);

    // Best-effort: lock to landscape (Android/Chrome). Safely ignored where unsupported.
    try {
      const orientation = (window.screen?.orientation ?? undefined) as unknown as
        | { lock?: (o: string) => Promise<void> }
        | undefined;
      void orientation?.lock?.('landscape')?.catch?.(() => {});
    } catch {
      // unsupported (e.g. iOS) — the prompt below covers it
    }

    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-900 px-10 text-center text-white">
      <div className="animate-pulse text-7xl">🔄📱</div>
      <p className="text-2xl font-black">Turn your device sideways</p>
      <p className="text-sm text-slate-300">Dino Expedition plays best in landscape (wide) mode.</p>
    </div>
  );
}
