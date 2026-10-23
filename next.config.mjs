import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  return {
    // 앱인토스 WebView에 올릴 정적 번들을 out/ 으로 내보낸다.
    output: 'export',
    images: { unoptimized: true },
    // next dev가 AI 에이전트를 감지하면 루트에 AGENTS.md를 자동으로 만드는 기능을 끈다.
    agentRules: false,
    // 개발 서버에서만 SDK를 @apps-in-toss/devtools mock으로 바꾼다.
    // Turbopack은 unplugin을 지원하지 않아 resolve alias로 직접 지정한다.
    ...(phase === PHASE_DEVELOPMENT_SERVER && {
      turbopack: {
        resolveAlias: {
          '@apps-in-toss/web-framework': '@apps-in-toss/devtools/mock',
        },
      },
    }),
  };
}
