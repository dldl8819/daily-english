import type { Metadata, Viewport } from 'next';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import { DevtoolsPanel } from '@/components/DevtoolsPanel';

export const metadata: Metadata = {
  title: '하루 영어 한 입',
  description: '하루 5문제, 개발자 영어와 일상 영어를 1~2분에',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 앱인토스 비게임 출시 가이드: 핀치 줌을 막는다.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme은 아래 스크립트가 React보다 먼저 정하므로 hydration 경고를 끈다.
    <html lang="ko" data-theme="default" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <DevtoolsPanel />
      </body>
    </html>
  );
}
