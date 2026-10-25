import { afterEach, describe, expect, it, vi } from 'vitest';
import sample from '../../src/data/questions.sample.json';
import type { AnswerResponse, CompleteResponse, SetView, TodayResponse } from '../../src/lib/apiTypes';
import type { Question } from '../../src/lib/types';
import { type AppDeps, createApp } from '../src/app';
import { createBank } from '../src/bank';
import { MAX_REISSUES } from '../src/sets';
import { createMemoryStore } from '../src/store-memory';

const BANK = createBank(sample as Question[]);
const SECRET = 's'.repeat(32);
const ORIGIN = 'https://english-bite.apps.tossmini.com';
const API = 'https://api.test/api/v1';
const PROFILE = 'reason=career&careerFocus=dev&selfLevel=1&dailyGoal=5';
/** 한국 시간 2026-10-23 12:00 */
const NOON_KST = Date.parse('2026-10-23T03:00:00Z');
const DATE = '2026-10-23';

function setup(overrides: Partial<AppDeps> = {}) {
  let nowMs = NOON_KST;
  const exchanged: string[] = [];
  const app = createApp({
    store: createMemoryStore(),
    bank: BANK,
    sessionSecret: SECRET,
    allowedOrigins: [ORIGIN],
    devAuth: false,
    // 테스트용 파트너 API: ok:<키>는 성공, 나머지는 유효하지 않은 코드
    exchange: async (code) => {
      exchanged.push(code);
      return code.startsWith('ok:') ? { ok: true, anonKey: code.slice(3) } : { ok: false, reason: 'invalid' };
    },
    now: () => nowMs,
    ...overrides,
  });
  return { app, exchanged, setNow: (ms: number) => (nowMs = ms) };
}

type App = ReturnType<typeof setup>['app'];

