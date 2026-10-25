import { describe, expect, it } from 'vitest';
import type { Difficulty, Question } from './types';
import {
  EMPTY_PROGRESS,
  attemptQuestions,
  bindUser,
  bonusQuestions,
  completeBonus,
  grantBonus,
  recordBonusPick,
  todaysBonus,
  completeDay,
  countCorrect,
  difficultyMix,
  pickDaily,
  recordPick,
  startAttempt,
  visibleStreak,
} from './daily';
import { levelFromXp, levelProgress, xpForResult, xpToReach } from './level';

// 난이도 1~3 × 분류 2개 × 5문제 = 30문제
const questions: Question[] = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  category: i % 2 ? 'daily' : 'dev',
  difficulty: ((Math.floor(i / 10) % 3) + 1) as Difficulty,
  prompt: `q${i + 1} ___`,
  choices: ['a', 'b', 'c', 'd'],
  answer: i % 4,
  explanation: '',
}));

const ids = (list: Question[]) => list.map((q) => q.id);

describe('pickDaily', () => {
  it('같은 날짜·레벨·기록이면 같은 5문제를 준다', () => {
    expect(ids(pickDaily(questions, '2026-10-21'))).toEqual(ids(pickDaily(questions, '2026-10-21')));
    expect(pickDaily(questions, '2026-10-21')).toHaveLength(5);
  });

  it('하루 안에서 같은 문제를 두 번 내지 않는다', () => {
    const picked = ids(pickDaily(questions, '2026-10-21', 9));
    expect(new Set(picked).size).toBe(picked.length);
  });

  it('레벨에 맞는 난이도 구성을 따른다', () => {
    for (const level of [1, 3, 6, 10]) {
      const difficulties = pickDaily(questions, '2026-10-21', level).map((q) => q.difficulty);
      expect([...difficulties].sort()).toEqual([...difficultyMix(level)].sort());
    }
  });

  it('개발자 영어와 일상 영어를 섞는다', () => {
    const categories = new Set(pickDaily(questions, '2026-10-21').map((q) => q.category));
    expect(categories).toEqual(new Set(['dev', 'daily']));
  });

  it('안 본 문제를 먼저 낸다', () => {
    const first = ids(pickDaily(questions, '2026-10-21'));
    const second = ids(pickDaily(questions, '2026-10-21', 1, first));
    expect(second.some((id) => first.includes(id))).toBe(false);
  });

  it('원하는 난이도가 모자라면 다른 난이도로 채운다', () => {
    const onlyEasy = questions.filter((q) => q.difficulty === 1);
    expect(pickDaily(onlyEasy, '2026-10-21', 10)).toHaveLength(5);
  });

  it('원하는 난이도의 새 문제를 다 봤으면 복습보다 가까운 난이도의 새 문제를 먼저 낸다', () => {
    // 레벨 10은 중급 1 + 심화 4. 심화를 모두 봤으면 심화 복습 대신 새 중급(가까운 난이도)으로 채운다.
    const hardSeen = ids(questions.filter((q) => q.difficulty === 3));
    const picked = pickDaily(questions, '2026-10-21', 10, hardSeen);
    expect(picked.some((q) => hardSeen.includes(q.id))).toBe(false);
    expect(picked.map((q) => q.difficulty)).toEqual([2, 2, 2, 2, 2]);
  });

  it('새 문제가 하나도 없을 때만 복습한다', () => {
    const allSeen = ids(questions);
    const picked = pickDaily(questions, '2026-10-21', 10, allSeen);
    expect(picked).toHaveLength(5);
    expect([...picked.map((q) => q.difficulty)].sort()).toEqual([...difficultyMix(10)].sort());
  });

  it('문제가 5개보다 적으면 있는 만큼만, 없으면 빈 배열', () => {
    expect(pickDaily(questions.slice(0, 3), '2026-10-21')).toHaveLength(3);
    expect(pickDaily([], '2026-10-21')).toEqual([]);
  });
});

