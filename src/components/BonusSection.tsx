'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BonusSet, BonusSource } from '@/lib/types';
import {
  loadRewardedAd,
  rewardedAdAvailable,
  shareApp,
  shareAvailable,
  showRewardedAd,
} from '@/lib/bonus';

/** 공유·광고는 마쳤는데 서버에서 보너스 문제를 받지 못했을 때 */
const OPEN_FAILED = '5문제를 열지 못했어요. 잠시 후 다시 시도해 주세요.';

type AdState = 'checking' | 'unavailable' | 'loading' | 'ready';

type Props = {
  /** 오늘 연 보너스 문제 */
  sets: BonusSet[];
  /** 보너스를 열어 준다. 이미 열었으면 아무 일도 하지 않는다. 서버 모드에서 열지 못하면 false */
  onGrant: (source: BonusSource) => Promise<boolean> | void;
};

/**
 * 결과 카드 안의 "5문제 더 풀기": 아직 쓰지 않은 방법(친구에게 알리기, 광고 보기)의 버튼만 보여 준다.
 * 방법마다 하루 한 번이고, 이미 푼 보너스의 결과는 결과 카드의 합계에 들어간다.
 */
export default function BonusSection({ sets, onGrant }: Props) {
  const [adState, setAdState] = useState<AdState>('checking');
  const [busy, setBusy] = useState<BonusSource | null>(null);
  const [message, setMessage] = useState('');
  const canShare = shareAvailable();

  const preloadAd = useCallback(async () => {
    setAdState('loading');
    setAdState((await loadRewardedAd()) ? 'ready' : 'unavailable');
  }, []);

  // 광고는 누르기 전에 미리 불러 둔다. 이미 광고로 열었으면 더 불러올 필요가 없다.
  const adUsed = sets.some((s) => s.source === 'ad');
  useEffect(() => {
    if (adUsed) return;
    let cancelled = false;
    void rewardedAdAvailable().then((ok) => {
      if (cancelled) return;
      if (ok) void preloadAd();
      else setAdState('unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, [adUsed, preloadAd]);

  async function share() {
    setBusy('share');
    setMessage('');
    const result = await shareApp();
    const opened = result === 'shared' && (await onGrant('share')) !== false;
    setBusy(null);
    if (opened) {
      setMessage('알려 주셔서 고마워요. 5문제가 열렸어요.');
    } else {
      setMessage(result === 'shared' ? OPEN_FAILED : '공유하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }

  async function watchAd() {
    setBusy('ad');
    setMessage('');
    const result = await showRewardedAd();
    const opened = result === 'rewarded' && (await onGrant('ad')) !== false;
    setBusy(null);
    if (opened) {
      setMessage('광고를 끝까지 봤어요. 5문제가 열렸어요.');
    } else if (result === 'rewarded') {
      setMessage(OPEN_FAILED);
    } else {
      setMessage(result === 'closed' ? '광고를 끝까지 보면 5문제가 열려요.' : '광고를 보여 주지 못했어요. 잠시 후 다시 시도해 주세요.');
      void preloadAd();
    }
  }

  const shareLeft = canShare && !sets.some((set) => set.source === 'share');
  const adLeft = adState !== 'unavailable' && !adUsed;

  if (!shareLeft && !adLeft && !message) return null;

  return (
    <section className="result-bonus" aria-labelledby="bonus-heading">
      <h3 id="bonus-heading" className="section-title">
        5문제 더 풀기
      </h3>
      <p className="sub">방법마다 하루 한 번 열 수 있고, 정답당 10 XP를 받아요.</p>
      {shareLeft && (
        <div className="bonus-row">
          <button type="button" className="btn" onClick={() => busy === null && share()} aria-disabled={busy !== null}>
            {busy === 'share' ? '공유하는 중' : '친구에게 알리고 5문제 더 풀기'}
          </button>
        </div>
      )}
      {adLeft && (
        <div className="bonus-row">
          <button
            type="button"
            className="btn"
            onClick={() => busy === null && adState === 'ready' && watchAd()}
            aria-disabled={busy !== null || adState !== 'ready'}
          >
            {adState === 'ready' ? '광고 보고 5문제 더 풀기' : '광고를 준비하고 있어요'}
          </button>
          <p className="sub">광고를 끝까지 보면 열려요. 중간에 닫으면 열리지 않아요.</p>
        </div>
      )}
      <p className="sub" role="status">
        {message}
      </p>
    </section>
  );
}
