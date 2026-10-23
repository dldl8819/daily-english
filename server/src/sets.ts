import type {
  AnswerResponse,
  CompleteResponse,
  ImportRequest,
  Me,
  ProgressResponse,
  SetKind,
  SetResult,
  SetView,
  TodayResponse,
} from '../../src/lib/apiTypes';
import { BONUS_XP_PER_CORRECT, EMPTY_PROGRESS, completeDay, grantBonus, setStudyProfile, startAttempt } from '../../src/lib/daily';
import { levelFromXp, xpForResult } from '../../src/lib/level';
import { CAREER_FOCUSES, DAILY_GOALS, REASONS, SELF_LEVELS } from '../../src/lib/study';
import type { AnswerRecord, BonusSource, Progress, StudyProfile } from '../../src/lib/types';
import { type Bank, gradedOf, publicQuestion } from './bank';
import { isDateKey, withinWindow } from './dates';
import type { SetRow, Store, UserRow } from './store';

/**
 * 문제 내기·채점·완료. 문제 고르기와 XP·연속 학습일 계산은 클라이언트와 같은 함수(src/lib)를 쓴다.
 * 그래서 서버에 저장된 기록을 클라이언트 진행 상황(Progress) 모양으로 바꿔서 넘긴다.
 */

/** 아직 답하지 않은 오늘의 문제를 다른 맞춤 설정으로 다시 고를 수 있는 횟수 (세트마다) */
export const MAX_REISSUES = 3;

/** 가져오기 값의 상한. 랭킹·보상이 없어 정확히 막을 필요는 없지만 터무니없는 값은 받지 않는다. */
const IMPORT_MAX_XP = 10_000_000;
const IMPORT_MAX_STREAK = 100_000;

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** 서버 로그에만 남기는 원인 (사용자에게는 message만 보낸다) */
    readonly detail?: string,
  ) {
    super(message);
  }
}

export function profileKey(p: StudyProfile): string {
  return [p.reason, p.careerFocus ?? '-', p.selfLevel, p.dailyGoal].join(':');
}

/** 맞춤 설정 값이 클라이언트가 고를 수 있는 값인지 확인한다. 형태가 틀리면 null */
export function parseProfile(raw: { reason?: unknown; careerFocus?: unknown; selfLevel?: unknown; dailyGoal?: unknown }): StudyProfile | null {
  const reason = REASONS.find((o) => o.value === raw.reason)?.value;
  const selfLevel = SELF_LEVELS.find((o) => String(o.value) === String(raw.selfLevel))?.value;
  const dailyGoal = DAILY_GOALS.find((o) => String(o.value) === String(raw.dailyGoal))?.value;
  if (!reason || !selfLevel || !dailyGoal) return null;
  if (reason !== 'career') return raw.careerFocus == null || raw.careerFocus === '' ? { reason, careerFocus: null, selfLevel, dailyGoal } : null;
  const careerFocus = CAREER_FOCUSES.find((o) => o.value === raw.careerFocus)?.value;
  return careerFocus ? { reason, careerFocus, selfLevel, dailyGoal } : null;
}

function parseProfileKey(key: string | null): StudyProfile | null {
  const [reason, careerFocus, selfLevel, dailyGoal] = (key ?? '').split(':');
  return parseProfile({ reason, careerFocus: careerFocus === '-' ? null : careerFocus, selfLevel, dailyGoal });
}

function byDate(a: SetRow, b: SetRow): number {
  return a.play_date.localeCompare(b.play_date) || a.id - b.id;
}

function resultOf(row: SetRow): SetResult | null {
  return row.completed_at === null ? null : { correct: row.correct ?? 0, total: row.total ?? 0, xpGained: row.xp_gained ?? 0 };
}

/**
 * 지금 XP·레벨·연속 학습일. 가져온 기록에서 시작해 완료한 세트를 날짜순으로 더한다.
 * 연속 학습일은 오늘의 문제를 마친 날로만 센다(클라이언트 completeDay와 같은 규칙).
 */
