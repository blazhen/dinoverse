import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ════════════════════════════════════════════════════════════════
//  Better Auth tables — managed by Better Auth.
//  `user` = a PARENT account (only parents authenticate; kids never do).
//  Column names are snake_case; the object keys MUST stay camelCase to
//  match the field names Better Auth expects.
// ════════════════════════════════════════════════════════════════

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ════════════════════════════════════════════════════════════════
//  DinoVerse domain tables
// ════════════════════════════════════════════════════════════════

export const ageBand = pgEnum('age_band', ['5-6', '7-8', '9-10', '11-12', '13-14']);
export const characterId = pgEnum('character_id', ['trik', 'stego', 'brachiosaurus']);

/** A child belongs to a parent (the Better Auth `user`). Children never authenticate. */
export const childProfiles = pgTable('child_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  parentId: text('parent_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  ageBand: ageBand('age_band').notNull(),
  avatarCharacter: characterId('avatar_character').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const quizzes = pgTable('quizzes', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  topic: text('topic').notNull(),
});

export const quizQuestions = pgTable('quiz_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id')
    .notNull()
    .references(() => quizzes.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  choices: jsonb('choices').$type<string[]>().notNull(),
  correctIndex: integer('correct_index').notNull(),
  position: integer('position').notNull().default(0),
});

export const progress = pgTable('progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  childId: uuid('child_id')
    .notNull()
    .references(() => childProfiles.id, { onDelete: 'cascade' }),
  quizId: uuid('quiz_id')
    .notNull()
    .references(() => quizzes.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────────
export const userRelations = relations(user, ({ many }) => ({
  children: many(childProfiles),
}));

export const childProfilesRelations = relations(childProfiles, ({ one, many }) => ({
  parent: one(user, { fields: [childProfiles.parentId], references: [user.id] }),
  progress: many(progress),
}));

/** One row per child: their adaptive game difficulty + cumulative stats for the platformer. */
export const gameProgress = pgTable('game_progress', {
  childId: uuid('child_id')
    .primaryKey()
    .references(() => childProfiles.id, { onDelete: 'cascade' }),
  difficulty: integer('difficulty').notNull().default(1),
  levelsCompleted: integer('levels_completed').notNull().default(0),
  highestLevel: integer('highest_level').notNull().default(0),
  gems: integer('gems').notNull().default(0),
  setbacks: integer('setbacks').notNull().default(0),
  // Dino Dash (3D runner) stats.
  runnerBestDistance: integer('runner_best_distance').notNull().default(0),
  runnerGems: integer('runner_gems').notNull().default(0),
  runnerBestSpeed: integer('runner_best_speed').notNull().default(0), // fastest km/h reached (the "rank")
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const quizzesRelations = relations(quizzes, ({ many }) => ({
  questions: many(quizQuestions),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
  quiz: one(quizzes, { fields: [quizQuestions.quizId], references: [quizzes.id] }),
}));

export const progressRelations = relations(progress, ({ one }) => ({
  child: one(childProfiles, { fields: [progress.childId], references: [childProfiles.id] }),
  quiz: one(quizzes, { fields: [progress.quizId], references: [quizzes.id] }),
}));
