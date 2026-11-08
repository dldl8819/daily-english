/**
 * 정답을 채운 문장의 한국어 해석. 해석이 없는 문항은 그리지 않는다.
 * 정답을 알려 주므로 답한 뒤에만 쓰고, 영어 문장 바로 아래에 둔다.
 * 문제 화면은 답하면 포커스가 해설로 가므로, 해설이 aria-describedby로 이 id를 가리켜 해석도 함께 읽히게 한다.
 */
export default function Translation({ text, id }: { text?: string; id?: string }) {
  if (!text) return null;
  return (
    <p className="translation" id={id}>
      <span className="translation-label">문장 해석</span>
      {text}
    </p>
  );
}