export function replay(user: UserRow, rows: SetRow[]): Me {
  let xp = user.imported_xp;
  let streak = user.imported_streak;
  let lastDate = user.imported_last_date;
  for (const row of [...rows].sort(byDate)) {
    if (row.completed_at === null) continue;
    if (row.kind === 'daily' && (lastDate === null || row.play_date > lastDate)) {
      const next = completeDay({ ...EMPTY_PROGRESS, streak, lastDate }, row.play_date, row.correct ?? 0, row.total ?? 0);
      streak = next.streak;
      lastDate = next.lastDate;
    }
    xp += row.xp_gained ?? 0;
  }
  return { xp, level: levelFromXp(xp), streak, lastDate };
}

/** 저장된 기록을 Progress 모양으로 바꾼다. 문제를 고를 때 본 문제·답 기록·레벨을 클라이언트와 같은 방식으로 쓰기 위해서다. */
function progressOf(user: UserRow, rows: SetRow[], bank: Bank, profile: StudyProfile, date: string): Progress {
  const ordered = [...rows].sort(byDate);
  const history: Record<string, AnswerRecord> = {};
  for (const row of ordered) {
    row.picks.forEach((pick, i) => {
      const q = bank.byId.get(row.question_ids[i]);
      if (q) history[q.id] = { date: row.play_date, correct: pick === q.answer };
    });
  }
  const me = replay(user, ordered);
  const daily = ordered.find((r) => r.play_date === date && r.kind === 'daily');
  return {
    ...EMPTY_PROGRESS,
    xp: me.xp,
    streak: me.streak,
    lastDate: me.lastDate,
    profile,
    seen: [...new Set([...user.imported_seen, ...ordered.flatMap((r) => r.question_ids)])],
    history,
    attempt: daily ? { date, ids: daily.question_ids, picks: daily.picks, review: daily.review } : null,
    today: daily?.completed_at ? { date, ...resultOf(daily)! } : null,
    bonus: ordered
      .filter((r) => r.play_date === date && r.kind !== 'daily')
      .map((r) => ({ date, source: r.kind as BonusSource, ids: r.question_ids, picks: r.picks, result: resultOf(r), review: r.review })),
  };
}

function questionOf(bank: Bank, id: number) {
  const q = bank.byId.get(id);
  // 낸 문제를 문제 은행에서 지우면 그 세트를 보여 줄 수 없다. 문제는 지우지 말고 고쳐서 쓴다.
  if (!q) throw new ApiFailure(500, 'BANK_MISMATCH', '문제를 불러오지 못했어요.');
  return q;
}

function setView(row: SetRow, bank: Bank): SetView {
  const questions = row.question_ids.map((id) => questionOf(bank, id));
  return {
    kind: row.kind,
    questions: questions.map(publicQuestion),
    picks: row.picks,
    graded: row.picks.map((_, i) => gradedOf(questions[i])),
    review: row.review,
    result: resultOf(row),
  };
}

async function userOf(store: Store, userId: string): Promise<UserRow> {
  const user = await store.user(userId);
  if (!user) throw new ApiFailure(401, 'UNAUTHORIZED', '다시 로그인해 주세요.');
  return user;
}

function findSet(rows: SetRow[], date: string, kind: SetKind): SetRow | undefined {
  return rows.find((r) => r.play_date === date && r.kind === kind);
}

async function reread(store: Store, userId: string, date: string, kind: SetKind): Promise<SetRow> {
  const row = findSet(await store.sets(userId), date, kind);
  if (!row) throw new ApiFailure(409, 'CONFLICT', '잠시 후 다시 시도해 주세요.');
  return row;
}

/**
 * 오늘의 문제와 보너스 세트. 오늘의 문제가 없으면 새로 고르고,
 * 아직 하나도 풀지 않았는데 맞춤 설정이 바뀌었으면 다시 고른다(MAX_REISSUES번까지).
 */
