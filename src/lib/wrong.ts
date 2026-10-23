import type { Progress, Question, WrongItem } from './types';

/** 기기 저장 공간을 생각해 최근 것만 남긴다. */
export const WRONG_MAX = 200;

/**
 * 답을 기록한 뒤 틀린 문제 목록을 맞춘다.
 * 틀리면 맨 앞에 넣고(같은 문제가 있으면 옮긴다), 맞히면 목록에서 뺀다.
 */
export function noteAnswer(progress: Progress, question: Question, pick: number, date: string): Progress {
  const rest = progress.wrong.filter((w) => w.questionId !== question.id);
  if (pick === question.answer) {
    return rest.length === progress.wrong.length ? progress : { ...progress, wrong: rest };
  }
  return { ...progress, wrong: [{ questionId: question.id, pick, date }, ...rest].slice(0, WRONG_MAX) };
}

/**
 * 틀린 문제 기능이 생기기 전에 푼 기록(가장 최근 하루의 오늘 문제와 그날 보너스)에서 틀린 문제를 옮겨 온다.
 * 기기에 남아 있는 것은 그 하루치뿐이라 그 전 날짜의 오답은 되살릴 수 없다. 처음 한 번만 부른다.
 */
export function backfillWrong(progress: Progress, questions: Question[]): Progress {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answered = [
    ...(progress.attempt ? [progress.attempt] : []),
    ...progress.bonus.map((b) => ({ date: b.date, ids: b.ids, picks: b.picks })),
  ];
  let next = progress;
  for (const { date, ids, picks } of answered) {
    picks.forEach((pick, i) => {
      const question = byId.get(ids[i]);
      if (question && pick !== question.answer && !next.wrong.some((w) => w.questionId === question.id)) {
        next = noteAnswer(next, question, pick, date);
      }
    });
  }
  return next;
}

export function removeWrong(progress: Progress, questionId: number): Progress {
  return { ...progress, wrong: progress.wrong.filter((w) => w.questionId !== questionId) };
}

export type WrongEntry = WrongItem & { question: Question };

/** 틀린 문제를 문제와 묶는다. 문제 은행에서 빠진 문제는 건너뛴다. */
export function wrongEntries(progress: Progress, questions: Question[]): WrongEntry[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return progress.wrong.flatMap((w) => {
    const question = byId.get(w.questionId);
    return question ? [{ ...w, question }] : [];
  });
}
