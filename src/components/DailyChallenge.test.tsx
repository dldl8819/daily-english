// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DailyChallenge from './DailyChallenge';
import questionsData from '@/data/questions.json';
import type { Question } from '@/lib/types';
import { STORAGE_KEY } from '@/lib/storage';
import { THEME_KEY } from '@/lib/theme';

const QUESTIONS = questionsData as Question[];

/** axe 검사. jsdom은 실제 색을 계산하지 못해 색 대비는 contrast.test.ts에서 따로 본다. */
async function expectNoA11yViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

/** 화면의 현재 문제를 저장된 attempt에서 찾는다. */
function currentQuestion(index: number): Question {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  return QUESTIONS.find((q) => q.id === saved.attempt.ids[index])!;
}

/** 홈 → 설정 → 세부 화면(예: /화면 설정/)으로 간다. 메뉴 버튼 이름에는 지금 값이 함께 붙는다. */
async function openSettings(user: ReturnType<typeof userEvent.setup>, item: RegExp) {
  await user.click(await screen.findByRole('button', { name: '설정' }));
  await user.click(await screen.findByRole('button', { name: item }));
}

/** 토스 내비게이션 바·안드로이드 뒤로가기와 같은 동작(브라우저 기록 뒤로). 화면 안에는 뒤로가기 버튼이 없다. */
async function goBack() {
  await act(async () => {
    history.back();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function choiceButtons() {
  return screen.getAllByRole('button').filter((b) => b.classList.contains('choice'));
}

beforeEach(() => {
localStorage.clear();
  // 맞춤 문제 설정을 마친 사용자(경력 개발·개발 업무, 하루 5문제)로 시작한다. 처음 들어올 때 묻는 화면은 따로 확인한다.
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile: { reason: 'career', careerFocus: 'dev', selfLevel: 1, dailyGoal: 5 } }));
  // 앞 테스트에서 다른 화면으로 이동한 기록이 남지 않게 한다.
  history.replaceState(null, '');
  delete document.documentElement.dataset.theme;
  // jsdom에는 matchMedia가 없다.
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe('다시 볼 항목과 설정', () => {
  it('답한 뒤 문장·단어를 저장하고, 목록 화면에서 보고 지운다', async () => {
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });
    const q = currentQuestion(0);

    await user.click(choiceButtons()[q.answer]);
    const saveSentence = screen.getByRole('button', { name: /문장 저장/ });
    expect(saveSentence.getAttribute('aria-pressed')).toBe('false');
    await user.click(saveSentence);
    await user.click(screen.getByRole('button', { name: /단어 저장/ }));
    expect(saveSentence.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '다시 볼 항목 2개' })).toBeTruthy();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: '다시 볼 항목 2개' }));
    const heading = screen.getByRole('heading', { level: 1, name: '다시 볼 항목' });
    expect(document.activeElement).toBe(heading);
    const answer = q.choices[q.answer];
    expect(container.textContent).toContain(q.prompt.replace('___', answer));
    expect(container.querySelector('.saved-text')!.getAttribute('lang')).toBe('en');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: `${answer} 삭제` }));
    expect(screen.getByText(/저장한 단어가 없어요/)).toBeTruthy();

    // 홈으로 돌아가면 제목에 포커스가 간다.
    await goBack();
    const home = await screen.findByRole('heading', { level: 1, name: '하루 영어 한 입' });
    await waitFor(() => expect(document.activeElement).toBe(home));
  });

  it('닉네임을 검증해서 저장하고 레벨 카드에 보여 준다', async () => {
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });

    await user.click(screen.getByRole('button', { name: '설정' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: '설정' }));
    // 설정 메뉴: 항목마다 지금 값을 함께 보여 준다. 발송 코드가 없는 빌드에서는 학습 알림 설정이 없다.
    expect(screen.getByRole('button', { name: /프로필 설정\s*닉네임 없음 · Lv\.1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /맞춤 문제 설정\s*경력 개발\(개발 업무\) · 기초부터 · 하루 5문제/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /화면 설정\s*기본/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /학습 알림 설정/ })).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: /프로필 설정/ }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: '프로필 설정' }));
    const input = screen.getByLabelText('닉네임');
    const saveButton = screen.getByRole('button', { name: '저장' });

    // 바꾼 것이 없으면 저장 버튼은 비활성이고, 눌러도 아무 일이 없다.
    expect(saveButton.getAttribute('aria-disabled')).toBe('true');
    await user.click(saveButton);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('.nickname-form [role=status]')!.textContent).toBe('');

    await user.type(input, 'a');
    expect(saveButton.getAttribute('aria-disabled')).toBe('false');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('2~10자');
    await expectNoA11yViolations(container);

    await user.clear(input);
    await user.type(input, '영어 고수');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(container.querySelector('.nickname-form [role=status]')!.textContent).toBe('닉네임을 저장했어요.');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).nickname).toBe('영어 고수');
    // 저장하면 다시 비활성, 공백만 더해도 바뀐 게 아니다.
    expect(saveButton.getAttribute('aria-disabled')).toBe('true');
    await user.type(input, ' ');
    expect(saveButton.getAttribute('aria-disabled')).toBe('true');
    expect(container.querySelector('.nickname-form [role=status]')!.textContent).toBe('');
    await user.type(input, '님');
    expect(saveButton.getAttribute('aria-disabled')).toBe('false');
    await user.clear(input);
    await user.type(input, '영어 고수');

    // 설정으로 돌아오면 메뉴에 새 닉네임이 보이고, 홈에도 보인다.
    await goBack();
    const menuHeading = await screen.findByRole('heading', { level: 1, name: '설정' });
    await waitFor(() => expect(document.activeElement).toBe(menuHeading));
    expect(screen.getByRole('button', { name: /프로필 설정\s*영어 고수/ })).toBeTruthy();
    await goBack();
    expect(await screen.findByText('영어 고수님')).toBeTruthy();
  });

  it('완료 후 오늘 문제를 복습하고 거기서도 저장할 수 있다', async () => {
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });

    // 1번만 틀리고 나머지는 맞힌다.
    const first = currentQuestion(0);
    const wrong = (first.answer + 1) % 4;
    for (let i = 0; i < 5; i++) {
      const q = currentQuestion(i);
      await user.click(choiceButtons()[i === 0 ? wrong : q.answer]);
      await user.click(screen.getByRole('button', { name: i < 4 ? '다음 문제' : '결과 보기' }));
    }

    await user.click(await screen.findByRole('button', { name: '오늘 문제 다시 보기' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: '오늘의 문제 복습' }));
    expect(container.textContent).toContain('5문제 중 4문제를 맞혔어요.');

    const items = container.querySelectorAll('.review-list > li');
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain('틀림');
    expect(items[0].textContent).toContain(`내 답${first.choices[wrong]}`);
    expect(items[0].textContent).toContain(first.prompt.replace('___', first.choices[first.answer]));
    expect(items[1].textContent).toContain('맞힘');
    expect(items[1].textContent).not.toContain('내 답');
    expect(items[0].querySelector('.saved-text')!.getAttribute('lang')).toBe('en');

    const save = items[0].querySelector('button[aria-pressed]') as HTMLButtonElement;
    await user.click(save);
    expect(save.getAttribute('aria-pressed')).toBe('true');
    await expectNoA11yViolations(container);

    await goBack();
    expect(await screen.findByRole('button', { name: '다시 볼 항목 1개' })).toBeTruthy();
  });

  it('토스 앱 밖(테스트 환경)에서는 배너 광고 영역이 공간을 차지하지 않고 숨겨진다', async () => {
    const { container } = render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });
    const ad = container.querySelector('.ad')!;
    expect(ad.getAttribute('aria-hidden')).toBe('true');
    expect(ad.classList.contains('ad-shown')).toBe(false);
  });
});

