import { describe, expect, it } from 'vitest';
import { exchangeAnonCode, signSession, verifySession } from '../src/auth';

const BASE = 'https://apps-in-toss-api.toss.im';

function fetcher(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  return {
    calls,
    fetch: async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return respond();
    },
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('exchangeAnonCode', () => {
  it('파트너 API에 code를 보내고 anonKey를 받는다', async () => {
    const f = fetcher(() => json({ resultType: 'SUCCESS', success: { anonKey: 'anon-123' } }));
    expect(await exchangeAnonCode(f, BASE, 'code-1')).toEqual({ ok: true, anonKey: 'anon-123' });
    expect(f.calls[0].url).toBe(`${BASE}/api-partner/v1/apps-in-toss/users/anon-key/exchange`);
    expect(f.calls[0].init?.method).toBe('POST');
    expect(JSON.parse(f.calls[0].init?.body as string)).toEqual({ code: 'code-1' });
  });

  it('업무 오류(HTTP 200 + FAIL), 검증 오류, 서버 오류, 연결 실패를 나누고, 로그용 원인을 붙인다', async () => {
    const fail = (errorCode: string) => json({ resultType: 'FAIL', error: { errorCode, reason: '' } });
    expect(await exchangeAnonCode(fetcher(() => fail('4011')), BASE, 'c')).toEqual({ ok: false, reason: 'invalid' });
    expect(await exchangeAnonCode(fetcher(() => fail('4095')), BASE, 'c')).toEqual({ ok: false, reason: 'rate_limited', detail: 'FAIL 4095' });
    expect(await exchangeAnonCode(fetcher(() => fail('9999')), BASE, 'c')).toEqual({ ok: false, reason: 'upstream', detail: 'FAIL 9999' });
    expect(await exchangeAnonCode(fetcher(() => json({}, 400)), BASE, 'c')).toEqual({ ok: false, reason: 'invalid' });
    expect(await exchangeAnonCode(fetcher(() => json({}, 500)), BASE, 'c')).toEqual({ ok: false, reason: 'upstream', detail: 'http 500' });
    expect(await exchangeAnonCode(fetcher(() => new Response('<html>', { status: 200 })), BASE, 'c')).toEqual({
      ok: false,
      reason: 'upstream',
      detail: 'invalid json',
    });
    expect(await exchangeAnonCode(fetcher(() => Promise.reject(new Error('down'))), BASE, 'c')).toEqual({
      ok: false,
      reason: 'upstream',
      detail: 'network: down',
    });
    // SUCCESS인데 키가 비어 있으면 성공으로 보지 않는다.
    expect(await exchangeAnonCode(fetcher(() => json({ resultType: 'SUCCESS', success: { anonKey: '' } })), BASE, 'c')).toEqual({
      ok: false,
      reason: 'upstream',
      detail: 'SUCCESS',
    });
  });
});

describe('세션 토큰', () => {
  const secret = 'k'.repeat(32);

  it('서명한 토큰에서 사용자 ID를 읽고, 만료 시각부터는 거절한다', async () => {
    const token = await signSession(secret, 'user-1', 1000);
    expect(await verifySession(secret, token, 1000)).toBe('user-1');
    expect(await verifySession(secret, token, 1000 + 30 * 86400)).toBeNull();
  });

  it('alg를 바꾼 토큰(none 등)은 받지 않는다', async () => {
    const token = await signSession(secret, 'user-1', 1000);
    const none = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/, '');
    expect(await verifySession(secret, `${none}.${token.split('.')[1]}.`, 1000)).toBeNull();
  });
});
