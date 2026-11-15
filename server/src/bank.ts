import type { Graded, PublicQuestion } from '../../src/lib/apiTypes';
import { indexQuestions } from '../../src/lib/daily';
import type { Question } from '../../src/lib/types';

/** 문제 은행. 서버 번들에만 들어간다(정답·해설 포함). */
export type Bank = { questions: Question[]; byId: Map<number, Question> };

/**
 * index.ts가 모듈 최상위에서 부르므로 Worker가 시작할 때 한 번 돈다.
 * 문제 고르기 색인도 이때 만들어 첫 요청에서 만들지 않게 한다(docs/21). 시작 시간 한도는 1초로 따로 있다.
 */
export function createBank(questions: Question[]): Bank {
  indexQuestions(questions);
  return { questions, byId: new Map(questions.map((q) => [q.id, q])) };
}

/** 답을 내기 전에 보여 줄 부분. 정답·해설이 섞여 나가지 않도록 필드를 하나씩 고른다. */
export function publicQuestion(q: Question): PublicQuestion {
  return { id: q.id, category: q.category, difficulty: q.difficulty, prompt: q.prompt, choices: q.choices };
}

/** 답한 뒤에 주는 부분. 해석·보기 설명은 있는 문항에만 붙인다. 보기 설명도 오답을 지우는 단서라 답하기 전에는 주지 않는다. */
export function gradedOf(q: Question): Graded {
  return {
    answer: q.answer,
    explanation: q.explanation,
    ...(q.translation ? { translation: q.translation } : {}),
    ...(q.choiceNotes ? { choiceNotes: q.choiceNotes } : {}),
  };
}