describe('화면 모드', () => {
  it('첫 화면에는 없고 설정 > 화면 설정에 있다', async () => {
    render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });
    expect(screen.queryByRole('group', { name: '화면' })).toBeNull();
  });

  it('기본으로 시작하고, 고르면 바로 바뀌고 저장된다', async () => {
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await openSettings(user, /화면 설정/);
    const group = await screen.findByRole('group', { name: '화면' });
    expect(group.tagName).toBe('FIELDSET');

    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual(['default', 'contrast', 'dark']);
    expect(screen.getByRole('radio', { name: '기본' })).toHaveProperty('checked', true);
    expect(document.documentElement.dataset.theme).toBe('default');

    await user.click(screen.getByRole('radio', { name: '어둡게' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    await user.click(screen.getByRole('radio', { name: '고대비' }));
    expect(document.documentElement.dataset.theme).toBe('contrast');
    expect(screen.getByRole('radio', { name: '고대비' }).getAttribute('aria-describedby')).toBe('theme-contrast-desc');
    await expectNoA11yViolations(container);
  });

  it('저장된 모드로 다시 연다', async () => {
    localStorage.setItem(THEME_KEY, 'dark');
    render(<DailyChallenge />);
    await openSettings(userEvent.setup(), /화면 설정/);
    await screen.findByRole('group', { name: '화면' });
    expect(screen.getByRole('radio', { name: '어둡게' })).toHaveProperty('checked', true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('기기 다크 모드는 따르지 않고, 대비 높이기 설정만 따른다', async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') || query.includes('prefers-contrast: more'),
      media: query,
    })) as unknown as typeof window.matchMedia;
    render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('contrast'));
  });
});

