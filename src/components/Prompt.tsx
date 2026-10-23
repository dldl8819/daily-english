'use client';

/**
 * 빈칸(___)을 화면에는 밑줄로, 스크린리더에는 "blank"로 읽히게 나눈다.
 * 문장은 lang="en" 안에 있어서 영어 음성으로 읽힌다.
 */
export default function Prompt({ text }: { text: string }) {
  const [before, after] = text.split('___');
  return (
    <>
      {before}
      <span className="blank" aria-hidden="true">
        ___
      </span>
      <span className="sr-only">blank</span>
      {after}
    </>
  );
}