describe('startAttempt', () => {
  it('오늘의 문제를 고정하고 본 문제로 기록한다', () => {
    const p = startAttempt(EMPTY_PROGRESS, questions, '2026-10-21');
    expect(p.attempt?.date).toBe('2026-10-21');
    expect(p.attempt?.ids).toHaveLength(5);
    expect(p.attempt?.picks).toEqual([]);
    expect(p.seen).toEqual(p.attempt?.ids);
  });

  it('같은 날 다시 호출하면 문제가 바뀌지 않는다', () => {
    const p = startAttempt(EMPTY_PROGRESS, questions, '2026-10-21');
    expect(startAttempt(p, questions, '2026-10-21')).toBe(p);
  });

  it('문제 은행이 바뀌어도 오늘 고정한 문제는 그대로다', () => {
    const p = startAttempt(EMPTY_PROGRESS, questions, '2026-10-21');
    const grown = [...questions, { ...questions[0], id: 999 }];
    expect(startAttempt(p, grown, '2026-10-21')).toBe(p);
  });

  it('고정한 문제가 은행에서 빠졌으면 다시 고른다', () => {
    const p = startAttempt(EMPTY_PROGRESS, questions, '2026-10-21');
    const removed = questions.filter((q) => q.id !== p.attempt!.ids[0]);
    const again = startAttempt(p, removed, '2026-10-21');
    expect(attemptQuestions(again.attempt!, removed)).not.toBeNull();
  });

  it('문제가 없으면 아무것도 바꾸지 않는다', () => {
    expect(startAttempt(EMPTY_PROGRESS, [], '2026-10-21')).toBe(EMPTY_PROGRESS);
  });
});

describe('recordPick', () => {
  const started = startAttempt(EMPTY_PROGRESS, questions, '2026-10-21');

  it('현재 문제의 답을 순서대로 기록한다', () => {
    const p = recordPick(recordPick(started, 0, 2), 1, 0);
    expect(p.attempt?.picks).toEqual([2, 0]);
  });

  it('이미 답한 문제나 건너뛴 문제는 기록하지 않는다', () => {
    const p = recordPick(started, 0, 2);
    expect(recordPick(p, 0, 1)).toBe(p);
    expect(recordPick(p, 3, 1)).toBe(p);
  });

  it('맞힌 수를 센다', () => {
    const list = attemptQuestions(started.attempt!, questions)!;
    const picks = list.map((q, i) => (i < 3 ? q.answer : (q.answer + 1) % 4));
    expect(countCorrect(list, picks)).toBe(3);
  });
});

describe('completeDay', () => {
  it('XP와 streak를 올린다', () => {
    const p = completeDay(EMPTY_PROGRESS, '2026-10-21', 4, 5);
    expect(p.xp).toBe(xpForResult(4));
    expect(p.streak).toBe(1);
    expect(p.today).toEqual({ date: '2026-10-21', correct: 4, total: 5, xpGained: 45 });
  });

  it('연속된 날이면 streak가 이어지고, 건너뛰면 1로 돌아간다', () => {
    const d1 = completeDay(EMPTY_PROGRESS, '2026-10-21', 5, 5);
    const d2 = completeDay(d1, '2026-10-22', 5, 5);
    expect(d2.streak).toBe(2);
    expect(completeDay(d2, '2026-10-24', 5, 5).streak).toBe(1);
  });

  it('같은 날 두 번 완료해도 XP가 중복되지 않는다', () => {
    const d1 = completeDay(EMPTY_PROGRESS, '2026-10-21', 5, 5);
    expect(completeDay(d1, '2026-10-21', 5, 5)).toBe(d1);
  });

  it('월·연 경계에서도 연속으로 센다', () => {
    expect(completeDay(completeDay(EMPTY_PROGRESS, '2026-10-31', 5, 5), '2026-11-01', 5, 5).streak).toBe(2);
    expect(completeDay(completeDay(EMPTY_PROGRESS, '2026-12-31', 5, 5), '2027-01-01', 5, 5).streak).toBe(2);
  });

  it('풀이 기록과 본 문제 기록은 유지한다', () => {
    const started = startAttempt(EMPTY_PROGRESS, questions, '2026-10-21');
    const done = completeDay(started, '2026-10-21', 3, 5);
    expect(done.attempt).toEqual(started.attempt);
    expect(done.seen).toEqual(started.seen);
  });
});

