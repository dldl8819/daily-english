'use client';

import { useEffect, useRef } from 'react';
import type { Progress, Question, SavedKind } from '@/lib/types';
import { filledSentence, savedEntries } from '@/lib/saved';

const SECTIONS: { kind: SavedKind; title: string; empty: string }[] = [
  { kind: 'sentence', title: '문장', empty: '저장한 문장이 없어요. 문제를 풀고 "문장 저장"을 눌러 보세요.' },
  { kind: 'word', title: '단어·표현', empty: '저장한 단어가 없어요. 문제를 풀고 "단어 저장"을 눌러 보세요.' },
];

type Props = {
  progress: Progress;
  questions: Question[];
  onRemove: (questionId: number, kind: SavedKind) => void;
};

/** 다시 볼 문장·단어 목록 */
export default function SavedView({ progress, questions, onRemove }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>
        다시 볼 항목
      </h1>
      {SECTIONS.map((section) => {
        const entries = savedEntries(progress, questions, section.kind);
        return (
          <section key={section.kind} className="card" aria-labelledby={`saved-${section.kind}`}>
            <h2 id={`saved-${section.kind}`} className="section-title">
              {section.title} <span className="sub">{entries.length}개</span>
            </h2>
            {entries.length === 0 ? (
              <p className="sub">{section.empty}</p>
            ) : (
              <ul className="saved-list">
                {entries.map(({ question }) => {
                  const text = section.kind === 'sentence' ? filledSentence(question) : question.choices[question.answer];
                  return (
                    <li key={question.id}>
                      <p className="saved-text" lang="en">
                        {text}
                      </p>
                      {section.kind === 'word' && (
                        <p className="sub" lang="en">
                          {filledSentence(question)}
                        </p>
                      )}
                      <p className="saved-explain">{question.explanation}</p>
                      <button
                        type="button"
                        className="small-btn"
                        onClick={() => onRemove(question.id, section.kind)}
                        aria-label={`${text} 삭제`}
                      >
                        삭제
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
