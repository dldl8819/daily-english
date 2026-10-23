import questions from '../../src/data/questions.json';
import type { Question } from '../../src/lib/types';
import { createApp } from './app';
import { type MtlsFetcher, exchangeAnonCode } from './auth';
import { createBank } from './bank';
import { createSupabaseStore } from './store-supabase';

export interface Env {
  SUPABASE_URL: string;
  /** Supabase secret key (service_role). 운영: wrangler secret, 로컬: .dev.vars */
  SUPABASE_SECRET_KEY: string;
  /** 세션 토큰 서명 키 (32자 이상). 운영: wrangler secret, 로컬: .dev.vars */
  SESSION_SECRET: string;
  /** 쉼표로 나눈 허용 Origin */
  ALLOWED_ORIGINS: string;
  TOSS_API_BASE: string;
  /** 'true'면 localhost로 온 요청에서 개발용 로그인을 허용한다. .dev.vars에만 둔다. */
  DEV_AUTH?: string;
  /** 앱인토스 mTLS 클라이언트 인증서 (wrangler.jsonc의 mtls_certificates) */
  TOSS_MTLS?: MtlsFetcher;
}

const bank = createBank(questions as Question[]);
let handle: ((req: Request) => Promise<Response>) | null = null;

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    handle ??= createApp({
      store: createSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY),
      bank,
      sessionSecret: env.SESSION_SECRET ?? '',
      allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
      devAuth: env.DEV_AUTH === 'true',
      exchange: async (code) =>
        env.TOSS_MTLS
          ? exchangeAnonCode(env.TOSS_MTLS, env.TOSS_API_BASE, code)
          : { ok: false, reason: 'upstream', detail: 'TOSS_MTLS 바인딩 없음 (wrangler.jsonc mtls_certificates)' },
    });
    return handle(req);
  },
};