async function call<T = Record<string, unknown>>(
  app: App,
  method: string,
  path: string,
  { token, body, headers = {}, base = API }: { token?: string; body?: unknown; headers?: Record<string, string>; base?: string } = {},
): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await app(
    new Request(`${base}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T, headers: res.headers };
}

async function login(app: App, name: string): Promise<string> {
  const res = await call<{ token: string }>(app, 'POST', '/auth/anonymous', { body: { code: `ok:${name}` } });
  expect(res.status).toBe(200);
  return res.body.token;
}

const todayOf = (app: App, token: string, date = DATE, profile = PROFILE) => call<TodayResponse>(app, 'GET', `/daily?date=${date}&${profile}`, { token });
const answerOf = (app: App, token: string, set: string, questionId: number, picked: number, date = DATE) =>
  call<AnswerResponse>(app, 'POST', `/daily/${date}/answers`, { token, body: { set, questionId, picked } });
const completeOf = (app: App, token: string, set: string, date = DATE) => call<CompleteResponse>(app, 'POST', `/daily/${date}/complete`, { token, body: { set } });
const answerKey = (id: number) => BANK.byId.get(id)!.answer;

/** 세트를 모두 맞히거나(wrong 없음) 지정한 순서만 틀린다. */
async function solve(app: App, token: string, set: SetView, wrong: number[] = [], date = DATE) {
  for (const [i, q] of set.questions.entries()) {
    const pick = wrong.includes(i) ? (answerKey(q.id) + 1) % q.choices.length : answerKey(q.id);
    expect((await answerOf(app, token, set.kind, q.id, pick, date)).status).toBe(200);
  }
}

describe('인증', () => {
  it('파트너 API로 바꾼 식별키로 세션 토큰을 주고, 같은 식별키는 같은 사용자다', async () => {
    const { app, exchanged } = setup();
    const a1 = await login(app, 'anon-a');
    const a2 = await login(app, 'anon-a');
    expect(exchanged).toEqual(['ok:anon-a', 'ok:anon-a']);
    await todayOf(app, a1);
    // 다시 로그인해도 같은 세트가 보인다(같은 사용자).
    expect((await todayOf(app, a2)).body.daily.questions).toEqual((await todayOf(app, a1)).body.daily.questions);
  });

  it('유효하지 않은 코드, 빈 코드, 형식이 틀린 본문은 거절한다', async () => {
    const { app } = setup();
    expect((await call(app, 'POST', '/auth/anonymous', { body: { code: 'expired' } })).status).toBe(401);
    expect((await call(app, 'POST', '/auth/anonymous', { body: { code: '' } })).status).toBe(400);
    expect((await call(app, 'POST', '/auth/anonymous', { body: '{not json' })).status).toBe(400);
    expect((await call(app, 'POST', '/auth/anonymous', { body: [1] })).status).toBe(400);
  });

  it('토큰이 없거나, 변조됐거나, 다른 키로 서명됐거나, 만료되면 401', async () => {
    const { app, setNow } = setup();
    const token = await login(app, 'anon-a');
    expect((await call(app, 'GET', `/daily?date=${DATE}&${PROFILE}`)).status).toBe(401);
    expect((await todayOf(app, `${token}x`)).status).toBe(401);
    const [h, p, s] = token.split('.');
    const forgedPayload = btoa(JSON.stringify({ ...JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))), sub: 'someone-else' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect((await todayOf(app, `${h}.${forgedPayload}.${s}`)).status).toBe(401);
    expect((await todayOf(app, `${h}.${p}.`)).status).toBe(401);
    expect((await todayOf(app, 'a.b.c')).status).toBe(401);

    const other = setup({ sessionSecret: 'o'.repeat(32) });
    expect((await todayOf(other.app, token)).status).toBe(401);

    setNow(NOON_KST + 31 * 86_400_000);
    expect((await call(app, 'GET', `/me/progress`, { token })).status).toBe(401);
  });

  it('개발용 로그인은 localhost로 온 요청에서만 동작한다', async () => {
    const { app, exchanged } = setup({ devAuth: true });
    expect((await call(app, 'POST', '/auth/anonymous', { body: { code: 'dev:me' } })).status).toBe(401);
    expect(exchanged).toEqual(['dev:me']);
    const local = await call<{ token: string }>(app, 'POST', '/auth/anonymous', { body: { code: 'dev:me' }, base: 'http://localhost:8787/api/v1' });
    expect(local.status).toBe(200);
    expect(exchanged).toEqual(['dev:me']);
  });

  it('서명 키가 짧으면 아무 요청도 처리하지 않는다', async () => {
    const { app } = setup({ sessionSecret: 'short' });
    expect((await call(app, 'POST', '/auth/anonymous', { body: { code: 'ok:a' } })).body).toMatchObject({ code: 'MISCONFIGURED' });
  });
});

describe('오늘의 문제', () => {
  it('정답과 해설 없이 문제를 내고, 같은 날에는 같은 문제를 준다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const first = await todayOf(app, token);
    expect(first.status).toBe(200);
    expect(first.body.daily.questions).toHaveLength(5);
    for (const q of first.body.daily.questions) expect(Object.keys(q).sort()).toEqual(['category', 'choices', 'difficulty', 'id', 'prompt']);
    expect(JSON.stringify(first.body)).not.toContain('"answer"');
    expect(JSON.stringify(first.body)).not.toContain('explanation');
    expect((await todayOf(app, token)).body.daily).toEqual(first.body.daily);
    expect(first.headers.get('cache-control')).toBe('no-store');
  });

  it('하루 목표만큼 내고, 맞춤 설정의 분류에서만 고른다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const res = await todayOf(app, token, DATE, 'reason=study&selfLevel=2&dailyGoal=10');
    expect(res.body.daily.questions).toHaveLength(10);
    expect(new Set(res.body.daily.questions.map((q) => q.category))).toEqual(new Set(['study', 'toeic']));
  });

  it('오늘 앞뒤 하루가 아닌 날짜, 형식이 틀린 날짜·설정은 거절한다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    expect((await todayOf(app, token, '2026-10-25')).body).toMatchObject({ code: 'DATE_OUT_OF_RANGE' });
    expect((await todayOf(app, token, '2026-10-21')).body).toMatchObject({ code: 'DATE_OUT_OF_RANGE' });
    expect((await todayOf(app, token, '2026-10-22')).status).toBe(200);
    expect((await todayOf(app, token, '2026-02-30')).body).toMatchObject({ code: 'INVALID_DATE' });
    expect((await todayOf(app, token, DATE, 'reason=career&selfLevel=1&dailyGoal=5')).body).toMatchObject({ code: 'INVALID_PROFILE' });
    expect((await todayOf(app, token, DATE, 'reason=travel&selfLevel=1&dailyGoal=50')).body).toMatchObject({ code: 'INVALID_PROFILE' });
  });

  it('하나도 풀기 전에 설정을 바꾸면 다시 고르되, 정해진 횟수까지만', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const profiles = ['reason=travel&selfLevel=1&dailyGoal=5', 'reason=study&selfLevel=1&dailyGoal=5', PROFILE, 'reason=travel&selfLevel=1&dailyGoal=5'];
    let ids = (await todayOf(app, token)).body.daily.questions.map((q) => q.id);
    for (const [i, profile] of profiles.entries()) {
      const next = (await todayOf(app, token, DATE, profile)).body.daily.questions.map((q) => q.id);
      if (i < MAX_REISSUES) expect(next).not.toEqual(ids);
      else expect(next).toEqual(ids);
      ids = next;
    }
  });

  it('답을 하나라도 낸 뒤에는 설정을 바꿔도 그대로다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const daily = (await todayOf(app, token)).body.daily;
    await answerOf(app, token, 'daily', daily.questions[0].id, 0);
    expect((await todayOf(app, token, DATE, 'reason=travel&selfLevel=1&dailyGoal=5')).body.daily.questions).toEqual(daily.questions);
  });
});

describe('채점', () => {
  it('문장 해석은 답하기 전에는 주지 않고, 채점 결과와 답한 문제의 다시 불러오기에만 싣는다', async () => {
    const withTranslation = createBank((sample as Question[]).map((q) => ({ ...q, translation: `해석 #${q.id}` })));
    const { app } = setup({ bank: withTranslation });
    const token = await login(app, 'a');
    const before = (await todayOf(app, token)).body;
    expect(JSON.stringify(before)).not.toContain('해석 #');
    const [q0, q1] = before.daily.questions;
    const graded = await answerOf(app, token, 'daily', q0.id, 0);
    expect(graded.body.translation).toBe(`해석 #${q0.id}`);
    const after = (await todayOf(app, token)).body.daily;
    expect(after.graded.map((g) => g.translation)).toEqual([`해석 #${q0.id}`]);
    expect(JSON.stringify(after.questions)).not.toContain('해석 #');
    expect(JSON.stringify(after)).not.toContain(`해석 #${q1.id}`);
  });

  it('해석이 없는 문항은 채점 결과에 translation을 넣지 않는다', async () => {
    const withoutTranslation = createBank((sample as Question[]).map(({ translation: _translation, ...q }) => q));
    const { app } = setup({ bank: withoutTranslation });
    const token = await login(app, 'a');
    const q = (await todayOf(app, token)).body.daily.questions[0];
    expect(Object.keys((await answerOf(app, token, 'daily', q.id, 0)).body).sort()).toEqual(['answer', 'correct', 'explanation']);
  });

  it('답을 내면 정답과 해설을 주고, 다시 불러오면 답한 문제의 채점 결과만 들어 있다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const [q0, q1] = (await todayOf(app, token)).body.daily.questions;
    const right = await answerOf(app, token, 'daily', q0.id, answerKey(q0.id));
    const { explanation, translation } = BANK.byId.get(q0.id)!;
    expect(right.body).toEqual({ correct: true, answer: answerKey(q0.id), explanation, ...(translation ? { translation } : {}) });
    const wrongPick = (answerKey(q1.id) + 1) % 4;
    expect((await answerOf(app, token, 'daily', q1.id, wrongPick)).body).toMatchObject({ correct: false, answer: answerKey(q1.id) });
    const daily = (await todayOf(app, token)).body.daily;
    expect(daily.picks).toEqual([answerKey(q0.id), wrongPick]);
    expect(daily.graded.map((g) => g.answer)).toEqual([answerKey(q0.id), answerKey(q1.id)]);
  });

  it('세트에 없는 문제, 순서를 건너뛴 문제, 범위 밖 보기는 채점하지 않는다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const daily = (await todayOf(app, token)).body.daily;
    const outside = BANK.questions.find((q) => !daily.questions.some((d) => d.id === q.id))!;
    expect((await answerOf(app, token, 'daily', outside.id, 0)).body).toMatchObject({ code: 'NOT_IN_SET' });
    expect((await answerOf(app, token, 'daily', daily.questions[2].id, 0)).body).toMatchObject({ code: 'OUT_OF_ORDER' });
    expect((await answerOf(app, token, 'daily', daily.questions[0].id, 4)).body).toMatchObject({ code: 'INVALID_PICK' });
    expect((await answerOf(app, token, 'daily', daily.questions[0].id, 1.5)).body).toMatchObject({ code: 'INVALID_PICK' });
    expect((await answerOf(app, token, 'share', daily.questions[0].id, 0)).body).toMatchObject({ code: 'SET_NOT_FOUND' });
  });

  it('같은 답을 다시 보내면 같은 결과, 다른 답이면 409', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const q = (await todayOf(app, token)).body.daily.questions[0];
    const first = await answerOf(app, token, 'daily', q.id, 1);
    expect((await answerOf(app, token, 'daily', q.id, 1)).body).toEqual(first.body);
    expect((await answerOf(app, token, 'daily', q.id, 2)).status).toBe(409);
  });

  it('다른 사용자의 세트는 채점하거나 볼 수 없다', async () => {
    const { app } = setup();
    const a = await login(app, 'a');
    const b = await login(app, 'b');
    const aDaily = (await todayOf(app, a)).body.daily;
    expect((await answerOf(app, b, 'daily', aDaily.questions[0].id, 0)).status).toBe(404);
    const bDaily = (await todayOf(app, b)).body.daily;
    if (!bDaily.questions.some((q) => q.id === aDaily.questions[0].id)) {
      expect((await answerOf(app, b, 'daily', aDaily.questions[0].id, 0)).body).toMatchObject({ code: 'NOT_IN_SET' });
    }
    expect((await todayOf(app, a)).body.daily.picks).toEqual([]);
  });
});

