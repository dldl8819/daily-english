// 보기 설명(Question.choiceNotes) 규칙. 문제 은행 테스트(questions.test.ts)와 보기 설명 합치기 스크립트(scripts/questions-notes.mjs)가 같이 쓴다.
// - 보기마다 하나, choices와 같은 순서
// - 단어·표현은 문장 속 뜻, 형태를 고르는 문제는 형태(동명사, to부정사, 과거형 등)를 한국어로 짧게
// - 답한 뒤에만 보여 준다(오답을 지우는 단서가 된다)

/** 한 설명의 최대 글자 수. 보기 버튼 안에 한두 줄로 들어가는 길이다. */
export const CHOICE_NOTE_MAX = 24;

/** 규칙에 어긋나는 점. 비어 있으면 통과다. 설명이 없는 문항은 통과다(아직 채우는 중). */
export function choiceNoteProblems(question: { choices: string[]; choiceNotes?: unknown }): string[] {
  const notes = question.choiceNotes;
  if (notes === undefined) return [];
  if (!Array.isArray(notes) || notes.length !== question.choices.length) return [`보기 설명은 보기와 같은 ${question.choices.length}개여야 해요`];
  const problems: string[] = [];
  notes.forEach((note: unknown, i) => {
    const label = `${i + 1}번 보기 설명`;
    if (typeof note !== 'string' || note.trim() === '') {
      problems.push(`${label}이 비었어요`);
      return;
    }
    if (note !== note.trim() || /\s{2,}/.test(note)) problems.push(`${label}에 앞뒤·연속 공백: "${note}"`);
    if (note.length > CHOICE_NOTE_MAX) problems.push(`${label}이 ${note.length}자예요(최대 ${CHOICE_NOTE_MAX}자): ${note}`);
    if (!/[가-힣]/.test(note)) problems.push(`${label}에 한글이 없어요: ${note}`);
    if (note.toLowerCase() === question.choices[i].toLowerCase()) problems.push(`${label}이 보기와 같아요: ${note}`);
    if (note.includes('___')) problems.push(`${label}에 빈칸(___)이 있어요`);
  });
  // 비슷한 말이라도 차이를 알려 주는 게 목적이라, 같은 설명이 두 번 나오면 고친다.
  if (problems.length === 0 && new Set(notes).size !== notes.length) problems.push(`보기 설명이 겹쳐요: ${notes.join(' / ')}`);
  return problems;
}
