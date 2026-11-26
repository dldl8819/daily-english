import type { AuthResponse } from '../../src/lib/apiTypes';
import { type ExchangeResult, MIN_SECRET_LENGTH, SESSION_TTL_SECONDS, signSession, verifySession } from './auth';
import type { Bank } from './bank';
import { isDateKey, kstToday, withinWindow } from './dates';
import { ApiFailure, answer, complete, importLocal, openBonus, parseProfile, parseSource, progress, today } from './sets';
import type { Store } from './store';

export type AppDeps = {
  store: Store;
  bank: Bank;
  sessionSecret: string;
  /** 허용할 미니앱 Origin. 토큰은 쿠키가 아니라 Authorization 헤더로 오므로 CORS는 보조 장치다. */
  allowedOrigins: string[];
  exchange: (code: string) => Promise<ExchangeResult>;
  /** 로컬 개발: code를 파트너 API로 바꾸지 않고 개발용 사용자로 본다. localhost로 온 요청에서만 동작한다. */
  devAuth: boolean;
  now?: () => number;
};

const PREFIX = '/api/v1';
const MAX_BODY_BYTES = 16 * 1024;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const PREFLIGHT = {
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '600',
};

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  return origin && allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : { vary: 'Origin' };
}

function json(status: number, data: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/**
 * 서버 오류 로그. Workers 로그가 객체의 필드를 색인하므로 대시보드에서 event = api_error, code로 걸러 본다.
 * 5xx와 토스 API 요청 한도 초과(429)만 남긴다. 다른 4xx는 정상 거절이라 호출 로그(상태 코드)로 충분하다.
 * 요청 본문(인증 코드), Authorization 헤더, 쿼리는 남기지 않는다. ray로 같은 요청의 호출 로그를 찾는다.
 */
function logFailure(req: Request, status: number, code: string, detail: string, stack?: string) {
  const entry = {
    event: 'api_error',
    status,
    code,
    detail,
    method: req.method,
    path: new URL(req.url).pathname,
    ray: req.headers.get('cf-ray'),
    ...(stack ? { stack: stack.split('\n').slice(0, 6).join('\n') } : {}),
  };
  if (status >= 500) console.error(entry);
  else console.warn(entry);
}

type Wait = { op: string; ms: number };

/**
 * 요청 안에서 기다린 시간(DB 호출, 토스 API)을 하나씩 잰다.
 * 운영 Workers의 Date.now()는 코드가 도는 동안 멈춰 있고 I/O가 끝난 뒤에만 흐른다. 그래서 호출 앞뒤 차이가 그 호출의 대기 시간이다.
 * CPU 시간은 이 방법으로 잴 수 없다. https://developers.cloudflare.com/workers/runtime-apis/performance/
 */
function timed<F extends (...args: never[]) => Promise<unknown>>(op: string, fn: F, waits: Wait[]): F {
  return (async (...args: Parameters<F>) => {
    const started = Date.now();
    try {
      return await fn(...args);
    } finally {
      waits.push({ op, ms: Date.now() - started });
    }
  }) as F;
}

function timedStore(store: Store, waits: Wait[]): Store {
  const entries = Object.entries(store).map(([op, fn]) => [op, timed(op, (fn as Store[keyof Store]).bind(store) as never, waits)]);
  return Object.fromEntries(entries) as Store;
}

/**
 * 요청마다 걸린 시간과 그 안의 대기를 남긴다(docs/21 5.1). 대시보드에서 event = api_timing으로 걸러 본다.
 * 첫 문제 받기가 7.7초 걸린 일(2026-11-26)의 원인을 찾으려고 넣었다. 사용자 ID, 쿼리, 본문은 남기지 않는다.
 */
function logTiming(req: Request, status: number, ms: number, waits: Wait[]) {
  console.log({ event: 'api_timing', method: req.method, path: new URL(req.url).pathname, status, ms, waits, ray: req.headers.get('cf-ray') });
}

/** 서버 API (docs/11_API_명세.md 2장). 오류는 { code, message } 형식이다. */
export function createApp(deps: AppDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? Date.now;
  return async (req) => {
    const cors = corsHeaders(req.headers.get('origin'), deps.allowedOrigins);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, ...PREFLIGHT } });
    const started = Date.now();
    const waits: Wait[] = [];
    const measured: AppDeps = { ...deps, store: timedStore(deps.store, waits), exchange: timed('exchange', deps.exchange, waits) };
    const res = await handle(req, measured, now, cors);
    logTiming(req, res.status, Date.now() - started, waits);
    return res;
  };
}

