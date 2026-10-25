import type { Graded, PublicQuestion } from './apiTypes';
import type { Question } from './types';

/**
 * 서버 모드에서 받은 문제. 풀이·다시 볼 항목·틀린 문제·복습 화면이 문제 은행 대신 이것을 쓴다.
 * 채점 전에는 정답·해설·해석을 모르므로 answer가 UNGRADED, explanation이 ''이고 translation이 없다. 그런 문제는 답하기 전의 풀이 화면에만 나온다.
 */
export const QUESTION_CACHE_KEY = 'daily-english:questions:v1';
export const UNGRADED = -1;

export type QuestionCache = Record<string, Question>;

function isQuestion(value: unknown): value is Question {
  const q = value as Partial<Question> | null;
  return (
    !!q &&
    typeof q.id === 'number' &&
    typeof q.category === 'string' &&
    (q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3) &&
    typeof q.prompt === 'string' &&
    Array.isArray(q.choices) &&
    q.choices.every((c) => typeof c === 'string') &&
    typeof q.answer === 'number' &&
    typeof q.explanation === 'string' &&
    (q.translation === undefined || typeof q.translation === 'string')
  );
}

/** 저장된 캐시를 읽는다. 형태가 틀린 항목은 버린다. */
export function parseQuestionCache(raw: string | null): QuestionCache {
  try {
    const value = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, Question] => /^\d+$/.test(entry[0]) && isQuestion(entry[1])));
  } catch {
    return {};
  }
}

export function isGraded(q: Question): boolean {
  return q.answer !== UNGRADED;
}

/** 채점 전 문제를 넣는다. 이미 채점된 문제는 그대로 둔다. */
export function withPublic(cache: QuestionCache, q: PublicQuestion): QuestionCache {
  const existing = cache[q.id];
  if (existing && isGraded(existing)) return cache;
  return { ...cache, [q.id]: { ...q, answer: UNGRADED, explanation: '' } };
}

export function withGraded(cache: QuestionCache, q: PublicQuestion, graded: Graded): QuestionCache {
  return { ...cache, [q.id]: { ...q, ...graded } };
}

export function cachedQuestions(cache: QuestionCache): Question[] {
  return Object.values(cache);
}
