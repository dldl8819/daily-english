import type { AnswerRecord, Attempt, BonusSet, BonusSource, Category, Difficulty, Progress, Question, StudyProfile } from './types';
import { reviewPriority, reviewRecords } from './history';
import { xpForResult } from './level';
import { dailyGoalOf, profileCategories, studyLevel } from './study';

export const QUESTIONS_PER_DAY = 5;
const DAY_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 로컬 날짜 기준 yyyy-mm-dd */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/**
 * 레벨별 난이도 구성. 5문제 묶음을 문제 수만큼 되풀이한다(10문제면 두 번).
 * 낮은 레벨은 쉬운 문제 위주로, 레벨이 오를수록 어려운 문제 비중을 늘린다.
 */
export function difficultyMix(level: number, count = QUESTIONS_PER_DAY): Difficulty[] {
  const unit: Difficulty[] =
    level <= 2 ? [1, 1, 1, 2, 2] : level <= 4 ? [1, 2, 2, 2, 3] : level <= 7 ? [2, 2, 2, 3, 3] : [2, 3, 3, 3, 3];
  return Array.from({ length: count }, (_, i) => unit[i % unit.length]);
}

/** 날짜와 문제 ID로 정해지는 섞기용 값. 같은 입력이면 항상 같은 순서가 나온다. */
function rank(id: number, key: string): number {
  let h = 2166136261;
  for (const ch of `${key}#${id}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 오늘 낼 문제를 고른다.
 * - 레벨에 맞는 난이도 구성(difficultyMix)을 따른다.
 * - 안 본 문제를 먼저 고르고, 다 봤으면 본 문제를 복습으로 낸다. 복습은 틀린 것, 오래전에 답한 것부터(records).
 * - 학습 목적의 분류(categories)에서만 고르고, 분류가 둘이면 번갈아 고른다.
 * - 원하는 난이도가 모자라면 가까운 난이도에서 채운다. 이때도 새 문제가 남아 있으면 복습보다 새 문제를 먼저 낸다.
 */
export function pickDaily(
  questions: Question[],
  key: string,
  level = 1,
  seen: number[] = [],
  salt = '',
  categories: Category[] = ['dev', 'daily'],
  count: number = QUESTIONS_PER_DAY,
  records: Map<number, AnswerRecord> = new Map(),
): Question[] {
  const seenSet = new Set(seen);
  const OLDEST: AnswerRecord = { date: '', correct: true };
  // 목적에 맞는 문제가 하나도 없을 때(문제 은행이 비정상)만 전체에서 고른다.
  const inGoal = questions.filter((q) => categories.includes(q.category));
  const pool = inGoal.length > 0 ? inGoal : questions;
  const ordered = [...pool].sort((a, b) => {
    const seenA = seenSet.has(a.id);
    const seenB = seenSet.has(b.id);
    if (seenA !== seenB) return Number(seenA) - Number(seenB);
    const review = seenA ? reviewPriority(records.get(a.id) ?? OLDEST, records.get(b.id) ?? OLDEST) : 0;
    return review || rank(a.id, key + salt) - rank(b.id, key + salt);
  });
  const position = new Map(ordered.map((q, i) => [q.id, i]));
  const picked: Question[] = [];
  const used = new Set<number>();
  const order: Category[] = dayNumber(key) % 2 === 0 ? categories : [...categories].reverse();

  difficultyMix(level, count).forEach((difficulty, slot) => {
    if (picked.length >= Math.min(count, pool.length)) return;
    const category = order[slot % order.length];
    const byCloseness = (q: Question) => Math.abs(q.difficulty - difficulty);
    // 가까운 난이도, 같은 분류, 복습 순서(ordered) 순으로 가장 알맞은 문제
    const nearest = (list: Question[]) =>
      [...list].sort(
        (a, b) =>
          byCloseness(a) - byCloseness(b) ||
          Number(a.category !== category) - Number(b.category !== category) ||
          position.get(a.id)! - position.get(b.id)!,
      )[0];
    const candidates = ordered.filter((q) => !used.has(q.id));
    const unseen = candidates.filter((q) => !seenSet.has(q.id));
    const best =
      unseen.find((q) => q.difficulty === difficulty && q.category === category) ??
      unseen.find((q) => q.difficulty === difficulty) ??
      // 원하는 난이도의 새 문제가 없으면 가까운 난이도의 새 문제를 먼저 낸다(하루 20문제씩 1년 동안 새 문제를 내기 위해서다).
      // 새 문제가 모두 떨어졌을 때만 복습한다.
      nearest(unseen) ??
      nearest(candidates);
    if (best) {
      picked.push(best);
      used.add(best.id);
    }
  });

  return picked;
}

export const EMPTY_PROGRESS: Progress = {
  xp: 0,
  streak: 0,
  lastDate: null,
  today: null,
  attempt: null,
  seen: [],
  userKey: null,
  nickname: null,
  saved: [],
  bonus: [],
  profile: null,
  wrong: [],
  history: {},
};

/**
 * 저장된 진행 상황을 지금 사용자 식별키와 맞춘다.
 * - 키를 못 받았으면(토스 앱 밖, 구버전) 그대로 쓴다.
 * - 저장된 키가 없으면 지금 키를 붙인다. 식별키를 넣기 전 기록을 이어받기 위해서다.
 * - 저장된 키가 다르면 같은 기기의 다른 토스 사용자이므로 새로 시작한다.
 */
export function bindUser(progress: Progress, userKey: string | null): Progress {
  if (userKey === null || progress.userKey === userKey) return progress;
  if (progress.userKey === null) return { ...progress, userKey };
  return { ...EMPTY_PROGRESS, userKey };
}

/** 오늘의 풀이를 시작한다. 이미 오늘 시작했으면 그대로 둔다. */
export function startAttempt(progress: Progress, questions: Question[], key: string): Progress {
  if (progress.attempt?.date === key && attemptQuestions(progress.attempt, questions) !== null) {
    return progress;
  }
  const ids = pickDaily(
    questions,
    key,
    studyLevel(progress),
    progress.seen,
    '',
    profileCategories(progress.profile),
    dailyGoalOf(progress),
    reviewRecords(progress),
  ).map((q) => q.id);
  if (ids.length === 0) {
    return progress;
  }
  const review = ids.filter((id) => progress.seen.includes(id));
  const seen = [...new Set([...progress.seen, ...ids])];
  return { ...progress, attempt: { date: key, ids, picks: [], review }, seen };
}

/** 고정된 문제 ID를 문제로 바꾼다. 문제 은행에서 빠진 ID가 있으면 null. */
export function attemptQuestions(attempt: Attempt, questions: Question[]): Question[] | null {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const list = attempt.ids.map((id) => byId.get(id));
  return list.every((q): q is Question => q !== undefined) && list.length > 0 ? list : null;
}

/** 현재 문제의 답을 기록한다. 이미 답한 문제는 바꾸지 않는다. */
export function recordPick(progress: Progress, index: number, choice: number): Progress {
  const attempt = progress.attempt;
  if (!attempt || index !== attempt.picks.length || index >= attempt.ids.length) {
    return progress;
  }
  return { ...progress, attempt: { ...attempt, picks: [...attempt.picks, choice] } };
}

export function countCorrect(questions: Question[], picks: number[]): number {
  return picks.filter((choice, i) => questions[i]?.answer === choice).length;
}

export function completeDay(progress: Progress, key: string, correct: number, total: number): Progress {
  if (progress.today?.date === key) {
    return progress;
  }
  const consecutive = progress.lastDate !== null && dayNumber(key) - dayNumber(progress.lastDate) === 1;
  const xpGained = xpForResult(correct);
  return {
    ...progress,
    xp: progress.xp + xpGained,
    streak: consecutive ? progress.streak + 1 : 1,
    lastDate: key,
    today: { date: key, correct, total, xpGained },
  };
}

/** 어제까지 이어진 streak만 유효하다. 하루 이상 건너뛰었으면 0으로 보여 준다. */
export function visibleStreak(progress: Progress, key: string): number {
  if (progress.lastDate === null) {
    return 0;
  }
  return dayNumber(key) - dayNumber(progress.lastDate) <= 1 ? progress.streak : 0;
}

export const BONUS_XP_PER_CORRECT = 10;

/** 오늘 연 보너스 문제. 어제 것은 남기지 않는다. */
export function todaysBonus(progress: Progress, key: string): BonusSet[] {
  return progress.bonus.filter((b) => b.date === key);
}

/**
 * 보너스 5문제를 연다.
 * - 오늘 학습을 마친 뒤에만 열 수 있고, 방법(공유·광고)마다 하루 한 번이다.
 * - 오늘 낸 문제(기본·다른 보너스)와 겹치지 않게, 레벨에 맞는 난이도로 고른다.
 */
export function grantBonus(progress: Progress, questions: Question[], key: string, source: BonusSource): Progress {
  if (progress.today?.date !== key) return progress;
  const mine = todaysBonus(progress, key);
  if (mine.some((b) => b.source === source)) return progress;

  const used = new Set<number>([
    ...(progress.attempt?.date === key ? progress.attempt.ids : []),
    ...mine.flatMap((b) => b.ids),
  ]);
  const pool = questions.filter((q) => !used.has(q.id));
  const ids = pickDaily(
    pool,
    key,
    studyLevel(progress),
    progress.seen,
    source,
    profileCategories(progress.profile),
    QUESTIONS_PER_DAY,
    reviewRecords(progress),
  ).map((q) => q.id);
  if (ids.length === 0) return progress;
  const review = ids.filter((id) => progress.seen.includes(id));

  return {
    ...progress,
    bonus: [...mine, { date: key, source, ids, picks: [], result: null, review }],
    seen: [...new Set([...progress.seen, ...ids])],
  };
}

function updateBonus(progress: Progress, key: string, source: BonusSource, change: (b: BonusSet) => BonusSet): Progress {
  const index = progress.bonus.findIndex((b) => b.date === key && b.source === source);
  if (index < 0) return progress;
  const bonus = progress.bonus.map((b, i) => (i === index ? change(b) : b));
  return { ...progress, bonus };
}

/** 보너스 문제의 현재 문제 답을 기록한다. 이미 답한 문제나 끝난 세트는 바꾸지 않는다. */
export function recordBonusPick(
  progress: Progress,
  key: string,
  source: BonusSource,
  index: number,
  choice: number,
): Progress {
  const set = progress.bonus.find((b) => b.date === key && b.source === source);
  if (!set || set.result || index !== set.picks.length || index >= set.ids.length) return progress;
  return updateBonus(progress, key, source, (b) => ({ ...b, picks: [...b.picks, choice] }));
}

/** 보너스 5문제를 마친다. 정답당 XP만 받고 완료 보너스는 없다. 연속 학습일에는 영향이 없다. */
export function completeBonus(progress: Progress, key: string, source: BonusSource, correct: number): Progress {
  const set = progress.bonus.find((b) => b.date === key && b.source === source);
  if (!set || set.result) return progress;
  const xpGained = correct * BONUS_XP_PER_CORRECT;
  const done = updateBonus(progress, key, source, (b) => ({
    ...b,
    result: { correct, total: b.ids.length, xpGained },
  }));
  return { ...done, xp: done.xp + xpGained };
}

/** 고정된 보너스 문제 ID를 문제로 바꾼다. 문제 은행에서 빠진 ID가 있으면 null. */
export function bonusQuestions(set: BonusSet, questions: Question[]): Question[] | null {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const list = set.ids.map((id) => byId.get(id));
  return list.every((q): q is Question => q !== undefined) && list.length > 0 ? list : null;
}

/**
 * 맞춤 문제 설정(배우는 이유, 실력, 하루 목표)을 정한다.
 * 오늘 문제를 아직 하나도 풀지 않았으면 새 설정으로 다시 고르고, 풀기 시작했으면 내일부터 바뀐다.
 */
export function setStudyProfile(progress: Progress, profile: StudyProfile, questions: Question[], key: string): Progress {
  const next = { ...progress, profile };
  const untouched = next.attempt?.date === key && next.attempt.picks.length === 0 && next.today?.date !== key;
  if (!untouched) return next;
  const discarded = new Set(next.attempt!.ids);
  return startAttempt({ ...next, attempt: null, seen: next.seen.filter((id) => !discarded.has(id)) }, questions, key);
}
