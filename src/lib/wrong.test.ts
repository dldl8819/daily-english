import { describe, expect, it } from 'vitest';
import type { Question } from './types';
import { EMPTY_PROGRESS } from './daily';
import { WRONG_MAX, backfillWrong, noteAnswer, removeWrong, wrongEntries } from './wrong';

const q = (id: number): Question => ({
  id,
  category: 'daily',
  difficulty: 1,
  prompt: 'I ___ it.',
  choices: ['like', 'likes', 'liking', 'liked'],
  answer: 0,
  explanation: '해설',
});

describe('틀린 문제', () => {
  it('틀리면 맨 앞에 넣고, 같은 문제를 또 틀리면 앞으로 옮긴다', () => {
    let p = noteAnswer(EMPTY_PROGRESS, q(1), 2, '2026-10-21');
    p = noteAnswer(p, q(2), 1, '2026-10-21');
    p = noteAnswer(p, q(1), 3, '2026-10-22');
    expect(p.wrong).toEqual([
      { questionId: 1, pick: 3, date: '2026-10-22' },
      { questionId: 2, pick: 1, date: '2026-10-21' },
    ]);
  });

  it('맞히면 목록에서 빠지고, 목록에 없으면 그대로 둔다', () => {
    const p = noteAnswer(EMPTY_PROGRESS, q(1), 2, '2026-10-21');
    expect(noteAnswer(p, q(1), 0, '2026-10-22').wrong).toEqual([]);
    expect(noteAnswer(EMPTY_PROGRESS, q(1), 0, '2026-10-21')).toBe(EMPTY_PROGRESS);
  });

  it(`최근 ${WRONG_MAX}개만 남긴다`, () => {
    let p = EMPTY_PROGRESS;
    for (let id = 1; id <= WRONG_MAX + 5; id += 1) p = noteAnswer(p, q(id), 1, '2026-10-21');
    expect(p.wrong).toHaveLength(WRONG_MAX);
    expect(p.wrong[0].questionId).toBe(WRONG_MAX + 5);
  });

  it('지우고, 문제 은행에서 빠진 문제는 목록에 보이지 않는다', () => {
    let p = noteAnswer(EMPTY_PROGRESS, q(1), 1, '2026-10-21');
    p = noteAnswer(p, q(99), 1, '2026-10-21');
    expect(wrongEntries(p, [q(1)]).map((e) => e.questionId)).toEqual([1]);
    expect(removeWrong(p, 1).wrong.map((w) => w.questionId)).toEqual([99]);
  });
});

describe('이전 기록으로 틀린 문제 채우기', () => {
  it('가장 최근 하루의 오늘 문제와 보너스에서 틀린 문제만 옮긴다', () => {
    const p = backfillWrong(
      {
        ...EMPTY_PROGRESS,
        attempt: { date: '2026-10-22', ids: [1, 2, 3], picks: [0, 1, 2], review: [] },
        bonus: [{ date: '2026-10-22', source: 'share', ids: [4, 5], picks: [3, 0], result: null, review: [] }],
      },
      [q(1), q(2), q(3), q(4), q(5)],
    );
    expect(p.wrong.map((w) => [w.questionId, w.pick])).toEqual([
      [4, 3],
      [3, 2],
      [2, 1],
    ]);
  });

  it('이미 목록에 있는 문제는 건드리지 않고, 기록이 없으면 그대로 둔다', () => {
    const base = noteAnswer(EMPTY_PROGRESS, q(2), 3, '2026-10-21');
    const p = backfillWrong({ ...base, attempt: { date: '2026-10-22', ids: [2], picks: [1], review: [] } }, [q(2)]);
    expect(p.wrong).toEqual(base.wrong);
    expect(backfillWrong(EMPTY_PROGRESS, [q(1)])).toBe(EMPTY_PROGRESS);
  });
});
