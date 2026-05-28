'use client';

import { useEffect, useRef, useState } from 'react';

import type { DinoType } from './dino-character';
import type { RunnerHandle, RunnerOptions, RunnerStats, RunnerView } from './runner';

// Our profile roster uses 'brachiosaurus'; the dino rig calls it 'brachio'.
function dinoFor(avatar?: string): DinoType {
  if (avatar === 'stego') return 'stego';
  if (avatar === 'brachiosaurus') return 'brachio';
  return 'trik';
}

// Faster start + steeper climb for older kids; gentle for the youngest. No cap — the climb is
// endless, so start speed + acceleration are what keep the youngest easier for longer.
function optsForAge(ageBand?: string): RunnerOptions {
  switch (ageBand) {
    case '5-6':
      return { startSpeed: 9, accel: 0.4 };
    case '7-8':
      return { startSpeed: 11, accel: 0.5 };
    case '9-10':
      return { startSpeed: 12, accel: 0.6 };
    case '11-12':
      return { startSpeed: 14, accel: 0.7 };
    case '13-14':
      return { startSpeed: 15, accel: 0.8 };
    default:
      return { startSpeed: 12, accel: 0.6 };
  }
}

const EMPTY_STATS: RunnerStats = { distance: 0, gems: 0, hearts: 3, shield: false, magnet: false, speed: 0, breakReady: true };

