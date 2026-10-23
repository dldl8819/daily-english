'use client';

import { useEffect, useRef, useState } from 'react';
import { canUseSdk, isInToss } from '@/lib/storage';

/** 개발 단계에서는 반드시 테스트 ID를 쓴다 (실제 ID로 테스트하면 정책 위반). */
const TEST_AD_GROUP_ID = 'ait-ad-test-banner-id';

function adGroupId(): string | null {
  if (process.env.NODE_ENV !== 'production') return TEST_AD_GROUP_ID;
  return process.env.NEXT_PUBLIC_AIT_BANNER_AD_GROUP_ID || null;
}

type Sdk = typeof import('@apps-in-toss/web-framework');

// 초기화는 앱에서 한 번만 한다. 중복 호출하면 "[toss-ad] Already initialized" 오류가 난다.
let ready: Promise<void> | null = null;

function initialize(TossAds: Sdk['TossAds']): Promise<void> {
  ready ??= new Promise<void>((resolve, reject) => {
    TossAds.initialize({
      callbacks: {
        onInitialized: () => resolve(),
        onInitializationFailed: (error) => {
          ready = null;
          reject(error);
        },
      },
    });
  });
  return ready;
}

/**
 * 메인 화면 하단 배너 광고 (앱인토스 Toss Ads, WebView).
 * - 고정하지 않고 본문 흐름 맨 아래에 둔다. 스크롤 가능한 화면에만, 버튼과 붙지 않게 여백을 둔다.
 * - 광고가 그려지기 전·광고가 없을 때·지원하지 않는 환경(토스 5.241.0 미만, 일반 브라우저)에서는 공간을 차지하지 않는다.
 * - 광고 내용·색·문구는 SDK가 그리고 손대지 않는다. 테마만 화면 모드에 맞춘다.
 */
export default function BannerAd({ dark }: { dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const id = adGroupId();
    if (!id || !canUseSdk()) return;
    let cancelled = false;
    let attached: { destroy: () => void } | undefined;

    void (async () => {
      try {
        const { TossAds, isMinVersionSupported } = await import('@apps-in-toss/web-framework');
        if (isInToss() && !isMinVersionSupported({ android: '5.241.0', ios: '5.241.0' })) return;
        if (!TossAds.initialize.isSupported() || !TossAds.attachBanner.isSupported()) return;
        await initialize(TossAds);
        if (cancelled || !ref.current) return;
        attached = TossAds.attachBanner(id, ref.current, {
          theme: dark ? 'dark' : 'light',
          tone: 'blackAndWhite',
          variant: 'expanded',
          callbacks: {
            onAdRendered: () => setRendered(true),
            onNoFill: () => setRendered(false),
            onAdFailedToRender: () => setRendered(false),
          },
        });
      } catch {
        // 광고를 못 띄워도 학습 화면은 그대로 쓴다.
      }
    })();

    return () => {
      cancelled = true;
      attached?.destroy();
      setRendered(false);
    };
  }, [dark]);

  return (
    <section className={rendered ? 'ad ad-shown' : 'ad'} aria-label="광고" aria-hidden={!rendered}>
      <div ref={ref} className="ad-slot" />
    </section>
  );
}
