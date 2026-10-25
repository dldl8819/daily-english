// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sample from '@/data/questions.sample.json';
import { STORAGE_KEY } from '@/lib/storage';
import { QUESTION_CACHE_KEY, UNGRADED } from '@/lib/questionCache';
import type { Question } from '@/lib/types';
import { createApp } from '../../server/src/app';
import { createBank } from '../../server/src/bank';
import { createMemoryStore } from '../../server/src/store-memory';

/**
 * 서버 모드(NEXT_PUBLIC_API_BASE_URL이 있는 빌드). 실제 서버 코드(server/src)를 메모리 저장소로 띄워 fetch에 연결한다.
 * 클라이언트는 문제 은행을 갖지 않고, 서버에서 받은 문제와 채점 결과만 쓴다.
 */

const API = 'http://api.test';
// 문장 해석도 정답을 알려 주므로, 답하기 전에 오지 않는지 보려고 모든 문항에 해석을 붙인다.
const BANK = createBank((sample as Question[]).map((q) => ({ ...q, translation: `해석 #${q.id}` })));

// 앱인토스 SDK: 토스 앱 안처럼 동작시킨다(식별키, 일회용 인증 코드, 저장소).
const sdk = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const supported = <T extends (...args: never[]) => unknown>(fn: T, ok = true) => Object.assign(fn, { isSupported: () => ok });
  return {
    storage,
    module: {
      Storage: {
        getItem: async (key: string) => storage.get(key) ?? null,
        setItem: async (key: string, value: string) => void storage.set(key, value),
      },
      User: {
        getAnonymousKey: supported(async () => ({ type: 'HASH', hash: 'hash-a' })),
        createAnonymousKeyAuthCode: async () => ({ code: 'ok:user-a', expiresIn: 300 }),
      },
      Environment: { getServerTime: supported(async () => Date.now(), false) },
      Analytics: { log: async () => {}, screen: async () => {} },
      Review: { request: supported(async () => {}, false) },
      NavigationBar: { setOptions: async () => {} },
      TossAds: { initialize: supported(() => {}, false), attachBanner: supported(() => ({ destroy() {} }), false) },
      isMinVersionSupported: () => false,
    },
  };
});
vi.mock('@apps-in-toss/web-framework', () => sdk.module);

vi.mock('@/lib/bonus', () => ({
  shareAvailable: () => true,
  shareApp: vi.fn().mockResolvedValue('shared'),
  rewardedAdAvailable: vi.fn().mockResolvedValue(false),
  loadRewardedAd: vi.fn().mockResolvedValue(false),
  showRewardedAd: vi.fn(),
}));

// 서버 모드에서는 번들의 문제 은행을 불러오지 않아야 한다.
const localBank = vi.hoisted(() => ({ loadLocalBank: vi.fn() }));
vi.mock('@/lib/localBank', () => localBank);

let DailyChallenge: (typeof import('./DailyChallenge'))['default'];
let requests: string[];
let offline: boolean;

function saved() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!);
}

/** 첫 화면: 로그인과 오늘 문제 요청을 거친다. 처음 불러오는 테스트는 모듈 준비 시간이 더 걸린다. */
const firstQuestion = () => screen.findByRole('heading', { level: 2, name: /1번째 문제/ }, { timeout: 5000 });

const answerOf = (id: number) => BANK.byId.get(id)!.answer;

function choiceButtons() {
  return screen.getAllByRole('button').filter((b) => b.classList.contains('choice'));
}

/** 현재 문제에 답하고 채점 결과가 나올 때까지 기다린 뒤 다음으로 간다. */
async function answerAndNext(user: ReturnType<typeof userEvent.setup>, id: number, pick: number, last: boolean) {
  await user.click(choiceButtons()[pick]);
  await user.click(await screen.findByRole('button', { name: last ? '결과 보기' : '다음 문제' }));
}

beforeEach(async () => {
  localStorage.clear();
  sdk.storage.clear();
  localBank.loadLocalBank.mockClear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile: { reason: 'career', careerFocus: 'dev', selfLevel: 1, dailyGoal: 5 } }));
  history.replaceState(null, '');
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
  // 토스 앱 WebView처럼 네이티브 브리지를 둔다.
  (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = {};
  // jsdom에는 crypto.subtle이 없어 서버 코드(세션 서명)에 Node 구현을 쓴다.
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

  const app = createApp({
    store: createMemoryStore(),
    bank: BANK,
    sessionSecret: 't'.repeat(32),
    allowedOrigins: [],
    devAuth: false,
    exchange: async (code) => (code.startsWith('ok:') ? { ok: true, anonKey: code.slice(3) } : { ok: false, reason: 'invalid' }),
  });
  requests = [];
  offline = false;
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    if (offline) throw new TypeError('Failed to fetch');
    const { signal: _signal, ...rest } = init;
    requests.push(`${rest.method ?? 'GET'} ${input.replace(API, '').split('?')[0]}`);
    return app(new Request(input, rest));
  });
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', API);
  vi.resetModules();
  DailyChallenge = (await import('./DailyChallenge')).default;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete (window as { ReactNativeWebView?: unknown }).ReactNativeWebView;
});

