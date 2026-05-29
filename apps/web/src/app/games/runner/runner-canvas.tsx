'use client';

import { useEffect, useRef, useState } from 'react';

import type { DinoType } from './dino-character';
import { defaultServerUrl, makeRoomCode, Multiplayer, type AbilityEvent, type AbilityKind, type BoxHitEvent, type MpPlayer, type MpState } from './multiplayer';
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

const EMPTY_STATS: RunnerStats = { distance: 0, gems: 0, hearts: 3, shield: false, magnet: false, speed: 0, breakReady: true, breakCooldownProgress: 1, combo: 1, lane: 1, y: 0, abilityCharge: 0, heldAbility: null };

/** Smash-cooldown gauge — sits above the ⚡ ability button so both action gauges are
 *  in the player's peripheral vision. Same conic-gradient pattern as the ability fill
 *  so the visual language is consistent. */
function SmashIndicator({ breakReady, progress }: { breakReady: boolean; progress: number }) {
  const SMASH_CD_S = 1.2; // mirrors BREAK_COOLDOWN_S in runner.ts
  const p = Math.max(0, Math.min(1, progress));
  const remainingS = (1 - p) * SMASH_CD_S;
  const ringStyle: React.CSSProperties = breakReady
    ? { background: '#fbbf24' }
    : { background: `conic-gradient(from -90deg, #fbbf24 ${p * 360}deg, rgba(255,255,255,0.12) ${p * 360}deg)` };
  return (
    <div className={`pointer-events-none inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold backdrop-blur ${breakReady ? 'bg-amber-400/20 text-amber-200' : 'bg-black/50 text-white/80'}`}>
      <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full" style={ringStyle}>
        <span className="absolute inset-1 rounded-full bg-slate-900/85" />
        <span className={`relative ${breakReady ? '' : 'opacity-60'}`}>💥</span>
      </span>
      <span className="whitespace-nowrap">{breakReady ? 'Ready' : `${remainingS.toFixed(1)}s`}</span>
    </div>
  );
}

const DINOS: { id: DinoType; label: string }[] = [
  { id: 'trik', label: '🕸️ Trik' },
  { id: 'stego', label: '❄️ Stego' },
  { id: 'brachio', label: '⚡ Brachio' },
  { id: 'trex', label: '📦 Trex' },
];

// ── Bot AI ────────────────────────────────────────────────────────────────────────
type BotDifficulty = 'easy' | 'normal' | 'hard';

interface Bot {
  id: string;
  name: string;
  character: DinoType;
  distance: number;
  lane: number;
  y: number;
  speed: number; // internal units/sec
  hearts: number;
  finished: boolean;
  // AI state
  laneChangeAt: number; // epoch-ms — when to next consider switching lanes
  abilityCharge: number; // 0..100
  abilityReadyAt: number; // epoch-ms — earliest moment to fire next ability
  frozenUntil: number; // own immobilise state (set by other players' Freeze / Trap)
  stunSpeedCapUntil: number; // own slow state (set by Thunder / Water)
  jumpEndsAt: number; // epoch-ms — when current jump animation ends; 0 = not jumping
}

interface BotProfile {
  baseSpeed: number;
  speedVariance: number;
  abilityChance: number; // when ready, % chance to actually cast
  abilityTargetsPlayer: boolean; // hard mode only
  laneSmartness: number; // 0..1 — higher = more likely to chase player's lane
}
const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: { baseSpeed: 10.5, speedVariance: 1.5, abilityChance: 0, abilityTargetsPlayer: false, laneSmartness: 0 },
  normal: { baseSpeed: 12.5, speedVariance: 2.5, abilityChance: 0.45, abilityTargetsPlayer: false, laneSmartness: 0.25 },
  hard: { baseSpeed: 15, speedVariance: 3, abilityChance: 0.7, abilityTargetsPlayer: true, laneSmartness: 0.55 },
};