describe('완료와 보너스', () => {
  it('다 풀어야 완료되고, XP는 저장된 답으로 계산하며, 다시 완료해도 두 번 더하지 않는다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const daily = (await todayOf(app, token)).body.daily;
    expect((await completeOf(app, token, 'daily')).body).toMatchObject({ code: 'UNANSWERED' });
    await solve(app, token, daily, [4]);
    const done = await completeOf(app, token, 'daily');
    expect(done.body).toEqual({ result: { correct: 4, total: 5, xpGained: 45 }, me: { xp: 45, level: 1, streak: 1, lastDate: DATE } });
    expect((await completeOf(app, token, 'daily')).body).toEqual(done.body);
    expect((await answerOf(app, token, 'daily', daily.questions[4].id, answerKey(daily.questions[4].id))).status).toBe(409);
  });

  it('보너스는 오늘의 문제를 마친 뒤에만, 방법마다 한 번, 겹치지 않는 5문제다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const daily = (await todayOf(app, token)).body.daily;
    expect((await call(app, 'POST', `/daily/${DATE}/bonus`, { token, body: { source: 'share' } })).body).toMatchObject({ code: 'DAILY_NOT_COMPLETED' });
    await solve(app, token, daily);
    await completeOf(app, token, 'daily');

    const share = await call<SetView>(app, 'POST', `/daily/${DATE}/bonus`, { token, body: { source: 'share' } });
    expect(share.body.questions).toHaveLength(5);
    expect(JSON.stringify(share.body)).not.toContain('explanation');
    const again = await call<SetView>(app, 'POST', `/daily/${DATE}/bonus`, { token, body: { source: 'share' } });
    expect(again.body).toEqual(share.body);
    const ad = await call<SetView>(app, 'POST', `/daily/${DATE}/bonus`, { token, body: { source: 'ad' } });
    const ids = [...daily.questions, ...share.body.questions, ...ad.body.questions].map((q) => q.id);
    expect(new Set(ids).size).toBe(15);
    expect((await call(app, 'POST', `/daily/${DATE}/bonus`, { token, body: { source: 'free' } })).status).toBe(400);

    await solve(app, token, share.body, [0, 1]);
    const bonusDone = await completeOf(app, token, 'share');
    expect(bonusDone.body).toEqual({ result: { correct: 3, total: 5, xpGained: 30 }, me: { xp: 85, level: 2, streak: 1, lastDate: DATE } });
    const today = (await todayOf(app, token)).body;
    expect(today.bonus.map((b) => b.kind)).toEqual(['share', 'ad']);
    expect(today.me.xp).toBe(85);
  });

  it('하루에 정답을 받을 수 있는 문제는 오늘의 문제와 보너스 두 세트뿐이다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const daily = (await todayOf(app, token)).body.daily;
    await solve(app, token, daily);
    await completeOf(app, token, 'daily');
    const issued = new Set(daily.questions.map((q) => q.id));
    for (const source of ['share', 'ad']) {
      const set = (await call<SetView>(app, 'POST', `/daily/${DATE}/bonus`, { token, body: { source } })).body;
      set.questions.forEach((q) => issued.add(q.id));
    }
    let graded = 0;
    for (const q of BANK.questions) {
      for (const set of ['daily', 'share', 'ad']) {
        if ((await answerOf(app, token, set, q.id, 0)).status === 200) graded++;
      }
    }
    // 이미 답한 오늘의 문제 5개(같은 답은 같은 결과) + 보너스 각 세트의 첫 문제만 순서대로 채점된다.
    expect(graded).toBeLessThanOrEqual(issued.size);
  });

  it('연속 학습일은 오늘의 문제를 마친 날로 센다', async () => {
    const { app, setNow } = setup();
    const token = await login(app, 'a');
    for (const [day, date] of [[0, '2026-10-23'], [1, '2026-10-24'], [3, '2026-10-26']] as const) {
      setNow(NOON_KST + day * 86_400_000);
      await solve(app, token, (await todayOf(app, token, date)).body.daily, [], date);
      const { me } = (await completeOf(app, token, 'daily', date)).body;
      expect(me.streak).toBe(day === 1 ? 2 : 1);
    }
  });
});

