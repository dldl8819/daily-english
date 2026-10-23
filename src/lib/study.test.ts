import { describe, expect, it } from 'vitest';
import data from '@/data/questions.json';
import type { Question, StudyProfile } from './types';
import { EMPTY_PROGRESS, difficultyMix, pickDaily, recordPick, setStudyProfile, startAttempt } from './daily';
import { profileCategories, profileSummary, studyLevel } from './study';
import { xpToReach } from './level';

const questions = data as Question[];
const byId = new Map(questions.map((q) => [q.id, q]));
const profile = (over: Partial<StudyProfile> = {}): StudyProfile => ({
  reason: 'career',
  careerFocus: 'dev',
  selfLevel: 1,
  dailyGoal: 5,
  ...over,
});

describe('배우는 이유에 따른 분류', () => {
  it('설정 전에는 처음 출시 때처럼 개발자·일상 영어를 낸다', () => {
    expect(profileCategories(null)).toEqual(['dev', 'daily']);
  });

  it.each([
    ['communication', null, ['daily', 'office']],
    ['career', 'dev', ['dev', 'office']],
    ['career', 'office', ['office', 'daily']],
    ['career', 'toeic', ['toeic', 'office']],
    ['hobby', null, ['daily']],
    ['travel', null, ['daily']],
    ['study', null, ['study', 'toeic']],
  ] as const)('%s(%s) → %j', (reason, careerFocus, categories) => {
    expect(profileCategories({ reason, careerFocus })).toEqual(categories);
  });

  it.each(['communication', 'hobby', 'study'] as const)('%s이면 그 분류에서만 고르고, 분류가 둘이면 둘 다 나온다', (reason) => {
    const categories = profileCategories({ reason, careerFocus: null });
    for (const key of ['2026-10-21', '2026-10-22']) {
      const picked = pickDaily(questions, key, 1, [], '', categories);
      expect(picked).toHaveLength(5);
      expect(picked.every((q) => categories.includes(q.category))).toBe(true);
      expect(new Set(picked.map((q) => q.category)).size).toBe(categories.length);
    }
  });

  it('목적 분류에 문제가 없으면 전체에서 고른다', () => {
    const devOnly = questions.filter((q) => q.category === 'dev');
    expect(pickDaily(devOnly, '2026-10-21', 1, [], '', ['toeic'])).toHaveLength(5);
  });

  it('한 줄 요약', () => {
    expect(profileSummary(profile({ careerFocus: 'toeic', selfLevel: 2, dailyGoal: 10 }))).toBe(
      '경력 개발(토익 점수) · 어느 정도 · 하루 10문제',
    );
    expect(profileSummary(profile({ reason: 'travel', careerFocus: null }))).toBe('여행 · 기초부터 · 하루 5문제');
  });
});

describe('하루 목표 문제 수', () => {
  it('난이도 구성은 5문제 묶음을 되풀이한다', () => {
    expect(difficultyMix(1, 10)).toEqual([1, 1, 1, 2, 2, 1, 1, 1, 2, 2]);
    expect(difficultyMix(5)).toEqual([2, 2, 2, 3, 3]);
  });

  it.each([5, 10, 15, 20] as const)('%i문제를 겹치지 않게 고정한다', (dailyGoal) => {
    const p = startAttempt({ ...EMPTY_PROGRESS, profile: profile({ dailyGoal }) }, questions, '2026-10-21');
    expect(p.attempt!.ids).toHaveLength(dailyGoal);
    expect(new Set(p.attempt!.ids).size).toBe(dailyGoal);
  });
});

describe('스스로 고른 실력', () => {
  it('시작 레벨을 올리지만 XP 레벨이 더 높으면 XP 레벨을 쓴다', () => {
    expect(studyLevel({ xp: 0, profile: null })).toBe(1);
    expect(studyLevel({ xp: 0, profile: profile({ selfLevel: 2 }) })).toBe(3);
    expect(studyLevel({ xp: 0, profile: profile({ selfLevel: 3 }) })).toBe(5);
    expect(studyLevel({ xp: xpToReach(6), profile: profile({ selfLevel: 2 }) })).toBe(6);
  });

  it('자신 있어요를 고르면 첫날부터 심화 문제가 섞인다', () => {
    const p = startAttempt({ ...EMPTY_PROGRESS, profile: profile({ careerFocus: 'office', selfLevel: 3 }) }, questions, '2026-10-21');
    const difficulties = p.attempt!.ids.map((id) => byId.get(id)!.difficulty);
    expect(difficulties).toContain(3);
    expect(difficulties).not.toContain(1);
  });
});

describe('setStudyProfile', () => {
  const key = '2026-10-21';

  it('오늘 문제를 아직 안 풀었으면 새 설정(분류·문제 수)으로 다시 고른다', () => {
    const started = startAttempt({ ...EMPTY_PROGRESS, profile: profile() }, questions, key);
    const changed = setStudyProfile(started, profile({ careerFocus: 'toeic', dailyGoal: 10 }), questions, key);
    expect(changed.profile?.careerFocus).toBe('toeic');
    expect(changed.attempt!.ids).toHaveLength(10);
    const categories = changed.attempt!.ids.map((id) => byId.get(id)!.category);
    expect(categories.every((c) => c === 'toeic' || c === 'office')).toBe(true);
    // 버린 문제는 본 문제에서 빼고, 새로 고른 문제만 본 문제로 남는다.
    expect(new Set(changed.seen)).toEqual(new Set(changed.attempt!.ids));
  });

  it('오늘 문제를 풀기 시작했으면 그대로 두고 설정만 바꾼다', () => {
    const started = startAttempt({ ...EMPTY_PROGRESS, profile: profile() }, questions, key);
    const answered = recordPick(started, 0, 0);
    const changed = setStudyProfile(answered, profile({ reason: 'study', careerFocus: null, dailyGoal: 20 }), questions, key);
    expect(changed.attempt).toEqual(answered.attempt);
    expect(changed.profile?.reason).toBe('study');
  });

  it('오늘 문제가 없으면(처음 들어온 사용자) 설정만 정한다', () => {
    const changed = setStudyProfile(EMPTY_PROGRESS, profile({ reason: 'hobby', careerFocus: null }), questions, key);
    expect(changed.attempt).toBeNull();
    expect(changed.profile?.reason).toBe('hobby');
  });
});
