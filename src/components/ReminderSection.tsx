'use client';

import { useState } from 'react';
import { REMINDER_TIME_LABEL, type ReminderResult, type ReminderState } from '@/lib/reminder';

const OFF_GUIDE = '알림을 끄려면 토스 앱 → 전체 → 설정 → 알림 → 서비스별 알림에서 바꿀 수 있어요.';

const MESSAGES: Record<Exclude<ReminderResult, 'agreed'>, string> = {
  rejected: '알림을 신청하지 않았어요. 언제든 다시 신청할 수 있어요.',
  unsupported: '토스 앱을 최신 버전으로 업데이트하면 알림을 신청할 수 있어요.',
  error: '알림 신청에 실패했어요. 잠시 후 다시 시도해 주세요.',
};

type Props = {
  state: ReminderState;
  onRequest: () => Promise<ReminderResult>;
};

/** 설정 > 학습 알림 설정 화면의 알림 신청 영역 */
export default function ReminderSection({ state, onRequest }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function request() {
    setBusy(true);
    const result = await onRequest();
    setBusy(false);
    setMessage(result === 'agreed' ? '알림을 신청했어요.' : MESSAGES[result]);
  }

  return (
    <section className="card" aria-labelledby="reminder-heading">
      <h2 id="reminder-heading" className="section-title">
        학습 알림
      </h2>
      <p>{REMINDER_TIME_LABEL}에 토스 알림으로 오늘의 문제가 열렸다고 알려 드려요.</p>
      {state === 'agreed' ? (
        <p className="sub reminder-on">
          <span aria-hidden="true">✓ </span>알림을 받고 있어요. {OFF_GUIDE}
        </p>
      ) : (
        <button type="button" className="btn" onClick={() => !busy && request()} aria-disabled={busy}>
          {busy ? '신청하는 중' : '알림 받기'}
        </button>
      )}
      <p className="sub" role="status">
        {message}
      </p>
    </section>
  );
}