describe('서버 모드', () => {
  it('문제 은행 없이 서버에서 받은 문제로 풀고, 채점·XP·보너스·복습까지 서버 결과를 따른다', async () => {
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await firstQuestion();
    expect(localBank.loadLocalBank).not.toHaveBeenCalled();
    expect(requests.slice(0, 2)).toEqual(['POST /api/v1/auth/anonymous', 'GET /api/v1/daily']);

    // 답하기 전에는 정답·해설·해석을 모른다.
    const ids: number[] = saved().attempt.ids;
    const cache = () => JSON.parse(localStorage.getItem(QUESTION_CACHE_KEY)!);
    expect(ids.map((id) => cache()[id].answer)).toEqual(ids.map(() => UNGRADED));
    expect(ids.map((id) => cache()[id].explanation)).toEqual(ids.map(() => ''));
    expect(ids.map((id) => cache()[id].translation)).toEqual(ids.map(() => undefined));
    expect(container.textContent).not.toContain('문장 해석');

    // 답하면 해설 아래에 문장 해석이 나온다.
    await user.click(choiceButtons()[answerOf(ids[0])]);
    await waitFor(() => expect(container.querySelector('.explain .translation')?.textContent).toBe(`문장 해석해석 #${ids[0]}`));
    expect(cache()[ids[0]].translation).toBe(`해석 #${ids[0]}`);
    expect(cache()[ids[1]].translation).toBeUndefined();
    await user.click(screen.getByRole('button', { name: '다음 문제' }));
    for (let i = 1; i < 5; i++) await answerAndNext(user, ids[i], answerOf(ids[i]), i === 4);
    await screen.findByRole('heading', { name: '오늘 학습을 마쳤어요' });
    expect(saved().xp).toBe(55);
    expect(cache()[ids[0]].answer).toBe(answerOf(ids[0]));

    await user.click(await screen.findByRole('button', { name: '친구에게 알리고 5문제 더 풀기' }));
    await screen.findByRole('heading', { level: 2, name: /보너스 5문제 중 1번째 문제/ });
    const bonusIds: number[] = saved().bonus[0].ids;
    expect(bonusIds.some((id) => ids.includes(id))).toBe(false);
    for (let i = 0; i < 5; i++) {
      const id = bonusIds[i];
      await answerAndNext(user, id, i < 3 ? answerOf(id) : (answerOf(id) + 1) % 4, i === 4);
    }
    await waitFor(() => expect(container.textContent).toContain('오늘의 문제 5/5 · 보너스(친구에게 알리기) 3/5'));
    expect(container.textContent).toContain('+85');
    expect(saved().xp).toBe(85);
    expect(saved().wrong.map((w: { questionId: number }) => w.questionId).sort()).toEqual(bonusIds.slice(3).sort());
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);

    // 복습·틀린 문제 화면도 서버에서 받은 정답·해설로 보여 준다.
    await user.click(screen.getByRole('button', { name: '오늘 문제 다시 보기' }));
    expect(container.textContent).toContain('10문제 중 8문제를 맞혔어요.');
    expect(container.textContent).toContain(BANK.byId.get(bonusIds[3])!.explanation);
    expect(container.textContent).toContain(`해석 #${bonusIds[3]}`);
  });

  it('다시 열면 서버 기록에서 이어 푼다', async () => {
    const user = userEvent.setup();
    const first = render(<DailyChallenge />);
    await firstQuestion();
    const ids: number[] = saved().attempt.ids;
    await answerAndNext(user, ids[0], answerOf(ids[0]), false);
    first.unmount();
    // 기기 기록을 지워도(다른 기기) 서버 기록으로 이어 간다.
    localStorage.removeItem(QUESTION_CACHE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile: { reason: 'career', careerFocus: 'dev', selfLevel: 1, dailyGoal: 5 } }));
    sdk.storage.clear();

    render(<DailyChallenge />);
    expect(await screen.findByRole('heading', { level: 2, name: /2번째 문제/ })).toBeTruthy();
    expect(saved().attempt.ids).toEqual(ids);
    expect(saved().attempt.picks).toEqual([answerOf(ids[0])]);
  });

  it('채점 요청이 실패하면 이유를 알리고, 다시 고를 수 있다', async () => {
    const user = userEvent.setup();
    render(<DailyChallenge />);
    await firstQuestion();
    const id: number = saved().attempt.ids[0];

    offline = true;
    await user.click(choiceButtons()[answerOf(id)]);
    expect((await screen.findByRole('alert')).textContent).toContain('인터넷 연결');
    expect(saved().attempt.picks).toEqual([]);

    offline = false;
    await user.click(choiceButtons()[answerOf(id)]);
    expect(await screen.findByRole('button', { name: '다음 문제' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saved().attempt.picks).toEqual([answerOf(id)]);
  });

  it('토스 앱 밖에서는 로그인할 수 없다고 알리고 문제를 내지 않는다', async () => {
    delete (window as { ReactNativeWebView?: unknown }).ReactNativeWebView;
    render(<DailyChallenge />);
    expect((await screen.findByRole('alert')).textContent).toContain('토스 앱에서 열어 주세요');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    expect(requests).toEqual([]);
  });

  it('처음 연결할 때 기기 기록(XP·연속 학습일)을 한 번 서버로 옮긴다', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ xp: 200, streak: 3, lastDate: '2000-01-01', seen: [1, 2], profile: { reason: 'career', careerFocus: 'dev', selfLevel: 1, dailyGoal: 5 } }),
    );
    render(<DailyChallenge />);
    await firstQuestion();
    expect(requests).toContain('POST /api/v1/me/progress/import');
    expect(saved().xp).toBe(200);
    expect(saved().attempt.ids).not.toContain(1);
  });
});
