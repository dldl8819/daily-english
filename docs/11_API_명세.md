# 11. API Specification

1장은 현재 코드의 내부 모듈 API, 2장은 서버 HTTP API(`server/`)다. 서버 주소 없이 빌드하면(기기 모드) 지금처럼 HTTP API를 쓰지 않는다.

## 1. 내부 모듈 API [구현]

### `src/lib/daily.ts`

| 함수 | 시그니처 | 설명 |
|------|----------|------|
| `dateKey` | `(d: Date) => string` | 로컬 날짜를 `yyyy-mm-dd`로 |
| `difficultyMix` | `(level: number) => Difficulty[]` | 레벨별 5문제 난이도 구성 |
| `pickDaily` | `(questions, key, level = 1, seen = []) => Question[]` | 레벨·본 문제 기록을 반영해 최대 5개 |
| `startAttempt` | `(progress, questions, key) => Progress` | 오늘 문제 고정. 이미 시작했으면 입력 그대로 |
| `attemptQuestions` | `(attempt, questions) => Question[] \| null` | 고정 ID를 문제로. 빠진 문제가 있으면 null |
| `recordPick` | `(progress, index, choice) => Progress` | 현재 문제 답 기록. 순서가 안 맞으면 입력 그대로 |
| `countCorrect` | `(questions, picks) => number` | 맞힌 수 |
| `completeDay` | `(progress: Progress, key: string, correct: number, total: number) => Progress` | 완료 처리한 새 진행 상황. 같은 날 재호출 시 입력을 그대로 반환 |
| `visibleStreak` | `(progress: Progress, key: string) => number` | 화면에 보일 streak |
| `QUESTIONS_PER_DAY` | `5` | 하루 문제 수 |
| `EMPTY_PROGRESS` | `Progress` | 초기 상태 |

### `src/lib/level.ts`

| 함수 | 시그니처 | 설명 |
|------|----------|------|
| `xpToReach` | `(level: number) => number` | 레벨 도달 누적 XP |
| `levelFromXp` | `(xp: number) => number` | 누적 XP의 레벨 |
| `levelProgress` | `(xp: number) => { level, current, needed }` | 레벨 내 진행도 |
| `xpForResult` | `(correct: number) => number` | 하루 획득 XP |

### `src/lib/storage.ts`

| 함수 | 시그니처 | 설명 |
|------|----------|------|
| `isInToss` | `() => boolean` | 토스 WebView 여부 |
| `parseProgress` | `(raw: string \| null) => Progress` | 문자열 → 진행 상황, 필드 검증 |
| `loadProgress` | `() => Promise<Progress>` | 토스 앱: SDK → localStorage 순. 실패 시 `EMPTY_PROGRESS` |
| `saveProgress` | `(progress: Progress) => Promise<void>` | localStorage + (토스 앱) SDK. 실패는 무시 |
| `todayKey` | `(toKey: (d: Date) => string) => Promise<string>` | 토스 서버 시간 우선, 없으면 기기 시계 |

### 사용하는 앱인토스 SDK API (`@apps-in-toss/web-framework` 3.8.1)

| API | 용도 |
|-----|------|
| `Storage.getItem(key)` / `Storage.setItem(key, value)` | 진행 상황 저장 |
| `Environment.getServerTime()` / `.isSupported()` | 오늘 날짜 |

## 2. 서버 HTTP API [구현, 운영 배포 전]

`server/` (Cloudflare Workers). 미니앱을 `NEXT_PUBLIC_API_BASE_URL`과 함께 빌드하면 이 API에서 문제를 받고, 문제 은행(정답·해설)은 번들에 들어가지 않는다. 설정·배포는 `server/README.md`.

- 기본 경로: `/api/v1`. 요청·응답은 JSON, 날짜는 `yyyy-mm-dd`
- 인증: 익명 식별키 교환(2.1)으로 받은 세션 토큰을 `Authorization: Bearer <token>`으로 보낸다. 토큰은 HS256, 30일
- 날짜: 한국 시간 오늘의 앞뒤 하루만 받는다(기기 시간대 차이). 날짜마다 세트가 하나라 아무 날짜나 받으면 문제를 더 받아 갈 수 있기 때문이다
- 한도: 사용자마다 날짜별로 오늘의 문제 1세트, 보너스는 방법(share·ad)마다 1세트. 정답·해설은 그 세트에서 답한 문제에만 준다
- 형식: 요청·응답 타입은 `src/lib/apiTypes.ts` (서버와 클라이언트가 함께 쓴다)
- CORS: `https://english-bite.apps.tossmini.com`, `https://english-bite.private-apps.tossmini.com`만 허용
- 응답 헤더: `Cache-Control: no-store`. 본문은 16KB까지

### 오류 공통 형식

```json
{ "code": "ALREADY_ANSWERED", "message": "이미 답한 문제예요." }
```