// Whimsical bot name pool — different vibes so 3 bots in a race read distinctly.
const BOT_NAME_POOL = [
  'Speedy', 'Thunder', 'Tanky', 'Webby', 'Frosty', 'Boom', 'Stomp', 'Roar',
  'Zappy', 'Spike', 'Swift', 'Crunch', 'Blitz', 'Smash', 'Dash',
];
function pickBotNames(n: number): string[] {
  const pool = [...BOT_NAME_POOL];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (pool.length === 0) {
      out.push(`Bot${i + 1}`);
      continue;
    }
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}
// 3 bots → assign distinct dinos from {trik, stego, brachio} (skip trex for AoE comfort).
// 4+ would include trex; capped at 3 here so we never run out of unique slots.
function pickBotDinos(n: number, exclude: DinoType): DinoType[] {
  const all: DinoType[] = ['trik', 'stego', 'brachio', 'trex'];
  // Shuffle and prefer not matching the player's dino — keeps variety.
  const pool = all.filter((d) => d !== exclude);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const out: DinoType[] = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]!);
  return out;
}

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
  // PvP receiver overlay — set when a rival hits us; cleared automatically when expired.
  // The runner.ts handles input-blocking; this is purely a visual cue on OUR screen.
  const [hitOverlay, setHitOverlay] = useState<{ kind: AbilityKind; until: number } | null>(null);
  // Per-caster grace window — after a hit from caster X lands on us, ignore another hit
  // from X for HIT_GRACE_MS. Prevents the cheap "spam Q to perma-freeze the same victim".
  // Tracks epoch-ms when we're vulnerable again, keyed by casterId.
  const HIT_GRACE_MS = 500;
  const hitGraceRef = useRef<Map<string, number>>(new Map());
  // PvP visual state for OTHER players (not just us) — when we hear an ability event in
  // MP we mark target ghosts as frozen/stunned for the effect duration so the local
  // ghost tint reflects what landed on them. Cleared when the timer elapses.
  const ghostFrozenRef = useRef<Map<string, number>>(new Map()); // id → frozenUntil epoch-ms
  const ghostStunnedRef = useRef<Map<string, number>>(new Map()); // id → stunnedUntil epoch-ms

  // ── Bot AI state ────────────────────────────────────────────────────────────
  // botSetup, when non-null during a run, drives the local-only bot simulation. The
  // bot tick interval ticks them at 10Hz (matches the MP position sync rate). Bots
  // are passed to the runner as RunnerOpponents — same code path as multiplayer
  // ghosts — so visuals + collision come "for free".
  const [showBotSetup, setShowBotSetup] = useState(false);
  const [botCount, setBotCount] = useState(2);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const botsRef = useRef<Bot[]>([]);
  const botBoxesRef = useRef<{ id: string; ownerId: string; type: 'water' | 'fire' | 'trap'; lane: number; distance: number }[]>([]);
  const botTickRef = useRef<number | null>(null);
  const botModeRef = useRef<{ difficulty: BotDifficulty } | null>(null);
  // setInterval captures closure values at call time → state changes (paused, countdown)
  // don't propagate into tickBots. Mirror them to refs so the tick sees the latest values.
  const pausedRef = useRef(false);
  const countdownEndRef = useRef<number | null>(null);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    countdownEndRef.current = countdownEnd;
  }, [countdownEnd]);
  const PLAYER_SELF_ID = 'self'; // synthetic id used for the local player in bot mode
  // Kill-feed: rolling log of who cast what on whom. Max 4 visible, each fades after 3s.
  // Structured (not HTML) so player names render through React's normal escaping — no XSS.
  interface FeedEntry {
    id: number;
    until: number;
    kind: AbilityKind;
    /** Optional verb override (used by box-hit entries to show the specific type
     *  — burned/soaked/trapped — instead of the default per-kind verb). */
    verb?: string;
    casterName: string;
    casterIsMe: boolean;
    targets: { name: string; isMe: boolean }[];
    fizzled: boolean; // caster fired but nobody in range
  }
  const [feedEvents, setFeedEvents] = useState<FeedEntry[]>([]);
  const feedIdRef = useRef(0);
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

  // The on-screen ⚡ button is the ABILITY trigger. The charge bar only fills when the
  // player breaks an Ability Box (see runner.ts). In multiplayer the ability is a PvP
  // shot — we tell the server which kind based on the local dino, the server picks the
  // target, broadcasts an event, and the target's client applies the effect locally.
  // Random ability system: the dino no longer determines the cast — the box does.
  // `stats.heldAbility` (from runner.ts) tells us which one is queued, if any.
  function abilityIconFor(kind: AbilityKind | null): string {
    if (kind === 'freeze') return '❄️';
    if (kind === 'thunder') return '⚡';
    if (kind === 'box') return '📦';
    if (kind === 'pull') return '🕸️';
    return '⚡'; // empty — placeholder glyph; the dim style tells the player it's not ready
  }
  const abilityIcon = abilityIconFor(stats.heldAbility);
  function fireAbility() {
    const kind = stats.heldAbility;
    if (!kind) {
      showCharging();
      return;
    }
    if (mpScreen === 'race' && mpRef.current) {
      // Multiplayer: server picks targets + broadcasts back via onAbility.
      mpRef.current.ability(kind);
      handleRef.current?.consumeAbilityCharge();
    } else if (botModeRef.current && botsRef.current.length > 0) {
      // Solo-vs-bots: targets bots locally (visible-first / weighted-random).
      castPlayerAbilityOnBots(kind);
      handleRef.current?.consumeAbilityCharge();
    } else {
      // Pure solo: held ability becomes a local boost (see runner.ts castAbility).
      handleRef.current?.useAbility();
    }
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
        onAbility: handleAbilityEvent,
        onBoxHit: handleBoxHitEvent,
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

  // Receive a PvP ability broadcast from the server. Four things might happen:
  //  1. Push to the kill-feed (everyone sees who hit whom).
  //  2. CASTER → flash a cast-confirm rune.
  //  3. TARGET (with grace check) → apply the effect locally + show the receiver overlay.
  //  4. Cast fizzled (no targets) → caster gets a "no target" hint.
  function handleAbilityEvent(e: AbilityEvent) {
    const myId = mpStateRef.current?.myId;
    if (!myId) return;
    const state = mpStateRef.current;
    const casterName = state?.players.find((p) => p.id === e.casterId)?.name ?? 'someone';
    const casterIsMe = e.casterId === myId;
    // 1. Kill-feed — all clients see who cast what on whom.
    if (e.targetIds.length === 0) {
      // Only the caster cares about a fizzle.
      if (casterIsMe) pushFeed({ kind: e.kind, casterName, casterIsMe: true, targets: [], fizzled: true });
    } else {
      const targets = e.targetIds.map((tid) => ({
        name: state?.players.find((p) => p.id === tid)?.name ?? 'someone',
        isMe: tid === myId,
      }));
      pushFeed({ kind: e.kind, casterName, casterIsMe, targets, fizzled: false });
    }
    // 2. Visual beam(s) — colour-coded by ability kind. From caster → each target.
    //    'self' resolves on the runner side via the locally-known dino position.
    const beamColor = e.kind === 'freeze' ? 0x60a5fa : e.kind === 'pull' ? 0xef4444 : e.kind === 'thunder' ? 0xfde047 : 0xa78bfa;
    const nowMs = Date.now();
    for (const tid of e.targetIds) {
      const from: string | 'self' = e.casterId === myId ? 'self' : e.casterId;
      const to: string | 'self' = tid === myId ? 'self' : tid;
      handleRef.current?.showAbilityBeam(from, to, beamColor);
      // Mark target ghosts so their dinos render with the right tint locally — this
      // also runs for the caster's screen so YOU see your spell land visibly.
      if (tid !== myId) {
        if (e.kind === 'freeze') ghostFrozenRef.current.set(tid, nowMs + 2000);
        else if (e.kind === 'thunder') ghostStunnedRef.current.set(tid, nowMs + 1500);
        else if (e.kind === 'pull') ghostStunnedRef.current.set(tid, nowMs + 600); // brief flash
      }
    }
    // 3. Caster confirmation — show WHO we hit (target name) so the cast doesn't feel
    //    anonymous. Thunder may have multiple targets; join them with commas.
    if (e.casterId === myId) {
      if (e.targetIds.length === 0) {
        showRune('🌫️ no target');
      } else {
        const verb = e.kind === 'freeze' ? '❄️ FROZE' : e.kind === 'pull' ? '🕸️ PULLED' : e.kind === 'thunder' ? '⚡ ZAPPED' : '📦 DROPPED';
        const names = e.targetIds
          .map((tid) => state?.players.find((p) => p.id === tid)?.name ?? 'someone')
          .join(', ');
        showRune(`${verb} ${names}`);
      }
      return;
    }
    if (!e.targetIds.includes(myId)) return; // not for us
    // 4. Target — grace check prevents spam-locking the same victim by the same caster.
    const now = Date.now();
    const graceUntil = hitGraceRef.current.get(e.casterId) ?? 0;
    if (now < graceUntil) return;
    hitGraceRef.current.set(e.casterId, now + HIT_GRACE_MS);
    // Apply effect + overlay
    if (e.kind === 'freeze') {
      handleRef.current?.applyFreeze(2000);
      setHitOverlay({ kind: 'freeze', until: now + 2000 });
    } else if (e.kind === 'pull') {
      handleRef.current?.applyHit();
      setHitOverlay({ kind: 'pull', until: now + 1000 });
    } else if (e.kind === 'thunder') {
      handleRef.current?.applyStun(1500);
      setHitOverlay({ kind: 'thunder', until: now + 1500 });
    }
  }
  function abilityVerb(kind: AbilityKind): string {
    if (kind === 'freeze') return '❄️ froze';
    if (kind === 'pull') return '🕸️ pulled';
    if (kind === 'thunder') return '⚡ zapped';
    return '📦 trapped';
  }
  // A Trex Leave-Box was consumed (by anyone). Tell the runner to drop its local mesh
  // so the box vanishes consistently across all clients + push the kill-feed entry.
  function handleBoxHitEvent(e: BoxHitEvent) {
    handleRef.current?.forgetDroppedBox(e.boxId);
    const state = mpStateRef.current;
    if (!state) return;
    const ownerName = state.players.find((p) => p.id === e.ownerId)?.name ?? 'someone';
    const victimName = state.players.find((p) => p.id === e.victimId)?.name ?? 'someone';
    const ownerIsMe = e.ownerId === state.myId;
    const victimIsMe = e.victimId === state.myId;
    const verb = e.type === 'fire' ? '🔥 burned' : e.type === 'water' ? '💧 soaked' : '📦 trapped';
    pushFeed({
      kind: 'box',
      verb,
      casterName: ownerName,
      casterIsMe: ownerIsMe,
      targets: [{ name: victimName, isMe: victimIsMe }],
      fizzled: false,
    });
  }

  // ── Bot tick ────────────────────────────────────────────────────────────────
  // Runs at 10Hz while a bot-mode run is active. Advances bot positions, decides
  // lane changes + ability casts, resolves bot-vs-box collisions, then pushes the
  // latest snapshot to the runner as opponents + dropped-boxes.
  function tickBots(dt: number) {
    if (!handleRef.current) return;
    const mode = botModeRef.current;
    if (!mode) return;
    // Bots wait through the 3-2-1 countdown AND through any pause — otherwise they
    // sprint ahead while the player is staring at "3, 2, 1". Still sync mesh
    // positions at the current values so they appear at the spawn-spread positions.
    const inCountdown = countdownEndRef.current != null && Date.now() < countdownEndRef.current;
    if (pausedRef.current || inCountdown) {
      const ops: RunnerOpponent[] = botsRef.current.map((b) => ({
        id: b.id,
        name: b.name,
        character: b.character,
        distance: b.distance,
        lane: b.lane,
        y: b.y,
        finished: b.finished,
        frozen: Date.now() < b.frozenUntil,
        stunned: Date.now() < b.stunSpeedCapUntil,
      }));
      handleRef.current.setOpponents(ops);
      handleRef.current.setDroppedBoxes(botBoxesRef.current);
      return;
    }
    const profile = BOT_PROFILES[mode.difficulty];
    const now = Date.now();
    const playerDistance = mpStatsRef.current.distance;
    const playerLane = mpStatsRef.current.lane;
    const myHearts = mpStatsRef.current.hearts;
    const playerAlive = myHearts > 0 && !over;

    // 1. Tick each bot.
    for (const bot of botsRef.current) {
      if (bot.finished) continue;
      // Hearts hit zero → bot is done. Stays in the world but stops acting.
      if (bot.hearts <= 0) {
        bot.finished = true;
        pushFeed({ kind: 'pull', verb: '💀 collapsed', casterName: bot.name, casterIsMe: false, targets: [], fizzled: true });
        continue;
      }
      // Frozen by another player's Freeze / Trap → can't move or act.
      if (now < bot.frozenUntil) continue;

      // Move forward (effective speed factors in stun-cap).
      let eff = bot.speed;
      if (now < bot.stunSpeedCapUntil) eff = Math.min(eff, 7);
      bot.distance += eff * dt;
      // Gradually recover from stun-cap by drifting speed back to base.
      if (now >= bot.stunSpeedCapUntil && bot.speed < profile.baseSpeed) {
        bot.speed = Math.min(profile.baseSpeed + bot.speed * 0.001, bot.speed + dt * 2);
      }

      // Lane change decision. Slower cadence + only 1-step changes (no teleporting from
      // lane 0 to lane 2 in one tick) so bots read as deliberate rather than jittery.
      if (now > bot.laneChangeAt) {
        if (Math.random() < 0.4) {
          let target = bot.lane;
          if (Math.random() < profile.laneSmartness && playerAlive) {
            // Step toward the player's lane by one (not snap).
            if (playerLane > bot.lane) target = bot.lane + 1;
            else if (playerLane < bot.lane) target = bot.lane - 1;
          } else {
            // Random ±1 step (or stay).
            target = bot.lane + (Math.random() < 0.5 ? -1 : 1);
          }
          bot.lane = Math.max(0, Math.min(2, target));
        }
        bot.laneChangeAt = now + 2200 + Math.random() * 2500;
      }
      // Random jumps so bots look alive instead of gliding on rails. Triggered while
      // grounded; the y position is recomputed each frame from a half-sine curve until
      // jumpEndsAt elapses.
      if (bot.jumpEndsAt === 0 && Math.random() < 0.012) {
        bot.jumpEndsAt = now + 600; // 600ms jump arc
      }
      if (bot.jumpEndsAt > 0) {
        if (now >= bot.jumpEndsAt) {
          bot.y = 0;
          bot.jumpEndsAt = 0;
        } else {
          const progress = 1 - (bot.jumpEndsAt - now) / 600;
          bot.y = Math.sin(progress * Math.PI) * 1.6; // peak ~1.6, returns to 0
        }
      }

      // Charge the bot's ability (about 20s solo / faster in hard).
      const chargeRate = mode.difficulty === 'hard' ? 8 : mode.difficulty === 'normal' ? 5.5 : 4;
      bot.abilityCharge = Math.min(100, bot.abilityCharge + chargeRate * dt);

      // Decide cast.
      if (bot.abilityCharge >= 100 && now > bot.abilityReadyAt) {
        if (Math.random() < profile.abilityChance) {
          castBotAbility(bot, profile, playerAlive);
          bot.abilityCharge = 0;
        }
        bot.abilityReadyAt = now + 3000 + Math.random() * 4000;
      }
    }

    // 2. Bot-vs-dropped-box collisions (boxes the player or another Trex bot dropped).
    for (const bot of botsRef.current) {
      if (bot.finished || now < bot.frozenUntil) continue;
      for (let i = botBoxesRef.current.length - 1; i >= 0; i--) {
        const box = botBoxesRef.current[i]!;
        if (box.ownerId === bot.id) continue; // owner-immune
        if (box.lane !== bot.lane) continue;
        if (Math.abs(box.distance - bot.distance) > 1.5) continue;
        // Hit
        if (box.type === 'fire') bot.hearts = Math.max(0, bot.hearts - 1);
        else if (box.type === 'water') {
          bot.stunSpeedCapUntil = now + 2000;
          bot.speed = Math.max(6, bot.speed * 0.5);
        } else if (box.type === 'trap') bot.frozenUntil = now + 1500;
        // Push a kill-feed entry attributing it to the box owner.
        const ownerName = box.ownerId === PLAYER_SELF_ID ? 'YOU' : botsRef.current.find((b) => b.id === box.ownerId)?.name ?? 'someone';
        const ownerIsMe = box.ownerId === PLAYER_SELF_ID;
        const verb = box.type === 'fire' ? '🔥 burned' : box.type === 'water' ? '💧 soaked' : '📦 trapped';
        pushFeed({ kind: 'box', verb, casterName: ownerName, casterIsMe: ownerIsMe, targets: [{ name: bot.name, isMe: false }], fizzled: false });
        // Remove the box from the world + tell the runner to forget its mesh.
        botBoxesRef.current.splice(i, 1);
        handleRef.current?.forgetDroppedBox(box.id);
      }
    }

    // 3. Cull boxes that have scrolled far behind everyone.
    for (let i = botBoxesRef.current.length - 1; i >= 0; i--) {
      const b = botBoxesRef.current[i]!;
      if (playerDistance - b.distance > 30) {
        botBoxesRef.current.splice(i, 1);
        handleRef.current?.forgetDroppedBox(b.id);
      }
    }

    // 4. Sync snapshot to the runner.
    const ops: RunnerOpponent[] = botsRef.current.map((b) => ({
      id: b.id,
      name: b.name,
      character: b.character,
      distance: b.distance,
      lane: b.lane,
      y: b.y,
      finished: b.finished,
      frozen: now < b.frozenUntil,
      stunned: now < b.stunSpeedCapUntil,
    }));
    handleRef.current.setOpponents(ops);
    handleRef.current.setDroppedBoxes(botBoxesRef.current);
  }

  // Bots also draw from the same random pool every cast (matching the player's
  // "Ability Box gives a random one of the 4" model). No per-character mapping.
  const BOT_ABILITY_POOL: AbilityKind[] = ['pull', 'freeze', 'thunder', 'box'];
  function castBotAbility(bot: Bot, profile: BotProfile, playerAlive: boolean) {
    const kind = BOT_ABILITY_POOL[Math.floor(Math.random() * BOT_ABILITY_POOL.length)]!;
    const now = Date.now();

    // Trex — drop a box ahead of self instead of targeting.
    if (kind === 'box') {
      const r = Math.random();
      const type: 'water' | 'fire' | 'trap' = r < 0.5 ? 'trap' : r < 0.8 ? 'water' : 'fire';
      botBoxesRef.current.push({
        id: `b_${bot.id}_${now.toString(36)}`,
        ownerId: bot.id,
        type,
        lane: bot.lane,
        distance: bot.distance + 3,
      });
      const verb = type === 'fire' ? '🔥 dropped fire' : type === 'water' ? '💧 dropped water' : '📦 dropped trap';
      pushFeed({ kind: 'box', verb, casterName: bot.name, casterIsMe: false, targets: [], fizzled: true });
      return;
    }

    // Other abilities — pick a target. Prefer player on hard if visible + ahead.
    const playerDistance = mpStatsRef.current.distance;
    const playerAhead = playerDistance > bot.distance;
    const playerNear = Math.abs(playerDistance - bot.distance) < 60;
    const canHitPlayer = profile.abilityTargetsPlayer && playerAlive && playerAhead && playerNear;

    if (kind === 'thunder') {
      // AoE — hits all rivals ahead of bot. Includes player iff hard mode.
      const beamColor = 0xfde047;
      const aheadBots = botsRef.current.filter((b) => b.id !== bot.id && !b.finished && b.distance > bot.distance && b.distance - bot.distance < 60);
      for (const t of aheadBots) {
        t.stunSpeedCapUntil = now + 1500;
        t.speed = Math.max(6, t.speed * 0.5);
        handleRef.current?.showAbilityBeam(bot.id, t.id, beamColor);
      }
      const hitPlayer = canHitPlayer;
      if (hitPlayer) {
        const grace = hitGraceRef.current.get(bot.id) ?? 0;
        if (now >= grace) {
          hitGraceRef.current.set(bot.id, now + HIT_GRACE_MS);
          handleRef.current?.applyStun(1500);
          setHitOverlay({ kind: 'thunder', until: now + 1500 });
          handleRef.current?.showAbilityBeam(bot.id, 'self', beamColor);
        }
      }
      const targets = aheadBots.map((b) => ({ name: b.name, isMe: false }));
      if (hitPlayer) targets.push({ name: 'YOU', isMe: true });
      if (targets.length > 0) {
        pushFeed({ kind, casterName: bot.name, casterIsMe: false, targets, fizzled: false });
      }
      return;
    }

    // pull / freeze: single target
    type Cand = { kind: 'player' } | { kind: 'bot'; bot: Bot };
    const candidates: Cand[] = [];
    const aheadBots = botsRef.current.filter((b) => b.id !== bot.id && !b.finished && b.distance > bot.distance && b.distance - bot.distance < 60);
    for (const b of aheadBots) candidates.push({ kind: 'bot', bot: b });
    if (canHitPlayer) candidates.push({ kind: 'player' });
    if (candidates.length === 0) return;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)]!;

    const beamColor = kind === 'freeze' ? 0x60a5fa : 0xef4444;
    if (chosen.kind === 'player') {
      const grace = hitGraceRef.current.get(bot.id) ?? 0;
      if (now < grace) return;
      hitGraceRef.current.set(bot.id, now + HIT_GRACE_MS);
      if (kind === 'freeze') {
        handleRef.current?.applyFreeze(2000);
        setHitOverlay({ kind: 'freeze', until: now + 2000 });
      } else {
        handleRef.current?.applyHit();
        setHitOverlay({ kind: 'pull', until: now + 1000 });
      }
      handleRef.current?.showAbilityBeam(bot.id, 'self', beamColor);
      pushFeed({ kind, casterName: bot.name, casterIsMe: false, targets: [{ name: 'YOU', isMe: true }], fizzled: false });
    } else {
      const t = chosen.bot;
      if (kind === 'freeze') t.frozenUntil = now + 2000;
      else t.hearts = Math.max(0, t.hearts - 1);
      handleRef.current?.showAbilityBeam(bot.id, t.id, beamColor);
      pushFeed({ kind, casterName: bot.name, casterIsMe: false, targets: [{ name: t.name, isMe: false }], fizzled: false });
    }
  }

  // Player fires their ability in bot-mode → target bots locally (mirrors what the
  // server does in MP). Visible-first deterministic pick; otherwise weighted-random
  // toward the leader (same algorithm as RaceRoom). `kind` is whatever the player has
  // currently held (random per Ability Box pickup).
  function castPlayerAbilityOnBots(kind: AbilityKind) {
    const playerDistance = mpStatsRef.current.distance;
    const now = Date.now();

    if (kind === 'box') {
      const r = Math.random();
      const type: 'water' | 'fire' | 'trap' = r < 0.5 ? 'trap' : r < 0.8 ? 'water' : 'fire';
      botBoxesRef.current.push({
        id: `p_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
        ownerId: PLAYER_SELF_ID,
        type,
        lane: mpStatsRef.current.lane,
        distance: playerDistance + 3,
      });
      const verb = type === 'fire' ? '🔥 dropped fire' : type === 'water' ? '💧 dropped water' : '📦 dropped trap';
      pushFeed({ kind: 'box', verb, casterName: 'YOU', casterIsMe: true, targets: [], fizzled: true });
      showRune('📦 DROPPED!');
      return;
    }

    const ahead = botsRef.current.filter((b) => !b.finished && b.distance > playerDistance && b.distance - playerDistance < 60);
    if (ahead.length === 0) {
      showRune('🌫️ no target');
      return;
    }
    const beamColor = kind === 'freeze' ? 0x60a5fa : kind === 'pull' ? 0xef4444 : 0xfde047;
    let targets: Bot[];
    if (kind === 'thunder') {
      targets = ahead;
    } else {
      const visible = ahead.filter((b) => b.distance - playerDistance < 25);
      if (visible.length > 0) {
        visible.sort((a, b) => a.distance - b.distance - (playerDistance - playerDistance));
        targets = [visible[0]!];
      } else {
        ahead.sort((a, b) => b.distance - a.distance);
        let total = 0;
        const weights = ahead.map((_, i) => {
          const w = ahead.length - i;
          total += w;
          return w;
        });
        let pick = Math.random() * total;
        let chosen = ahead[0]!;
        for (let i = 0; i < ahead.length; i++) {
          pick -= weights[i]!;
          if (pick <= 0) {
            chosen = ahead[i]!;
            break;
          }
        }
        targets = [chosen];
      }
    }
    for (const t of targets) {
      if (kind === 'freeze') t.frozenUntil = now + 2000;
      else if (kind === 'pull') t.hearts = Math.max(0, t.hearts - 1);
      else if (kind === 'thunder') {
        t.stunSpeedCapUntil = now + 1500;
        t.speed = Math.max(6, t.speed * 0.5);
      }
      handleRef.current?.showAbilityBeam('self', t.id, beamColor);
    }
    // Cast popup names the target(s) so the player sees what they actually hit — not
    // just a generic verb. Thunder may have multiple; join with commas.
    const verb = kind === 'freeze' ? '❄️ FROZE' : kind === 'pull' ? '🕸️ PULLED' : '⚡ ZAPPED';
    const names = targets.map((t) => t.name).join(', ');
    showRune(`${verb} ${names}`);
    pushFeed({
      kind,
      casterName: 'YOU',
      casterIsMe: true,
      targets: targets.map((t) => ({ name: t.name, isMe: false })),
      fizzled: false,
    });
  }

  function pushFeed(partial: Omit<FeedEntry, 'id' | 'until'>) {
    const id = ++feedIdRef.current;
    const until = Date.now() + 3000;
    setFeedEvents((prev) => [{ id, until, ...partial }, ...prev].slice(0, 4));
    window.setTimeout(() => {
      setFeedEvents((prev) => prev.filter((f) => f.id !== id));
    }, 3100);
  }
  // Auto-clear the receiver overlay when its window passes.
  useEffect(() => {
    if (!hitOverlay) return;
    const remain = hitOverlay.until - Date.now();
    if (remain <= 0) {
      setHitOverlay(null);
      return;
    }
    const id = window.setTimeout(() => setHitOverlay(null), remain);
    return () => window.clearTimeout(id);
  }, [hitOverlay]);

  // Whenever the room state changes, mirror to the ref + push opponents into the live runner.
  useEffect(() => {
    mpStateRef.current = mpState;
    if (!mpState || !handleRef.current) return;
    const now = Date.now();
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
        // Pull the local frozen/stunned-until timestamps from the maps we populated in
        // handleAbilityEvent. Expired entries are treated as not-set.
        frozen: (ghostFrozenRef.current.get(p.id) ?? 0) > now,
        stunned: (ghostStunnedRef.current.get(p.id) ?? 0) > now,
      }));
    handleRef.current.setOpponents(ops);
    handleRef.current.setDroppedBoxes(mpState.boxes);
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
      if (botTickRef.current != null) {
        window.clearInterval(botTickRef.current);
        botTickRef.current = null;
      }
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

  // ── Swipe / tap controls (touch devices only) ──────────────────────────────────
  // Swipe ↑/↓/◀/▶ anywhere → move (one swipe = one discrete move).
  // Tap anywhere (touch without swipe, released quickly) → smash. Two quick taps in
  // succession naturally break a 📦 crate (runner already needs 2 hits to kill one).
  // The 💥 button is now the ABILITY button — it has its own onTouchStart with
  // stopPropagation so a tap on it doesn't double-fire as a smash.
  const SWIPE_FIRE = 36; // px from origin → fire the direction
  const TAP_MAX_DURATION = 280; // ms — touch released faster than this AND no swipe = tap
  const TAP_MAX_DRIFT = 12; // px — finger barely moved AND no swipe = tap
  const swipeIdRef = useRef<number | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeStartTimeRef = useRef<number>(0);
  const swipeMaxDriftRef = useRef<number>(0); // furthest the finger drifted during this touch
  const swipeFiredRef = useRef(false); // one swipe per touch — re-touch to swipe again

  const onWrapTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!playing) return;
    if (swipeIdRef.current !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    swipeIdRef.current = t.identifier;
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
    swipeStartTimeRef.current = Date.now();
    swipeMaxDriftRef.current = 0;
    swipeFiredRef.current = false;
  };
  const onWrapTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!playing || !swipeStartRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      if (t.identifier !== swipeIdRef.current) continue;
      const dx = t.clientX - swipeStartRef.current.x;
      const dy = t.clientY - swipeStartRef.current.y;
      const mag = Math.max(Math.abs(dx), Math.abs(dy));
      if (mag > swipeMaxDriftRef.current) swipeMaxDriftRef.current = mag;
      if (swipeFiredRef.current || mag < SWIPE_FIRE) return;
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
        const wasSwipe = swipeFiredRef.current;
        const duration = Date.now() - swipeStartTimeRef.current;
        const drift = swipeMaxDriftRef.current;
        swipeIdRef.current = null;
        swipeStartRef.current = null;
        swipeFiredRef.current = false;
        // If they didn't swipe AND let go quickly without drifting → it's a TAP → smash.
        if (!wasSwipe && duration < TAP_MAX_DURATION && drift < TAP_MAX_DRIFT) {
          handleRef.current?.breakBox();
        }
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

  async function start(botSetup?: { count: number; difficulty: BotDifficulty }) {
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
    handleRef.current = createRunner(
      mountRef.current,
      {
        onUpdate,
        onGameOver,
        onRune: showRune,
        // Local box collision in bot mode → just forget the box (effect already applied
        // inside runner.ts), no server roundtrip.
        onDroppedBoxCollision: (boxId) => {
          if (botModeRef.current) {
            botBoxesRef.current = botBoxesRef.current.filter((b) => b.id !== boxId);
            handleRef.current?.forgetDroppedBox(boxId);
          }
        },
      },
      opts,
    );
    // 3-2-1 countdown so the player can settle their fingers on the controls before the
    // run actually starts. Mirrors the multiplayer race-start countdown.
    handleRef.current.setPaused(true);
    setCountdownEnd(Date.now() + 3000);
    // If bots requested, spin them up + start the AI tick. They begin moving while the
    // 3-2-1 plays so they fan out a bit by GO.
    if (botSetup && botSetup.count > 0) startBots(botSetup);
  }

  // Build the bot roster + start the 10Hz tick. Bots spawn LATERALLY around the player
  // (left/right lanes — never stacked in the centre lane on top of you) and only a
  // few metres staggered forward/back so they're all visible on screen from the gun.
  function startBots(setup: { count: number; difficulty: BotDifficulty }) {
    const profile = BOT_PROFILES[setup.difficulty];
    const names = pickBotNames(setup.count);
    const dinos = pickBotDinos(setup.count, selectedDino);
    const now = Date.now();
    // Player is at lane 1 (centre) by default. Bots go into the side lanes first; if
    // we run out of side slots they go back into centre but BEHIND the player so
    // they're not clipping the player's own dino model.
    const BOT_LANES = [0, 2, 0, 2]; // left, right, left, right
    const BOT_DIST_OFFSETS = [2, 2, -2, -2]; // first two ahead, then behind
    const bots: Bot[] = [];
    for (let i = 0; i < setup.count; i++) {
      bots.push({
        id: `bot_${i}_${now.toString(36)}`,
        name: names[i]!,
        character: dinos[i]!,
        distance: BOT_DIST_OFFSETS[i] ?? 0,
        lane: BOT_LANES[i] ?? 0,
        y: 0,
        speed: profile.baseSpeed + (Math.random() * 2 - 1) * profile.speedVariance,
        hearts: 3,
        finished: false,
        laneChangeAt: now + 1500 + Math.random() * 2000,
        abilityCharge: 0,
        abilityReadyAt: now + 4000 + Math.random() * 4000,
        frozenUntil: 0,
        stunSpeedCapUntil: 0,
        jumpEndsAt: 0,
      });
    }
    botsRef.current = bots;
    botBoxesRef.current = [];
    botModeRef.current = { difficulty: setup.difficulty };
    handleRef.current?.setSelfId(PLAYER_SELF_ID);
    // 10Hz tick loop (matches MP pos broadcast rate — synced cadence keeps motion smooth).
    if (botTickRef.current != null) window.clearInterval(botTickRef.current);
    botTickRef.current = window.setInterval(() => tickBots(0.1), 100);
  }
  function stopBots() {
    if (botTickRef.current != null) {
      window.clearInterval(botTickRef.current);
      botTickRef.current = null;
    }
    botsRef.current = [];
    botBoxesRef.current = [];
    botModeRef.current = null;
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
    // Spawn-spread: each player gets a unique starting lane + small distance offset
    // based on their join order (index in the players list). Keeps everyone off the
    // centre spawn so the first second of a race doesn't have 4 dinos clipping through
    // one another. Pattern cycles lane: 1 / 0 / 2 / 1 — centre, left, right, centre.
    const myIndex = Math.max(0, state.players.findIndex((p) => p.id === state.myId));
    const SPAWN_LANES = [1, 0, 2, 1];
    const startLane = SPAWN_LANES[myIndex % SPAWN_LANES.length]!;
    const startDistance = myIndex * 4; // 0, 4, 8, 12 — visible spread without giving anyone a head-start to be sore about

    const opts: RunnerOptions = {
      ...optsForAge(profileRef.current.ageBand),
      character: selectedDino,
      // Use the ROOM's view (set by the host) — every player races in the same camera so
      // nobody gets a tactical advantage from a different perspective.
      view: state.view,
      seed: state.seed,
      startLane,
      startDistance,
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
          // Local collision with a dropped Trex box → tell the server (boxHit). Server
          // validates + broadcasts the consumption to everyone.
          onDroppedBoxCollision: (boxId) => {
            mpRef.current?.boxHit(boxId);
          },
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
    // Tell the runner our id (used for Leave-Box owner-immunity).
    handleRef.current.setSelfId(state.myId);
    // Seed in initial opponents + dropped boxes (handler in the mpState effect will keep
    // updating after this).
    const ops: RunnerOpponent[] = state.players
      .filter((p) => p.id !== state.myId)
      .map((p) => ({ id: p.id, name: p.name, character: p.character, distance: p.distance, lane: p.lane, y: p.y, finished: p.finished }));
    handleRef.current.setOpponents(ops);
    handleRef.current.setDroppedBoxes(state.boxes);
    mpRef.current?.startPosLoop(() => ({
      distance: mpStatsRef.current.distance,
      lane: mpStatsRef.current.lane,
      y: mpStatsRef.current.y,
    }));
  }

  function playAgain() {
    // Multiplayer: "Play again" used to restart in the SAME room while the rest of the
    // race was still going — which dumped the player into mid-race ghosts they couldn't
    // catch up to. Instead, leave the room entirely + return to the menu. The player
    // can then start a fresh solo run or host a new race.
    if (mpScreen === 'race') {
      toMenu();
      return;
    }
    setOver(false);
    setPaused(false);
    setStats(EMPTY_STATS);
    topSpeedRef.current = 0;
    handleRef.current?.restart();
    // If we were racing bots, rebuild a fresh roster (same count + difficulty) so
    // "play again" feels like a real rematch and not the same exhausted bots.
    if (botModeRef.current) {
      const diff = botModeRef.current.difficulty;
      stopBots();
      startBots({ count: botCount, difficulty: diff });
    }
    // Same 3-2-1 grace as the first run.
    handleRef.current?.setPaused(true);
    setCountdownEnd(Date.now() + 3000);
  }

  function toMenu() {
    // Back to the main menu: tear down the running game + any active multiplayer room
    // + any solo-vs-bots tick loop.
    handleRef.current?.destroy();
    handleRef.current = null;
    void mpRef.current?.leave();
    mpRef.current = null;
    stopBots();
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
  // ⚡ Ability button — same physical button slot as the old smash button, but its job is
  // now "use ability when full". Visual fills with amber as the charge accumulates (conic
  // gradient driving the background); pulses when ready to fire.
  const abilitySize = isCoarse ? 'px-7 py-5 text-3xl' : 'px-5 py-4 text-2xl';
  const abilityFull = stats.abilityCharge >= 1;
  const abilityDeg = Math.max(0, Math.min(1, stats.abilityCharge)) * 360;
  // NOTE: do NOT include a `position` utility (relative/absolute) here — the mobile button
  // adds `absolute bottom-4 left-4` and they'd collide in the cascade, leaving the button
  // off-screen. Position is owned by each call-site.
  const abilityClasses = `touch-manipulation pointer-events-auto select-none rounded-full font-bold transition ${
    abilityFull
      ? 'text-slate-900 ring-4 ring-amber-200 animate-pulse'
      : 'text-white/70 border-2 border-dashed border-white/30'
  }`;
  const abilityStyle: React.CSSProperties = abilityFull
    ? { backgroundColor: '#fbbf24' }
    : { background: `conic-gradient(from -90deg, #fbbf24 ${abilityDeg}deg, rgba(255,255,255,0.06) ${abilityDeg}deg)` };
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
          {/* Quit-to-menu button — visible during play so mobile users (where the page
              chrome's "← Games" link is hidden) always have a one-tap exit. Confirms first. */}
          <button type="button" onClick={requestQuit} className={`${pillBtn} absolute right-3 top-[9rem]`}>
            🏠 Menu
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

      {/* PvP receiver overlay — flashes a screen border + centered label when a rival
          hits us with an ability. Colour-coded by kind. The runner's input-block /
          speed-cap does the actual gameplay effect; this is purely visual. */}
      {hitOverlay && (() => {
        const isFreeze = hitOverlay.kind === 'freeze';
        const isPull = hitOverlay.kind === 'pull';
        const tint = isFreeze ? 'bg-sky-400/25 ring-sky-300' : isPull ? 'bg-red-500/25 ring-red-400' : 'bg-violet-400/25 ring-violet-300';
        const label = isFreeze ? '❄️ FROZEN' : isPull ? '🕸️ PULLED' : '⚡ STUNNED';
        return (
          <div className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center ring-8 ring-inset ${tint}`}>
            <div className="rounded-2xl bg-black/55 px-8 py-4 text-3xl font-black text-white drop-shadow-lg">
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

            <button
              type="button"
              onClick={() => setShowBotSetup(true)}
              className="pointer-events-auto rounded-full bg-emerald-500 px-8 py-3 text-lg font-black text-white shadow-lg ring-2 ring-white/40 transition hover:bg-emerald-400 active:scale-95"
            >
              🤖 Race vs Bots
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

      {/* Bot-race setup — count + difficulty, then start a solo run with bots. Lives over
          the menu only (not during a run). Closes itself when Start fires. */}
      {showBotSetup && !started && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/85 px-6 text-center text-white" style={scrollShellStyle}>
          <div className="w-full max-w-sm rounded-2xl bg-slate-800 px-6 py-6 ring-2 ring-white/20">
            <div className="mb-2 text-5xl">🤖</div>
            <h2 className="mb-4 text-2xl font-black">Race vs Bots</h2>

            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">How many bots?</p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBotCount(n)}
                    className={`rounded-xl px-5 py-2.5 text-lg font-black transition ${
                      botCount === n ? 'bg-emerald-500 text-white ring-2 ring-emerald-200' : 'bg-white/15 text-white/80 hover:bg-white/25'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">Difficulty</p>
              <div className="flex justify-center gap-2">
                {(['easy', 'normal', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setBotDifficulty(d)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold capitalize transition ${
                      botDifficulty === d ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-200' : 'bg-white/15 text-white/80 hover:bg-white/25'
                    }`}
                  >
                    {d === 'easy' && '🌱 '}
                    {d === 'normal' && '🎯 '}
                    {d === 'hard' && '🔥 '}
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-white/60">
                {botDifficulty === 'easy' && 'Slow bots, no abilities. Best for younger players.'}
                {botDifficulty === 'normal' && 'Bots cast abilities on each other — you race uncontested.'}
                {botDifficulty === 'hard' && 'Bots cast abilities on YOU too. Expect chaos.'}
              </p>
            </div>

            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowBotSetup(false)}
                className="rounded-full bg-white/15 px-5 py-2 text-sm font-bold hover:bg-white/25"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBotSetup(false);
                  void start({ count: botCount, difficulty: botDifficulty });
                }}
                className="rounded-full bg-emerald-500 px-8 py-2 text-lg font-black text-white hover:bg-emerald-400"
              >
                ▶ Start
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

      {/* Mini-map — vertical bar on the left. YOU sit at the centre line; rivals appear
          above (ahead) or below (behind) at their relative distance. Range is ±50m
          (anyone further is pinned to the edge). Visible in MP and bot mode whenever
          there are rivals to track. */}
      {playing && (() => {
        const MAP_RANGE_M = 50; // metres above + below the centre line
        type Marker = { id: string; gap: number; isMe: boolean };
        const myDist = stats.distance;
        const markers: Marker[] = [];
        if (mpScreen === 'race' && mpState) {
          for (const p of mpState.players) {
            const isMe = p.id === mpState.myId;
            markers.push({ id: p.id, gap: p.distance - myDist, isMe });
          }
        } else if (botModeRef.current && botsRef.current.length > 0) {
          markers.push({ id: 'self', gap: 0, isMe: true });
          for (const b of botsRef.current) markers.push({ id: b.id, gap: b.distance - myDist, isMe: false });
        }
        if (markers.length < 2) return null;
        return (
          <div className="pointer-events-none absolute left-3 top-32 z-10 h-56 w-10 rounded-xl bg-black/40 ring-1 ring-white/15 backdrop-blur">
            {/* centre line (you are here) */}
            <div className="absolute inset-x-1.5 top-1/2 h-px bg-white/25" />
            {/* labels */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white/60">↑ {MAP_RANGE_M}m</div>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white/60">↓ {MAP_RANGE_M}m</div>
            {markers.map((m) => {
              const clamped = Math.max(-MAP_RANGE_M, Math.min(MAP_RANGE_M, m.gap));
              // gap > 0 = rival is ahead → top half (lower top%). gap < 0 = behind → bottom half.
              const topPct = 50 - (clamped / MAP_RANGE_M) * 50;
              return (
                <div
                  key={m.id}
                  className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                    m.isMe ? 'bg-amber-400 ring-2 ring-white' : 'bg-white shadow'
                  }`}
                  style={{ top: `${topPct}%` }}
                />
              );
            })}
          </div>
        );
      })()}

      {/* Live leaderboard during a race — shows everyone's distance in real time. Same
          panel for MP and bot mode. In MP rows come from the synced room state; in bot
          mode we build them from botsRef + the local player stats. */}
      {playing && (() => {
        type Row = { id: string; name: string; distance: number; finished: boolean; isMe: boolean };
        let rows: Row[] = [];
        if (mpScreen === 'race' && mpState) {
          rows = mpState.players.map((p) => ({ id: p.id, name: p.name, distance: p.distance, finished: p.finished, isMe: p.id === mpState.myId }));
        } else if (botModeRef.current && botsRef.current.length > 0) {
          rows = [
            { id: PLAYER_SELF_ID, name: 'YOU', distance: stats.distance, finished: over, isMe: true },
            ...botsRef.current.map((b) => ({ id: b.id, name: b.name, distance: b.distance, finished: b.finished, isMe: false })),
          ];
        }
        if (rows.length < 2) return null;
        rows.sort((a, b) => b.distance - a.distance);
        return (
          <div className="pointer-events-none absolute right-3 top-32 z-10 rounded-xl bg-black/40 px-3 py-2 text-xs font-bold text-white backdrop-blur">
            <p className="mb-1 text-white/70">🏁 Race</p>
            {rows.map((r, i) => (
              <div key={r.id} className={r.isMe ? 'text-amber-200' : 'text-white/90'}>
                {i + 1}. {r.isMe ? 'YOU' : r.name}: {Math.floor(r.distance)}m {r.finished && '🏁'}
              </div>
            ))}
          </div>
        );
      })()}

      {/* PvP kill-feed — most-recent at the top, fades after 3s. Sits just under the
          leaderboard so the player can see who's casting what at a glance. Names render
          through React (escaped) — no XSS even with a hostile player name. */}
      {playing && mpScreen === 'race' && feedEvents.length > 0 && (
        <div className="pointer-events-none absolute right-3 top-[12rem] z-10 flex flex-col gap-1 text-xs font-semibold text-white">
          {feedEvents.map((f) => (
            <div key={f.id} className="rounded-md bg-black/55 px-2 py-1 backdrop-blur">
              <span className={f.casterIsMe ? 'font-black text-amber-200' : ''}>
                {f.casterIsMe ? 'YOU' : f.casterName}
              </span>{' '}
              <span className="text-white/80">{f.verb ?? abilityVerb(f.kind)}</span>{' '}
              {f.fizzled ? (
                <span className="italic text-white/50">no target</span>
              ) : (
                f.targets.map((t, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    <span className={t.isMe ? 'font-black text-red-200' : ''}>{t.isMe ? 'YOU' : t.name}</span>
                  </span>
                ))
              )}
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
              <li>📱 Mobile / tablet: <b>swipe ↑↓◀▶ anywhere</b> to move · <b>tap anywhere</b> to smash · <b>⚡ button (bottom-left)</b> = your ability (when charged).</li>
              <li>⌨️ Desktop: ←/→ lane · ↑/Space jump · ↓ slide · <b>E smash</b> · <b>Q ⚡ ability</b> · P pause</li>
              <li>🟫 Ground box → jump over OR land on top · 🟦 Flying bar → slide under</li>
              <li>Tap once on 🟨 gold for a rune. 📦 crates need <b>two fast taps</b> → 🎰 JACKPOT.</li>
              <li><b>⚡ Ability Box</b> (purple) — tap once. You get a <b>random</b> ability (every dino can hold any of them). After firing, find another box. The button icon shows what you currently hold:</li>
              <li className="pl-4">🕸️ <b>Web Pull</b> — yanks the rival ahead of you back, costs them ❤️.</li>
              <li className="pl-4">❄️ <b>Freeze Shot</b> — locks the rival in place for 2 seconds.</li>
              <li className="pl-4">⚡ <b>Thunder</b> — stuns ALL rivals ahead of you for 1.5 seconds.</li>
              <li className="pl-4">📦 <b>Leave Box</b> — drops a random 📦/💧/🔥 box behind you for rivals to run through.</li>
              <li>🗺️ Tiny mini-map on the left shows rivals above (ahead) and below (behind) you.</li>
              <li>💎 Coins chain into a 🔥 combo. ⚡ ground boosts add km/h.</li>
              <li>🤖 <b>Race vs Bots</b> from the menu — 1-3 bots, three difficulty tiers. Hard-mode bots will target YOU too.</li>
              <li>❤️ Don&apos;t lose all your hearts!</li>
            </ul>
            <button type="button" onClick={() => setShowHowTo(false)} className="pointer-events-auto mt-2 rounded-full bg-emerald-500 px-6 py-2.5 font-bold hover:bg-emerald-600">
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Desktop D-pad — movement + ABILITY button (was the smash button; smashing on
          desktop is now the E key, ability is Q OR a click here). */}
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
          <div className="flex flex-col items-center gap-1">
            <SmashIndicator breakReady={stats.breakReady} progress={stats.breakCooldownProgress} />
            <button
              type="button"
              className={`${abilityClasses} ${abilitySize}`}
              style={abilityStyle}
              onPointerDown={fireAbility}
              aria-label={abilityFull ? 'Use ability' : `Ability ${Math.round(stats.abilityCharge * 100)}%`}
            >
              {abilityIcon}
            </button>
          </div>
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

      {/* Touch UI: swipe anywhere = move · tap anywhere = smash · ⚡ ability button bottom-left.
          The ⚡ button stops touch propagation so its tap never registers as a smash.
          The 💥 smash indicator sits right above the ⚡ button so both action gauges are
          in the player's peripheral vision.

          Bottom offset uses `max(5rem, env(safe-area-inset-bottom) + 4rem)` so on iPhone
          Safari — where the persistent URL bar and home-indicator gesture area eat the
          bottom ~80px and refuse the fullscreen API — the button still clears the chrome.
          On notched iPhones the safe-area inset adds even more clearance automatically. */}
      {playing && isCoarse && (
        <>
          <div
            className="absolute left-4 z-20 flex flex-col items-center gap-1.5"
            style={{ bottom: 'max(5rem, calc(env(safe-area-inset-bottom, 0px) + 4rem))' }}
          >
            <SmashIndicator breakReady={stats.breakReady} progress={stats.breakCooldownProgress} />
            <button
              type="button"
              className={`${abilityClasses} ${abilitySize}`}
              style={abilityStyle}
              onTouchStart={(e) => {
                e.stopPropagation();
                fireAbility();
              }}
              aria-label={abilityFull ? 'Use ability' : `Ability ${Math.round(stats.abilityCharge * 100)}%`}
            >
              {abilityIcon}
            </button>
          </div>

          {/* Idle hint — clears up once player makes a move. Matches the ability button's
              raised offset so the bottom-row UI stays aligned and clear of Safari chrome. */}
          <div
            className="pointer-events-none absolute right-4 rounded-full bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur"
            style={{ bottom: 'max(5rem, calc(env(safe-area-inset-bottom, 0px) + 4rem))' }}
          >
            swipe ↑↓◀▶ to move · tap = smash
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

            {/* Multiplayer final standings — sorted by distance, highlight YOU, medal the
                top 3. "✓ done" = that player has also game-over'd; otherwise they're still
                racing. Re-renders when mpState updates so live distances stay current. */}
            {mpScreen === 'race' && mpState && mpState.players.length > 1 && (() => {
              const ranked = [...mpState.players].sort((a, b) => b.distance - a.distance);
              return (
                <div className="mt-2 w-full max-w-sm rounded-2xl bg-black/40 px-4 py-3 ring-2 ring-white/15">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">🏁 Standings</p>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {ranked.map((p, i) => {
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                      const isMe = p.id === mpState.myId;
                      return (
                        <li
                          key={p.id}
                          className={`flex items-center justify-between rounded-xl px-3 py-1.5 ${
                            isMe ? 'bg-amber-400/20 ring-1 ring-amber-300/60 font-bold' : 'bg-white/5'
                          }`}
                        >
                          <span>
                            {medal} {isMe ? 'YOU' : p.name}
                          </span>
                          <span className="text-white/80">
                            {Math.floor(p.distance)}m{' '}
                            {p.finished ? <span className="text-emerald-300">✓</span> : <span className="text-xs text-white/50">…running</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}

            {/* Solo-vs-bots final standings — same shape, sourced from local botsRef. */}
            {botModeRef.current && botsRef.current.length > 0 && (() => {
              const myDist = finalScore.distance;
              const all = [
                ...botsRef.current.map((b) => ({ name: b.name, isMe: false, distance: b.distance, finished: b.finished })),
                { name: 'YOU', isMe: true, distance: myDist, finished: true },
              ].sort((a, b) => b.distance - a.distance);
              return (
                <div className="mt-2 w-full max-w-sm rounded-2xl bg-black/40 px-4 py-3 ring-2 ring-white/15">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/70">🤖 Standings</p>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {all.map((p, i) => {
                      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                      return (
                        <li
                          key={`${p.name}_${i}`}
                          className={`flex items-center justify-between rounded-xl px-3 py-1.5 ${
                            p.isMe ? 'bg-amber-400/20 ring-1 ring-amber-300/60 font-bold' : 'bg-white/5'
                          }`}
                        >
                          <span>{medal} {p.name}</span>
                          <span className="text-white/80">{Math.floor(p.distance)}m</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}

            <div className="mt-1 flex gap-3">
              <button type="button" onClick={playAgain} className="rounded-full bg-emerald-500 px-6 py-3 text-lg font-bold text-white hover:bg-emerald-600">
                {mpScreen === 'race' ? '🚪 Leave race' : '▶ Play again'}
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
