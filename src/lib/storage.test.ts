import { describe, expect, it } from 'vitest';
import { EMPTY_PROGRESS } from './daily';
import { parseProgress } from './storage';

describe('parseProgress', () => {
  it('저장값이 없으면 빈 진행 상황', () => {
    expect(parseProgress(null)).toEqual(EMPTY_PROGRESS);
  });

  it('깨진 JSON이면 빈 진행 상황', () => {
    expect(parseProgress('{not json')).toEqual(EMPTY_PROGRESS);
  });

  it('타입이 틀린 필드만 기본값으로 바꾼다', () => {
    const p = parseProgress(JSON.stringify({ xp: '100', streak: 3, lastDate: '2026-10-21' }));
    expect(p.xp).toBe(0);
    expect(p.streak).toBe(3);
    expect(p.lastDate).toBe('2026-10-21');
  });

  it('v1 초기 형식(attempt, seen, userKey 없음)을 그대로 읽는다', () => {
    const old = { xp: 45, streak: 1, lastDate: '2026-10-21', today: { date: '2026-10-21', correct: 4, total: 5, xpGained: 45 } };
    expect(parseProgress(JSON.stringify(old))).toEqual({
      ...old,
      attempt: null,
      seen: [],
      userKey: null,
      nickname: null,
      saved: [],
      bonus: [],
      profile: null,
      wrong: [],
      history: {},
    });
  });

  it('보너스 문제를 읽고, 형태가 틀린 항목은 버린다', () => {
    const p = parseProgress(
      JSON.stringify({
        bonus: [
          { date: '2026-10-21', source: 'ad', ids: [1, 2], picks: [0], result: null },
          { date: '2026-10-21', source: 'share', ids: [3], picks: [1], result: { correct: 1, total: 1, xpGained: 10 } },
          { date: '2026-10-21', source: 'coupon', ids: [4], picks: [], result: null },
        ],
      }),
    );
    expect(p.bonus.map((b) => b.source)).toEqual(['ad', 'share']);
    expect(p.bonus[1].result).toEqual({ correct: 1, total: 1, xpGained: 10 });
  });

  it('닉네임과 저장 항목을 읽고, 형태가 틀린 저장 항목은 버린다', () => {
    const p = parseProgress(
      JSON.stringify({
        nickname: '민식',
        saved: [
          { questionId: 3, kind: 'word', savedAt: '2026-10-21T00:00:00.000Z' },
          { questionId: 'x', kind: 'word', savedAt: '2026-10-21T00:00:00.000Z' },
          { questionId: 4, kind: 'phrase', savedAt: '2026-10-21T00:00:00.000Z' },
        ],
      }),
    );
    expect(p.nickname).toBe('민식');
    expect(p.saved).toEqual([{ questionId: 3, kind: 'word', savedAt: '2026-10-21T00:00:00.000Z' }]);
  });

  it('사용자 식별키를 읽고, 문자열이 아니면 버린다', () => {
    expect(parseProgress(JSON.stringify({ userKey: 'abc' })).userKey).toBe('abc');
    expect(parseProgress(JSON.stringify({ userKey: 1 })).userKey).toBeNull();
  });

  it('맞춤 문제 설정과 틀린 문제를 읽고, 모르는 값과 형태가 틀린 항목은 버린다', () => {
    const profile = { reason: 'career', careerFocus: 'toeic', selfLevel: 3, dailyGoal: 15 };
    const p = parseProgress(
      JSON.stringify({
        profile,
        wrong: [{ questionId: 1, pick: 2, date: '2026-10-21' }, { questionId: '2', pick: 1, date: '2026-10-21' }],
      }),
    );
    expect(p.profile).toEqual(profile);
    expect(p.wrong).toEqual([{ questionId: 1, pick: 2, date: '2026-10-21' }]);
    for (const bad of [
      { ...profile, reason: 'exam' },
      { ...profile, dailyGoal: 7 },
      { ...profile, selfLevel: 4 },
      { ...profile, reason: 'travel' }, // 경력 개발이 아니면 쓰는 곳이 없어야 한다
      { ...profile, careerFocus: null }, // 경력 개발이면 쓰는 곳이 있어야 한다
    ]) {
      expect(parseProgress(JSON.stringify({ profile: bad })).profile).toBeNull();
    }
  });

  it('20261022-7의 학습 목적·실력은 같은 문제가 나오는 설정으로 옮기고, 하루 목표는 5문제', () => {
    const read = (goal: string, selfLevel = 2) => parseProgress(JSON.stringify({ goal, selfLevel })).profile;
    expect(read('dev')).toEqual({ reason: 'career', careerFocus: 'dev', selfLevel: 2, dailyGoal: 5 });
    expect(read('office')).toEqual({ reason: 'career', careerFocus: 'office', selfLevel: 2, dailyGoal: 5 });
    expect(read('toeic')).toEqual({ reason: 'career', careerFocus: 'toeic', selfLevel: 2, dailyGoal: 5 });
    expect(read('study')).toEqual({ reason: 'study', careerFocus: null, selfLevel: 2, dailyGoal: 5 });
    expect(read('daily')).toEqual({ reason: 'travel', careerFocus: null, selfLevel: 2, dailyGoal: 5 });
    expect(read('exam')).toBeNull();
    expect(read('dev', 4)).toBeNull();
  });

  it('형태가 틀린 today, attempt는 버린다', () => {
    const p = parseProgress(JSON.stringify({ today: { date: 1 }, attempt: { date: '2026-10-21', ids: 'x', picks: [] } }));
    expect(p.today).toBeNull();
    expect(p.attempt).toBeNull();
  });
});
