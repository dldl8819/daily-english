'use client';

import { useEffect, useRef } from 'react';
import type { Progress, Question } from '@/lib/types';
import { filledSentence, savedEntries } from '@/lib/saved';
import Translation from './Translation';

type Props = {
  progress: Progress;
  questions: Question[];
  onRemove: (questionId: number) => void;
};

/** 정답을 채운 문장. 정답 단어·표현은 굵게 보여 준다. */
function FilledSentence({ question }: { question: Question }) {
  const [before, after] = question.prompt.split('___');
  return (
    <>
      {before}
      <strong>{question.choices[question.answer]}</strong>
      {after}
    </>
  );
}

/** 다시 볼 항목 목록. 저장한 문제를 정답을 채운 문장, 문장 해석, 해설로 보여 준다. */
export default function SavedView({ progress, questions, onRemove }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const entries = savedEntries(progress, questions);

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>
        다시 볼 항목
      </h1>
      <section className="card" aria-labelledby="saved-title">
        <h2 id="saved-title" className="section-title">
          저장한 문제 <span className="sub">{entries.length}개</span>
        </h2>
        {entries.length === 0 ? (
          <p className="sub">저장한 문제가 없어요. 문제를 풀고 &quot;저장&quot;을 눌러 보세요.</p>
        ) : (
          <ul className="saved-list">
            {entries.map(({ question }) => {
              const sentence = filledSentence(question);
              return (
                <li key={question.id}>
                  <p className="saved-text" lang="en">
                    <FilledSentence question={question} />
                  </p>
                  <Translation text={question.translation} />
                  <p className="saved-explain">{question.explanation}</p>
                  <button
                    type="button"
                    className="small-btn"
                    onClick={() => onRemove(question.id)}
                    aria-label={`${sentence} 삭제`}
                  >
                    삭제
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
