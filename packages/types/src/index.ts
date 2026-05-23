/**
 * Shared domain types for DinoVerse.
 * Pure TypeScript — safe to import from both web (React) and mobile (React Native).
 */

// ─── Characters (canon) ──────────────────────────────────────────
export type CharacterId = 'trik' | 'stego' | 'brachiosaurus';

export interface Character {
  id: CharacterId;
  name: string;
  archetype: string;
  personality: string;
}

// ─── Accounts & roles ────────────────────────────────────────────
export type UserRole = 'parent' | 'child';

export interface ParentAccount {
  id: string;
  email: string;
  createdAt: string;
}

export interface ChildProfile {
  id: string;
  parentId: string;
  displayName: string;
  /** Age band drives content gating and screen-time defaults. */
  ageBand: '5-6' | '7-8' | '9-10';
  avatarCharacter: CharacterId;
  createdAt: string;
}

// ─── Learning & progression ──────────────────────────────────────
export interface Quiz {
  id: string;
  title: string;
  topic: string;
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
}

export interface ProgressEntry {
  childId: string;
  quizId: string;
  score: number;
  completedAt: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  iconKey: string;
}

// ─── Content feed ────────────────────────────────────────────────
export type FeedItemKind = 'video' | 'micro-game';

export interface FeedItem {
  id: string;
  kind: FeedItemKind;
  title: string;
  /** Cloudflare Stream UID for video items. */
  streamUid?: string;
  minAgeBand: ChildProfile['ageBand'];
}

// ─── Multiplayer (Colyseus rooms) ────────────────────────────────
/** Preset-only communication — NO free-form chat is ever allowed. */
export type SafePhrase =
  | 'nice-job'
  | 'lets-go'
  | 'over-here'
  | 'thank-you'
  | 'try-again'
  | 'we-did-it';

export interface RoomState {
  roomId: string;
  players: string[];
  puzzleId: string;
  solved: boolean;
}
