import { describe, expect, it } from 'vitest';
import { requestReview, shouldAskReview, track, trackScreen } from './analytics';

describe('shouldAskReview', () => {
  it('연속 3일째와 7일마다, 3문제 이상 맞혔을 때만 리뷰를 부탁한다', () => {
    expect(shouldAskReview(3, 3)).toBe(true);
    expect(shouldAskReview(7, 5)).toBe(true);
    expect(shouldAskReview(14, 4)).toBe(true);
    expect(shouldAskReview(1, 5)).toBe(false);
    expect(shouldAskReview(4, 5)).toBe(false);
    expect(shouldAskReview(3, 2)).toBe(false);
    expect(shouldAskReview(0, 5)).toBe(false);
  });
});

describe('토스 앱 밖', () => {
  it('로그·리뷰 요청은 아무 일 없이 끝난다', async () => {
    await expect(track('daily_complete', { correct: 5 })).resolves.toBeUndefined();
    await expect(trackScreen('home')).resolves.toBeUndefined();
    await expect(requestReview()).resolves.toBeUndefined();
  });
});