describe('DailyChallenge 접근성', () => {
  it('첫 화면: 제목 구조, 진행 바, 영어 문장 언어, 빈칸 읽기', async () => {
    const { container } = render(
      <main>
        <DailyChallenge />
      </main>,
    );
    await screen.findByRole('heading', { level: 2, name: /5문제 중 1번째 문제/ });

    expect(screen.getByRole('heading', { level: 1, name: '하루 영어 한 입' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '내 레벨' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '다음 레벨까지 진행도' }).getAttribute('aria-valuenow')).toBe('0');

    const prompt = container.querySelector('.prompt')!;
    expect(prompt.getAttribute('lang')).toBe('en');
    expect(prompt.querySelector('.blank')!.getAttribute('aria-hidden')).toBe('true');
    expect(prompt.textContent).toContain('blank');

    const choiceGroup = choiceButtons()[0].closest('[role="group"]')!;
    expect(choiceGroup.getAttribute('aria-labelledby')).toBe(prompt.id);
    for (const button of choiceButtons()) {
      expect(button.querySelector('[lang="en"]')).toBeTruthy();
    }
    await expectNoA11yViolations(container);
  });

  it('답을 고르면 결과를 글자로 알리고 포커스를 결과로 옮긴다', async () => {
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });

    const q = currentQuestion(0);
    const wrong = (q.answer + 1) % 4;
    await user.click(choiceButtons()[wrong]);

    const feedback = container.querySelector('.explain') as HTMLElement;
    expect(document.activeElement).toBe(feedback);
    expect(feedback.textContent).toContain('오답이에요');
    expect(feedback.textContent).toContain(q.choices[q.answer]);

    const buttons = choiceButtons();
    expect(buttons[q.answer].textContent).toContain('정답');
    expect(buttons[wrong].textContent).toContain('내 선택');
    for (const button of buttons) {
      expect(button.getAttribute('aria-disabled')).toBe('true');
    }

    // 이미 답한 문제는 다시 눌러도 바뀌지 않는다.
    await user.click(buttons[q.answer]);
    expect(buttons[wrong].textContent).toContain('내 선택');
    await expectNoA11yViolations(container);
  });

  it('다음 문제로 가면 문제 제목에, 다 풀면 결과 제목에 포커스가 간다', async () => {
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });

    for (let i = 0; i < 5; i++) {
      await user.click(choiceButtons()[currentQuestion(i).answer]);
      expect(container.querySelector('.explain')!.textContent).toContain('정답이에요');
      if (i < 4) {
        await user.click(screen.getByRole('button', { name: '다음 문제' }));
        expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: new RegExp(`${i + 2}번째 문제`) }));
      }
    }
    await user.click(screen.getByRole('button', { name: '결과 보기' }));

    const heading = await screen.findByRole('heading', { level: 2, name: '오늘 학습을 마쳤어요' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(container.textContent).toContain('5문제 중 5문제');
    // 결과의 의미: 55 XP → Lv.1(다음 레벨 60), 레벨업은 아직 아님
    expect(container.textContent).toContain('다음 레벨까지 5 XP 남았어요.');
    expect(container.textContent).toContain('XP는 정답 1개에 10');
    expect(container.querySelector('.level-up')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('키보드만으로 답을 고를 수 있다', async () => {
    const user = userEvent.setup();
    render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });

    // 첫 화면에서 Tab 한 번이면 바로 첫 선택지다 (할 일이 가장 먼저 보이게).
    await user.tab();
    expect(document.activeElement).toBe(choiceButtons()[0]);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: /다음 문제/ })).toBeTruthy();
  });
});