describe('기기 기록 가져오기', () => {
  it('한 번만, 서버 기록이 생기기 전에만 받고, 본 문제는 다시 내지 않는다', async () => {
    const { app } = setup();
    // 가져오지 않았다면 나왔을 문제를 본 문제로 넘긴다.
    const seen = (await todayOf(app, await login(app, 'base'))).body.daily.questions.map((q) => q.id);
    const token = await login(app, 'a');
    const body = { xp: 300, streak: 4, lastDate: '2026-10-22', seen: [...seen, 99999] };
    expect((await call(app, 'POST', '/me/progress/import', { token, body })).status).toBe(200);
    expect((await call(app, 'POST', '/me/progress/import', { token, body })).body).toMatchObject({ code: 'ALREADY_IMPORTED' });

    const today = (await todayOf(app, token)).body;
    expect(today.me).toEqual({ xp: 300, level: 3, streak: 4, lastDate: '2026-10-22' });
    expect(today.daily.questions.some((q) => seen.includes(q.id))).toBe(false);
    await solve(app, token, today.daily);
    expect((await completeOf(app, token, 'daily')).body.me).toMatchObject({ xp: 355, streak: 5 });

    const later = await login(app, 'b');
    await todayOf(app, later);
    expect((await call(app, 'POST', '/me/progress/import', { token: later, body })).body).toMatchObject({ code: 'ALREADY_STARTED' });
  });

  it('형식이 틀린 기록은 받지 않는다', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    for (const body of [
      { xp: -1, streak: 0, lastDate: null, seen: [] },
      { xp: 1e12, streak: 0, lastDate: null, seen: [] },
      { xp: 0, streak: 0, lastDate: '2030-01-01', seen: [] },
      { xp: 0, streak: 0, lastDate: null, seen: 'all' },
    ]) {
      expect((await call(app, 'POST', '/me/progress/import', { token, body })).body).toMatchObject({ code: 'INVALID_IMPORT' });
    }
  });
});

