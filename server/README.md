# english-bite-api (Cloudflare Workers)

하루 영어 한 입의 서버예요. 문제를 내고 채점해요. 문제 은행(정답·해설)은 이 서버 번들에만 들어가고, 미니앱 번들에는 들어가지 않아요.

- 사용자 확인: 미니앱이 `User.createAnonymousKeyAuthCode()`로 받은 일회용 코드를 서버가 mTLS로 앱인토스 파트너 API에서 익명 식별키로 바꿔요. 서버는 서명한 세션 토큰을 돌려줘요.
- 한도: 사용자마다 날짜별로 오늘의 문제 1세트와 보너스(공유·광고) 세트만 내고, 낸 문제만 채점해요. 이 한도 때문에 문제 은행을 한꺼번에 가져갈 수 없어요.
- 저장: Supabase(`supabase/migrations`)를 secret key로만 읽고 써요. 테이블은 공개 키로 접근할 수 없어요.
- API 명세: `docs/11_API_명세.md` 2장

## 로컬 개발

Node.js 24.15 이상이 필요해요(루트 `.nvmrc`).

```bash
# 1. 로컬 Supabase (Docker 필요). 마이그레이션이 자동으로 적용돼요.
npx supabase start -x gotrue,realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

# 2. 서버 비밀값: .dev.vars.example을 .dev.vars로 복사하고 채워요(.dev.vars는 저장소에 올리지 않아요).
cd server && npm install && npm run dev        # http://127.0.0.1:8787

# 3. 미니앱을 서버 모드로: 루트에 .env.development.local을 만들고 다음 줄을 넣은 뒤 npm run dev
#    NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8787
```

`DEV_AUTH=true`는 localhost로 온 요청에서만 토스 인증 코드 교환을 건너뛰어요. 운영 주소에서는 켜져 있어도 동작하지 않아요.

## 테스트

```bash
npm test                                   # 루트에서. 서버 로직(server/test)도 함께 돌아요.
cd server && npm run typecheck

# 통합 테스트: wrangler dev와 로컬 Supabase를 띄운 상태에서
API_URL=http://127.0.0.1:8787 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=<로컬 publishable 키> \
  npx vitest run server/test/integration.test.ts
```

## 서버 오류 보기 (Workers 로그)

외부 모니터링 서비스 없이 Cloudflare의 Workers 로그로 본다(`wrangler.jsonc`의 `observability`).

- **어디서**: Cloudflare 대시보드 > Workers & Pages > english-bite-api > Logs. 실시간으로 보려면 `npx wrangler tail --env production`.
- **무엇이 남나**
  - 요청마다 호출 로그 1건(메서드, 주소, 상태 코드, 걸린 시간).
  - 서버 오류(5xx)와 토스 API 요청 한도 초과(429)는 `event: api_error` 로그를 따로 남긴다(`src/app.ts`의 `logFailure`). 필드: `status`, `code`, `detail`(원인), `method`, `path`, `ray`, 처리하지 못한 예외는 `stack` 앞부분.
  - 대시보드에서 `event = api_error`나 `code = AUTH_UPSTREAM`으로 걸러 보고, `ray`로 같은 요청의 호출 로그를 찾는다.
- **남기지 않는 것**: 요청 본문(인증 코드), 세션 토큰, 쿼리, 사용자 식별키. 정상 거절(400·401·404·409 등)은 호출 로그의 상태 코드로만 남는다.
- **Issues**: 5xx·예외를 원인별로 묶어 보여 준다(공개 베타, `observability.issues`). 켠 뒤의 요청부터 모은다. 웹훅·채팅으로 보내는 자동화는 대시보드에서 만든다.
- **한도**: 무료 플랜은 하루 20만 건, 3일 보관(유료 7일). 2026-12-01부터 Cloudflare Observability 요금제로 바뀐다.
- **배포 뒤 한 번 확인**: 호출 로그에 요청 헤더(Authorization)가 함께 남는지 Cloudflare 문서에 나와 있지 않다. 첫 배포 뒤 로그 하나를 열어 보고, 토큰이 보이면 `logs.invocation_logs`를 끄고 `api_error`만 쓴다.

자주 보는 `code`:

| code | 뜻 | 볼 곳 |
|------|----|-------|
| `INTERNAL` | 처리하지 못한 예외 (DB 연결 등) | `detail`, `stack` |
| `AUTH_UPSTREAM` | 토스 파트너 API 실패. `detail`이 `TOSS_MTLS 바인딩 없음`이면 인증서 설정 누락 | `detail`(응답 상태, 토스 오류 코드) |
| `RATE_LIMITED` | 토스 API 요청 한도(앱당 분당 3,000회) 초과 | 같은 시간대 `/auth/anonymous` 호출 수 |
| `MISCONFIGURED` | `SESSION_SECRET`이 짧거나 없음 | `wrangler secret list --env production` |
| `BANK_MISMATCH` | 낸 문제가 문제 은행에서 지워짐 | 문제 은행 변경 이력 |

## 운영 배포 (처음 한 번)

1. **mTLS 인증서**: 앱인토스 콘솔 > 개발 > mTLS 인증서에서 발급받아요. 받은 zip의 `*_public.crt`, `*_private.key`를 Cloudflare에 올려요. 키 파일은 저장소에 넣지 마세요.
   ```bash
   npx wrangler login
   npx wrangler mtls-certificate upload --cert <이름>_public.crt --key <이름>_private.key --name english-bite-toss
   ```
   출력된 ID를 `wrangler.jsonc`의 `REPLACE_WITH_MTLS_CERTIFICATE_ID` 자리에 넣어요.
2. **DB 마이그레이션**: 운영 Supabase에 `supabase/migrations`의 새 마이그레이션을 적용해요.
   ```bash
   npx supabase link --project-ref rbmaztwsrsyaarfysxcq
   npx supabase db push
   ```
3. **비밀값**
   ```bash
   npx wrangler secret put SUPABASE_SECRET_KEY --env production   # Supabase > Project Settings > API Keys의 secret key
   npx wrangler secret put SESSION_SECRET --env production        # 32자 이상 임의 문자열
   ```
4. **배포**: `npm run deploy`. 실제 문제 은행(`src/data/questions.json`)이 없거나 샘플과 같으면 배포를 멈춰요.
5. **미니앱 빌드**: 루트 `.env.production`에 `NEXT_PUBLIC_API_BASE_URL=<배포된 Workers 주소>`를 넣고 `npm run build:ait`. 이 빌드부터 문제 은행이 번들에서 빠져요.

문제 은행을 고친 뒤에는 서버를 다시 배포해요. 이미 낸 문제를 문제 은행에서 지우면 그 세트를 보여 줄 수 없으니, 문제는 지우지 말고 고쳐서 써요.
