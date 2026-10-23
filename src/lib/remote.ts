import { ApiError, request } from './api';
import type { AnswerResponse, CompleteResponse, ImportRequest, SetKind, SetView, TodayResponse } from './apiTypes';
import { type QuestionCache, withGraded, withPublic } from './questionCache';
import { loadValue, saveValue } from './storage';
import type { BonusSet, BonusSource, Progress, StudyProfile } from './types';

/** 서버 모드의 API 호출(docs/11_API_명세.md 2장)과, 응답을 기기 진행 상황에 반영하는 함수 */

export function fetchToday(date: string, profile: StudyProfile): Promise<TodayResponse> {
  const query = new URLSearchParams({
    date,
    reason: profile.reason,
    careerFocus: profile.careerFocus ?? '',
    selfLevel: String(profile.selfLevel),
    dailyGoal: String(profile.dailyGoal),
  });
  return request<TodayResponse>('GET', `/api/v1/daily?${query}`);
}

export function submitAnswer(date: string, set: SetKind, questionId: number, picked: number): Promise<AnswerResponse> {
  return request<AnswerResponse>('POST', `/api/v1/daily/${date}/answers`, { set, questionId, picked });
}

export function completeSet(date: string, set: SetKind): Promise<CompleteResponse> {
  return request<CompleteResponse>('POST', `/api/v1/daily/${date}/complete`, { set });
}

export function openBonus(date: string, source: BonusSource): Promise<SetView> {
  return request<SetView>('POST', `/api/v1/daily/${date}/bonus`, { source });
}

export const IMPORTED_KEY = 'daily-english:imported:v1';

/**
 * 서버 연동 전 기기에 쌓인 기록(XP·연속 학습일·본 문제)을 처음 한 번 서버로 옮긴다.
 * 서버에 이미 기록이 있거나(409) 기록 형식이 틀리면(400) 옮기지 않고 넘어간다.
 */
export async function importOnce(progress: Progress): Promise<void> {
  if ((await loadValue(IMPORTED_KEY)) === 'done') return;
  if (progress.xp > 0 || progress.lastDate !== null || progress.seen.length > 0) {
    const body: ImportRequest = { xp: progress.xp, streak: progress.streak, lastDate: progress.lastDate, seen: progress.seen };
    try {
      await request('POST', '/api/v1/me/progress/import', body);
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 409 || e.status === 400))) throw e;
    }
  }
  await saveValue(IMPORTED_KEY, 'done');
}

/** 세트의 문제를 캐시에 넣는다. 답한 문제는 정답·해설까지 넣는다. */
export function withSet(cache: QuestionCache, set: SetView): QuestionCache {
  return set.questions.reduce((next, q, i) => (i < set.graded.length ? withGraded(next, q, set.graded[i]) : withPublic(next, q)), cache);
}

function bonusOf(date: string, set: SetView): BonusSet {
  return {
    date,
    source: set.kind as BonusSource,
    ids: set.questions.map((q) => q.id),
    picks: set.picks,
    result: set.result,
    review: set.review,
  };
}

/** 보너스 세트 하나를 진행 상황에 넣는다. 같은 날 같은 방법이 있으면 바꾼다. */
export function withBonus(progress: Progress, date: string, set: SetView): Progress {
  const bonus = bonusOf(date, set);
  return {
    ...progress,
    bonus: [...progress.bonus.filter((b) => b.date === date && b.source !== bonus.source), bonus],
    seen: [...new Set([...progress.seen, ...bonus.ids])],
  };
}

/** 서버의 오늘 세트·XP·연속 학습일을 진행 상황과 문제 캐시에 반영한다. 서버 기록을 따른다. */
export function applyToday(progress: Progress, cache: QuestionCache, res: TodayResponse): { progress: Progress; cache: QuestionCache } {
  const sets = [res.daily, ...res.bonus];
  const ids = res.daily.questions.map((q) => q.id);
  return {
    progress: {
      ...progress,
      xp: res.me.xp,
      streak: res.me.streak,
      lastDate: res.me.lastDate,
      attempt: { date: res.date, ids, picks: res.daily.picks, review: res.daily.review },
      today: res.daily.result ? { date: res.date, ...res.daily.result } : progress.today?.date === res.date ? null : progress.today,
      bonus: res.bonus.map((b) => bonusOf(res.date, b)),
      seen: [...new Set([...progress.seen, ...sets.flatMap((s) => s.questions.map((q) => q.id))])],
    },
    cache: sets.reduce(withSet, cache),
  };
}