export async function today(store: Store, bank: Bank, userId: string, date: string, profile: StudyProfile): Promise<TodayResponse> {
  const user = await userOf(store, userId);
  const rows = await store.sets(userId);
  const key = profileKey(profile);
  let daily = findSet(rows, date, 'daily');

  if (!daily) {
    const { attempt } = startAttempt(progressOf(user, rows, bank, profile, date), bank.questions, date);
    if (!attempt || attempt.date !== date) throw new ApiFailure(503, 'NO_QUESTIONS', '낼 문제가 없어요.');
    daily =
      (await store.insertSet({ user_id: userId, play_date: date, kind: 'daily', question_ids: attempt.ids, review: attempt.review, profile: key })) ??
      (await reread(store, userId, date, 'daily'));
  } else {
    const missing = daily.question_ids.some((id) => !bank.byId.has(id));
    const untouched = daily.picks.length === 0 && daily.completed_at === null;
    if (untouched && (daily.profile !== key || missing) && daily.reissues < MAX_REISSUES) {
      const { attempt } = setStudyProfile(progressOf(user, rows, bank, profile, date), profile, bank.questions, date);
      if (attempt && attempt.date === date) {
        daily =
          (await store.reissueSet(daily.id, daily.reissues, { question_ids: attempt.ids, review: attempt.review, profile: key })) ??
          (await reread(store, userId, date, 'daily'));
      }
    }
  }

  const latest = await store.sets(userId);
  return {
    date,
    me: replay(user, latest),
    daily: setView(daily, bank),
    bonus: latest.filter((r) => r.play_date === date && r.kind !== 'daily').sort(byDate).map((r) => setView(r, bank)),
  };
}

/** 보너스 5문제를 연다. 오늘의 문제를 마친 뒤에만, 방법마다 하루 한 번. 이미 열었으면 그 세트를 돌려준다. */
export async function openBonus(store: Store, bank: Bank, userId: string, date: string, source: BonusSource): Promise<SetView> {
  const user = await userOf(store, userId);
  const rows = await store.sets(userId);
  const existing = findSet(rows, date, source);
  if (existing) return setView(existing, bank);
  const daily = findSet(rows, date, 'daily');
  const profile = daily?.completed_at ? parseProfileKey(daily.profile) : null;
  if (!daily || !profile) throw new ApiFailure(409, 'DAILY_NOT_COMPLETED', '오늘의 문제를 먼저 마쳐 주세요.');

  const set = grantBonus(progressOf(user, rows, bank, profile, date), bank.questions, date, source).bonus.find(
    (b) => b.date === date && b.source === source,
  );
  if (!set) throw new ApiFailure(503, 'NO_QUESTIONS', '낼 문제가 없어요.');
  const row =
    (await store.insertSet({ user_id: userId, play_date: date, kind: source, question_ids: set.ids, review: set.review, profile: daily.profile })) ??
    (await reread(store, userId, date, source));
  return setView(row, bank);
}

/**
 * 답 하나를 채점한다. 세트의 다음 문제만 받는다(순서대로).
 * 같은 답을 다시 보내면(응답을 못 받고 재시도) 같은 결과를 돌려준다.
 */
export async function answer(
  store: Store,
  bank: Bank,
  userId: string,
  date: string,
  body: { set?: unknown; questionId?: unknown; picked?: unknown },
): Promise<AnswerResponse> {
  const kind = parseKind(body.set);
  const row = findSet(await store.sets(userId), date, kind);
  if (!row) throw new ApiFailure(404, 'SET_NOT_FOUND', '문제를 찾지 못했어요.');
  const position = typeof body.questionId === 'number' ? row.question_ids.indexOf(body.questionId) : -1;
  if (position < 0) throw new ApiFailure(400, 'NOT_IN_SET', '그날 문제가 아니에요.');
  const q = questionOf(bank, row.question_ids[position]);
  const picked = body.picked;
  if (typeof picked !== 'number' || !Number.isInteger(picked) || picked < 0 || picked >= q.choices.length) {
    throw new ApiFailure(400, 'INVALID_PICK', '보기를 다시 골라 주세요.');
  }
  const graded = { correct: picked === q.answer, ...gradedOf(q) };

  if (position < row.picks.length) {
    if (row.picks[position] === picked) return graded;
    throw new ApiFailure(409, 'ALREADY_ANSWERED', '이미 답한 문제예요.');
  }
  if (row.completed_at !== null) throw new ApiFailure(409, 'ALREADY_COMPLETED', '이미 마친 문제예요.');
  if (position !== row.picks.length) throw new ApiFailure(400, 'OUT_OF_ORDER', '앞 문제부터 풀어 주세요.');

  if (!(await store.appendPick(row.id, row.picks, picked))) {
    // 같은 답이 동시에 두 번 들어온 경우만 성공으로 본다.
    const now = await reread(store, userId, date, kind);
    if (now.picks[position] !== picked) throw new ApiFailure(409, 'ALREADY_ANSWERED', '이미 답한 문제예요.');
  }
  return graded;
}

