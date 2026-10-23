'use client';

import { useEffect, useRef, useState } from 'react';
import type { CareerFocus, DailyGoal, Reason, SelfLevel, StudyProfile } from '@/lib/types';
import { CAREER_FOCUSES, DAILY_GOALS, REASONS, SELF_LEVELS } from '@/lib/study';

type Step = 'reason' | 'focus' | 'level' | 'goal';

type Draft = {
  reason: Reason | null;
  careerFocus: CareerFocus | null;
  selfLevel: SelfLevel | null;
  dailyGoal: DailyGoal | null;
};

type Props = {
  /** 이미 고른 설정. 고른 보기를 표시해 둔다. */
  initial: StudyProfile | null;
  onComplete: (profile: StudyProfile) => void;
};

const QUESTION: Record<Step, string> = {
  reason: '영어를 배우는 이유가 무엇인가요?',
  focus: '영어를 어디에 쓰실 건가요?',
  level: '영어 실력은 어느 정도이신가요?',
  goal: '하루에 몇 문제씩 풀까요?',
};

/**
 * 맞춤 문제 설정: 한 화면에 질문 하나, 보기를 누르면 바로 다음 질문으로 넘어간다.
 * 보기는 라디오가 아니라 버튼이다. 라디오는 화살표 키로 고르기만 해도 넘어가 버려 키보드·스크린리더 사용자가 원치 않게 넘어갈 수 있다.
 */
export default function StudyWizard({ initial, onComplete }: Props) {
  const [draft, setDraft] = useState<Draft>({
    reason: initial?.reason ?? null,
    careerFocus: initial?.careerFocus ?? null,
    selfLevel: initial?.selfLevel ?? null,
    dailyGoal: initial?.dailyGoal ?? null,
  });
  const [index, setIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const steps: Step[] = ['reason', ...(draft.reason === 'career' ? (['focus'] as const) : []), 'level', 'goal'];
  const step = steps[index];

  // 다음·이전 질문으로 가면 질문 제목으로 포커스를 옮긴다. 처음 그릴 때는 옮기지 않는다.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [index]);

  function choose(next: Draft) {
    setDraft(next);
    if (step === 'goal') {
      onComplete({
        reason: next.reason!,
        careerFocus: next.reason === 'career' ? next.careerFocus : null,
        selfLevel: next.selfLevel!,
        dailyGoal: next.dailyGoal!,
      });
      return;
    }
    moved.current = true;
    setIndex(index + 1);
  }

  const options =
    step === 'reason'
      ? REASONS.map((o) => ({ ...o, pressed: draft.reason === o.value, pick: () => choose({ ...draft, reason: o.value }) }))
      : step === 'focus'
        ? CAREER_FOCUSES.map((o) => ({ ...o, pressed: draft.careerFocus === o.value, pick: () => choose({ ...draft, careerFocus: o.value }) }))
        : step === 'level'
          ? SELF_LEVELS.map((o) => ({ ...o, pressed: draft.selfLevel === o.value, pick: () => choose({ ...draft, selfLevel: o.value }) }))
          : DAILY_GOALS.map((o) => ({ ...o, pressed: draft.dailyGoal === o.value, pick: () => choose({ ...draft, dailyGoal: o.value }) }));

  return (
    <div className="wizard">
      <p className="sub wizard-step" aria-hidden="true">
        {index + 1} / {steps.length}
      </p>
      <h2 className="section-title" tabIndex={-1} ref={headingRef}>
        <span className="sr-only">
          {steps.length}개 중 {index + 1}번째 질문,{' '}
        </span>
        {QUESTION[step]}
      </h2>
      <ul className="option-buttons">
        {options.map((option) => (
          <li key={String(option.value)}>
            <button type="button" className="option-btn" aria-pressed={option.pressed} onClick={option.pick}>
              <strong>{option.label}</strong>
              <span className="sub">{option.description}</span>
            </button>
          </li>
        ))}
      </ul>
      {/* 질문 사이 이동이라 화면 뒤로가기(토스 내비게이션 바)와 헷갈리지 않게 아래에 둔다. */}
      {index > 0 && (
        <button
          type="button"
          className="small-btn wizard-prev"
          onClick={() => {
            moved.current = true;
            setIndex(index - 1);
          }}
        >
          이전 질문으로
        </button>
      )}
    </div>
  );
}
