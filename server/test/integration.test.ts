import { describe, expect, it } from 'vitest';
import bankData from '../../src/data/questions.json';
import extraData from '../../src/data/questions.extra.json';
import type { AnswerResponse, CompleteResponse, SetView, TodayResponse } from '../../src/lib/apiTypes';
import type { Question } from '../../src/lib/types';

/**
 * 로컬 통합 검증: wrangler dev(Workers 런타임) + 로컬 Supabase(npx supabase start).
 * API_URL(예: http://127.0.0.1:8787)이 있을 때만 돈다. SUPABASE_URL·SUPABASE_PUBLISHABLE_KEY가 있으면 Data API 노출도 확인한다.
 * 서버는 .dev.vars의 DEV_AUTH=true로 띄운다(dev:<이름> 코드로 사용자를 나눈다).
 */
const API = process.env.API_URL;
const SUPABASE = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const BANK = new Map([...(bankData as Question[]), ...(extraData as Question[])].map((q) => [q.id, q]));
const PROFILE = 'reason=career&careerFocus=dev&selfLevel=1&dailyGoal=5';

function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

async function call<T = Record<string, unknown>>(method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as T, headers: res.headers };
}

async function login(): Promise<string> {
  const res = await call<{ token: string }>('POST', '/auth/anonymous', undefined, { code: `dev:it-${crypto.randomUUID()}` });
  expect(res.status).toBe(200);
  return res.body.token;
}

const date = kstToday();
const answer = (token: string, set: string, questionId: number, picked: number) =>
  call<AnswerResponse>('POST', `/daily/${date}/answers`, token, { set, questionId, picked });

async function solve(token: string, set: SetView, wrong: number[] = []) {
  for (const [i, q] of set.questions.entries()) {
    const right = BANK.get(q.id)!.answer;
    expect((await answer(token, set.kind, q.id, wrong.includes(i) ? (right + 1) % q.choices.length : right)).status).toBe(200);
  }
}

