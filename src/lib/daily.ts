import type { AnswerRecord, Attempt, BonusSet, BonusSource, Category, Difficulty, Progress, Question, StudyProfile } from './types';
import { reviewPriority, reviewRecords } from './history';
import { xpForPick, xpForResult } from './level';
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

/**
 * 날짜와 문제 ID로 정해지는 섞기용 값. 같은 입력이면 항상 같은 순서가 나온다.
 * `${key}#${id}`를 FNV-1a로 해시한 값이다. 키 부분(`${key}#`)을 먼저 해시해 두고(rankPrefix) 문제마다 ID만 이어서 해시한다.
 * FNV-1a는 글자를 앞에서부터 하나씩 더하므로 문자열 전체를 한 번에 해시한 값과 같다.
 */
function rankPrefix(key: string): number {
  let h = 2166136261;
  for (const ch of `${key}#`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h;
}

function rankOf(prefix: number, id: number): number {
  let h = prefix;
  for (const ch of String(id)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 분류 → 난이도 → 문제 위치(은행 순서). 문제를 고를 때 은행 전체 대신 필요한 묶음만 훑으려고 만든다. */
type QuestionIndex = {
  size: number;
  buckets: Map<Category, Map<number, number[]>>;
  counts: Map<Category, number>;
  difficulties: number[];
  /** ID → 위치. ID가 겹치는 비정상 은행도 지금과 같게 다루려고 위치를 모두 둔다. */
  positions: Map<number, number[]>;
};

const indexes = new WeakMap<readonly Question[], QuestionIndex>();

function questionIndex(questions: readonly Question[]): QuestionIndex {
  const cached = indexes.get(questions);
  if (cached && cached.size === questions.length) return cached;
  const index: QuestionIndex = { size: questions.length, buckets: new Map(), counts: new Map(), difficulties: [], positions: new Map() };
  const difficulties = new Set<number>();
  questions.forEach((q, i) => {
    let byDifficulty = index.buckets.get(q.category);
    if (!byDifficulty) index.buckets.set(q.category, (byDifficulty = new Map()));
    let bucket = byDifficulty.get(q.difficulty);
    if (!bucket) byDifficulty.set(q.difficulty, (bucket = []));
    bucket.push(i);
    index.counts.set(q.category, (index.counts.get(q.category) ?? 0) + 1);
    const at = index.positions.get(q.id);
    if (at) at.push(i);
    else index.positions.set(q.id, [i]);
    difficulties.add(q.difficulty);
  });
  index.difficulties = [...difficulties];
  indexes.set(questions, index);
  return index;
}

/** 문제 고르기 색인을 미리 만든다. 서버는 시작할 때 불러 첫 요청에서 만들지 않게 한다. 같은 배열이면 다시 만들지 않는다. */
export function indexQuestions(questions: readonly Question[]): void {
  questionIndex(questions);
}

/**
 * 오늘 낼 문제를 고른다.
 * - 레벨에 맞는 난이도 구성(difficultyMix)을 따른다.
 * - 안 본 문제를 먼저 고르고, 다 봤으면 본 문제를 복습으로 낸다. 복습은 틀린 것, 오래전에 답한 것부터(records).
 * - 학습 목적의 분류(categories)에서만 고르고, 분류가 둘이면 번갈아 고른다.
 * - 원하는 난이도가 모자라면 가까운 난이도에서 채운다. 이때도 새 문제가 남아 있으면 복습보다 새 문제를 먼저 낸다.
 * - exclude에 있는 ID는 고르지 않는다(보너스가 오늘 낸 문제를 빼는 데 쓴다).
 *
 * 서버는 요청당 CPU 시간이 짧다(Workers 무료 플랜 10ms, docs/21). 그래서 은행 전체를 훑지 않고
 * 색인(questionIndex)에서 자리에 맞는 분류·난이도 묶음만 훑는다. 같은 섞기 값이면 은행 순서가 앞선 문제를 고른다.
 * 새 문제가 모두 떨어진 뒤의 복습만 예전처럼 은행 전체를 훑는다.
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
  exclude: ReadonlySet<number> = new Set(),
): Question[] {
  const index = questionIndex(questions);
  const seenSet = new Set(seen);
  const used = new Set<number>();
  const prefix = rankPrefix(key + salt);
  const free = (q: Question) => !used.has(q.id) && !exclude.has(q.id);

  // 목적에 맞는 문제가 하나도 없을 때(문제 은행이 비정상)만 전체에서 고른다.
  const goal = [...new Set(categories)];
  const excludedIn = (inPool: (q: Question) => boolean) => {
    let n = 0;
    for (const id of exclude) for (const i of index.positions.get(id) ?? []) if (inPool(questions[i])) n++;
    return n;
  };
  const inGoal = (q: Question) => goal.includes(q.category);
  const goalSize = goal.reduce((sum, c) => sum + (index.counts.get(c) ?? 0), 0) - excludedIn(inGoal);
  const inPool = goalSize > 0 ? inGoal : () => true;
  const poolCategories = goalSize > 0 ? goal : [...index.buckets.keys()];
  const poolSize = goalSize > 0 ? goalSize : questions.length - excludedIn(inPool);
  const bucketOf = (category: Category, difficulty: number) => index.buckets.get(category)?.get(difficulty) ?? [];

  /** 묶음들에서 안 본 문제 중 섞기 값이 가장 작은 문제의 위치. 같으면 은행 순서가 앞선 문제. 없으면 -1 */
  const firstNew = (buckets: number[][]) => {
    let best = -1;
    let bestRank = 0;
    for (const bucket of buckets) {
      for (const i of bucket) {
        const q = questions[i];
        if (seenSet.has(q.id) || !free(q)) continue;
        const r = rankOf(prefix, q.id);
        if (best < 0 || r < bestRank || (r === bestRank && i < best)) {
          best = i;
          bestRank = r;
        }
      }
    }
    return best;
  };

  // 새 문제가 모두 떨어졌을 때의 복습: 가까운 난이도, 같은 분류, 틀린 것·오래전에 답한 것, 섞은 순서 순. 은행 순서대로 훑는다.
  const OLDEST: AnswerRecord = { date: '', correct: true };
  const comesFirst = (a: Question, b: Question) => {
    const seenA = seenSet.has(a.id);
    const seenB = seenSet.has(b.id);
    if (seenA !== seenB) return Number(seenA) - Number(seenB);
    const review = seenA ? reviewPriority(records.get(a.id) ?? OLDEST, records.get(b.id) ?? OLDEST) : 0;
    return review || rankOf(prefix, a.id) - rankOf(prefix, b.id);
  };
  const firstReview = (difficulty: number, category: Category) => {
    const byCloseness = (q: Question) => Math.abs(q.difficulty - difficulty);
    const nearest = (a: Question, b: Question) =>
      byCloseness(a) - byCloseness(b) ||
      Number(a.category !== category) - Number(b.category !== category) ||
      comesFirst(a, b);
    let best = -1;
    questions.forEach((q, i) => {
      if (free(q) && inPool(q) && (best < 0 || nearest(q, questions[best]) < 0)) best = i;
    });
    return best;
  };

  const picked: Question[] = [];
  const order: Category[] = dayNumber(key) % 2 === 0 ? categories : [...categories].reverse();
  difficultyMix(level, count).forEach((difficulty, slot) => {
    if (picked.length >= Math.min(count, poolSize)) return;
    const category = order[slot % order.length];
    // 1. 같은 난이도·같은 분류의 새 문제 2. 같은 난이도의 새 문제
    let best = firstNew([bucketOf(category, difficulty)]);
    if (best < 0) best = firstNew(poolCategories.map((c) => bucketOf(c, difficulty)));
    // 3. 원하는 난이도의 새 문제가 없으면 가까운 난이도의 새 문제를 먼저 낸다(하루 20문제씩 1년 동안 새 문제를 내기 위해서다).
    //    난이도 거리가 같으면 같은 분류를 먼저 본다.
    if (best < 0) {
      const gaps = [...new Set(index.difficulties.map((d) => Math.abs(d - difficulty)))].sort((a, b) => a - b);
      for (const gap of gaps) {
        const near = index.difficulties.filter((d) => Math.abs(d - difficulty) === gap);
        best = firstNew(near.map((d) => bucketOf(category, d)));
        if (best < 0) best = firstNew(poolCategories.filter((c) => c !== category).flatMap((c) => near.map((d) => bucketOf(c, d))));
        if (best >= 0) break;
      }
    }
    // 4. 새 문제가 모두 떨어졌을 때만 복습한다.
    if (best < 0) best = firstReview(difficulty, category);
    if (best >= 0) {
      picked.push(questions[best]);
      used.add(questions[best].id);
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

/** 현재 문제의 답을 기록하고, 맞혔으면 XP를 바로 준다(xpForPick). 이미 답한 문제는 바꾸지 않는다. */
export function recordPick(progress: Progress, index: number, choice: number, correct: boolean): Progress {
  const attempt = progress.attempt;
  if (!attempt || index !== attempt.picks.length || index >= attempt.ids.length) {
    return progress;
  }
  const gained = xpForPick(correct);
  return {
    ...progress,
    xp: progress.xp + gained,
    attempt: { ...attempt, picks: [...attempt.picks, choice], xpGranted: (attempt.xpGranted ?? 0) + gained },
  };
}

export function countCorrect(questions: Question[], picks: number[]): number {
  return picks.filter((choice, i) => questions[i]?.answer === choice).length;
}

export function completeDay(progress: Progress, key: string, correct: number, total: number): Progress {
  if (progress.today?.date === key) {
    return progress;
  }
  const consecutive = progress.lastDate !== null && dayNumber(key) - dayNumber(progress.lastDate) === 1;
  // 결과의 XP는 세트 합계다. 답할 때 이미 준 XP를 빼고 나머지(완료 보너스)만 더한다.
  const xpGained = xpForResult(correct);
  const granted = progress.attempt?.date === key ? (progress.attempt.xpGranted ?? 0) : 0;
  return {
    ...progress,
    xp: progress.xp + Math.max(0, xpGained - granted),
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
  // 은행을 걸러 새 배열을 만들지 않고 뺄 ID를 넘긴다. 같은 배열이어야 색인을 다시 쓴다.
  const ids = pickDaily(
    questions,
    key,
    studyLevel(progress),
    progress.seen,
    source,
    profileCategories(progress.profile),
    QUESTIONS_PER_DAY,
    reviewRecords(progress),
    used,
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

/** 보너스 문제의 현재 문제 답을 기록하고, 맞혔으면 XP를 바로 준다. 이미 답한 문제나 끝난 세트는 바꾸지 않는다. */
export function recordBonusPick(
  progress: Progress,
  key: string,
  source: BonusSource,
  index: number,
  choice: number,
  correct: boolean,
): Progress {
  const set = progress.bonus.find((b) => b.date === key && b.source === source);
  if (!set || set.result || index !== set.picks.length || index >= set.ids.length) return progress;
  const gained = correct ? BONUS_XP_PER_CORRECT : 0;
  const next = updateBonus(progress, key, source, (b) => ({ ...b, picks: [...b.picks, choice], xpGranted: (b.xpGranted ?? 0) + gained }));
  return { ...next, xp: next.xp + gained };
}

/** 보너스 5문제를 마친다. 정답당 XP만 받고 완료 보너스는 없다(답할 때 이미 받았다). 연속 학습일에는 영향이 없다. */
export function completeBonus(progress: Progress, key: string, source: BonusSource, correct: number): Progress {
  const set = progress.bonus.find((b) => b.date === key && b.source === source);
  if (!set || set.result) return progress;
  const xpGained = correct * BONUS_XP_PER_CORRECT;
  const done = updateBonus(progress, key, source, (b) => ({
    ...b,
    result: { correct, total: b.ids.length, xpGained },
  }));
  return { ...done, xp: done.xp + Math.max(0, xpGained - (set.xpGranted ?? 0)) };
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
