import { canUseSdk } from './storage';
import { track } from './analytics';

/** 공유할 미니앱 주소. appName은 콘솔에 등록한 값(변경 불가)이다. */
const APP_LINK = 'intoss://english-bite';

/** 개발 단계에서는 반드시 테스트 광고 ID를 쓴다 (실제 ID로 테스트하면 정책 위반). */
const TEST_REWARDED_ID = 'ait-ad-test-rewarded-id';

export function rewardedAdGroupId(): string | null {
  if (process.env.NODE_ENV !== 'production') return TEST_REWARDED_ID;
  return process.env.NEXT_PUBLIC_AIT_REWARDED_AD_GROUP_ID || null;
}

export function shareAvailable(): boolean {
  return canUseSdk();
}

export type ShareResult = 'shared' | 'unsupported' | 'error';

/**
 * 친구에게 미니앱을 알린다. 토스 공유 링크를 만들어 공유 창을 연다.
 * 공유 창이 오류 없이 끝나면 true다. 친구가 실제로 받았는지는 알 수 없다.
 */
export async function shareApp(): Promise<ShareResult> {
  if (!canUseSdk()) return 'unsupported';
  try {
    const { Share } = await import('@apps-in-toss/web-framework');
    const link = await Share.createLink({ path: APP_LINK });
    await Share.sendMessage({ message: `하루 5문제, 영어를 하루 한 입씩 챙겨 봐요.\n${link}` });
    void track('share_app');
    return 'shared';
  } catch {
    return 'error';
  }
}

type Sdk = typeof import('@apps-in-toss/web-framework');

async function ads(): Promise<Sdk | null> {
  try {
    return await import('@apps-in-toss/web-framework');
  } catch {
    return null;
  }
}

/** 보상형 광고를 쓸 수 있는 환경인지. 광고 그룹 ID가 없는 운영 빌드에서는 false */
export async function rewardedAdAvailable(): Promise<boolean> {
  if (!canUseSdk() || !rewardedAdGroupId()) return false;
  const sdk = await ads();
  return !!sdk && sdk.loadFullScreenAd.isSupported() && sdk.showFullScreenAd.isSupported();
}

/** 광고를 미리 불러 둔다(광고는 사용자가 누르기 전에 로드돼 있어야 한다). 성공하면 true */
export async function loadRewardedAd(): Promise<boolean> {
  const adGroupId = rewardedAdGroupId();
  const sdk = await ads();
  if (!adGroupId || !sdk) return false;
  return new Promise<boolean>((resolve) => {
    let cleanup: (() => void) | undefined;
    const finish = (ok: boolean) => {
      cleanup?.();
      resolve(ok);
    };
    cleanup = sdk.loadFullScreenAd({
      options: { adGroupId },
      onEvent: (event) => {
        if (event.type === 'loaded') finish(true);
      },
      onError: () => finish(false),
    });
  });
}

export type RewardedResult = 'rewarded' | 'closed' | 'error';

/**
 * 미리 불러 둔 보상형 광고를 보여 준다.
 * userEarnedReward(끝까지 시청)에서만 'rewarded'다. 중간에 닫으면 'closed'로 보상이 없다.
 */
export async function showRewardedAd(): Promise<RewardedResult> {
  const adGroupId = rewardedAdGroupId();
  const sdk = await ads();
  if (!adGroupId || !sdk || !sdk.showFullScreenAd.isSupported()) return 'error';
  return new Promise<RewardedResult>((resolve) => {
    let settled = false;
    let cleanup: (() => void) | undefined;
    const finish = (value: RewardedResult) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    cleanup = sdk.showFullScreenAd({
      options: { adGroupId },
      onEvent: (event) => {
        if (event.type === 'userEarnedReward') finish('rewarded');
        if (event.type === 'dismissed') {
          finish('closed');
          cleanup?.();
        }
        if (event.type === 'failedToShow') {
          finish('error');
          cleanup?.();
        }
      },
      onError: () => {
        finish('error');
        cleanup?.();
      },
    });
  });
}
