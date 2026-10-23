'use client';

import { useEffect, useRef, useState } from 'react';
import type { Question } from '@/lib/types';
import { CATEGORY_LABEL } from '@/lib/study';
import type { WrongEntry } from '@/lib/wrong';
import Prompt from './Prompt';

type Props = {
  entries: WrongEntry[];
  /** 다시 풀어 본 결과 (기록용) */
  onRetry: (question: Question, pick: number) => void;
  /** 목록에서 뺄 문제. 맞힌 문제는 '확인'을 누르거나 화면을 나갈 때 뺀다. */
  onRemove: (questionIds: number[]) => void;
};

/** 다시 풀어 볼 한 문제. 답을 고르면 결과와 해설을 보여 준다. */
type ItemProps = {
  entry: WrongEntry;
  onRetry: Props['onRetry'];
  onCorrect: (questionId: number) => void;
  onConfirm: (questionId: number) => void;
};

function WrongItemCard({ entry, onRetry, onCorrect, onConfirm }: ItemProps) {
  const { question } = entry;
  const [picked, setPicked] = useState<number | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const answered = picked !== null;
  const right = picked === question.answer;
  const headingId = `wrong-${question.id}`;

  useEffect(() => {
    if (answered) feedbackRef.current?.focus();
  }, [answered]);

  return (
    <li className="card" aria-labelledby={headingId}>
      <h2 id={headingId} className="review-head">
        {CATEGORY_LABEL[question.category]}{' '}
        <span className="sub">
          {entry.date} · 그때 고른 답 <span lang="en">{question.choices[entry.pick]}</span>
        </span>
      </h2>
      <p className="prompt" lang="en" id={`${headingId}-prompt`}>
        <Prompt text={question.prompt} />
      </p>
      <div role="group" aria-labelledby={`${headingId}-prompt`}>
        {question.choices.map((text, i) => {
          const state = !answered ? '' : i === question.answer ? 'ok' : i === picked ? 'bad' : '';
          return (
            <button
              key={i}
              type="button"
              className={`choice ${state}`}
              aria-disabled={answered}
              onClick={() => {
                if (answered) return;
                setPicked(i);
                onRetry(question, i);
                if (i === question.answer) onCorrect(question.id);
              }}
            >
              <span lang="en">{text}</span>
              {answered && i === question.answer && (
                <span className="mark">
                  <span aria-hidden="true">✓ </span>정답
                </span>
              )}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="explain" ref={feedbackRef} tabIndex={-1}>
          <p className="verdict">
            {right ? (
              '이번에는 맞혔어요. 목록에서 빠져요.'
            ) : (
              <>
                다시 틀렸어요. 정답은 <span lang="en">{question.choices[question.answer]}</span>예요.
              </>
            )}
          </p>
          <p>{question.explanation}</p>
          {right && (
            <button type="button" className="btn" onClick={() => onConfirm(question.id)}>
              확인
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** 틀린 문제 모아 보기. 다시 풀어서 맞히면 목록에서 빠진다. XP와는 무관하다. */
export default function WrongView({ entries, onRetry, onRemove }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  // 맞힌 문제를 바로 빼면 해설을 읽는 중에 카드가 사라진다. 확인을 누르거나 화면을 나갈 때 뺀다.
  const corrected = useRef(new Set<number>());
  const removeRef = useRef(onRemove);
  removeRef.current = onRemove;
  useEffect(
    () => () => {
      if (corrected.current.size > 0) removeRef.current([...corrected.current]);
    },
    [],
  );

  function confirm(questionId: number) {
    corrected.current.delete(questionId);
    removeRef.current([questionId]);
  }

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>
        틀린 문제
      </h1>
      {entries.length === 0 ? (
        <p className="card sub">틀린 문제가 없어요. 문제를 틀리면 여기에 모여요.</p>
      ) : (
        <>
          <p className="sub">
            {entries.length}문제를 다시 풀어 볼 수 있어요. 맞히면 목록에서 빠지고, XP는 없어요.
          </p>
          <ol className="review-list">
            {entries.map((entry) => (
              <WrongItemCard
                key={entry.questionId}
                entry={entry}
                onRetry={onRetry}
                onCorrect={(id) => corrected.current.add(id)}
                onConfirm={confirm}
              />
            ))}
          </ol>
        </>
      )}
    </>
  );
}
