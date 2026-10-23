import type { Progress, Question, SavedItem, SavedKind } from './types';

/** 빈칸에 정답을 채운 문장 */
export function filledSentence(question: Question): string {
  return question.prompt.replace('___', question.choices[question.answer]);
}

export function isSaved(progress: Progress, questionId: number, kind: SavedKind): boolean {
  return progress.saved.some((s) => s.questionId === questionId && s.kind === kind);
}

/** 저장돼 있으면 빼고, 없으면 맨 앞에 넣는다. */
export function toggleSaved(progress: Progress, questionId: number, kind: SavedKind, now: Date): Progress {
  const saved = isSaved(progress, questionId, kind)
    ? progress.saved.filter((s) => !(s.questionId === questionId && s.kind === kind))
    : [{ questionId, kind, savedAt: now.toISOString() }, ...progress.saved];
  return { ...progress, saved };
}

export type SavedEntry = SavedItem & { question: Question };

/** 저장 항목을 문제와 묶는다. 문제 은행에서 빠진 문제는 건너뛴다. 최근 저장한 것부터. */
export function savedEntries(progress: Progress, questions: Question[], kind: SavedKind): SavedEntry[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return progress.saved
    .filter((s) => s.kind === kind)
    .flatMap((s) => {
      const question = byId.get(s.questionId);
      return question ? [{ ...s, question }] : [];
    })
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
