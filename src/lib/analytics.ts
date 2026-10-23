import { canUseSdk } from './storage';

/**
 * 앱인토스 분석 로그. 콘솔 '분석 > 이벤트'와 '핵심 지표'(활성·전환 지표)의 기준이 된다.
 * 토스 앱 밖에서는 아무것도 하지 않고, 실패해도 사용 흐름에 영향을 주지 않는다.
 * 개인정보는 보내지 않는다 (anonymous_key는 SDK가 자동으로 붙인다).
 */
export type AppEvent =
  | 'daily_complete' // 대표 전환: 오늘 5문제 완료
  | 'bonus_open' // 보너스 5문제 열림 (source: share | ad)
  | 'bonus_complete' // 보너스 5문제 완료
  | 'share_app' // 친구에게 알리기 공유 창 완료
  | 'item_save' // 다시 볼 문장·단어 저장 (kind)
  | 'reminder_agree' // 학습 알림 동의
  | 'study_profile_set' // 맞춤 문제 설정 (reason, career_focus, self_level, daily_goal, from: onboarding | settings)
  | 'wrong_retry'; // 틀린 문제 다시 풀기 (correct)

export type EventParams = Record<string, string | number | boolean>;

export async function track(event: AppEvent, params: EventParams = {}): Promise<void> {
  if (!canUseSdk()) return;
  try {
    const { Analytics } = await import('@apps-in-toss/web-framework');
    await Analytics.log({ log_name: event, log_type: 'event', params });
  } catch {
    // 로그 실패는 무시한다.
  }
}

/** 화면 진입 로그. 화면 이름은 home·saved·settings·review */
export async function trackScreen(name: string): Promise<void> {
  if (!canUseSdk()) return;
  try {
    const { Analytics } = await import('@apps-in-toss/web-framework');
    await Analytics.screen({ log_name: `${name}_screen` });
  } catch {
    // 로그 실패는 무시한다.
  }
}

/**
 * 리뷰를 요청할 만한 순간인지. 만족도가 높을 때만, 같은 날 한 번(오늘 5문제 완료 시점)만 부른다.
 * - 연속 학습 3일째, 그리고 7일마다
 * - 오늘 5문제 중 3문제 이상 맞혔을 때
 */
export function shouldAskReview(streak: number, correct: number): boolean {
  if (correct < 3) return false;
  return streak === 3 || (streak > 0 && streak % 7 === 0);
}

/**
 * 리뷰 요청. 앱인토스가 피로도에 따라 화면을 안 띄울 수도 있고, 결과를 알려 주지 않는다.
 * 결과에 따라 흐름이나 보상을 바꾸지 않는다.
 */
export async function requestReview(): Promise<void> {
  if (!canUseSdk()) return;
  try {
    const { Review } = await import('@apps-in-toss/web-framework');
    if (Review.request.isSupported()) await Review.request();
  } catch {
    // 리뷰 요청 실패는 무시한다.
  }
}