describe('맞춤 문제', () => {
  it('처음 들어오면 질문을 하나씩 묻고, 고르면 바로 다음 질문으로 넘어간다', async () => {
    localStorage.removeItem(STORAGE_KEY);
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /영어를 배우는 이유가 무엇인가요/ });
    // 고르기 전에는 오늘의 문제를 고정하지 않는다.
    expect(screen.queryByRole('heading', { level: 2, name: /1번째 문제/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /이전/ })).toBeNull();
    await expectNoA11yViolations(container);

    // 경력 개발이면 쓰는 곳을 한 번 더 묻는다(질문 4개).
    await user.click(screen.getByRole('button', { name: /^경력 개발/ }));
    const focus = screen.getByRole('heading', { level: 2, name: /4개 중 2번째 질문,\s*영어를 어디에 쓰실 건가요/ });
    expect(document.activeElement).toBe(focus);

    // 이전으로 돌아가면 고른 보기가 표시돼 있다.
    await user.click(screen.getByRole('button', { name: '이전 질문으로' }));
    expect(screen.getByRole('button', { name: /^경력 개발/ }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: /^경력 개발/ }));
    await user.click(screen.getByRole('button', { name: /^토익 점수/ }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: /영어 실력은 어느 정도이신가요/ }));
    await user.click(screen.getByRole('button', { name: /^어느 정도/ }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: /하루에 몇 문제씩 풀까요/ }));
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: /^10문제/ }));

    const heading = await screen.findByRole('heading', { level: 2, name: /10문제 중 1번째 문제/ });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText('하루 10문제로 영어 한 입')).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.profile).toEqual({ reason: 'career', careerFocus: 'toeic', selfLevel: 2, dailyGoal: 10 });
    expect(stored.attempt.ids).toHaveLength(10);
    const categories = stored.attempt.ids.map((id: number) => QUESTIONS.find((q) => q.id === id)!.category);
    expect(categories.every((c: string) => c === 'toeic' || c === 'office')).toBe(true);
  });

  it('경력 개발이 아니면 질문이 3개다', async () => {
    localStorage.removeItem(STORAGE_KEY);
    const user = userEvent.setup();
    render(<DailyChallenge />);
    await user.click(await screen.findByRole('button', { name: /^학업/ }));
    expect(screen.getByRole('heading', { level: 2, name: /3개 중 2번째 질문,\s*영어 실력은/ })).toBeTruthy();
  });

  it('설정에서 바꾸면 아직 안 푼 오늘 문제가 바뀐다', async () => {
    const user = userEvent.setup();
    render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });
    await openSettings(user, /맞춤 문제 설정/);

    // 지금 설정이 표시돼 있다.
    expect(screen.getByRole('button', { name: /^경력 개발/ }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: /^여행/ }));
    expect(screen.getByRole('button', { name: /^기초부터/ }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: /^기초부터/ }));
    await user.click(screen.getByRole('button', { name: /^15문제/ }));
    expect(screen.getByText('저장했어요. 여행 · 기초부터 · 하루 15문제')).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.profile.reason).toBe('travel');
    expect(stored.attempt.ids).toHaveLength(15);
    const categories = stored.attempt.ids.map((id: number) => QUESTIONS.find((q) => q.id === id)!.category);
    expect(new Set(categories)).toEqual(new Set(['daily']));
  });
});

