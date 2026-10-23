import { canUseSdk, loadValue, saveValue } from './storage';
import { track } from './analytics';

/**
 * 매일 학습 알림 (앱인토스 스마트 발송 · 기능성 · 토스 정기 발송).
 * 발송은 콘솔에 등록한 정기 발송 템플릿으로 토스가 대신 하고, 앱은 사용자 동의만 받는다.
 * 정기 발송 템플릿은 미니앱 출시 후에만 만들 수 있어, 발송 코드가 없으면 알림 메뉴를 숨긴다.
 */

/** 개발 서버에서는 devtools mock으로 흐름을 확인할 수 있게 예시 코드를 쓴다. */
const DEV_TEMPLATE_CODE = 'english-bite-daily-reminder';

export function reminderTemplateCode(): string | null {
  const code = process.env.NEXT_PUBLIC_AIT_REMINDER_TEMPLATE_CODE;
  if (code) return code;
  return process.env.NODE_ENV === 'development' ? DEV_TEMPLATE_CODE : null;
}

/** 콘솔 정기 발송 시각과 같아야 한다. 21~08시는 방해 금지 시간이라 그 사이로 잡지 않는다. */
export const REMINDER_TIME_LABEL = '매일 저녁 7시';

export const REMINDER_KEY = 'daily-english:reminder:v1';

export type ReminderState = 'agreed' | null;

export type ReminderResult = 'agreed' | 'rejected' | 'unsupported' | 'error';

export async function loadReminder(): Promise<ReminderState> {
  return (await loadValue(REMINDER_KEY)) === 'agreed' ? 'agreed' : null;
}

/** 사용자가 버튼을 눌렀을 때만 부른다 (진입 시 동의 화면 자동 노출 금지). */
export async function requestReminder(templateCode: string): Promise<ReminderResult> {
  if (!canUseSdk()) return 'unsupported';
  try {
    const { Notification } = await import('@apps-in-toss/web-framework');
    if (!Notification.requestAgreement.isSupported()) return 'unsupported';
    const result = await new Promise<ReminderResult>((resolve) => {
      let cleanup: (() => void) | undefined;
      const done = (value: ReminderResult) => {
        cleanup?.();
        resolve(value);
      };
      cleanup = Notification.requestAgreement({
        options: { templateCode },
        onEvent: ({ type }) => done(type === 'agreementRejected' ? 'rejected' : 'agreed'),
        onError: () => done('error'),
      });
    });
    if (result === 'agreed') {
      await saveValue(REMINDER_KEY, 'agreed');
      void track('reminder_agree');
    }
    return result;
  } catch {
    return 'error';
  }
}
