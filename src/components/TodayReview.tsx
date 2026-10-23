'use client';

import { useEffect, useRef } from 'react';
import type { Question, SavedKind } from '@/lib/types';
import { filledSentence } from '@/lib/saved';
import { countCorrect } from '@/lib/daily';

/** 복습 묶음 하나: 오늘의 5문제 또는 보너스 5문제 */
export type ReviewGroup = {
  id: string;
  title: string;
  questions: Question[];
  picks: number[];
};

type Props = {
  groups: ReviewGroup[];
  isSaved: (questionId: number, kind: SavedKind) => boolean;
  onToggleSave: (questionId: number, kind: SavedKind) => void;
};

/** 오늘 푼 문제 복습(보너스 포함): 정답을 채운 문장, 내 답, 정답, 해설. XP와는 무관하다. 답한 문제만 보여 준다. */
export default function TodayReview({ groups, isSaved, onToggleSave }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const answered = groups.map((g) => ({ ...g, questions: g.questions.slice(0, g.picks.length) })).filter((g) => g.questions.length > 0);
  const total = answered.reduce((n, g) => n + g.questions.length, 0);
  const correct = answered.reduce((n, g) => n + countCorrect(g.questions, g.picks), 0);

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>
        오늘의 문제 복습
      </h1>
      <p className="sub">
        {total}문제 중 {correct}문제를 맞혔어요.
      </p>
      {answered.map((group) => (
        <section key={group.id} aria-labelledby={`group-${group.id}`}>
          <h2 id={`group-${group.id}`} className="section-title review-group">
            {group.title}
          </h2>
          <ol className="review-list">
            {group.questions.map((question, i) => {
              const picked = group.picks[i];
              const right = picked === question.answer;
              const answer = question.choices[question.answer];
              return (
                <li key={question.id} className="card" aria-labelledby={`review-${question.id}`}>
                  <h3 id={`review-${question.id}`} className={`review-head ${right ? 'ok-text' : 'bad-text'}`}>
                    {i + 1}번 <span aria-hidden="true">{right ? '✓ ' : '✗ '}</span>
                    {right ? '맞힘' : '틀림'}
                  </h3>
                  <p className="saved-text" lang="en">
                    {filledSentence(question)}
                  </p>
                  <dl className="review-answers">
                    {!right && picked !== undefined && (
                      <div>
                        <dt>내 답</dt>
                        <dd lang="en">{question.choices[picked]}</dd>
                      </div>
                    )}
                    <div>
                      <dt>정답</dt>
                      <dd lang="en">{answer}</dd>
                    </div>
                  </dl>
                  <p className="saved-explain">{question.explanation}</p>
                  <div className="save-row" role="group" aria-label={`${group.title} ${i + 1}번 다시 볼 항목에 저장`}>
                    {(['sentence', 'word'] as const).map((kind) => {
                      const on = isSaved(question.id, kind);
                      return (
                        <button
                          key={kind}
                          type="button"
                          className="small-btn"
                          aria-pressed={on}
                          onClick={() => onToggleSave(question.id, kind)}
                        >
                          {on && <span aria-hidden="true">✓ </span>}
                          {kind === 'sentence' ? '문장 저장' : '단어 저장'}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </>
  );
}
