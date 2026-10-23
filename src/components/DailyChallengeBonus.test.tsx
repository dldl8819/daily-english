// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DailyChallenge from './DailyChallenge';
import questionsData from '@/data/questions.json';
import type { Question } from '@/lib/types';
import { STORAGE_KEY } from '@/lib/storage';

vi.mock('@/lib/bonus', () => ({
  shareAvailable: () => true,
  shareApp: vi.fn().mockResolvedValue('shared'),
  rewardedAdAvailable: vi.fn().mockResolvedValue(false),
  loadRewardedAd: vi.fn().mockResolvedValue(false),
  showRewardedAd: vi.fn(),
}));

const QUESTIONS = questionsData as Question[];

function saved() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!);
}

function byId(id: number) {
  return QUESTIONS.find((q) => q.id === id)!;
}

function choiceButtons() {
  return screen.getAllByRole('button').filter((b) => b.classList.contains('choice'));
}

beforeEach(() => {
localStorage.clear();
  // 맞춤 문제 설정을 마친 사용자(경력 개발·개발 업무, 하루 5문제)로 시작한다. 처음 들어올 때 묻는 화면은 따로 확인한다.
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile: { reason: 'career', careerFocus: 'dev', selfLevel: 1, dailyGoal: 5 } }));
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe('5문제 더 풀기 (통합)', () => {
  it('오늘 5문제를 마치고 공유하면 보너스 5문제를 풀고 정답당 10 XP를 받는다', async () => {
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });

    // 마치기 전에는 보너스 영역이 없다.
    expect(screen.queryByRole('heading', { name: '5문제 더 풀기' })).toBeNull();

    for (let i = 0; i < 5; i++) {
      await user.click(choiceButtons()[byId(saved().attempt.ids[i]).answer]);
      await user.click(screen.getByRole('button', { name: i < 4 ? '다음 문제' : '결과 보기' }));
    }
    const xpAfterDaily = saved().xp;
    expect(xpAfterDaily).toBe(55);

    await user.click(await screen.findByRole('button', { name: '친구에게 알리고 5문제 더 풀기' }));

    // 보너스 문제가 열리면 문제 제목으로 포커스가 간다.
    const heading = await screen.findByRole('heading', { level: 2, name: /보너스 5문제 중 1번째 문제/ });
    await waitFor(() => expect(document.activeElement).toBe(heading));

    // 보너스를 푸는 동안에는 결과 카드 자리에 보너스 문제가 나온다.
    expect(screen.queryByRole('heading', { name: '오늘 학습을 마쳤어요' })).toBeNull();
    const bonusIds: number[] = saved().bonus[0].ids;
    expect(bonusIds.some((id) => saved().attempt.ids.includes(id))).toBe(false);

    // 3개 맞히고 2개 틀린다.
    for (let i = 0; i < 5; i++) {
      const q = byId(bonusIds[i]);
      await user.click(choiceButtons()[i < 3 ? q.answer : (q.answer + 1) % 4]);
      await user.click(screen.getByRole('button', { name: i < 4 ? '다음 문제' : '결과 보기' }));
    }

    expect(saved().xp).toBe(xpAfterDaily + 30);
    expect(saved().streak).toBe(1);
    // 다 풀면 오늘의 문제와 보너스를 합친 결과 카드로 돌아오고, 제목으로 포커스가 간다.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: '오늘 학습을 마쳤어요' })),
    );
    expect(container.textContent).toContain('10문제 중 8문제');
    expect(container.textContent).toContain('+85');
    expect(container.textContent).toContain('오늘의 문제 5/5 · 보너스(친구에게 알리기) 3/5');
    // 광고를 쓸 수 없는 환경이라 남은 방법이 없어 "5문제 더 풀기"는 사라진다.
    expect(screen.queryByRole('heading', { name: '5문제 더 풀기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '친구에게 알리고 5문제 더 풀기' })).toBeNull();

    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);

    // 보너스에서 틀린 2문제는 틀린 문제에 모인다.
    expect(saved().wrong.map((w: { questionId: number }) => w.questionId).sort()).toEqual(bonusIds.slice(3).sort());
    expect(screen.getByRole('button', { name: '틀린 문제 2개' })).toBeTruthy();

    // 복습에는 오늘의 문제와 보너스 5문제가 모두 나온다.
    await user.click(screen.getByRole('button', { name: '오늘 문제 다시 보기' }));
    expect(screen.getByRole('heading', { level: 2, name: '오늘의 문제' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '보너스: 친구에게 알리기' })).toBeTruthy();
    expect(container.textContent).toContain('10문제 중 8문제를 맞혔어요.');
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(10);
    const reviewResult = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(reviewResult.violations.map((v) => v.id)).toEqual([]);
  });
});
