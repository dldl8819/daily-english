/**
 * 사용자 확인.
 * 1. 미니앱이 User.createAnonymousKeyAuthCode()로 받은 일회용 code를 보낸다.
 * 2. 서버가 mTLS로 앱인토스 파트너 API에서 code를 익명 식별키(anonKey)로 바꾼다.
 * 3. 서버가 서명한 세션 토큰을 돌려주고, 이후 요청은 Authorization: Bearer로 받는다.
 * 클라이언트가 getAnonymousKey()로 얻은 값은 요청자를 증명하지 않으므로 받지 않는다.
 */

const AUDIENCE = 'english-bite';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** 서명 키 최소 길이. 짧은 키는 무차별 대입으로 위조될 수 있다. */
export const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

const HEADER = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

/** HS256 JWT. sub는 public.users.id */
export async function signSession(secret: string, userId: string, nowSec: number): Promise<string> {
  const payload = base64url(
    encoder.encode(JSON.stringify({ sub: userId, aud: AUDIENCE, iat: nowSec, exp: nowSec + SESSION_TTL_SECONDS })),
  );
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(`${HEADER}.${payload}`));
  return `${HEADER}.${payload}.${base64url(new Uint8Array(signature))}`;
}

/** 서명·대상·만료를 확인하고 사용자 ID를 돌려준다. 하나라도 틀리면 null */
export async function verifySession(secret: string, token: string, nowSec: number): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  const signature = fromBase64url(parts[2]);
  if (!signature) return null;
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), signature, encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) return null;
  try {
    const bytes = fromBase64url(parts[1]);
    const claims = bytes && (JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown; aud?: unknown; exp?: unknown });
    if (!claims || claims.aud !== AUDIENCE || typeof claims.exp !== 'number' || claims.exp <= nowSec) return null;
    return typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : null;
  } catch {
    return null;
  }
}

/** 실패의 detail은 서버 로그에만 남기는 원인이다(응답 상태, 토스 오류 코드). 인증 코드는 담지 않는다. */
export type ExchangeResult = { ok: true; anonKey: string } | { ok: false; reason: 'invalid' | 'rate_limited' | 'upstream'; detail?: string };

/** mTLS 클라이언트 인증서가 붙은 fetch (Workers mtls_certificates 바인딩) */
export type MtlsFetcher = { fetch(input: string, init?: RequestInit): Promise<Response> };

const EXCHANGE_PATH = '/api-partner/v1/apps-in-toss/users/anon-key/exchange';

/**
 * 일회용 code를 익명 식별키로 바꾼다 (POST /api-partner/v1/apps-in-toss/users/anon-key/exchange).
 * 업무 오류도 HTTP 200에 resultType FAIL로 온다. 4011: 코드가 유효하지 않음, 4095: 요청 한도 초과.
 */
export async function exchangeAnonCode(fetcher: MtlsFetcher, baseUrl: string, code: string): Promise<ExchangeResult> {
  let res: Response;
  try {
    res = await fetcher.fetch(`${baseUrl}${EXCHANGE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch (e) {
    return { ok: false, reason: 'upstream', detail: `network: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (res.status === 400) return { ok: false, reason: 'invalid' };
  if (!res.ok) return { ok: false, reason: 'upstream', detail: `http ${res.status}` };
  let body: { resultType?: unknown; success?: { anonKey?: unknown } | null; error?: { errorCode?: unknown } | null };
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: 'upstream', detail: 'invalid json' };
  }
  const anonKey = body.success?.anonKey;
  if (body.resultType === 'SUCCESS' && typeof anonKey === 'string' && anonKey.length > 0) return { ok: true, anonKey };
  const errorCode = body.error?.errorCode;
  if (errorCode === '4011') return { ok: false, reason: 'invalid' };
  if (errorCode === '4095') return { ok: false, reason: 'rate_limited', detail: 'FAIL 4095' };
  return { ok: false, reason: 'upstream', detail: `${String(body.resultType)} ${String(errorCode ?? '')}`.trim() };
}