describe('서버 오류 로그 (Workers 로그)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('5xx는 원인·경로·ray를 로그에만 남기고, 인증 코드·토큰·쿼리는 남기지 않는다', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createMemoryStore();
    const failing = {
      ...store,
      sets: async () => {
        throw new Error('supabase 08006: connection failure');
      },
    };
    const { app } = setup({ store: failing });
    const token = await login(app, 'secret-anon-key');
    const res = await call(app, 'GET', `/daily?date=${DATE}&${PROFILE}`, { token, headers: { 'cf-ray': 'ray-1' } });

    expect(res.status).toBe(500);
    // 원인은 응답에 싣지 않는다.
    expect(res.body).toEqual({ code: 'INTERNAL', message: '잠시 후 다시 시도해 주세요.' });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0][0]).toMatchObject({
      event: 'api_error',
      status: 500,
      code: 'INTERNAL',
      detail: 'Error: supabase 08006: connection failure',
      method: 'GET',
      path: '/api/v1/daily',
      ray: 'ray-1',
    });
    const logged = JSON.stringify([...errors.mock.calls, ...warns.mock.calls]);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain('secret-anon-key');
    expect(logged).not.toContain('careerFocus');
  });

  it('토스 인증 서버 오류는 error, 요청 한도 초과는 warn으로 남기고, 정상 거절(4xx)은 남기지 않는다', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app } = setup({
      exchange: async (code) => {
        if (code === 'code-upstream') return { ok: false, reason: 'upstream', detail: 'http 503' };
        if (code === 'code-busy') return { ok: false, reason: 'rate_limited', detail: 'FAIL 4095' };
        return code.startsWith('ok:') ? { ok: true, anonKey: code.slice(3) } : { ok: false, reason: 'invalid' };
      },
    });
    expect((await call(app, 'POST', '/auth/anonymous', { body: { code: 'code-upstream' } })).status).toBe(502);
    expect(errors.mock.calls[0][0]).toMatchObject({ event: 'api_error', status: 502, code: 'AUTH_UPSTREAM', detail: 'http 503' });
    expect((await call(app, 'POST', '/auth/anonymous', { body: { code: 'code-busy' } })).status).toBe(429);
    expect(warns.mock.calls[0][0]).toMatchObject({ event: 'api_error', status: 429, code: 'RATE_LIMITED', detail: 'FAIL 4095' });
    expect(JSON.stringify([...errors.mock.calls, ...warns.mock.calls])).not.toContain('code-');

    const token = await login(app, 'a');
    await call(app, 'POST', '/auth/anonymous', { body: { code: 'expired' } });
    await todayOf(app, token, '2026-10-30');
    await answerOf(app, token, 'daily', 1, 0);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(warns).toHaveBeenCalledTimes(1);
  });

  it('서명 키가 짧은 설정 오류는 원인을 남긴다', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = setup({ sessionSecret: 'short' });
    await call(app, 'POST', '/auth/anonymous', { body: { code: 'ok:a' } });
    expect(errors.mock.calls[0][0]).toMatchObject({ code: 'MISCONFIGURED', detail: 'SESSION_SECRET이 32자보다 짧아요.' });
  });
});

describe('HTTP', () => {
  it('허용한 Origin에만 CORS 헤더를 붙이고, 사전 요청에 답한다', async () => {
    const { app } = setup();
    const allowed = await call(app, 'POST', '/auth/anonymous', { body: { code: 'ok:a' }, headers: { origin: ORIGIN } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const denied = await call(app, 'POST', '/auth/anonymous', { body: { code: 'ok:a' }, headers: { origin: 'https://evil.example' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await app(new Request(`${API}/daily`, { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('큰 본문은 413, 없는 주소는 404', async () => {
    const { app } = setup();
    const token = await login(app, 'a');
    const big = { xp: 0, streak: 0, lastDate: null, seen: Array.from({ length: 20_000 }, (_, i) => i) };
    expect((await call(app, 'POST', '/me/progress/import', { token, body: big })).status).toBe(413);
    expect((await call(app, 'GET', '/admin', { token })).status).toBe(404);
  });
});
