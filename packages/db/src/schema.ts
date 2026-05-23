import { relations } from 'drizzle-orm';
import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ageBand = pgEnum('age_band', ['5-6', '7-8', '9-10']);
export const characterId = pgEnum('character_id', ['trik', 'stego', 'brachiosaurus']);

/** Parent accounts own everything; children never authenticate independently. */
export const parents = pgTable('parents', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const childProfiles = pgTable('child_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  parentId: uuid('parent_id')
    .notNull()
    .references(() => parents.id, { onDelete: 'cascade' }),
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

export const parentsRelations = relations(parents, ({ many }) => ({
  children: many(childProfiles),
}));

export const childProfilesRelations = relations(childProfiles, ({ one, many }) => ({
  parent: one(parents, { fields: [childProfiles.parentId], references: [parents.id] }),
  progress: many(progress),
}));

export const progressRelations = relations(progress, ({ one }) => ({
  child: one(childProfiles, { fields: [progress.childId], references: [childProfiles.id] }),
  quiz: one(quizzes, { fields: [progress.quizId], references: [quizzes.id] }),
}));
