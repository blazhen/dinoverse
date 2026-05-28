'use client';

import { useEffect, useRef, useState } from 'react';

import type { DinoType } from './dino-character';
import { defaultServerUrl, makeRoomCode, Multiplayer, type MpPlayer, type MpState } from './multiplayer';
import { RunnerAudio } from './runner-audio';
import type { RunnerHandle, RunnerOpponent, RunnerOptions, RunnerStats, RunnerView } from './runner';

// Our profile roster uses 'brachiosaurus'; the dino rig calls it 'brachio'.
function dinoFor(avatar?: string): DinoType {
  if (avatar === 'stego') return 'stego';
  if (avatar === 'brachiosaurus') return 'brachio';
  return 'trik';
}

// Faster start + steeper climb for older kids; gentle for the youngest. Auto-cap is 70 km/h
// (≈19.4 internal units/s) so start speeds stop a few notches below that to leave a real ramp.
function optsForAge(ageBand?: string): RunnerOptions {
  switch (ageBand) {
    case '5-6':
      return { startSpeed: 9, accel: 0.15 }; // ~32 km/h → 70 km/h over ~70s
    case '7-8':
      return { startSpeed: 10, accel: 0.2 };
    case '9-10':
      return { startSpeed: 11, accel: 0.25 }; // default-ish pacing
    case '11-12':
      return { startSpeed: 12, accel: 0.3 };
    case '13-14':
      return { startSpeed: 13, accel: 0.4 };
    default:
      return { startSpeed: 11, accel: 0.25 };
  }
}

// localStorage helpers (standalone persistence — the game ships without the full app).
function lsNum(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore (private mode)
  }
}
function lsDino(): DinoType {
  try {
    const d = localStorage.getItem('dinoDashDino');
    if (d === 'trik' || d === 'stego' || d === 'brachio' || d === 'trex') return d;
  } catch {
    // ignore
  }
  return 'trik';
}

const EMPTY_STATS: RunnerStats = { distance: 0, gems: 0, hearts: 3, shield: false, magnet: false, speed: 0, breakReady: true, combo: 1, lane: 1, y: 0 };

const DINOS: { id: DinoType; label: string }[] = [
  { id: 'trik', label: '⚡ Trik' },
  { id: 'stego', label: '🛡️ Stego' },
  { id: 'brachio', label: '🔭 Brachio' },
];

