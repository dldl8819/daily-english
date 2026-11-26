import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 저장해 둔 세션이 있는 상태로 시작한다. 로그인(인증 코드 교환) 없이 API 요청만 본다.
vi.mock('./storage', () => ({
  canUseSdk: () => true,
  loadUserKey: async () => 'user-1',
  loadValue: async () => JSON.stringify({ token: 'token-1', expiresAt: Date.now() + 3_600_000, userKey: 'user-1' }),
  saveValue: async () => {},
}));

import { ApiError, request } from './api';

/** 앱이 끊을 때(abort)까지 응답하지 않는 서버 */
function hang(init: RequestInit = {}): Promise<Response> {
  return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
}

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('request: 시간 초과면 한 번 더 보낸다 (docs/21 2.8)', () => {
  it('첫 요청이 10초 안에 오지 않으면 다시 보내고, 두 번째 응답을 쓴다', async () => {
    const fetch = vi.fn().mockImplementationOnce((_: string, init: RequestInit) => hang(init)).mockImplementationOnce(async () => ok());
    vi.stubGlobal('fetch', fetch);

    const pending = request('GET', '/api/v1/daily?date=2026-11-26');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers).toMatchObject({ authorization: 'Bearer token-1' });
  });

  it('두 번 다 시간 초과면 인터넷 연결 안내로 끝낸다 (세 번은 보내지 않는다)', async () => {
    const fetch = vi.fn((_: string, init: RequestInit) => hang(init));
    vi.stubGlobal('fetch', fetch);

    const settled = expect(request('POST', '/api/v1/daily/2026-11-26/answers', { set: 'daily', questionId: 1, picked: 0 })).rejects.toMatchObject({
      code: 'TIMEOUT',
      message: '인터넷 연결을 확인하고 다시 시도해 주세요.',
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('연결 자체가 안 되면(오프라인) 다시 보내지 않고 바로 알린다', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetch);

    const error = await request('GET', '/api/v1/daily').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'NETWORK', message: '인터넷 연결을 확인하고 다시 시도해 주세요.' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('서버가 거절한 요청(4xx·5xx)은 다시 보내지 않는다', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code: 'INTERNAL', message: '잠시 후 다시 시도해 주세요.' }), { status: 500 }));
    vi.stubGlobal('fetch', fetch);

    await expect(request('GET', '/api/v1/daily')).rejects.toMatchObject({ status: 500, code: 'INTERNAL' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
