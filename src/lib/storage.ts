import type {
  AnswerRecord,
  Attempt,
  BonusSet,
  CareerFocus,
  DailyGoal,
  Progress,
  Reason,
  SavedItem,
  SelfLevel,
  StudyProfile,
  TodayResult,
  WrongItem,
} from './types';
import { EMPTY_PROGRESS } from './daily';

export const STORAGE_KEY = 'daily-english:progress:v1';
/** 이전 버전에서 푼 기록으로 틀린 문제를 채웠는지. 한 번만 채우기 위한 표시다. */
export const WRONG_BACKFILL_KEY = 'daily-english:wrong-backfill:v1';

/** 토스 앱 WebView 안에서만 네이티브 브리지가 있다. */
export function isInToss(): boolean {
  return typeof window !== 'undefined' && (window as { ReactNativeWebView?: unknown }).ReactNativeWebView != null;
}

/**
 * SDK를 불러도 되는지. 토스 앱 안이거나, 개발 서버일 때다.
 * 개발 서버는 next.config.mjs에서 SDK를 @apps-in-toss/devtools mock으로 바꿔 두므로 일반 브라우저에서도 SDK 경로를 확인할 수 있다.
 */
export function canUseSdk(): boolean {
  return isInToss() || process.env.NODE_ENV === 'development';
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => typeof n === 'number');
}

function parseToday(value: unknown): TodayResult | null {
  const t = value as Partial<TodayResult> | null;
  return t &&
    typeof t.date === 'string' &&
    typeof t.correct === 'number' &&
    typeof t.total === 'number' &&
    typeof t.xpGained === 'number'
    ? { date: t.date, correct: t.correct, total: t.total, xpGained: t.xpGained }
    : null;
}

function parseAttempt(value: unknown): Attempt | null {
  const a = value as Partial<Attempt> | null;
  return a && typeof a.date === 'string' && isNumberArray(a.ids) && isNumberArray(a.picks)
    ? { date: a.date, ids: a.ids, picks: a.picks, review: isNumberArray(a.review) ? a.review : [] }
    : null;
}

function parseSaved(value: unknown): SavedItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is SavedItem =>
      typeof s?.questionId === 'number' &&
      (s.kind === 'sentence' || s.kind === 'word') &&
      typeof s.savedAt === 'string',
  );
}

const REASONS: Reason[] = ['communication', 'career', 'hobby', 'travel', 'study'];
const CAREER_FOCUSES: CareerFocus[] = ['dev', 'office', 'toeic'];
const DAILY_GOALS: DailyGoal[] = [5, 10, 15, 20];

/**
 * 맞춤 문제 설정을 읽는다. 형태가 틀리면 null(처음 들어올 때처럼 다시 묻는다).
 * 20261022-7의 학습 목적(goal)·실력(selfLevel)은 같은 문제가 나오는 설정으로 옮긴다.
 */
function parseProfile(value: unknown, legacyGoal: unknown, legacyLevel: unknown): StudyProfile | null {
  const v = value as Partial<StudyProfile> | null;
  if (v && typeof v === 'object') {
    const ok =
      REASONS.includes(v.reason as Reason) &&
      (v.reason === 'career' ? CAREER_FOCUSES.includes(v.careerFocus as CareerFocus) : v.careerFocus == null) &&
      (v.selfLevel === 1 || v.selfLevel === 2 || v.selfLevel === 3) &&
      DAILY_GOALS.includes(v.dailyGoal as DailyGoal);
    return ok ? { reason: v.reason!, careerFocus: v.careerFocus ?? null, selfLevel: v.selfLevel!, dailyGoal: v.dailyGoal! } : null;
  }
  const selfLevel: SelfLevel | null = legacyLevel === 1 || legacyLevel === 2 || legacyLevel === 3 ? legacyLevel : null;
  if (selfLevel === null) return null;
  const base = { selfLevel, dailyGoal: 5 as DailyGoal };
  switch (legacyGoal) {
    case 'dev':
    case 'office':
    case 'toeic':
      return { ...base, reason: 'career', careerFocus: legacyGoal };
    case 'study':
      return { ...base, reason: 'study', careerFocus: null };
    case 'daily':
      return { ...base, reason: 'travel', careerFocus: null };
    default:
      return null;
  }
}

function parseWrong(value: unknown): WrongItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (w): w is WrongItem => typeof w?.questionId === 'number' && typeof w.pick === 'number' && typeof w.date === 'string',
  );
}

/** 문제별 답 기록. 형태가 틀린 항목은 버린다. */
function parseHistory(value: unknown): Record<string, AnswerRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, AnswerRecord> = {};
  for (const [id, r] of Object.entries(value as Record<string, unknown>)) {
    const record = r as Partial<AnswerRecord> | null;
    if (/^\d+$/.test(id) && typeof record?.date === 'string' && typeof record.correct === 'boolean') {
      out[id] = { date: record.date, correct: record.correct };
    }
  }
  return out;
}

