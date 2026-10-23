// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReminderSection from './ReminderSection';
import { reminderTemplateCode } from '@/lib/reminder';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function expectNoA11yViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

describe('ReminderSection', () => {
  it('알림 받기를 누르면 동의를 요청하고 결과를 알린다', async () => {
    const user = userEvent.setup();
    const onRequest = vi.fn().mockResolvedValue('agreed');
    const { container, rerender } = render(<ReminderSection state={null} onRequest={onRequest} />);
    expect(screen.getByRole('heading', { level: 2, name: '학습 알림' })).toBeTruthy();
    expect(container.textContent).toContain('매일 저녁 7시');

    await user.click(screen.getByRole('button', { name: '알림 받기' }));
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('알림을 신청했어요.');

    rerender(<ReminderSection state="agreed" onRequest={onRequest} />);
    expect(screen.queryByRole('button', { name: '알림 받기' })).toBeNull();
    expect(container.textContent).toContain('서비스별 알림');
    await expectNoA11yViolations(container);
  });

  it.each([
    ['rejected', '언제든 다시 신청할 수 있어요'],
    ['unsupported', '최신 버전으로 업데이트'],
    ['error', '잠시 후 다시 시도'],
  ] as const)('%s 결과를 글로 안내한다', async (result, text) => {
    const user = userEvent.setup();
    render(<ReminderSection state={null} onRequest={vi.fn().mockResolvedValue(result)} />);
    await user.click(screen.getByRole('button', { name: '알림 받기' }));
    expect(screen.getByRole('status').textContent).toContain(text);
  });
});

describe('reminderTemplateCode', () => {
  it('설정된 발송 코드를 쓴다', () => {
    vi.stubEnv('NEXT_PUBLIC_AIT_REMINDER_TEMPLATE_CODE', 'english-bite-daily');
    expect(reminderTemplateCode()).toBe('english-bite-daily');
  });

  it('설정이 없으면 운영·테스트 빌드에서는 알림 메뉴를 숨긴다(null)', () => {
    vi.stubEnv('NEXT_PUBLIC_AIT_REMINDER_TEMPLATE_CODE', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(reminderTemplateCode()).toBeNull();
  });
});
