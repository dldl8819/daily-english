/**
 * 보기 글자. note가 있으면 그 보기의 짧은 설명(단어는 뜻, 형태 문제는 형태)을 아래에 붙인다.
 * 설명은 오답을 지우는 단서가 되므로, 부르는 쪽이 답한 뒤에만 note를 넘긴다.
 */
export default function ChoiceText({ text, note }: { text: string; note?: string }) {
  return (
    <span className="choice-text">
      <span lang="en">{text}</span>
      {note && <span className="choice-note">{note}</span>}
    </span>
  );
}
