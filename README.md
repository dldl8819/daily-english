# daily-english

앱인토스 WebView용 일일 영어 챌린지 "하루 영어 한 입"이에요. 하루 5문제(개발자 영어 + 일상 영어)를 풀면 XP가 쌓이고 레벨이 올라가요. 레벨이 오를수록 어려운 문제 비중이 늘어나요. 점수 비교나 랭킹은 없어요.

## 실행
Node.js 24.15 이상이 필요하다(`.nvmrc`). 앱인토스 devtools·ait-format과 jsdom이 요구한다.

```bash
npm install
npm run dev        # http://localhost:3000 (앱인토스 SDK는 devtools mock, 오른쪽 아래 AIT 버튼으로 패널)
npm test           # 로직·저장·문제 데이터 테스트
npm run build      # 정적 번들 out/
npm run build:ait  # out/ + 번들 검사 + 앱인토스 번들 english-bite.ait
npm run check:bundle  # out/에 문제 은행이 들어 있는지 검사 (서버 모드 빌드면 0문항이어야 통과)
npm run deploy     # ait deploy (API 키 필요)
```

## 구조
- `src/data/questions.sample.json`: 공개용 샘플 문제 75개 (난이도 1~3 × 분류 5개 각 5개). 실제 문제 은행 `questions.json`은 저장소에 없고, 없으면 `npm run dev`·`build`·`test`가 샘플을 복사해 쓴다
- `src/lib/daily.ts`: 오늘의 문제 선택·고정, 풀이 기록, 완료, streak
- `src/lib/level.ts`: XP → 레벨
- `src/lib/storage.ts`: 토스 앱 안에서는 SDK `Storage`, 밖에서는 localStorage. 오늘 날짜는 토스 서버 시간 우선
- `src/lib/api.ts`·`remote.ts`·`questionCache.ts`: 서버 모드(아래)의 세션 토큰, API 호출, 받은 문제 보관
- `server/`: 문제를 내고 채점하는 서버 (Cloudflare Workers + Supabase). 설정·배포는 `server/README.md`
- `supabase/migrations/`: DB 스키마. 테이블은 서버의 secret key로만 접근한다
- `apps-in-toss.config.ts`: 앱인토스 설정 (`appName` english-bite)
- `docs/`: 기획서, PRD, SRS, 설계, 테스트, WBS 등 프로젝트 문서

## 기기 모드와 서버 모드
- **기기 모드** (기본, `NEXT_PUBLIC_API_BASE_URL` 없음): 문제 은행이 번들에 들어가고 기기 안에서만 동작한다. 번들을 열면 문제 은행 전체(정답·해설)를 꺼낼 수 있다.
- **서버 모드** (`NEXT_PUBLIC_API_BASE_URL` 있음): 문제 은행이 번들에서 빠지고, 서버가 사용자마다 그날 낸 문제만 채점해 정답·해설을 준다. 토스 앱 안에서만 동작한다(익명 식별키 인증).
- `npm run build:ait`는 빌드 뒤 번들을 검사한다. 서버 주소가 있는데 문제 은행이 한 문항이라도 남아 있으면 `.ait`를 만들지 않는다.

## CI (GitHub Actions)
`.github/workflows/ci.yml`. main push와 PR마다 돈다. 저장소에는 샘플 문제만 있어 샘플로 검사하고, 배포는 하지 않는다.
- 타입·테스트·빌드: 타입 검사(앱·서버), 테스트, 기기 모드·서버 모드 빌드, 서버 모드 번들에 문제 은행이 없는지(`check:bundle`), Worker 번들(dry-run)
- 통합: 로컬 Supabase에 마이그레이션을 처음부터 적용하고 wrangler dev 위에서 `server/test/integration.test.ts` (`server/scripts/integration.sh`)
- 의존성·액션 업데이트는 Dependabot이 매주 PR로 올린다(새 릴리스는 7일 뒤, `.github/dependabot.yml`). 액션은 커밋 SHA로 고정한다.

## 문제 작성 기준
새 문제를 쓰거나 고칠 때는 아래를 모두 지킨다. 1~3은 `npm test`(`src/data/questions.test.ts`)가 막는다.
1. **부적절한 표현 금지**: 문장·오답 보기·해설 어디에도 비속어·은어·과도한 유행어, 폭력·죽음, 범죄, 약물·술·담배·도박, 선정성, 모욕·비하 표현을 쓰지 않는다. 종교·국적을 끌어오는 관용 표현(go Dutch, speak of the devil 등)도 피한다. 금지 목록은 `src/data/contentPolicy.ts` (근거: 앱인토스 비게임 출시 가이드, 서비스 오픈 정책).
2. **같은 문장 금지**: 대소문자·문장부호를 무시하고 같은 문장이 두 번 나오면 안 된다.
3. **형식**: 빈칸(`___`) 1개, 보기 4개(서로 다름), 정답 1개, 해설.
4. **같은 표현 반복 금지**: 문장이 달라도 같은 관용 표현을 다시 묻지 않는다(사람이 확인).
5. **정답은 하나**: 다른 보기도 맞는 영어가 되지 않게 쓴다. 토익 대비 문제는 직접 쓴 문제이고 기출이 아니다.