export function RunnerCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RunnerHandle | null>(null);
  const bestRef = useRef(0); // best distance loaded for the active child (for "New best!")
  const persistRef = useRef(false); // only save when a child profile is active
  const profileRef = useRef<{ ageBand?: string; avatarCharacter?: string }>({});
  const topSpeedRef = useRef(0); // fastest speed reached this run (internal units) — the "rank"

  const [stats, setStats] = useState<RunnerStats>(EMPTY_STATS);
  const [best, setBest] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [finalScore, setFinalScore] = useState({ distance: 0, gems: 0, newBest: false, topSpeed: 0 });
  const [runeMsg, setRuneMsg] = useState<string | null>(null); // "what you got" popup
  const [charging, setCharging] = useState(false); // shown if 💥 pressed while on cooldown
  const runeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chargeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showRune(rune: string) {
    setRuneMsg(rune);
    if (runeTimer.current) clearTimeout(runeTimer.current);
    runeTimer.current = setTimeout(() => setRuneMsg(null), 1600);
  }
  function showCharging() {
    setCharging(true);
    if (chargeTimer.current) clearTimeout(chargeTimer.current);
    chargeTimer.current = setTimeout(() => setCharging(false), 800);
  }

  // Load the active child's profile (age band, avatar, best) once, before the run.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/game/progress')
      .then((r) => r.json())
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        const child = (data?.child ?? null) as { ageBand?: string; avatarCharacter?: string } | null;
        profileRef.current = child ?? {};
        persistRef.current = !!child;
        const loadedBest = Number(data?.progress?.runnerBestDistance ?? 0);
        bestRef.current = loadedBest;
        setBest(loadedBest);
      });
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  // Desktop: P pauses/resumes (handled here so the overlay + runner stay in sync).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'p' || e.key === 'P') && started && !over) {
        const next = !paused;
        setPaused(next);
        handleRef.current?.setPaused(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, over, paused]);

  const onUpdate = (s: RunnerStats) => {
    if (s.speed > topSpeedRef.current) topSpeedRef.current = s.speed;
    setStats(s);
  };

  const onGameOver = (distance: number, gems: number) => {
    const newBest = distance > bestRef.current;
    if (newBest) {
      bestRef.current = distance;
      setBest(distance);
    }
    setFinalScore({ distance, gems, newBest, topSpeed: topSpeedRef.current });
    setOver(true);
    if (persistRef.current) {
      void fetch('/api/game/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'runner', distance, gems }),
      }).catch(() => {});
    }
  };

  // Camera is chosen here, before the run, and stays fixed (fair for multiplayer).
  async function start(view: RunnerView) {
    setStarted(true);
    topSpeedRef.current = 0;
    const { createRunner } = await import('./runner');
    if (!mountRef.current || handleRef.current) return;
    const opts: RunnerOptions = {
      ...optsForAge(profileRef.current.ageBand),
      character: dinoFor(profileRef.current.avatarCharacter),
      view,
    };
    handleRef.current = createRunner(mountRef.current, { onUpdate, onGameOver, onRune: showRune }, opts);
  }

  function playAgain() {
    setOver(false);
    setPaused(false);
    setStats(EMPTY_STATS);
    topSpeedRef.current = 0;
    handleRef.current?.restart();
  }

  function togglePause(next: boolean) {
    setPaused(next);
    handleRef.current?.setPaused(next);
  }

  const ctrlBtn =
    'pointer-events-auto select-none rounded-full bg-white/20 px-5 py-4 text-2xl font-bold text-white backdrop-blur active:bg-white/40';
  const viewCard =
    'pointer-events-auto w-56 rounded-2xl bg-white/15 px-5 py-4 text-lg font-bold backdrop-blur transition hover:bg-white/25 active:bg-white/35';

  return (
    <div className="relative h-full w-full bg-sky-200">
      <div ref={mountRef} className="h-full w-full" />

      {/* HUD (only once running) */}
      {started && (
        <div className="pointer-events-none absolute left-3 top-2 flex flex-col gap-0.5 text-white drop-shadow">
          <div>
            <span className="font-black">🏃 {stats.distance}m</span>
            <span className="ml-3 font-black">💎 {stats.gems}</span>
            <span className="ml-3 font-black">💨 {Math.round(stats.speed * 3.6)} km/h</span>
          </div>
          <div className="text-lg leading-none">
            {'❤️'.repeat(stats.hearts)}
            {'🤍'.repeat(Math.max(0, 3 - stats.hearts))}
            {stats.shield && <span className="ml-2">🛡️</span>}
            {stats.magnet && <span className="ml-1">🧲</span>}
          </div>
          {best > 0 && <div className="text-xs font-semibold text-white/80">Best: {best}m</div>}
        </div>
      )}

      {/* Pause button (single-player) */}
      {started && !over && !paused && (
        <button
          type="button"
          onClick={() => togglePause(true)}
          className="pointer-events-auto absolute right-3 top-2 rounded-full bg-white/20 px-3 py-1.5 text-sm font-bold text-white backdrop-blur active:bg-white/40"
        >
          ⏸ Pause
        </button>
      )}

      {/* Rune reward — what you got from a smashed box */}
      {runeMsg && (
        <div className="pointer-events-none absolute left-1/2 top-[26%] -translate-x-1/2 animate-pulse rounded-2xl bg-emerald-500/90 px-6 py-3 text-center text-2xl font-black text-white shadow-lg">
          {runeMsg}!
        </div>
      )}
      {/* 💥 pressed while still on cooldown */}
      {charging && (
        <div className="pointer-events-none absolute left-1/2 top-[26%] -translate-x-1/2 rounded-2xl bg-slate-800/90 px-5 py-2.5 text-center text-lg font-bold text-white shadow-lg">
          ⏳ Power charging…
        </div>
      )}

      {/* Pre-game: choose the camera (no in-game toggle — same for everyone in a race) */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-slate-900/70 px-6 text-center text-white">
          <div className="text-5xl">🦖</div>
          <h2 className="text-2xl font-black">Dino Dash</h2>
          <p className="text-sm text-white/80">Pick your camera — everyone in a race uses the same one:</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className={viewCard} onClick={() => void start('follow')}>
              🎥 Follow cam
              <span className="mt-1 block text-xs font-medium text-white/70">Wider view — see more track ahead</span>
            </button>
            <button type="button" className={viewCard} onClick={() => void start('close')}>
              🦖 Close cam
              <span className="mt-1 block text-xs font-medium text-white/70">Closer — see your dino &amp; its abilities</span>
            </button>
          </div>
        </div>
      )}

      {/* On-screen controls (touch + click). Swipes also work. */}
      {started && !over && !paused && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-end justify-between px-4">
          <div className="flex gap-2">
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.moveLeft()}>
              ◀
            </button>
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.moveRight()}>
              ▶
            </button>
          </div>
          <button
            type="button"
            className={`pointer-events-auto select-none rounded-full px-5 py-4 text-2xl font-bold backdrop-blur transition ${
              stats.breakReady
                ? 'bg-amber-400 text-slate-900 ring-4 ring-amber-200/80 active:bg-amber-300'
                : 'border-2 border-dashed border-white/30 bg-white/5 text-white/25'
            }`}
            onPointerDown={() => {
              if (stats.breakReady) handleRef.current?.breakBox();
              else showCharging();
            }}
          >
            💥
          </button>
          <div className="flex gap-2">
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.slide()}>
              ▼
            </button>
            <button type="button" className={ctrlBtn} onPointerDown={() => handleRef.current?.jump()}>
              ▲
            </button>
          </div>
        </div>
      )}

      {/* Paused (single-player) */}
      {paused && !over && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/70 text-center text-white">
          <div className="text-5xl">⏸️</div>
          <h2 className="text-2xl font-black">Paused</h2>
          <button
            type="button"
            onClick={() => togglePause(false)}
            className="rounded-full bg-emerald-500 px-6 py-3 text-lg font-bold text-white hover:bg-emerald-600"
          >
            ▶ Resume
          </button>
        </div>
      )}

      {/* Game over */}
      {over && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/70 text-center text-white">
          <div className="text-5xl">{finalScore.newBest ? '🏆' : '🏁'}</div>
          {finalScore.newBest ? (
            <h2 className="text-3xl font-black text-amber-300">New best! 🎉</h2>
          ) : (
            <h2 className="text-2xl font-black">Nice run!</h2>
          )}
          <p>
            🏃 {finalScore.distance}m · 💎 {finalScore.gems}
          </p>
          <p className="text-sm font-semibold text-amber-200">💨 Top speed: {Math.round(finalScore.topSpeed * 3.6)} km/h</p>
          {!finalScore.newBest && best > 0 && <p className="text-sm text-white/70">Best: {best}m</p>}
          <button
            type="button"
            onClick={playAgain}
            className="rounded-full bg-emerald-500 px-6 py-3 text-lg font-bold text-white hover:bg-emerald-600"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
