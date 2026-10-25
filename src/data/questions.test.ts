import { describe, expect, it } from 'vitest';
import type { Question } from '@/lib/types';
import data from './questions.json';
import extraData from './questions.extra.json';
import { contentViolations } from './contentPolicy';

const main = data as Question[];
// 1년 분량으로 늘린 추가 문제 은행(서버 모드 전용). 저장소에는 없고, 없으면 빈 목록이다.
const extra = extraData as Question[];
// 형식·중복·표현 검사는 두 문제 은행을 합쳐서 본다.
const questions = [...main, ...extra];
// 저장소에는 샘플(75문제)만 있다. 개수·분포 기준은 실제 문제 은행에서만 본다.
const isFullBank = main.length >= 100;

describe('문제 은행', () => {
  it.runIf(isFullBank)('100개 이상이다', () => {
    expect(main.length).toBeGreaterThanOrEqual(100);
  });

  it.runIf(isFullBank)('분류마다 100문제 이상이다', () => {
    for (const category of ['dev', 'office', 'study', 'toeic', 'daily']) {
      expect(main.filter((q) => q.category === category).length, category).toBeGreaterThanOrEqual(100);
    }
  });

  it('같은 문장이 두 번 나오지 않는다 (대소문자·문장부호 무시)', () => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z_ ]/g, ' ').replace(/\s+/g, ' ').trim();
    const byPrompt = new Map<string, number>();
    const dups = questions.flatMap((q) => {
      const key = norm(q.prompt);
      const first = byPrompt.get(key);
      byPrompt.set(key, q.id);
      return first === undefined ? [] : [`#${first} #${q.id}`];
    });
    expect(dups).toEqual([]);
  });

  it('출시 가이드에 어긋나는 표현(비속어·폭력·약물·선정·비하 등)이 문장·보기·해설·해석에 없다', () => {
    const hits = questions.flatMap((q) => {
      const found = contentViolations(q);
      return found.length ? [`#${q.id} ${found.join(', ')}`] : [];
    });
    expect(hits).toEqual([]);
  });

  it.runIf(isFullBank)('모든 문항에 문장 해석이 있다', () => {
    expect(main.filter((q) => !q.translation).map((q) => q.id)).toEqual([]);
  });

  it('추가 문제 은행은 모든 문항에 해석이 있다', () => {
    expect(extra.filter((q) => !q.translation).map((q) => q.id)).toEqual([]);
  });

  it('id가 겹치지 않는다 (두 문제 은행 합쳐서)', () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it.each(questions.map((q) => [q.id, q] as const))('#%i 형식이 올바르다', (_, q) => {
    expect(['dev', 'office', 'study', 'toeic', 'daily']).toContain(q.category);
    expect([1, 2, 3]).toContain(q.difficulty);
    expect(q.prompt.split('___').length - 1).toBe(1);
    expect(q.choices).toHaveLength(4);
    expect(new Set(q.choices.map((c) => c.toLowerCase())).size).toBe(4);
    expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length).toBe(true);
    expect(q.explanation.trim().length).toBeGreaterThan(0);
    // 해석은 아직 없는 문항도 있다. 있으면 빈칸 없이 정답을 채운 한국어 문장이어야 한다.
    if (q.translation !== undefined) {
      expect(q.translation.trim().length).toBeGreaterThan(0);
      expect(q.translation).not.toContain('___');
      expect(q.translation).toMatch(/[가-힣]/);
    }
  });

  it.runIf(isFullBank)('난이도·분류마다 하루 출제에 충분한 문제가 있다', () => {
    for (const difficulty of [1, 2, 3]) {
      for (const category of ['dev', 'office', 'study', 'toeic', 'daily']) {
        const count = main.filter((q) => q.difficulty === difficulty && q.category === category).length;
        expect(count, `난이도 ${difficulty} ${category}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('정답 위치가 한쪽에 몰리지 않는다', () => {
    const counts = [0, 1, 2, 3].map((i) => questions.filter((q) => q.answer === i).length);
    for (const count of counts) {
      expect(count / questions.length).toBeLessThan(0.4);
    }
  });
});