async function handle(req: Request, deps: AppDeps, now: () => number, cors: Record<string, string>): Promise<Response> {
  try {
    if (deps.sessionSecret.length < MIN_SECRET_LENGTH) throw new ApiFailure(500, 'MISCONFIGURED', '서버 설정을 확인해 주세요.', 'SESSION_SECRET이 32자보다 짧아요.');
    return json(200, await route(req, deps, now()), cors);
  } catch (e) {
    if (e instanceof ApiFailure) {
      if (e.status >= 500 || e.status === 429) logFailure(req, e.status, e.code, e.detail ?? e.message);
      return json(e.status, { code: e.code, message: e.message }, cors);
    }
    logFailure(req, 500, 'INTERNAL', e instanceof Error ? `${e.name}: ${e.message}` : String(e), e instanceof Error ? e.stack : undefined);
    return json(500, { code: 'INTERNAL', message: '잠시 후 다시 시도해 주세요.' }, cors);
  }
}

async function route(req: Request, deps: AppDeps, nowMs: number): Promise<unknown> {
  const url = new URL(req.url);
  const path = url.pathname;
  const todayKst = kstToday(nowMs);

  if (req.method === 'POST' && path === `${PREFIX}/auth/anonymous`) return authAnonymous(req, deps, nowMs);

  const userId = await authenticate(req, deps, nowMs);

  if (req.method === 'GET' && path === `${PREFIX}/me/progress`) {
    const date = url.searchParams.get('date');
    return progress(deps.store, deps.bank, userId, isDateKey(date) ? date : null);
  }
  if (req.method === 'POST' && path === `${PREFIX}/me/progress/import`) {
    await importLocal(deps.store, deps.bank, userId, await readJson(req), todayKst);
    return { ok: true };
  }
  if (req.method === 'GET' && path === `${PREFIX}/daily`) {
    const date = checkDate(url.searchParams.get('date'), todayKst);
    const profile = parseProfile(Object.fromEntries(url.searchParams));
    if (!profile) throw new ApiFailure(400, 'INVALID_PROFILE', '맞춤 문제 설정을 다시 골라 주세요.');
    return today(deps.store, deps.bank, userId, date, profile);
  }
  const action = path.match(/^\/api\/v1\/daily\/([^/]+)\/(answers|complete|bonus)$/);
  if (req.method === 'POST' && action) {
    const date = checkDate(action[1], todayKst);
    const body = await readJson(req);
    if (action[2] === 'answers') return answer(deps.store, deps.bank, userId, date, body);
    if (action[2] === 'complete') return complete(deps.store, deps.bank, userId, date, body);
    return openBonus(deps.store, deps.bank, userId, date, parseSource(body.source));
  }
  throw new ApiFailure(404, 'NOT_FOUND', '없는 주소예요.');
}

async function authAnonymous(req: Request, deps: AppDeps, nowMs: number): Promise<AuthResponse> {
  const { code } = await readJson(req);
  if (typeof code !== 'string' || code.length === 0 || code.length > 512) {
    throw new ApiFailure(400, 'INVALID_AUTH_CODE', '인증 코드가 올바르지 않아요.');
  }
  let anonKey: string;
  if (deps.devAuth && LOCAL_HOSTS.has(new URL(req.url).hostname)) {
    // 개발용 사용자는 실제 식별키와 겹치지 않게 dev: 로 시작한다. 테스트는 dev:<이름>으로 사용자를 나눈다.
    anonKey = code.startsWith('dev:') ? code : 'dev:local';
  } else {
    const result = await deps.exchange(code);
    if (!result.ok) {
      if (result.reason === 'invalid') throw new ApiFailure(401, 'INVALID_AUTH_CODE', '인증 코드가 만료됐거나 이미 쓰였어요.');
      if (result.reason === 'rate_limited') throw new ApiFailure(429, 'RATE_LIMITED', '잠시 후 다시 시도해 주세요.', result.detail);
      throw new ApiFailure(502, 'AUTH_UPSTREAM', '토스 인증 서버에 연결하지 못했어요.', result.detail);
    }
    anonKey = result.anonKey;
  }
  const user = await deps.store.userByIdentity(anonKey);
  return { token: await signSession(deps.sessionSecret, user.id, Math.floor(nowMs / 1000)), expiresIn: SESSION_TTL_SECONDS };
}

async function authenticate(req: Request, deps: AppDeps, nowMs: number): Promise<string> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const userId = token ? await verifySession(deps.sessionSecret, token, Math.floor(nowMs / 1000)) : null;
  if (!userId) throw new ApiFailure(401, 'UNAUTHORIZED', '다시 로그인해 주세요.');
  return userId;
}

function checkDate(value: string | null, todayKst: string): string {
  if (!isDateKey(value)) throw new ApiFailure(400, 'INVALID_DATE', '날짜 형식이 맞지 않아요.');
  if (!withinWindow(value, todayKst)) throw new ApiFailure(400, 'DATE_OUT_OF_RANGE', '오늘 문제만 풀 수 있어요.');
  return value;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) throw new ApiFailure(413, 'TOO_LARGE', '요청이 너무 커요.');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiFailure(413, 'TOO_LARGE', '요청이 너무 커요.');
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // 아래에서 같은 오류로 처리한다.
  }
  throw new ApiFailure(400, 'INVALID_JSON', '요청 형식이 맞지 않아요.');
}
