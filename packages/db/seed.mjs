// Idempotent seed for local/dev data. Run: pnpm --filter @dinoverse/db db:seed
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '../../.env' });
const sql = neon(process.env.DATABASE_URL);

const QUIZ_TITLE = 'Dino Basics';

const questions = [
  {
    prompt: 'Which DinoVerse friend loves astronomy and science the most?',
    choices: ['Trik', 'Stego', 'Brachiosaurus'],
    correctIndex: 2,
  },
  {
    prompt: 'How do the dino-cities get their power?',
    choices: ['Volcano geothermal heat', 'Only candles', 'Magic rocks'],
    correctIndex: 0,
  },
  {
    prompt: 'Who is super fast, curious, and a little mischievous?',
    choices: ['Stego', 'Trik', 'Brachiosaurus'],
    correctIndex: 1,
  },
];

const existing = await sql`SELECT id FROM quizzes WHERE title = ${QUIZ_TITLE}`;
if (existing.length > 0) {
  console.log(`Quiz "${QUIZ_TITLE}" already seeded (${existing[0].id}). Nothing to do.`);
} else {
  const [quiz] = await sql`
    INSERT INTO quizzes (title, topic) VALUES (${QUIZ_TITLE}, 'dinosaurs') RETURNING id`;
  for (const [i, q] of questions.entries()) {
    await sql`
      INSERT INTO quiz_questions (quiz_id, prompt, choices, correct_index, position)
      VALUES (${quiz.id}, ${q.prompt}, ${JSON.stringify(q.choices)}, ${q.correctIndex}, ${i})`;
  }
  console.log(`Seeded quiz "${QUIZ_TITLE}" (${quiz.id}) with ${questions.length} questions.`);
}
