import { getQuizWithQuestions } from '@dinoverse/db';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';

import { QuizPlayer } from './quiz-player';

export default async function QuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const quiz = await getQuizWithQuestions(db, quizId);
  if (!quiz) {
    notFound();
  }

  return (
    <QuizPlayer
      title={quiz.title}
      questions={quiz.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        choices: q.choices,
        correctIndex: q.correctIndex,
      }))}
    />
  );
}
