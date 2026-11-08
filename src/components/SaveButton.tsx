/**
 * 다시 볼 항목에 저장하는 버튼(문제마다 하나). 저장 상태는 aria-pressed로 알린다.
 * 화면에는 "저장"만 보이고, 스크린리더 이름(label)은 무엇을 저장하는지까지 말한다. 보이는 글자가 이름에 들어 있어야 한다(WCAG 2.5.3).
 */
export default function SaveButton({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" className="small-btn" aria-pressed={on} aria-label={label} onClick={onToggle}>
      {on && <span aria-hidden="true">✓ </span>}
      저장
    </button>
  );
}