| 상태 | code | 조건 |
|------|------|------|
| 400 | `INVALID_DATE`, `DATE_OUT_OF_RANGE`, `INVALID_PROFILE`, `INVALID_JSON`, `INVALID_SET`, `INVALID_SOURCE`, `INVALID_PICK`, `NOT_IN_SET`, `OUT_OF_ORDER`, `INVALID_IMPORT`, `INVALID_AUTH_CODE` | 형식 오류, 그날 세트에 없는 문제, 앞 문제를 건너뜀 |
| 401 | `UNAUTHORIZED`, `INVALID_AUTH_CODE` | 토큰 없음·변조·만료, 인증 코드 만료·재사용 |
| 404 | `SET_NOT_FOUND`, `NOT_FOUND` | 아직 열지 않은 세트 |
| 409 | `ALREADY_ANSWERED`, `ALREADY_COMPLETED`, `DAILY_NOT_COMPLETED`, `ALREADY_IMPORTED`, `ALREADY_STARTED` | 서버 기록과 맞지 않음. 클라이언트는 2.3으로 다시 맞춘다 |
| 413 | `TOO_LARGE` | 본문 16KB 초과 |
| 422 | `UNANSWERED` | 답하지 않은 문제가 있는데 완료 |
| 429 | `RATE_LIMITED` | 파트너 API 요청 한도 초과 |
| 502 | `AUTH_UPSTREAM` | 파트너 API 연결 실패 |

### 2.1 `POST /api/v1/auth/anonymous`

미니앱이 `User.createAnonymousKeyAuthCode()`로 받은 일회용 코드(5분, 한 번만)를 보낸다. 서버가 mTLS로 `POST https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/users/anon-key/exchange`에서 익명 식별키(`anonKey`)로 바꾸고, 그 사용자의 세션 토큰을 준다. 클라이언트가 `getAnonymousKey()`로 얻은 값은 요청자를 증명하지 않으므로 받지 않는다.

요청 `{ "code": "..." }` → 응답 `{ "token": "...", "expiresIn": 2592000 }`

로컬 개발(`DEV_AUTH=true`, localhost로 온 요청)에서는 교환 없이 `dev:<이름>` 사용자로 본다.

### 2.2 `GET /api/v1/me/progress?date=2026-10-23`

```json
{ "xp": 145, "level": 3, "streak": 3, "lastDate": "2026-10-23", "todayCompleted": true }
```

XP·연속 학습일은 가져온 기기 기록(2.7)에서 시작해 완료한 세트를 날짜순으로 더해 계산한다.

### 2.3 `GET /api/v1/daily?date=&reason=&careerFocus=&selfLevel=&dailyGoal=`

그날 세트. 오늘의 문제가 없으면 맞춤 설정으로 고른다(클라이언트와 같은 `pickDaily`). 아직 하나도 풀지 않았는데 설정이 바뀌었으면 다시 고른다(세트마다 3번까지).

```json
{
  "date": "2026-10-23",
  "me": { "xp": 145, "level": 3, "streak": 3, "lastDate": "2026-10-22" },
  "daily": {
    "kind": "daily",
    "questions": [{ "id": 3, "category": "dev", "difficulty": 1, "prompt": "Let's ___ the meeting to Thursday.", "choices": ["put on", "push back", "pull up", "pick off"] }],
    "picks": [1],
    "graded": [{ "answer": 1, "explanation": "'push back'은 일정을 뒤로 미룬다는 뜻이에요." }],
    "review": [],
    "result": null
  },
  "bonus": []
}
```

`questions`에는 정답·해설이 없다. `graded`는 `picks`와 길이가 같고, 답한 문제의 정답·해설이다(다시 열거나 기기를 바꿔도 이어 풀기 위해서다).

### 2.4 `POST /api/v1/daily/{date}/answers`

요청 `{ "set": "daily", "questionId": 3, "picked": 1 }` → 응답 `{ "correct": true, "answer": 1, "explanation": "..." }`

- 세트의 다음 문제만 받는다(`OUT_OF_ORDER`).
- 같은 답을 다시 보내면 같은 결과(응답을 못 받고 재시도). 다른 답이면 409.
- 동시에 들어온 답은 "picks가 그대로일 때만 덧붙이는" 조건부 쓰기로 하나만 받는다.

### 2.5 `POST /api/v1/daily/{date}/complete`

요청 `{ "set": "daily" }` → 응답

```json
{ "result": { "correct": 4, "total": 5, "xpGained": 45 }, "me": { "xp": 190, "level": 3, "streak": 4, "lastDate": "2026-10-23" } }
```

XP는 서버가 저장된 답으로 계산한다(오늘의 문제: 정답×10+5, 보너스: 정답×10). 이미 마쳤으면 같은 결과를 돌려준다(두 번 더하지 않는다).

### 2.6 `POST /api/v1/daily/{date}/bonus`

요청 `{ "source": "share" }` → 응답: 보너스 세트(2.3의 `daily`와 같은 형식). 오늘의 문제를 마친 뒤에만(`DAILY_NOT_COMPLETED`), 방법마다 한 번. 이미 열었으면 그 세트를 돌려준다. 공유·광고 시청 여부는 서버가 확인할 수 없어 클라이언트를 믿는다(하루 5문제씩으로 한정된다).

### 2.7 `POST /api/v1/me/progress/import`

서버 연동 전 기기 기록을 한 번 옮긴다. 서버에 세트가 생기기 전에만 받는다.

요청 `{ "xp": 145, "streak": 3, "lastDate": "2026-10-21", "seen": [1, 5, 9] }` → `{ "ok": true }`

`seen`은 새 문제를 먼저 내는 데만 쓰고, 그 문제의 내용·정답을 열어 주지 않는다.

### 2.8 계획: `GET /api/v1/me/wrong-answers` (F-08)

틀린 문제는 지금 기기에 저장한다(채점 때 받은 정답·해설을 함께 보관). 서버 목록은 기기 간 동기화가 필요할 때 만든다.
