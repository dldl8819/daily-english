import type { BonusSource, Question } from './types';

/**
 * 서버 API(server/)와 클라이언트가 함께 쓰는 요청·응답 형식 (docs/11_API_명세.md 2장).
 * 정답(answer)과 해설은 답을 낸 문제에만 온다.
 */

/** daily: 오늘의 문제, share·ad: 보너스 5문제 */
export type SetKind = 'daily' | BonusSource;

/** 답을 내기 전의 문제. 정답·해설·해석이 없다(해석도 정답을 알려 준다). */
export type PublicQuestion = Omit<Question, 'answer' | 'explanation' | 'translation'>;

export type Graded = { answer: number; explanation: string; translation?: string };

export type SetResult = { correct: number; total: number; xpGained: number };

export type SetView = {
  kind: SetKind;
  questions: PublicQuestion[];
  picks: number[];
  /** picks와 같은 길이. 답을 낸 문제의 정답과 해설 */
  graded: Graded[];
  /** questions 중 낼 때 이미 본 적 있던 문제(복습)의 ID */
  review: number[];
  result: SetResult | null;
};

/** 서버가 저장된 답으로 계산한 진행 상황 */
export type Me = { xp: number; level: number; streak: number; lastDate: string | null };

export type AuthResponse = { token: string; expiresIn: number };
export type TodayResponse = { date: string; me: Me; daily: SetView; bonus: SetView[] };
export type AnswerRequest = { set: SetKind; questionId: number; picked: number };
export type AnswerResponse = Graded & { correct: boolean };
export type CompleteResponse = { result: SetResult; me: Me };
export type ProgressResponse = Me & { todayCompleted: boolean };
/** 서버 연동 전 기기에 쌓인 기록. 한 번만 받는다. */
export type ImportRequest = { xp: number; streak: number; lastDate: string | null; seen: number[] };
export type ApiErrorBody = { code: string; message: string };