/** 세트를 마친다. XP는 저장된 답으로 계산한다. 이미 마쳤으면 그 결과를 돌려준다. */
export async function complete(store: Store, bank: Bank, userId: string, date: string, body: { set?: unknown }): Promise<CompleteResponse> {
  const kind = parseKind(body.set);
  const user = await userOf(store, userId);
  let row = findSet(await store.sets(userId), date, kind);
  if (!row) throw new ApiFailure(404, 'SET_NOT_FOUND', '문제를 찾지 못했어요.');
  if (row.completed_at === null) {
    if (row.picks.length < row.question_ids.length) throw new ApiFailure(422, 'UNANSWERED', '답하지 않은 문제가 있어요.');
    const correct = row.picks.filter((pick, i) => pick === questionOf(bank, row!.question_ids[i]).answer).length;
    const xp_gained = kind === 'daily' ? xpForResult(correct) : correct * BONUS_XP_PER_CORRECT;
    row =
      (await store.completeSet(row.id, { correct, total: row.question_ids.length, xp_gained })) ??
      (await reread(store, userId, date, kind));
  }
  return { result: resultOf(row)!, me: replay(user, await store.sets(userId)) };
}

export async function progress(store: Store, userId: string, date: string | null): Promise<ProgressResponse> {
  const user = await userOf(store, userId);
  const rows = await store.sets(userId);
  return { ...replay(user, rows), todayCompleted: rows.some((r) => r.kind === 'daily' && r.play_date === date && r.completed_at !== null) };
}

/**
 * 서버 연동 전 기기 기록을 한 번 받는다. 서버에 세트가 생기기 전에만 받는다.
 * 본 문제 ID는 새 문제를 먼저 내는 데만 쓰고, 그 문제의 내용·정답을 열어 주지 않는다.
 */
export async function importLocal(store: Store, bank: Bank, userId: string, body: Partial<Record<keyof ImportRequest, unknown>>, today: string): Promise<void> {
  const { xp, streak, lastDate, seen } = body;
  const validInt = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
  if (
    !validInt(xp, IMPORT_MAX_XP) ||
    !validInt(streak, IMPORT_MAX_STREAK) ||
    // 기기 시간대 때문에 하루 앞선 날짜까지는 받는다.
    !(lastDate === null || (isDateKey(lastDate) && (lastDate <= today || withinWindow(lastDate, today)))) ||
    !Array.isArray(seen) ||
    seen.length > bank.questions.length * 2
  ) {
    throw new ApiFailure(400, 'INVALID_IMPORT', '가져올 기록 형식이 맞지 않아요.');
  }
  await userOf(store, userId);
  if ((await store.sets(userId)).length > 0) throw new ApiFailure(409, 'ALREADY_STARTED', '이미 서버 기록이 있어요.');
  const imported = await store.importOnce(userId, {
    imported_xp: xp,
    imported_streak: streak,
    imported_last_date: lastDate,
    imported_seen: [...new Set(seen.filter((id): id is number => typeof id === 'number' && bank.byId.has(id)))],
  });
  if (!imported) throw new ApiFailure(409, 'ALREADY_IMPORTED', '이미 기록을 가져왔어요.');
}

function parseKind(value: unknown): SetKind {
  if (value === 'daily' || value === 'share' || value === 'ad') return value;
  throw new ApiFailure(400, 'INVALID_SET', '세트 종류가 맞지 않아요.');
}

export function parseSource(value: unknown): BonusSource {
  if (value === 'share' || value === 'ad') return value;
  throw new ApiFailure(400, 'INVALID_SOURCE', '보너스 방법이 맞지 않아요.');
}