function parseBonus(value: unknown): BonusSet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((b): BonusSet[] => {
    const r = b?.result as { correct?: unknown; total?: unknown; xpGained?: unknown } | null | undefined;
    const result =
      r && typeof r.correct === 'number' && typeof r.total === 'number' && typeof r.xpGained === 'number'
        ? { correct: r.correct, total: r.total, xpGained: r.xpGained }
        : null;
    return typeof b?.date === 'string' && (b.source === 'share' || b.source === 'ad') && isNumberArray(b.ids) && isNumberArray(b.picks)
      ? [{ date: b.date, source: b.source, ids: b.ids, picks: b.picks, result, review: isNumberArray(b.review) ? b.review : [] }]
      : [];
  });
}

/** 저장된 문자열을 진행 상황으로 바꾼다. 잘못된 필드는 기본값으로 바꾼다. */
export function parseProgress(raw: string | null): Progress {
  if (!raw) {
    return EMPTY_PROGRESS;
  }
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      xp: typeof p.xp === 'number' ? p.xp : 0,
      streak: typeof p.streak === 'number' ? p.streak : 0,
      lastDate: typeof p.lastDate === 'string' ? p.lastDate : null,
      today: parseToday(p.today),
      attempt: parseAttempt(p.attempt),
      seen: isNumberArray(p.seen) ? p.seen : [],
      userKey: typeof p.userKey === 'string' ? p.userKey : null,
      nickname: typeof p.nickname === 'string' ? p.nickname : null,
      saved: parseSaved(p.saved),
      bonus: parseBonus(p.bonus),
      profile: parseProfile(p.profile, p.goal, p.selfLevel),
      wrong: parseWrong(p.wrong),
      history: parseHistory(p.history),
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장이 막힌 환경(시크릿 모드 등)에서는 이번 세션 동안만 유지된다.
  }
}

/**
 * 토스 앱 안에서는 SDK Storage(앱을 종료해도 유지)를 쓰고, 일반 브라우저에서는 localStorage를 쓴다.
 * SDK에 값이 없으면 localStorage 값을 이어받는다.
 */
export async function loadValue(key: string): Promise<string | null> {
  if (canUseSdk()) {
    try {
      const { Storage } = await import('@apps-in-toss/web-framework');
      const raw = await Storage.getItem(key);
      if (raw !== null) {
        return raw;
      }
    } catch {
      // 브리지 호출이 실패하면 localStorage로 대신한다.
    }
  }
  return readLocal(key);
}

/** localStorage에도 항상 써 둔다. 첫 화면을 그리기 전에 동기로 읽을 수 있는 곳이 필요해서다. */
export async function saveValue(key: string, value: string): Promise<void> {
  writeLocal(key, value);
  if (canUseSdk()) {
    try {
      const { Storage } = await import('@apps-in-toss/web-framework');
      await Storage.setItem(key, value);
    } catch {
      // localStorage에는 이미 썼다.
    }
  }
}

export async function loadProgress(): Promise<Progress> {
  return parseProgress(await loadValue(STORAGE_KEY));
}

export async function saveProgress(progress: Progress): Promise<void> {
  await saveValue(STORAGE_KEY, JSON.stringify(progress));
}

/**
 * 앱인토스 사용자 식별키. 같은 미니앱에서는 앱 삭제·기기 변경 후에도 같다.
 * 토스 앱 밖이거나 토스 앱이 5.232.0보다 낮거나 오류가 나면 null이고, 앱은 식별키 없이 계속 동작한다.
 */
export async function loadUserKey(): Promise<string | null> {
  if (!canUseSdk()) return null;
  try {
    const { User } = await import('@apps-in-toss/web-framework');
    if (!User.getAnonymousKey.isSupported()) return null;
    const { hash } = await User.getAnonymousKey();
    return typeof hash === 'string' && hash.length > 0 ? hash : null;
  } catch {
    return null;
  }
}

/** 오늘 날짜 키. 토스 앱에서는 기기 시계 대신 토스 서버 시간을 쓴다. */
export async function todayKey(toKey: (d: Date) => string): Promise<string> {
  if (canUseSdk()) {
    try {
      const { Environment } = await import('@apps-in-toss/web-framework');
      if (Environment.getServerTime.isSupported()) {
        const ms = await Environment.getServerTime();
        if (typeof ms === 'number') {
          return toKey(new Date(ms));
        }
      }
    } catch {
      // 기기 시계로 대신한다.
    }
  }
  return toKey(new Date());
}
