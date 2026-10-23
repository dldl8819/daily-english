import { describe, expect, it } from 'vitest';
import { EMPTY_PROGRESS } from './daily';
import { checkNickname, setNickname } from './profile';
import { filledSentence, isSaved, savedEntries, toggleSaved } from './saved';
import type { Question } from './types';

describe('checkNickname', () => {
  it('앞뒤 공백을 지우고 연속 공백을 하나로 줄인다', () => {
    expect(checkNickname('  영어  고수 ')).toEqual({ ok: true, value: '영어 고수' });
  });

  it('2~10자만 허용한다', () => {
    expect(checkNickname('a').ok).toBe(false);
    expect(checkNickname('ab').ok).toBe(true);
    expect(checkNickname('가'.repeat(10)).ok).toBe(true);
    expect(checkNickname('가'.repeat(11)).ok).toBe(false);
  });

  it('한글·영문·숫자·밑줄·공백 외 문자는 막는다', () => {
    expect(checkNickname('dev_kim 1').ok).toBe(true);
    expect(checkNickname('<script>').ok).toBe(false);
    expect(checkNickname('이모지😀').ok).toBe(false);
  });

  it('같은 닉네임이면 진행 상황을 바꾸지 않는다', () => {
    const p = setNickname(EMPTY_PROGRESS, '민식');
    expect(p.nickname).toBe('민식');
    expect(setNickname(p, '민식')).toBe(p);
  });
});

const q = (id: number): Question => ({
  id,
  category: 'dev',
  difficulty: 1,
  prompt: `Please ___ the bug ${id}.`,
  choices: ['fix', 'eat', 'sing', 'fly'],
  answer: 0,
  explanation: '',
});

describe('saved', () => {
  it('빈칸에 정답을 채운 문장을 만든다', () => {
    expect(filledSentence(q(1))).toBe('Please fix the bug 1.');
  });

  it('저장과 삭제를 오간다', () => {
    const now = new Date('2026-10-21T00:00:00Z');
    const on = toggleSaved(EMPTY_PROGRESS, 1, 'sentence', now);
    expect(isSaved(on, 1, 'sentence')).toBe(true);
    expect(isSaved(on, 1, 'word')).toBe(false);
    expect(isSaved(toggleSaved(on, 1, 'sentence', now), 1, 'sentence')).toBe(false);
  });

  it('종류별로 최근 저장한 것부터 돌려주고, 은행에 없는 문제는 건너뛴다', () => {
    let p = toggleSaved(EMPTY_PROGRESS, 1, 'word', new Date('2026-10-21T00:00:00Z'));
    p = toggleSaved(p, 2, 'word', new Date('2026-10-22T00:00:00Z'));
    p = toggleSaved(p, 3, 'sentence', new Date('2026-10-22T00:00:00Z'));
    p = toggleSaved(p, 99, 'word', new Date('2026-10-23T00:00:00Z'));
    expect(savedEntries(p, [q(1), q(2), q(3)], 'word').map((e) => e.questionId)).toEqual([2, 1]);
    expect(savedEntries(p, [q(1), q(2), q(3)], 'sentence').map((e) => e.questionId)).toEqual([3]);
  });
});
