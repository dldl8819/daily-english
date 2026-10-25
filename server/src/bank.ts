import type { Graded, PublicQuestion } from '../../src/lib/apiTypes';
import type { Question } from '../../src/lib/types';

/** 문제 은행. 서버 번들에만 들어간다(정답·해설 포함). */
export type Bank = { questions: Question[]; byId: Map<number, Question> };

export function createBank(questions: Question[]): Bank {
  return { questions, byId: new Map(questions.map((q) => [q.id, q])) };
}

/** 답을 내기 전에 보여 줄 부분. 정답·해설이 섞여 나가지 않도록 필드를 하나씩 고른다. */
export function publicQuestion(q: Question): PublicQuestion {
  return { id: q.id, category: q.category, difficulty: q.difficulty, prompt: q.prompt, choices: q.choices };
}

/** 답한 뒤에 주는 부분. 해석은 있는 문항에만 붙인다. */
export function gradedOf(q: Question): Graded {
  return { answer: q.answer, explanation: q.explanation, ...(q.translation ? { translation: q.translation } : {}) };
}
