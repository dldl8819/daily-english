# 08. TRD (Technical Requirements Document)

## 1. 기술 스택

| 영역 | 선택 | 버전 (설치 확인) | 이유 |
|------|------|------------------|------|
| 프레임워크 | Next.js (App Router) | 16.4.2 | 기존 경험, 정적 export 지원 |
| UI | React | 19.3.1 | Next.js 기본 |
| 언어 | TypeScript (strict) | 5.x | 타입 안전성 |
| 스타일 | 순수 CSS + CSS 변수 | - | 화면이 단순해 Tailwind 의존성 불필요 |
| 테스트 | Vitest | 5.0.5 | 설정이 가볍고 TS 바로 실행 |
| 접근성 테스트 | jsdom, Testing Library, axe-core | 30.1.3, 16.3.3, 4.14.0 | 렌더링 결과 자동 검사 |
| 앱인토스 devtools | @apps-in-toss/devtools | 3.8.1 | 개발 서버에서 SDK를 mock으로 바꾸고 패널로 상태 조작 |

### 개발 서버와 devtools

- Next 16 개발 서버는 Turbopack이라 devtools의 unplugin을 쓸 수 없다. `next.config.mjs`에서 개발 서버일 때만 `turbopack.resolveAlias`로 `@apps-in-toss/web-framework`를 `@apps-in-toss/devtools/mock`으로 바꾼다.
- 패널은 `src/components/DevtoolsPanel.tsx`가 개발 서버에서만 불러온다.
- 코드는 `canUseSdk()`(토스 앱 안이거나 개발 서버)일 때 SDK를 부른다. 그래서 일반 브라우저의 개발 서버에서도 저장소·사용자 식별키·서버 시간·내비게이션 바 경로를 mock으로 확인할 수 있다. 운영 빌드와 테스트에서는 토스 앱 안일 때만 부른다.
- 운영 빌드 `out/`에 devtools 코드가 없는 것을 확인했다.
- `agentRules: false`: `next dev`가 AI 에이전트를 감지하면 `AGENTS.md`를 자동 생성하는 기능을 끈다.
| 앱인토스 SDK | @apps-in-toss/web-framework | 3.8.1 | 저장소, 서버 시간, 빌드 CLI(`ait`) |
| 저장 | SDK `Storage` + localStorage | - | 토스 앱 안에서는 SDK, 브라우저에서는 localStorage |
| 배포 | 앱인토스 WebView (`.ait` 업로드) | - | 공식 WebView 방식 |
| 런타임 | Node.js | 24.20.0 | winget으로 설치 |

취약점 대응 기록 (원칙: 발견 즉시 조치, `npm audit` 0건 유지)

| 날짜 | 발견 | 조치 |
|------|------|------|
| 2026-10-21 | next 15.5.4 취약점 | 15.5.28로 올림 |
| 2026-10-21 | Next 내부 PostCSS 취약점 | Next 16.4.2로 올림. `tsconfig.json`의 `jsx`가 `react-jsx`로 자동 변경됨 |
| 2026-10-21 | Vitest 3의 tinypool 취약점 (critical) | Vitest 5.0.5로 올림. 설정 파일을 `vitest.config.mts`로 변경 |

## 2. 플랫폼 선택 근거

| 후보 | 결론 | 근거 |
|------|------|------|
| WebView (Next.js) | 채택 | 앱인토스 공식 지원, 기존 웹 스택 재사용 |
| React Native (Granite) | 보류 | 공식 지원이지만 이 앱에 네이티브 기능이 필요 없음 |
| Flutter | 제외 | 앱인토스 지원 여부 미확인 |
| Unity WebGL | 제외 | 빌드 용량, 학습 비용 |

## 3. 빌드와 배포

| 단계 | 명령 | 결과 |
|------|------|------|
| 웹 빌드 | `next build` | `out/` 정적 파일 (`output: 'export'`) |
| 앱인토스 빌드 | `ait build` | `daily-english.ait` (2026-10-21 기준 약 297 KB) |
| 둘 다 | `npm run build:ait` | 위 두 단계를 차례로 실행 |
| 업로드 | `npm run deploy` (`ait deploy`) 또는 콘솔 업로드 | API 키 필요 |

- 설정 파일: `apps-in-toss.config.ts` (`appName`, `brand.primaryColor`, `navigationBar`, `permissions`, `webBundleDir: 'out'`)
- `ait build`는 `webBundleDir`을 그대로 묶는다. 웹 빌드를 먼저 해야 한다.
- 커뮤니티 사례에 따르면 수동 패키징은 지원하지 않고 `ait build`만 지원한다.
- 세부 조사 내용은 [16_앱인토스_연동_조사](16_앱인토스_연동_조사.md)에 있다.

## 4. 기술 요구사항

| ID | 요구사항 |
|----|----------|
| TR-01 | 날짜는 토스 앱 안에서는 토스 서버 시간(`Environment.getServerTime`), 그 밖에서는 기기 시계로 정한다. 일 번호 변환은 UTC로 해서 서머타임·시간대 영향을 받지 않는다. |
| TR-02 | 문제 데이터는 JSON으로 번들에 포함한다. 런타임 네트워크 요청이 없다. |
| TR-03 | 저장소 접근은 모두 try/catch로 감싼다. SDK 호출이 실패하면 localStorage로 대신한다. |
| TR-04 | 저장 키에 버전(`v1`)을 붙인다. 필드를 추가할 때는 읽기 쪽에서 기본값을 채워 하위 호환을 지킨다. |
| TR-05 | 핵심 계산 로직은 React와 분리된 순수 함수로 두어 단위 테스트한다. |
| TR-06 | 외부 런타임 의존성은 next, react, react-dom, @apps-in-toss/web-framework로 제한한다. |
| TR-07 | SDK는 토스 앱 안에서만 동적 import 한다. 일반 브라우저에서는 불러오지 않는다. |
| TR-08 | 서버 렌더링을 쓰지 않는다 (앱인토스 비게임 출시 가이드: CSR·SSG만 허용). |

## 5. 개발 환경

- Node.js 24 (LTS)
- 명령: `npm run dev`, `npm test`, `npm run build`, `npm run build:ait`

## 6. 향후 기술 과제

| 과제 | 내용 |
|------|------|
| 서버 | 토스 로그인 연동 시 진행 상황 저장 API 필요. 후보: Supabase 또는 Spring Boot |
| 문제 생성 파이프라인 | Claude API로 초안 생성 → 사람 검수 → JSON 반영. 생성 스크립트는 저장소 안 별도 폴더 |
| 분석 | SDK의 `Analytics`·`eventLog` 사용 검토 |
