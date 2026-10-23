// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BonusSection from './BonusSection';
import type { BonusSet } from '@/lib/types';
import * as bonus from '@/lib/bonus';

vi.mock('@/lib/bonus', () => ({
  shareAvailable: vi.fn(),
  shareApp: vi.fn(),
  rewardedAdAvailable: vi.fn(),
  loadRewardedAd: vi.fn(),
  showRewardedAd: vi.fn(),
}));

const mocked = vi.mocked(bonus);

beforeEach(() => {
  mocked.shareAvailable.mockReturnValue(true);
  mocked.rewardedAdAvailable.mockResolvedValue(true);
  mocked.loadRewardedAd.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function expectNoA11yViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

const set = (source: 'share' | 'ad', result: BonusSet['result']): BonusSet => ({
  date: '2026-10-21',
  source,
  ids: [1, 2, 3, 4, 5],
  picks: [],
  result,
  review: [],
});

describe('BonusSection', () => {
  it('공유가 끝나면 공유 보너스를 연다', async () => {
    const user = userEvent.setup();
    const onGrant = vi.fn();
    mocked.shareApp.mockResolvedValue('shared');
    const { container } = render(<BonusSection sets={[]} onGrant={onGrant} />);

    await user.click(screen.getByRole('button', { name: '친구에게 알리고 5문제 더 풀기' }));
    expect(onGrant).toHaveBeenCalledWith('share');
    expect(screen.getByRole('status').textContent).toContain('5문제가 열렸어요');
    await expectNoA11yViolations(container);
  });

  it('공유에 실패하면 열지 않는다', async () => {
    const user = userEvent.setup();
    const onGrant = vi.fn();
    mocked.shareApp.mockResolvedValue('error');
    render(<BonusSection sets={[]} onGrant={onGrant} />);
    await user.click(screen.getByRole('button', { name: '친구에게 알리고 5문제 더 풀기' }));
    expect(onGrant).not.toHaveBeenCalled();
  });

  it('광고는 미리 불러 둔 뒤에만 누를 수 있고, 끝까지 봤을 때만 연다', async () => {
    const user = userEvent.setup();
    const onGrant = vi.fn();
    mocked.showRewardedAd.mockResolvedValueOnce('closed').mockResolvedValueOnce('rewarded');
    render(<BonusSection sets={[]} onGrant={onGrant} />);

    const button = await screen.findByRole('button', { name: '광고 보고 5문제 더 풀기' });
    expect(mocked.loadRewardedAd).toHaveBeenCalledTimes(1);

    await user.click(button);
    expect(onGrant).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('끝까지 보면');
    await waitFor(() => expect(mocked.loadRewardedAd).toHaveBeenCalledTimes(2));

    await user.click(await screen.findByRole('button', { name: '광고 보고 5문제 더 풀기' }));
    expect(onGrant).toHaveBeenCalledWith('ad');
  });

  it('광고를 준비하는 동안에는 눌러도 아무 일도 없다', async () => {
    const user = userEvent.setup();
    mocked.loadRewardedAd.mockReturnValue(new Promise(() => {}));
    render(<BonusSection sets={[]} onGrant={vi.fn()} />);
    const button = await screen.findByRole('button', { name: '광고를 준비하고 있어요' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await user.click(button);
    expect(mocked.showRewardedAd).not.toHaveBeenCalled();
  });

  it('이미 쓴 방법의 버튼은 숨기고, 둘 다 썼으면 영역을 숨긴다', async () => {
    const { container, rerender } = render(
      <BonusSection sets={[set('share', { correct: 4, total: 5, xpGained: 40 })]} onGrant={vi.fn()} />,
    );
    expect(await screen.findByRole('button', { name: '광고 보고 5문제 더 풀기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '친구에게 알리고 5문제 더 풀기' })).toBeNull();

    rerender(
      <BonusSection
        sets={[set('share', { correct: 4, total: 5, xpGained: 40 }), set('ad', null)]}
        onGrant={vi.fn()}
      />,
    );
    expect(container.querySelector('#bonus-heading')).toBeNull();
  });

  it('공유도 광고도 쓸 수 없는 환경에서는 영역을 숨긴다', async () => {
    mocked.shareAvailable.mockReturnValue(false);
    mocked.rewardedAdAvailable.mockResolvedValue(false);
    const { container } = render(<BonusSection sets={[]} onGrant={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('#bonus-heading')).toBeNull());
  });

});
