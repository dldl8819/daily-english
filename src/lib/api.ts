import type { ApiErrorBody, AuthResponse } from './apiTypes';
import { canUseSdk, loadUserKey, loadValue, saveValue } from './storage';

/**
 * 서버 주소. 넣고 빌드하면 문제 은행이 번들에서 빠지고 문제를 서버에서 받는다(서버 모드).
 * 비어 있으면 지금처럼 번들의 문제 은행으로 기기 안에서만 동작한다.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
export const SERVER_MODE = API_BASE_URL !== '';

export const SESSION_KEY = 'daily-english:session:v1';
const TIMEOUT_MS = 10_000;
/** 만료 직전 토큰은 쓰지 않는다. */
const EXPIRY_MARGIN_MS = 60_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Session = { token: string; expiresAt: number; userKey: string | null };

let current: Session | null = null;
let renewing: Promise<Session> | null = null;
let userKeyOnce: Promise<string | null> | null = null;

function parseSession(raw: string | null): Session | null {
  try {
    const s = JSON.parse(raw ?? '') as Partial<Session>;
    return typeof s.token === 'string' && typeof s.expiresAt === 'number' && typeof s.userKey === 'string'
      ? { token: s.token, expiresAt: s.expiresAt, userKey: s.userKey }
      : null;
  } catch {
    return null;
  }
}

const fresh = (s: Session) => s.expiresAt - EXPIRY_MARGIN_MS > Date.now();

async function authCode(): Promise<string> {
  if (!canUseSdk()) throw new ApiError(0, 'NOT_IN_TOSS', '토스 앱에서 열어 주세요.');
  try {
    const { User } = await import('@apps-in-toss/web-framework');
    return (await User.createAnonymousKeyAuthCode()).code;
  } catch {
    throw new ApiError(0, 'AUTH_CODE', '토스 앱을 최신 버전으로 업데이트해 주세요.');
  }
}

async function send<T>(method: 'GET' | 'POST', path: string, body: unknown, token: string | null): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', '인터넷 연결을 확인하고 다시 시도해 주세요.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const error = data as Partial<ApiErrorBody> | null;
    throw new ApiError(res.status, error?.code ?? 'HTTP', error?.message ?? '잠시 후 다시 시도해 주세요.');
  }
  return data as T;
}

/**
 * 세션 토큰. 일회용 인증 코드(User.createAnonymousKeyAuthCode)를 서버로 보내 받는다.
 * 저장해 둔 토큰은 같은 토스 사용자(식별키)일 때만 다시 쓴다. 기기를 같이 쓰는 다른 사용자의 토큰을 쓰지 않기 위해서다.
 */
async function session(renew: boolean): Promise<Session> {
  const userKey = await (userKeyOnce ??= loadUserKey());
  if (!renew && current && current.userKey === userKey && fresh(current)) return current;
  if (!renew && userKey !== null) {
    const stored = parseSession(await loadValue(SESSION_KEY));
    if (stored && stored.userKey === userKey && fresh(stored)) return (current = stored);
  }
  renewing ??= (async () => {
    const { token, expiresIn } = await send<AuthResponse>('POST', '/api/v1/auth/anonymous', { code: await authCode() }, null);
    const next = { token, expiresAt: Date.now() + expiresIn * 1000, userKey };
    if (userKey !== null) await saveValue(SESSION_KEY, JSON.stringify(next));
    return next;
  })().finally(() => {
    renewing = null;
  });
  return (current = await renewing);
}

/** 로그인이 필요한 API. 토큰이 거절되면(401) 한 번 새로 받아 다시 보낸다. */
export async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const { token } = await session(false);
  try {
    return await send<T>(method, path, body, token);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    return send<T>(method, path, body, (await session(true)).token);
  }
}