export function RunnerCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RunnerHandle | null>(null);
  const bestRef = useRef(0); // best distance (for "New best!") — synced from localStorage in mount effect
  const bestSpeedRef = useRef(0); // best km/h (the "rank") — synced in mount effect
  const bestTimeRef = useRef(0); // longest run duration in seconds — synced in mount effect
  const persistRef = useRef(false); // also save to the DB when a child profile is active
  const profileRef = useRef<{ ageBand?: string; avatarCharacter?: string }>({});
  const topSpeedRef = useRef(0); // fastest speed reached this run (internal units)
  const audioRef = useRef<RunnerAudio | null>(null);

  // ALL localStorage-backed state initialises to a server-safe default below, then a mount
  // effect (see further down) syncs the real value from localStorage. Reading localStorage in
  // a useState initialiser causes SSR / hydration mismatches because the server has no storage.
  const [stats, setStats] = useState<RunnerStats>(EMPTY_STATS);
  const [best, setBest] = useState(0);
  const [bestSpeed, setBestSpeed] = useState(0);
  const [bestTime, setBestTime] = useState(0); // longest survival time in seconds
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [finalScore, setFinalScore] = useState({ distance: 0, gems: 0, newBest: false, topSpeed: 0, durationSec: 0 });
  const [runeMsg, setRuneMsg] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const [muted, setMuted] = useState(false);
  const [selectedDino, setSelectedDino] = useState<DinoType>('trik');
  const [view, setView] = useState<RunnerView>('follow');
  const [showHowTo, setShowHowTo] = useState(false);
  const [isCoarse, setIsCoarse] = useState(false); // true on touch devices (drives auto-fullscreen + larger buttons)
  const [isFs, setIsFs] = useState(false);
  // 3-2-1 countdown overlay: set to the epoch-ms when the countdown should END (i.e. when
  // the runner should unpause). Drives both the race-start countdown (server "countdown"
  // phase) and the resume-from-pause countdown. While set, the runner is paused.
  const [countdownEnd, setCountdownEnd] = useState<number | null>(null);
  const [countdownTick, setCountdownTick] = useState(0); // force re-render each 100ms
  // Confirm-quit modal: when true, show a Cancel/Yes overlay before tearing down a run.
  // Game-over screen skips this (the run is already done — nothing to confirm).
  const [confirmQuit, setConfirmQuit] = useState(false);
  const runeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chargeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Multiplayer state ───────────────────────────────────────────────────────
  // `mpScreen` drives which sub-UI is shown. 'menu' = single-player menu (default), 'lobby'
  // = waiting for room to fill / ready, 'race' = in progress (canvas shown). When in 'race'
  // we forward stats to the server and feed opponents to the runner.
  const [mpScreen, setMpScreen] = useState<'menu' | 'lobby' | 'race'>('menu');
  const [mpCode, setMpCode] = useState('');
  const [mpName, setMpName] = useState('');
  const [mpState, setMpState] = useState<MpState | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);
  const [mpConnecting, setMpConnecting] = useState(false);
  // false = host (default — auto-creates a room on Race-with-friends click). true = "I have
  // a code from a friend" → show a code input + Join button instead.
  const [mpJoinMode, setMpJoinMode] = useState(false);
  const [mpCopied, setMpCopied] = useState(false); // "Copied!" toast on the invite-link button
  const mpRef = useRef<Multiplayer | null>(null);
  const mpStateRef = useRef<MpState | null>(null);
  const mpStatsRef = useRef<RunnerStats>(EMPTY_STATS); // latest stats for the pos broadcaster

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

  // 💥 single-tap smash. Gold breaks on one tap; crates take two fast taps (the runner handles
  // the crack-then-finish bookkeeping internally).
  function smashTap() {
    if (!stats.breakReady) {
      showCharging();
      return;
    }
    handleRef.current?.breakBox();
  }

  // ── Multiplayer flow ────────────────────────────────────────────────────────
  // openMultiplayer auto-hosts a new room so the user can immediately copy an invite link.
  // If a `joinCode` is passed (from the ?race=XYZ URL or the "I have a code" form), it
  // joins that room instead. The lobby UI shows the code + invite link, players list, and
  // a ready toggle. When server phase flips to "racing" we start the canvas with the seed.
  function resolveName(): string {
    if (mpName) return mpName;
    let stored = '';
    try {
      stored = localStorage.getItem('dinoDashName') ?? '';
    } catch {
      /* ignore */
    }
    const name = stored || `Dino${Math.floor(Math.random() * 90) + 10}`;
    setMpName(name);
    return name;
  }
  async function openMultiplayer(joinCode?: string) {
    setMpScreen('lobby');
    setMpError(null);
    setMpJoinMode(!!joinCode);
    const code = (joinCode ?? makeRoomCode()).toUpperCase();
    setMpCode(code);
    const name = resolveName();
    await mpConnect(code, name);
  }
  function closeMultiplayer() {
    void mpRef.current?.leave();
    mpRef.current = null;
    setMpState(null);
    setMpError(null);
    setMpConnecting(false);
    setMpJoinMode(false);
    setMpCopied(false);
    setMpScreen('menu');
  }
  async function mpConnect(code: string, nameOverride?: string) {
    if (mpConnecting || !code) return;
    const name = nameOverride ?? mpName;
    if (!name) return;
    setMpError(null);
    setMpConnecting(true);
    lsSet('dinoDashName', name);
    try {
      const mp = new Multiplayer();
      mpRef.current = mp;
      // `view` is honoured only if THIS connection is the room-creating one (host). For
      // joiners, the room already exists and the server keeps its existing view.
      await mp.connect(code.toUpperCase(), name, selectedDino, view, {
        onState: (s) => setMpState(s),
        onError: (msg) => setMpError(msg),
        onLeave: () => {
          setMpState(null);
          setMpError('Disconnected from room.');
        },
      });
    } catch (e) {
      setMpError((e as Error).message || 'Failed to connect to server.');
      mpRef.current = null;
    } finally {
      setMpConnecting(false);
    }
  }
  // Drop the auto-hosted room and switch the lobby to "type a code" mode.
  async function switchToJoinMode() {
    await mpRef.current?.leave();
    mpRef.current = null;
    setMpState(null);
    setMpError(null);
    setMpJoinMode(true);
    setMpCode('');
  }
  // Submit the manually-typed code → connect.
  async function mpJoinTypedCode() {
    if (mpCode.length < 3) return;
    const name = resolveName();
    await mpConnect(mpCode, name);
  }
  // Build a sharable invite URL for the current room code.
  function inviteUrl(): string {
    if (typeof window === 'undefined' || !mpCode) return '';
    return `${window.location.origin}/games/runner?race=${mpCode}`;
  }
  async function copyInvite() {
    const url = inviteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMpCopied(true);
      setTimeout(() => setMpCopied(false), 1500);
    } catch {
      setMpError('Could not copy — long-press the link to copy manually.');
    }
  }
  // navigator.share gets the native iOS / Android share sheet — much better than copy on phone.
  async function shareInvite() {
    const url = inviteUrl();
    if (!url) return;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title: 'Dino Dash race', text: `Join my race! Code: ${mpCode}`, url });
      } catch {
        /* user cancelled */
      }
    } else {
      void copyInvite();
    }
  }
  function mpToggleReady() {
    if (!mpState) return;
    const me = mpState.players.find((p) => p.id === mpState.myId);
    mpRef.current?.ready(!me?.ready);
  }

  // Whenever the room state changes, mirror to the ref + push opponents into the live runner.
  useEffect(() => {
    mpStateRef.current = mpState;
    if (!mpState || !handleRef.current) return;
    const ops: RunnerOpponent[] = mpState.players
      .filter((p) => p.id !== mpState.myId)
      .map((p) => ({
        id: p.id,
        name: p.name,
        character: p.character,
        distance: p.distance,
        lane: p.lane,
        y: p.y,
        finished: p.finished,
      }));
    handleRef.current.setOpponents(ops);
  }, [mpState]);

  // Phase transitions:
  //  lobby → countdown : create the runner (paused) so the canvas paints behind the 3-2-1
  //                       overlay; the local countdown timer matches the server's 3s window.
  //  countdown → racing : the countdown tick effect already unpaused the runner; nothing
  //                       to do here, just stay on the race screen.
  useEffect(() => {
    if (mpState?.phase === 'countdown' && mpScreen === 'lobby') {
      setMpScreen('race');
      void startMpRace().then(() => {
        // Pause the freshly-created runner — the countdown overlay drives the unpause.
        handleRef.current?.setPaused(true);
        setCountdownEnd(Date.now() + 3000);
      });
    }
  }, [mpState?.phase, mpScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the active child's profile (age, avatar, DB best) if signed in. Optional — the game runs
  // standalone with localStorage; this just merges in a logged-in child's saved progress.
  useEffect(() => {
    // Hydrate localStorage-backed UI state HERE (not in useState) so the first client render
    // exactly matches the SSR-rendered HTML — otherwise React throws a hydration error.
    bestRef.current = lsNum('dinoDashBestDist');
    bestSpeedRef.current = lsNum('dinoDashBestSpeed');
    bestTimeRef.current = lsNum('dinoDashBestTime');
    if (bestRef.current) setBest(bestRef.current);
    if (bestSpeedRef.current) setBestSpeed(bestSpeedRef.current);
    if (bestTimeRef.current) setBestTime(bestTimeRef.current);
    try {
      if (localStorage.getItem('dinoDashMuted') === '1') setMuted(true);
      if (localStorage.getItem('dinoDashView') === 'close') setView('close');
      const d = lsDino();
      if (d !== 'trik') setSelectedDino(d);
    } catch {
      // ignore (private mode)
    }
    let cancelled = false;
    let hadDinoPref = false;
    try {
      hadDinoPref = !!localStorage.getItem('dinoDashDino');
    } catch {
      // ignore
    }
    void fetch('/api/game/progress')
      .then((r) => r.json())
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        const child = (data?.child ?? null) as { ageBand?: string; avatarCharacter?: string } | null;
        profileRef.current = child ?? {};
        persistRef.current = !!child;
        const dbBest = Number(data?.progress?.runnerBestDistance ?? 0);
        const dbSpeed = Number(data?.progress?.runnerBestSpeed ?? 0);
        bestRef.current = Math.max(bestRef.current, dbBest);
        bestSpeedRef.current = Math.max(bestSpeedRef.current, dbSpeed);
        setBest(bestRef.current);
        setBestSpeed(bestSpeedRef.current);
        if (!hadDinoPref && child?.avatarCharacter) setSelectedDino(dinoFor(child.avatarCharacter));
      });
    return () => {
      cancelled = true;
      if (runeTimer.current) clearTimeout(runeTimer.current);
      if (chargeTimer.current) clearTimeout(chargeTimer.current);
      void mpRef.current?.leave();
      mpRef.current = null;
      handleRef.current?.destroy();
      handleRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
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

  // Detect touch devices so we can swap arrow buttons for a virtual joystick on the left.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(pointer: coarse)');
    setIsCoarse(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsCoarse(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  // ?race=XYZ URL: someone opened a friend's invite link → auto-join that room. The check
  // runs once on mount, then we clean the URL so a hot reload / share-back doesn't loop us.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const race = params.get('race');
    if (!race) return;
    const code = race.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length < 3) return;
    window.history.replaceState({}, '', window.location.pathname);
    void openMultiplayer(code);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown tick + auto-resume when it hits zero. The overlay is rendered when
  // `countdownEnd` is set; we re-render every 100ms via `countdownTick` so the big number
  // updates smoothly, and unpause the runner the instant the deadline passes.
  useEffect(() => {
    if (countdownEnd == null) return;
    let raf = 0;
    const tick = () => {
      const remainingMs = countdownEnd - Date.now();
      if (remainingMs <= 0) {
        setCountdownEnd(null);
        handleRef.current?.setPaused(false);
        return;
      }
      setCountdownTick((n) => n + 1);
      raf = window.setTimeout(tick, 100) as unknown as number;
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [countdownEnd]);

  // ── Fullscreen (cross-browser) ─────────────────────────────────────────────
  // Standard `requestFullscreen` is unimplemented in Safari — it uses the `webkit*`
  // prefixed variants. iPhone Safari has NO element fullscreen at all (only <video>),
  // but desktop Safari and iPad Safari both work via the prefixed API. We try standard
  // first, then fall back to webkit. Errors are swallowed (some browsers reject when
  // not in a user-gesture handler).
  function getFsElement(): Element | null {
    const d = document as Document & { webkitFullscreenElement?: Element };
    return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
  }
  function requestFs(el: HTMLElement): Promise<void> | undefined {
    const e = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | undefined };
    if (el.requestFullscreen) return el.requestFullscreen();
    if (e.webkitRequestFullscreen) return e.webkitRequestFullscreen();
    return undefined;
  }
  function exitFs(): Promise<void> | undefined {
    const d = document as Document & { webkitExitFullscreen?: () => Promise<void> | undefined };
    if (document.exitFullscreen) return document.exitFullscreen();
    if (d.webkitExitFullscreen) return d.webkitExitFullscreen();
    return undefined;
  }

  // Track fullscreen state so the button can show the right icon. Listen to BOTH the
  // standard and webkit-prefixed change events so the icon stays in sync in Safari too.
  useEffect(() => {
    const h = () => setIsFs(getFsElement() != null);
    document.addEventListener('fullscreenchange', h);
    document.addEventListener('webkitfullscreenchange', h);
    return () => {
      document.removeEventListener('fullscreenchange', h);
      document.removeEventListener('webkitfullscreenchange', h);
    };
  }, []);

  function toggleFullscreen() {
    if (getFsElement()) {
      void exitFs();
    } else if (wrapRef.current) {
      const p = requestFs(wrapRef.current);
      if (p) p.catch(() => {/* user-gesture / iOS-Safari reject */});
    }
  }

  // ── Swipe-anywhere controls (touch devices only) ──────────────────────────────
  // Industry-standard endless-runner controls: swipe ↑/↓/◀/▶ anywhere on the screen to
  // jump / slide / change lane. One swipe = one move, like Subway Surfers. The 💥 button
  // (pinned bottom-left) stops touch propagation so taps on it don't register as swipes.
  // Multi-finger: we track the FIRST touch only — additional fingers (e.g. resting on 💥)
  // are ignored. A new swipe needs a finger lift + re-touch.
  const SWIPE_FIRE = 36; // px from origin → fire the direction
  const swipeIdRef = useRef<number | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeFiredRef = useRef(false); // one swipe per touch — re-touch to swipe again

  const onWrapTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!playing) return;
    // Only register a swipe finger if we don't already have one tracked.
    if (swipeIdRef.current !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    swipeIdRef.current = t.identifier;
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
    swipeFiredRef.current = false;
  };
  const onWrapTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!playing || swipeFiredRef.current || !swipeStartRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      if (t.identifier !== swipeIdRef.current) continue;
      const dx = t.clientX - swipeStartRef.current.x;
      const dy = t.clientY - swipeStartRef.current.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_FIRE) return;
      // Dominant axis wins — clean discrete output even for diagonal swipes.
      const dir =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy < 0 ? 'up' : 'down';
      swipeFiredRef.current = true;
      if (dir === 'right') handleRef.current?.moveRight();
      else if (dir === 'left') handleRef.current?.moveLeft();
      else if (dir === 'up') handleRef.current?.jump();
      else handleRef.current?.slide();
      return;
    }
  };
  const onWrapTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      if (t.identifier === swipeIdRef.current) {
        swipeIdRef.current = null;
        swipeStartRef.current = null;
        swipeFiredRef.current = false;
        return;
      }
    }
  };

  const onUpdate = (s: RunnerStats) => {
    if (s.speed > topSpeedRef.current) topSpeedRef.current = s.speed;
    setStats(s);
  };

  const onGameOver = (distance: number, gems: number, durationSec: number) => {
    const newBest = distance > bestRef.current;
    if (newBest) {
      bestRef.current = distance;
      setBest(distance);
      lsSet('dinoDashBestDist', String(distance));
    }
    const topKmh = Math.round(topSpeedRef.current * 3.6);
    if (topKmh > bestSpeedRef.current) {
      bestSpeedRef.current = topKmh;
      setBestSpeed(topKmh);
      lsSet('dinoDashBestSpeed', String(topKmh));
    }
    const durRounded = Math.round(durationSec);
    if (durRounded > bestTimeRef.current) {
      bestTimeRef.current = durRounded;
      setBestTime(durRounded);
      lsSet('dinoDashBestTime', String(durRounded));
    }
    setFinalScore({ distance, gems, newBest, topSpeed: topSpeedRef.current, durationSec });
    setOver(true);
    if (persistRef.current) {
      void fetch('/api/game/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'runner', distance, gems, topSpeed: topKmh }),
      }).catch(() => {});
    }
  };

  // Format a duration in seconds as "1m 23s" / "45s" — used for both the menu best line and
  // the game-over screen.
  function fmtTime(sec: number) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0 ? `${m}m ${rem}s` : `${s}s`;
  }

  async function start() {
    setStarted(true);
    topSpeedRef.current = 0;
    lsSet('dinoDashDino', selectedDino);
    lsSet('dinoDashView', view);
    // Create + resume audio inside the Play tap (browsers require a gesture to start sound).
    audioRef.current ??= new RunnerAudio();
    const audio = audioRef.current;
    audio.resume();
    // On phones/tablets auto-enter fullscreen so the browser chrome stops eating the screen.
    if (isCoarse && !getFsElement() && wrapRef.current) {
      try {
        await requestFs(wrapRef.current);
      } catch {
        // some browsers / contexts block it — user can still tap ⛶
      }
    }
    const { createRunner } = await import('./runner');
    if (!mountRef.current || handleRef.current) return;
    const opts: RunnerOptions = {
      ...optsForAge(profileRef.current.ageBand),
      character: selectedDino,
      view,
      sfx: {
        jump: () => audio.jump(),
        coin: () => audio.coin(),
        smash: () => audio.smash(),
        hit: () => audio.hit(),
        rune: () => audio.rune(),
        boost: () => audio.boost(),
      },
    };
    handleRef.current = createRunner(mountRef.current, { onUpdate, onGameOver, onRune: showRune }, opts);
  }

  // Multiplayer entrypoint: same as start(), but with the room's seed (deterministic track)
  // and a dedicated game-over hook that tells the server we're finished. The 10Hz pos
  // broadcaster pulls from mpStatsRef, which onUpdate keeps fresh.
  async function startMpRace() {
    const state = mpStateRef.current;
    if (!state) return;
    setStarted(true);
    topSpeedRef.current = 0;
    audioRef.current ??= new RunnerAudio();
    const audio = audioRef.current;
    audio.resume();
    if (isCoarse && !getFsElement() && wrapRef.current) {
      try {
        await requestFs(wrapRef.current);
      } catch {
        // ignore
      }
    }
    const { createRunner } = await import('./runner');
    if (!mountRef.current || handleRef.current) return;
    const opts: RunnerOptions = {
      ...optsForAge(profileRef.current.ageBand),
      character: selectedDino,
      // Use the ROOM's view (set by the host) — every player races in the same camera so
      // nobody gets a tactical advantage from a different perspective.
      view: state.view,
      seed: state.seed,
      sfx: {
        jump: () => audio.jump(),
        coin: () => audio.coin(),
        smash: () => audio.smash(),
        hit: () => audio.hit(),
        rune: () => audio.rune(),
        boost: () => audio.boost(),
      },
    };
    // Wrap createRunner so a WebGL/Three init failure surfaces in the lobby with a real
    // message instead of dumping the player onto a silent blank canvas.
    try {
      handleRef.current = createRunner(
        mountRef.current,
        {
          onUpdate: (s) => {
            mpStatsRef.current = s;
            onUpdate(s);
          },
          onGameOver: (distance, gems, durationSec) => {
            mpRef.current?.finish();
            mpRef.current?.stopPosLoop();
            onGameOver(distance, gems, durationSec);
          },
          onRune: showRune,
        },
        opts,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start the race renderer.';
      // eslint-disable-next-line no-console
      console.error('[runner] startMpRace createRunner failed:', err);
      setMpError(msg);
      setMpScreen('lobby');
      setStarted(false);
      return;
    }
    // Seed in initial opponents (handler in the mpState effect will keep updating after this).
    const ops: RunnerOpponent[] = state.players
      .filter((p) => p.id !== state.myId)
      .map((p) => ({ id: p.id, name: p.name, character: p.character, distance: p.distance, lane: p.lane, y: p.y, finished: p.finished }));
    handleRef.current.setOpponents(ops);
    mpRef.current?.startPosLoop(() => ({
      distance: mpStatsRef.current.distance,
      lane: mpStatsRef.current.lane,
      y: mpStatsRef.current.y,
    }));
  }

  function playAgain() {
    setOver(false);
    setPaused(false);
    setStats(EMPTY_STATS);
    topSpeedRef.current = 0;
    handleRef.current?.restart();
  }

  function toMenu() {
    // Back to the main menu: tear down the running game + any active multiplayer room.
    handleRef.current?.destroy();
    handleRef.current = null;
    void mpRef.current?.leave();
    mpRef.current = null;
    setMpState(null);
    setMpScreen('menu');
    setMpError(null);
    setOver(false);
    setPaused(false);
    setStarted(false);
    setStats(EMPTY_STATS);
    setConfirmQuit(false);
    setCountdownEnd(null);
  }
  // Pause-screen "Menu" goes through this — confirmation prevents accidental quit during
  // an active multiplayer race (where leaving means abandoning your friends mid-race).
  function requestQuit() {
    setConfirmQuit(true);
  }
  function cancelQuit() {
    setConfirmQuit(false);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    lsSet('dinoDashMuted', next ? '1' : '0');
    audioRef.current?.setMuted(next);
  }

  function togglePause(next: boolean) {
    setPaused(next);
    handleRef.current?.setPaused(next);
  }
  // Resume from pause: hide the pause overlay, leave the runner paused, and start a 3-2-1
  // countdown — the countdown tick effect unpauses the runner when it hits zero. Gives the
  // player a fair beat to grab the controls after resuming.
  function resumeWithCountdown() {
    setPaused(false);
    // runner is still paused from togglePause(true); the tick effect will unpause it.
    setCountdownEnd(Date.now() + 3000);
  }

  // D-pad arrow buttons. `touch-manipulation` kills the 300ms tap-delay + double-tap zoom on
  // mobile. Buttons sized larger on coarse-pointer devices so thumbs land cleanly.
  const dpadBtn = isCoarse
    ? 'pointer-events-auto touch-manipulation select-none rounded-full bg-white/25 px-7 py-5 text-3xl font-bold text-white backdrop-blur active:bg-white/45'
    : 'pointer-events-auto touch-manipulation select-none rounded-full bg-white/20 px-5 py-4 text-2xl font-bold text-white backdrop-blur active:bg-white/40';
  const smashSize = isCoarse ? 'px-7 py-5 text-3xl' : 'px-5 py-4 text-2xl';
  const smashReady = 'bg-amber-400 text-slate-900 ring-4 ring-amber-200/80 active:bg-amber-300 touch-manipulation';
  const smashCooling = 'border-2 border-dashed border-white/30 bg-white/5 text-white/25 touch-manipulation';
  const pillBtn = 'pointer-events-auto rounded-full bg-white/20 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/30';
  const pick = (active: boolean) =>
    `pointer-events-auto rounded-xl px-3 py-2 text-sm font-bold backdrop-blur transition ${
      active ? 'bg-white text-emerald-700 ring-2 ring-white' : 'bg-white/20 text-white hover:bg-white/30'
    }`;
  // "Playing" = a run is active. Used to gate the joystick handlers + touchAction so that the
  // menu / how-to / pause / game-over overlays scroll natively on landscape phones.
  const playing = started && !over && !paused && !showHowTo;
  // Reusable scroll-overlay shell (fixed-to-viewport so heights don't depend on the wrap div
  // chain, with iOS momentum scroll + overscroll containment for predictable touch panning).
  const scrollShellStyle: React.CSSProperties = { WebkitOverflowScrolling: 'touch', touchAction: 'auto' };

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full bg-sky-200"
      // Block browser scroll/zoom only during active play. Touch handlers drive the split-axis
      // joysticks on coarse-pointer devices; desktop uses the D-pad buttons instead.
      style={{ touchAction: playing ? 'none' : 'auto' }}
      onTouchStart={isCoarse && playing ? onWrapTouchStart : undefined}
      onTouchMove={isCoarse && playing ? onWrapTouchMove : undefined}
      onTouchEnd={isCoarse && playing ? onWrapTouchEnd : undefined}
      onTouchCancel={isCoarse && playing ? onWrapTouchEnd : undefined}
    >
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
          {stats.combo > 1 && <div className="text-base font-black text-amber-300 drop-shadow">🔥 Combo x{stats.combo}</div>}
          {best > 0 && <div className="text-xs font-semibold text-white/80">Best: {best}m</div>}
        </div>
      )}

      {/* Sound + Pause (in-game) */}
      {started && !over && (
        <>
          <button type="button" onClick={toggleMute} className={`${pillBtn} absolute right-3 top-2`}>
            {muted ? '🔇' : '🔊'}
          </button>
          {!paused && (
            <button type="button" onClick={() => togglePause(true)} className={`${pillBtn} absolute right-3 top-14`}>
              ⏸ Pause
            </button>
          )}
          <button type="button" onClick={toggleFullscreen} className={`${pillBtn} absolute right-3 top-[6.5rem]`}>
            {isFs ? '✕' : '⛶'}
          </button>
        </>
      )}

      {/* 3-2-1 GO countdown — used both for the multiplayer race start (server "countdown"
          phase) and the resume-from-pause grace period. While the overlay is up, the runner
          is paused; the tick effect auto-resumes when the deadline passes. */}
      {countdownEnd != null && (() => {
        const remainingMs = countdownEnd - Date.now();
        const n = Math.max(0, Math.ceil(remainingMs / 1000));
        const label = remainingMs < 350 ? 'GO!' : String(n);
        // `countdownTick` referenced to force re-render every 100ms
        void countdownTick;
        return (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
            <div className={`text-[14rem] font-black leading-none text-white drop-shadow-2xl ${label === 'GO!' ? 'text-emerald-300' : ''}`}>
              {label}
            </div>
          </div>
        );
      })()}

      {/* Rune reward — what you got from a smashed box */}
      {runeMsg && (
        <div className="pointer-events-none absolute left-1/2 top-[26%] -translate-x-1/2 animate-pulse rounded-2xl bg-emerald-500/90 px-6 py-3 text-center text-2xl font-black text-white shadow-lg">
          {runeMsg}!
        </div>
      )}
      {charging && (
        <div className="pointer-events-none absolute left-1/2 top-[26%] -translate-x-1/2 rounded-2xl bg-slate-800/90 px-5 py-2.5 text-center text-lg font-bold text-white shadow-lg">
          ⏳ Power charging…
        </div>
      )}

      {/* ───────── MAIN MENU (first screen on launch) ─────────
          fixed-to-viewport so the scroll context never depends on any ancestor's computed
          height (some mobile Chrome builds collapse percentage min-heights through flex chains
          and break the scroll). min-h-[100dvh] inner centers on tall screens, scrolls on
          short ones (landscape phones). */}
      {!started && (
        <div className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-gradient-to-b from-sky-400 to-emerald-500 text-white" style={scrollShellStyle}>
          <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 py-6 text-center">
            <div className="text-6xl drop-shadow-lg">🦖</div>
            <h1 className="text-4xl font-black tracking-tight drop-shadow-lg">Dino Dash</h1>
            <p className="-mt-2 text-sm font-semibold text-white/90">Run, dodge, smash &amp; dash as far as you can!</p>
            {best > 0 && (
              <p className="text-sm font-bold text-amber-200 drop-shadow">
                🏆 Best: {best}m · {bestSpeed} km/h{bestTime > 0 && <> · ⏱ {fmtTime(bestTime)}</>}
              </p>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/70">Your dino</p>
              <div className="flex gap-2">
                {DINOS.map((d) => (
                  <button key={d.id} type="button" className={pick(selectedDino === d.id)} onClick={() => setSelectedDino(d.id)}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/70">Camera</p>
              <div className="flex gap-2">
                <button type="button" className={pick(view === 'follow')} onClick={() => setView('follow')}>
                  🎥 Follow
                </button>
                <button type="button" className={pick(view === 'close')} onClick={() => setView('close')}>
                  🦖 Close
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void start()}
              className="pointer-events-auto mt-2 rounded-full bg-amber-400 px-12 py-4 text-2xl font-black text-slate-900 shadow-lg ring-4 ring-white/60 transition hover:bg-amber-300 active:scale-95"
            >
              ▶ PLAY
            </button>

            <button
              type="button"
              onClick={() => void openMultiplayer()}
              className="pointer-events-auto rounded-full bg-fuchsia-500 px-8 py-3 text-lg font-black text-white shadow-lg ring-2 ring-white/40 transition hover:bg-fuchsia-400 active:scale-95"
            >
              🏁 Race with friends
            </button>

            <div className="mt-1 flex flex-wrap justify-center gap-3">
              <button type="button" className={pillBtn} onClick={toggleMute}>
                {muted ? '🔇 Sound off' : '🔊 Sound on'}
              </button>
              <button type="button" className={pillBtn} onClick={toggleFullscreen}>
                {isFs ? '✕ Exit fullscreen' : '⛶ Fullscreen'}
              </button>
              <button type="button" className={pillBtn} onClick={() => setShowHowTo(true)}>
                ❓ How to play
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multiplayer lobby — auto-hosted on click; the host shares an invite link (or code)
          and friends arrive via that link. Bottom toggle switches to manual "join with code"
          for players who got a code via voice/text instead of a clickable link. */}
      {mpScreen === 'lobby' && !started && (
        <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-gradient-to-b from-fuchsia-900 to-slate-950 text-white" style={scrollShellStyle}>
          <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 py-6 text-center">
            <div className="text-5xl">🏁</div>
            <h2 className="text-3xl font-black">Race with friends</h2>

            {/* Manual "I have a code" join form — only shown while NOT connected and the user
                clicked the toggle below. Otherwise we auto-host (no chooser). */}
            {mpJoinMode && !mpState && (
              <>
                <p className="max-w-md text-sm text-white/80">Enter the code your friend shared.</p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-white/70">Your name</label>
                  <input
                    type="text"
                    value={mpName}
                    maxLength={16}
                    onChange={(e) => setMpName(e.target.value.replace(/[^A-Za-z0-9 ._-]/g, ''))}
                    className="pointer-events-auto rounded-xl bg-white/15 px-4 py-2 text-center text-lg font-bold text-white outline-none ring-2 ring-white/30 focus:ring-white/60"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-white/70">Room code</label>
                  <input
                    type="text"
                    value={mpCode}
                    maxLength={6}
                    autoFocus
                    onChange={(e) => setMpCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    className="pointer-events-auto rounded-xl bg-white/15 px-4 py-2 text-center text-2xl font-black tracking-widest text-white outline-none ring-2 ring-white/30 focus:ring-white/60"
                    placeholder="ABCD"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void mpJoinTypedCode()}
                  disabled={mpConnecting || mpCode.length < 3 || !mpName}
                  className="pointer-events-auto rounded-full bg-emerald-500 px-10 py-3 text-xl font-black text-white shadow-lg ring-2 ring-white/40 transition hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
                >
                  🔑 Join race
                </button>
              </>
            )}

            {mpConnecting && !mpState && <p className="text-sm text-white/70">Connecting…</p>}
            {mpError && !mpState && (
              <p className="max-w-md rounded-xl bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 ring-1 ring-red-300/40">
                ⚠ {mpError}
                <span className="mt-1 block text-xs text-red-200/70">
                  Server URL: <code className="font-mono">{defaultServerUrl()}</code>
                  <br />
                  {mpError.includes('Invalid URL')
                    ? 'Your NEXT_PUBLIC_COLYSEUS_URL env var is malformed. It must start with wss:// (or ws:// for dev).'
                    : 'Is the race server running and reachable? See DEPLOY.md / MULTIPLAYER.md.'}
                </span>
              </p>
            )}

            {/* Connected — show invite link, players list, ready toggle */}
            {mpState && (
              <>
                <div className="rounded-2xl bg-white/10 px-6 py-3 ring-2 ring-white/30">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Room code</p>
                  <p className="font-mono text-5xl font-black tracking-widest text-amber-200">{mpCode}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-white/60">
                    Camera (host’s pick): {mpState.view === 'close' ? '🦖 Close' : '🎥 Follow'}
                  </p>
                </div>

                <div className="flex w-full max-w-md flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Invite friends</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={inviteUrl()}
                      readOnly
                      onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                      className="pointer-events-auto flex-1 truncate rounded-xl bg-black/30 px-3 py-2 text-left text-xs text-white/90 outline-none ring-1 ring-white/20"
                    />
                    <button
                      type="button"
                      onClick={() => void copyInvite()}
                      className="pointer-events-auto shrink-0 rounded-xl bg-white/20 px-3 py-2 text-sm font-bold hover:bg-white/30"
                    >
                      {mpCopied ? '✓ Copied' : '📋 Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void shareInvite()}
                      className="pointer-events-auto shrink-0 rounded-xl bg-white/20 px-3 py-2 text-sm font-bold hover:bg-white/30"
                    >
                      📤 Share
                    </button>
                  </div>
                  <p className="text-[10px] text-white/50">Or read them the code: <b className="font-mono">{mpCode}</b> (they tap “I have a code” below).</p>
                </div>

                <div className="w-full max-w-md">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Players ({mpState.players.length}/4)</p>
                  <ul className="flex flex-col gap-1.5">
                    {mpState.players.map((p) => (
                      <li
                        key={p.id}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 ring-1 ${
                          p.id === mpState.myId ? 'bg-amber-400/20 ring-amber-300/60' : 'bg-white/10 ring-white/20'
                        }`}
                      >
                        <span className="font-bold">
                          🦖 {p.name} {p.id === mpState.myId && <span className="text-xs text-amber-200">(you)</span>}
                        </span>
                        <span className={`text-sm font-semibold ${p.ready ? 'text-emerald-300' : 'text-white/60'}`}>
                          {p.ready ? '✓ ready' : 'waiting'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {mpState.phase === 'countdown' && (
                  <p className="text-2xl font-black text-amber-200">
                    Starting in {Math.max(0, Math.ceil((mpState.startsAt - Date.now()) / 1000))}…
                  </p>
                )}
                {mpState.phase === 'lobby' && (
                  <button
                    type="button"
                    onClick={mpToggleReady}
                    className={`pointer-events-auto rounded-full px-10 py-3 text-xl font-black shadow-lg ring-2 ring-white/40 transition active:scale-95 ${
                      mpState.players.find((p) => p.id === mpState.myId)?.ready
                        ? 'bg-white/30 text-white hover:bg-white/40'
                        : 'bg-emerald-500 text-white hover:bg-emerald-400'
                    }`}
                  >
                    {mpState.players.find((p) => p.id === mpState.myId)?.ready ? '✕ Not ready' : "✓ I'm ready!"}
                  </button>
                )}
                <p className="text-xs text-white/60">Race starts when 2+ players are ready.</p>
              </>
            )}

            {/* Footer: join-mode toggle + back to menu */}
            <div className="mt-2 flex flex-col items-center gap-2">
              {!mpState && !mpJoinMode && (
                <button
                  type="button"
                  onClick={() => void switchToJoinMode()}
                  className="pointer-events-auto text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline"
                >
                  🔑 Have a code? Join one instead
                </button>
              )}
              <button
                type="button"
                onClick={closeMultiplayer}
                className="pointer-events-auto rounded-full bg-white/15 px-5 py-2 text-sm font-semibold hover:bg-white/25"
              >
                ← Back to menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live leaderboard during a race — shows everyone's distance in real time. */}
      {playing && mpScreen === 'race' && mpState && (
        <div className="pointer-events-none absolute right-3 top-32 z-10 rounded-xl bg-black/40 px-3 py-2 text-xs font-bold text-white backdrop-blur">
          <p className="mb-1 text-white/70">🏁 Race</p>
          {[...mpState.players]
            .sort((a, b) => b.distance - a.distance)
            .map((p, i) => (
              <div key={p.id} className={p.id === mpState.myId ? 'text-amber-200' : 'text-white/90'}>
                {i + 1}. {p.name}: {Math.floor(p.distance)}m {p.finished && '🏁'}
              </div>
            ))}
        </div>
      )}

      {/* How-to-play overlay (from the menu) — same scroll pattern as the menu. */}
      {showHowTo && !started && (
        <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-slate-900/90 text-white" style={scrollShellStyle}>
          <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-8 py-6 text-center">
            <h2 className="text-2xl font-black">How to play</h2>
            <ul className="space-y-1.5 text-left text-sm">
              <li>📱 Mobile / tablet: <b>swipe ↑↓◀▶ anywhere</b> on the screen — up = jump, down = slide, left/right = change lane. Tap <b>💥 (bottom-left)</b> to smash.</li>
              <li>⌨️ Desktop: ←/→ switch lane · ↑/Space jump · ↓ slide · E smash · P pause</li>
              <li>🟫 Ground box → jump over OR land on top</li>
              <li>🟦 Flying bar → slide under (no jumping over)</li>
              <li>💥 Tap once to smash 🟨 gold for a rune. 📦 crates need <b>two fast taps</b> — finish them for a 🎰 JACKPOT! (3s cooldown after a break)</li>
              <li>💎 Grab coins — chain them for a 🔥 combo · ⚡ boosts go faster</li>
              <li>❤️ Don&apos;t lose all your hearts!</li>
            </ul>
            <button type="button" onClick={() => setShowHowTo(false)} className="pointer-events-auto mt-2 rounded-full bg-emerald-500 px-6 py-2.5 font-bold hover:bg-emerald-600">
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Desktop D-pad — buttons + smash, hidden on touch (touch uses the joysticks below). */}
      {playing && !isCoarse && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-end justify-between px-4">
          <div className="flex gap-2">
            <button type="button" className={dpadBtn} onPointerDown={() => handleRef.current?.moveLeft()} aria-label="Lane left">
              ◀
            </button>
            <button type="button" className={dpadBtn} onPointerDown={() => handleRef.current?.moveRight()} aria-label="Lane right">
              ▶
            </button>
          </div>
          <button
            type="button"
            className={`pointer-events-auto relative select-none rounded-full ${smashSize} font-bold backdrop-blur transition ${
              stats.breakReady ? smashReady : smashCooling
            }`}
            onPointerDown={smashTap}
            aria-label="Smash"
          >
            💥
          </button>
          <div className="flex gap-2">
            <button type="button" className={dpadBtn} onPointerDown={() => handleRef.current?.slide()} aria-label="Slide">
              ▼
            </button>
            <button type="button" className={dpadBtn} onPointerDown={() => handleRef.current?.jump()} aria-label="Jump">
              ▲
            </button>
          </div>
        </div>
      )}

      {/* Touch UI: swipe anywhere ↑↓◀▶ to move + 💥 button pinned bottom-left. The wrap div's
          onTouchStart/Move/End above translate finger drags into discrete moves; the 💥 button
          stops propagation so a tap on it never registers as a swipe. */}
      {playing && isCoarse && (
        <>
          <button
            type="button"
            className={`pointer-events-auto absolute bottom-4 left-4 z-20 select-none touch-manipulation rounded-full ${smashSize} font-bold backdrop-blur transition ${
              stats.breakReady ? smashReady : smashCooling
            }`}
            onTouchStart={(e) => {
              e.stopPropagation();
              smashTap();
            }}
            aria-label="Smash"
          >
            💥
          </button>

          {/* Idle hint near the bottom-right — clears up once player makes a move. */}
          <div className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur">
            swipe ↑↓◀▶ anywhere
          </div>
        </>
      )}

      {/* Paused — scrollable in case landscape phone keyboard or browser chrome leaves no room. */}
      {paused && !over && (
        <div className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-slate-900/70 text-white" style={scrollShellStyle}>
          <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 py-6 text-center">
            <div className="text-5xl">⏸️</div>
            <h2 className="text-2xl font-black">Paused</h2>
            <div className="flex gap-3">
              <button type="button" onClick={resumeWithCountdown} className="rounded-full bg-emerald-500 px-6 py-3 text-lg font-bold text-white hover:bg-emerald-600">
                ▶ Resume
              </button>
              <button type="button" onClick={requestQuit} className="rounded-full bg-white/20 px-6 py-3 text-lg font-bold text-white hover:bg-white/30">
                🏠 Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quit confirmation — gates the Pause → Menu transition. Multiplayer message tells
          the player their friends will keep racing without them. The runner stays paused
          (or running) underneath; we don't tear anything down until they confirm. */}
      {confirmQuit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/80 px-6 text-center text-white">
          <div className="max-w-md rounded-2xl bg-slate-800 px-6 py-5 ring-2 ring-white/20">
            <div className="mb-2 text-4xl">⚠️</div>
            <h3 className="mb-1 text-xl font-black">Quit this run?</h3>
            <p className="mb-4 text-sm text-white/80">
              {mpScreen === 'race'
                ? 'Your friends will keep racing without you. You can rejoin the same code only if they restart.'
                : 'Your current run will end and progress this run will be lost.'}
            </p>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={cancelQuit} className="rounded-full bg-white/15 px-5 py-2 text-sm font-bold hover:bg-white/25">
                ← Keep playing
              </button>
              <button type="button" onClick={toMenu} className="rounded-full bg-red-500 px-5 py-2 text-sm font-bold hover:bg-red-600">
                🏠 Quit to menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game over — same scroll pattern as the menu. */}
      {over && (
        <div className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-slate-900/70 text-white" style={scrollShellStyle}>
          <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 py-6 text-center">
            <div className="text-5xl">{finalScore.newBest ? '🏆' : '🏁'}</div>
            {finalScore.newBest ? (
              <h2 className="text-3xl font-black text-amber-300">New best! 🎉</h2>
            ) : (
              <h2 className="text-2xl font-black">Nice run!</h2>
            )}
            <p>
              🏃 {finalScore.distance}m · 💎 {finalScore.gems} · ⏱ {fmtTime(finalScore.durationSec)}
            </p>
            <p className="text-sm font-semibold text-amber-200">💨 Top speed: {Math.round(finalScore.topSpeed * 3.6)} km/h</p>
            {!finalScore.newBest && best > 0 && (
              <p className="text-sm text-white/70">
                Best: {best}m{bestTime > 0 && <> · ⏱ {fmtTime(bestTime)}</>}
              </p>
            )}
            <div className="mt-1 flex gap-3">
              <button type="button" onClick={playAgain} className="rounded-full bg-emerald-500 px-6 py-3 text-lg font-bold text-white hover:bg-emerald-600">
                ▶ Play again
              </button>
              <button type="button" onClick={toMenu} className="rounded-full bg-white/20 px-6 py-3 text-lg font-bold text-white hover:bg-white/30">
                🏠 Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
