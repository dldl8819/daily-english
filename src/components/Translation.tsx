/**
 * 정답을 채운 문장의 한국어 해석. 해석이 없는 문항은 그리지 않는다.
 * 정답을 알려 주므로 답한 뒤의 해설 자리에서만 쓴다.
 */
export default function Translation({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="translation">
      <span className="translation-label">문장 해석</span>
      {text}
    </p>
  );
}