describe.skipIf(!API)('통합: Workers 런타임 + Supabase', () => {
  it('오늘 문제는 정답 없이 나오고, Supabase에 저장된 세트로 채점한다', async () => {
    const token = await login();
    const today = await call<TodayResponse>('GET', `/daily?date=${date}&${PROFILE}`, token);
    expect(today.status).toBe(200);
    expect(today.body.daily.questions).toHaveLength(5);
    expect(JSON.stringify(today.body)).not.toMatch(/"answer"|explanation|translation/);
    // 다시 불러와도 저장된 같은 세트다.
    expect((await call<TodayResponse>('GET', `/daily?date=${date}&${PROFILE}`, token)).body.daily).toEqual(today.body.daily);

    const [q0, q1, q2] = today.body.daily.questions;
    expect((await answer(token, 'daily', q2.id, 0)).body).toMatchObject({ code: 'OUT_OF_ORDER' });
    const graded = await answer(token, 'daily', q0.id, BANK.get(q0.id)!.answer);
    const { answer: right, explanation, translation } = BANK.get(q0.id)!;
    expect(graded.body).toEqual({ correct: true, answer: right, explanation, ...(translation ? { translation } : {}) });
    // picks가 그대로일 때만 덧붙이는 조건(PostgREST 배열 비교)이 실제로 동작하는지
    expect((await answer(token, 'daily', q0.id, BANK.get(q0.id)!.answer)).status).toBe(200);
    expect((await answer(token, 'daily', q0.id, (BANK.get(q0.id)!.answer + 1) % 4)).status).toBe(409);
    expect((await answer(token, 'daily', q1.id, 0)).status).toBe(200);
    expect((await call<TodayResponse>('GET', `/daily?date=${date}&${PROFILE}`, token)).body.daily.picks).toHaveLength(2);
  });

  it('같은 문제에 다른 답을 동시에 보내면 하나만 받는다', async () => {
    const token = await login();
    const q = (await call<TodayResponse>('GET', `/daily?date=${date}&${PROFILE}`, token)).body.daily.questions[0];
    const results = await Promise.all([0, 1, 2, 3].map((pick) => answer(token, 'daily', q.id, pick)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect((await call<TodayResponse>('GET', `/daily?date=${date}&${PROFILE}`, token)).body.daily.picks).toHaveLength(1);
  });

  it('완료를 동시에 여러 번 보내도 XP는 한 번만 더한다', async () => {
    const token = await login();
    const daily = (await call<TodayResponse>('GET', `/daily?date=${date}&${PROFILE}`, token)).body.daily;
    await solve(token, daily, [0]);
    const results = await Promise.all([1, 2, 3].map(() => call<CompleteResponse>('POST', `/daily/${date}/complete`, token, { set: 'daily' })));
    for (const r of results) expect(r.body).toEqual({ result: { correct: 4, total: 5, xpGained: 45 }, me: { xp: 45, level: 1, streak: 1, lastDate: date } });

    const share = await call<SetView>('POST', `/daily/${date}/bonus`, token, { source: 'share' });
    expect(share.body.questions).toHaveLength(5);
    await solve(token, share.body);
    expect((await call<CompleteResponse>('POST', `/daily/${date}/complete`, token, { set: 'share' })).body.me.xp).toBe(95);
    expect((await call('GET', `/me/progress?date=${date}`, token)).body).toEqual({ xp: 95, level: 2, streak: 1, lastDate: date, todayCompleted: true });
  });

  it('설정을 바꾸면 다시 고르고, 기기 기록은 한 번만 가져온다', async () => {
    const token = await login();
    expect((await call('POST', '/me/progress/import', token, { xp: 120, streak: 2, lastDate: null, seen: [] })).status).toBe(200);
    expect((await call('POST', '/me/progress/import', token, { xp: 120, streak: 2, lastDate: null, seen: [] })).status).toBe(409);
    const first = (await call<TodayResponse>('GET', `/daily?date=${date}&${PROFILE}`, token)).body;
    expect(first.me.xp).toBe(120);
    const travel = (await call<TodayResponse>('GET', `/daily?date=${date}&reason=travel&selfLevel=1&dailyGoal=10`, token)).body;
    expect(travel.daily.questions).toHaveLength(10);
    expect(new Set(travel.daily.questions.map((q) => q.category))).toEqual(new Set(['daily']));
  });

  it('토큰 없이, 범위 밖 날짜로, 허용하지 않은 Origin에서는 쓸 수 없다', async () => {
    expect((await call('GET', `/daily?date=${date}&${PROFILE}`)).status).toBe(401);
    const token = await login();
    expect((await call('GET', `/daily?date=2020-01-01&${PROFILE}`, token)).status).toBe(400);
    const allowed = await call('GET', `/me/progress`, token, undefined, { origin: 'http://localhost:3000' });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    const other = await call('GET', `/me/progress`, token, undefined, { origin: 'https://evil.example' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it.skipIf(!SUPABASE || !PUBLISHABLE)('공개 키(publishable)로는 Data API에서 테이블·함수에 접근할 수 없다', async () => {
    const headers = { apikey: PUBLISHABLE!, 'content-type': 'application/json' };
    for (const table of ['users', 'daily_results', 'saved_items']) {
      const read = await fetch(`${SUPABASE}/rest/v1/${table}?select=*&limit=1`, { headers });
      expect([401, 403]).toContain(read.status);
      const write = await fetch(`${SUPABASE}/rest/v1/${table}`, { method: 'POST', headers, body: '{}' });
      expect([401, 403]).toContain(write.status);
    }
    const rpc = await fetch(`${SUPABASE}/rest/v1/rpc/set_updated_at`, { method: 'POST', headers, body: '{}' });
    expect(rpc.ok).toBe(false);
  });
});