describe('bonus', () => {
  const day = '2026-10-21';
  const started = startAttempt(EMPTY_PROGRESS, questions, day);
  const done = completeDay(started, day, 5, 5);

  it('오늘 학습을 마치기 전에는 열리지 않는다', () => {
    expect(grantBonus(started, questions, day, 'share')).toBe(started);
  });

  it('방법마다 하루 한 번, 오늘 낸 문제와 겹치지 않게 5문제를 연다', () => {
    const one = grantBonus(done, questions, day, 'share');
    const two = grantBonus(one, questions, day, 'ad');
    expect(grantBonus(two, questions, day, 'share')).toBe(two);

    const ids = [...done.attempt!.ids, ...two.bonus.flatMap((b) => b.ids)];
    expect(two.bonus).toHaveLength(2);
    expect(two.bonus.every((b) => b.ids.length === 5)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(two.seen).toEqual(expect.arrayContaining(ids));
  });

  it('답을 순서대로 기록하고, 마치면 정답당 10 XP만 더한다', () => {
    let p = grantBonus(done, questions, day, 'ad');
    p = recordBonusPick(p, day, 'ad', 0, 1);
    expect(recordBonusPick(p, day, 'ad', 0, 2)).toBe(p);
    expect(recordBonusPick(p, day, 'ad', 3, 2)).toBe(p);
    expect(todaysBonus(p, day)[0].picks).toEqual([1]);

    const finished = completeBonus(p, day, 'ad', 3);
    expect(finished.xp).toBe(done.xp + 30);
    expect(finished.streak).toBe(done.streak);
    expect(todaysBonus(finished, day)[0].result).toEqual({ correct: 3, total: 5, xpGained: 30 });
    expect(completeBonus(finished, day, 'ad', 5)).toBe(finished);
  });

  it('다음 날에는 어제 보너스를 남기지 않고 새로 열 수 있다', () => {
    const yesterday = grantBonus(done, questions, day, 'share');
    const next = '2026-10-22';
    const nextDone = completeDay(startAttempt(yesterday, questions, next), next, 5, 5);
    expect(todaysBonus(nextDone, next)).toEqual([]);
    const opened = grantBonus(nextDone, questions, next, 'share');
    expect(opened.bonus.map((b) => b.date)).toEqual([next]);
  });

  it('고정한 보너스 문제를 문제로 바꾼다', () => {
    const p = grantBonus(done, questions, day, 'share');
    expect(bonusQuestions(p.bonus[0], questions)!.map((q) => q.id)).toEqual(p.bonus[0].ids);
    expect(bonusQuestions(p.bonus[0], [])).toBeNull();
  });
});

describe('bindUser', () => {
  const played = completeDay(EMPTY_PROGRESS, '2026-10-21', 5, 5);

  it('식별키를 못 받았으면 그대로 쓴다', () => {
    expect(bindUser(played, null)).toBe(played);
  });

  it('식별키가 없던 기록에는 지금 키를 붙여 이어받는다', () => {
    const bound = bindUser(played, 'user-a');
    expect(bound.userKey).toBe('user-a');
    expect(bound.xp).toBe(played.xp);
  });

  it('같은 사용자면 그대로 쓴다', () => {
    const bound = bindUser(played, 'user-a');
    expect(bindUser(bound, 'user-a')).toBe(bound);
  });

  it('다른 사용자면 새로 시작한다', () => {
    const fresh = bindUser(bindUser(played, 'user-a'), 'user-b');
    expect(fresh).toEqual({ ...EMPTY_PROGRESS, userKey: 'user-b' });
  });
});

describe('visibleStreak', () => {
  it('하루 넘게 쉬면 0으로 보인다', () => {
    const p = completeDay(EMPTY_PROGRESS, '2026-10-21', 5, 5);
    expect(visibleStreak(p, '2026-10-22')).toBe(1);
    expect(visibleStreak(p, '2026-10-23')).toBe(0);
  });
});

describe('level', () => {
  it('누적 XP로 레벨이 올라간다', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(59)).toBe(1);
    expect(levelFromXp(60)).toBe(2);
    expect(levelFromXp(180)).toBe(3);
    expect(xpToReach(5)).toBe(600);
  });

  it('진행도를 계산한다', () => {
    expect(levelProgress(90)).toEqual({ level: 2, current: 30, needed: 120 });
  });
});
