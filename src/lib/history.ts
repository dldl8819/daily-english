import type { AnswerRecord, Progress, Question } from './types';
import { profileCategories } from './study';

/** 답을 기록한다. 같은 문제는 마지막 답만 남긴다. */
export function noteSeen(progress: Progress, questionId: number, correct: boolean, date: string): Progress {
  return { ...progress, history: { ...progress.history, [questionId]: { date, correct } } };
}

/**
 * 복습 순서를 정할 기록. 답한 기록이 없는 본 문제(이 기능 전에 본 문제)는 가장 오래된 것으로,
 * 틀린 문제 목록에 있는 문제는 틀린 것으로 본다.
 */
export function reviewRecords(progress: Progress): Map<number, AnswerRecord> {
  const records = new Map<number, AnswerRecord>();
  for (const id of progress.seen) records.set(id, { date: '', correct: true });
  for (const [id, record] of Object.entries(progress.history)) records.set(Number(id), record);
  for (const w of progress.wrong) {
    const record = records.get(w.questionId);
    records.set(w.questionId, { date: record?.date ?? w.date, correct: false });
  }
  return records;
}

/**
 * 날짜 키(yyyy-mm-dd, 없으면 '') 비교. localeCompare를 쓰지 않는다.
 * localeCompare는 처음 부를 때 로캘 정렬 데이터(ICU)를 준비하느라 오래 걸린다. 이 PC의 Node에서 첫 호출에 약 7.6ms였고,
 * 서버(Workers 무료 플랜, 요청당 CPU 10ms)에서는 새 인스턴스마다 이 값을 치른다(docs/21 2.9). 날짜 키는 ASCII라 글자 순서로 비교해도 결과가 같다.
 */
export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 복습할 문제 순서: 틀린 것 먼저, 그다음 오래전에 답한 것. */
export function reviewPriority(a: AnswerRecord, b: AnswerRecord): number {
  return Number(a.correct) - Number(b.correct) || compareDateKeys(a.date, b.date);
}

/** 지금 맞춤 문제 설정에서 아직 안 본 문제 수 */
export function remainingNew(progress: Progress, questions: Question[]): number {
  const categories = profileCategories(progress.profile);
  const seen = new Set(progress.seen);
  return questions.filter((q) => categories.includes(q.category) && !seen.has(q.id)).length;
}
