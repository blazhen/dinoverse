'use client';

import { Button } from '@dinoverse/ui';
import Link from 'next/link';
import { useState } from 'react';

import { recordQuizResult } from '../actions';

interface Question {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
}

type SaveState = { ok: true; childName: string } | { ok: false } | null;

export function QuizPlayer({
  quizId,
  title,
  questions,
}: {
  quizId: string;
  title: string;
  questions: Question[];
}) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState<SaveState>(null);

  const question = questions[index];

  function choose(choiceIndex: number) {
    if (picked !== null) return; // already answered this question
    setPicked(choiceIndex);
    if (question && choiceIndex === question.correctIndex) {
      setScore((s) => s + 1);
    }
  }

  async function finish(finalScore: number) {
    setFinished(true);
    const result = await recordQuizResult(quizId, finalScore);
    setSaved(result.ok ? { ok: true, childName: result.childName } : { ok: false });
  }

  function next() {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setPicked(null);
    } else {
      const finalScore = score; // score already reflects the last answer
      void finish(finalScore);
    }
  }

  if (questions.length === 0) {
    return <main className="mx-auto max-w-md px-6 py-16">This quiz has no questions yet.</main>;
  }

  if (finished) {
    const perfect = score === questions.length;
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-20 text-center">
        <div className="text-6xl">{perfect ? '🏆' : '🌟'}</div>
        <h1 className="text-3xl font-black">
          {score} / {questions.length} correct!
        </h1>
        <p className="text-slate-500">
          {perfect ? 'Perfect score — you earned the Dino Genius badge!' : 'Great job! Try again for a perfect score.'}
        </p>

        {saved?.ok && (
          <p className="text-sm font-semibold text-emerald-600">
            Saved to {saved.childName}&apos;s progress ✓
          </p>
        )}
        {saved?.ok === false && (
          <p className="text-sm text-slate-400">
            Not saved —{' '}
            <Link href="/play" className="font-semibold text-emerald-600">
              pick who&apos;s playing
            </Link>{' '}
            to track progress.
          </p>
        )}

        <div className="flex gap-3">
          <Button
            onClick={() => {
              setIndex(0);
              setScore(0);
              setPicked(null);
              setFinished(false);
              setSaved(null);
            }}
          >
            Play again
          </Button>
          <Link href="/learn">
            <Button variant="secondary">More quizzes</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <div>
        <p className="text-sm font-semibold text-emerald-600">{title}</p>
        <p className="text-xs text-slate-400">
          Question {index + 1} of {questions.length}
        </p>
      </div>

      <h1 className="text-2xl font-black">{question!.prompt}</h1>

      <div className="flex flex-col gap-3">
        {question!.choices.map((choice, i) => {
          const isCorrect = i === question!.correctIndex;
          const isPicked = i === picked;
          let style = 'border-slate-300 bg-white hover:bg-slate-50';
          if (picked !== null) {
            if (isCorrect) style = 'border-emerald-500 bg-emerald-50';
            else if (isPicked) style = 'border-red-400 bg-red-50';
            else style = 'border-slate-200 bg-white opacity-60';
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              disabled={picked !== null}
              className={`rounded-xl border-2 px-4 py-3 text-left font-semibold transition ${style}`}
            >
              {choice}
              {picked !== null && isCorrect && ' ✓'}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <Button onClick={next} className="self-end">
          {index + 1 < questions.length ? 'Next' : 'See results'}
        </Button>
      )}
    </main>
  );
}