describe('틀린 문제', () => {
  it('틀린 문제가 모이고, 다시 풀어 맞히면 확인 후 빠진다', async () => {
    const user = userEvent.setup();
    const { container } = render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });
    expect(screen.getByRole('button', { name: '틀린 문제 0개' })).toBeTruthy();

    const q = currentQuestion(0);
    const wrongPick = (q.answer + 1) % 4;
    await user.click(choiceButtons()[wrongPick]);
    expect(screen.getByRole('button', { name: '틀린 문제 1개' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '틀린 문제 1개' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: '틀린 문제' }));
    expect(container.textContent).toContain(`그때 고른 답 ${q.choices[wrongPick]}`);
    await expectNoA11yViolations(container);

    await user.click(choiceButtons()[q.answer]);
    expect(screen.getByText('이번에는 맞혔어요. 목록에서 빠져요.')).toBeTruthy();
    // 해설을 읽는 동안에는 카드가 남아 있다.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).wrong).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.getByText(/틀린 문제가 없어요/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).wrong).toEqual([]);
  });

  it('맞혔지만 확인을 누르지 않고 나가도 목록에서 빠진다', async () => {
    const user = userEvent.setup();
    render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });
    const q = currentQuestion(0);
    await user.click(choiceButtons()[(q.answer + 1) % 4]);
    await user.click(screen.getByRole('button', { name: '틀린 문제 1개' }));
    await user.click(choiceButtons()[q.answer]);
    await goBack();
    expect(await screen.findByRole('button', { name: '틀린 문제 0개' })).toBeTruthy();
  });
});

describe('업데이트 전 기록', () => {
  /** 이전 버전(틀린 문제 기능 전)에서 오늘 5문제를 3/5로 마친 기록 */
  function seedFinishedDay() {
    const ids = QUESTIONS.filter((q) => q.category === 'dev').slice(0, 5).map((q) => q.id);
    const picks = ids.map((id, i) => {
      const q = QUESTIONS.find((x) => x.id === id)!;
      return i < 3 ? q.answer : (q.answer + 1) % 4;
    });
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        xp: 35,
        streak: 1,
        lastDate: key,
        today: { date: key, correct: 3, total: 5, xpGained: 35 },
        attempt: { date: key, ids, picks },
        seen: ids,
      }),
    );
    return ids;
  }

  it('처음 열 때 이전에 틀린 오늘 문제를 틀린 문제로 옮기고, 다시 열어도 또 옮기지 않는다', async () => {
    const ids = seedFinishedDay();
    const first = render(<DailyChallenge />);
    expect(await screen.findByRole('button', { name: '틀린 문제 2개' })).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.wrong.map((w: { questionId: number }) => w.questionId).sort()).toEqual(ids.slice(3).sort());
    first.unmount();

    // 목록을 비운 뒤 다시 열어도 채우지 않는다.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, wrong: [] }));
    render(<DailyChallenge />);
    expect(await screen.findByRole('button', { name: '틀린 문제 0개' })).toBeTruthy();
  });
});

describe('출시 가이드: 뒤로가기', () => {
  it('어느 화면에도 자체 뒤로가기 버튼이 없다 (토스 내비게이션 바의 뒤로가기와 함께 보이면 안 된다)', async () => {
    const user = userEvent.setup();
    render(<DailyChallenge />);
    await screen.findByRole('heading', { level: 2, name: /1번째 문제/ });
    const noBack = () => expect(screen.queryByRole('button', { name: /홈으로|설정으로|뒤로/ })).toBeNull();
    noBack();
    for (const menu of ['설정', /^틀린 문제/, /^다시 볼 항목/]) {
      await user.click(screen.getByRole('button', { name: menu }));
      noBack();
      if (menu === '설정') {
        await user.click(screen.getByRole('button', { name: /프로필 설정/ }));
        noBack();
        await goBack();
      }
      await goBack();
      await screen.findByRole('heading', { level: 1, name: '하루 영어 한 입' });
    }
  });
});
