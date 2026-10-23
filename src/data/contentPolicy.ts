// 문제 내용 기준 (앱인토스 비게임 출시 가이드 "비속어·은어·과도한 유행어 금지, 위법·선정적 콘텐츠 금지",
// 서비스 오픈 정책의 제한 콘텐츠: 불법·범죄, 약물·도박, 폭력·자해, 선정성, 혐오·차별).
// 문제 문장·보기·해설 어디에도 아래 표현을 쓰지 않는다. 오답 보기와 관용 표현도 마찬가지다.
// 문제를 새로 쓸 때마다 이 검사를 통과해야 한다(src/data/questions.test.ts, 문제 추가 스크립트).

/** 영어: 단어 경계로 찾는다(deadline·better·hello 같은 단어는 걸리지 않는다). */
export const BANNED_EN = [
  // 폭력·무기·죽음
  'kill', 'kills', 'killed', 'killing', 'murder', 'shoot', 'shot', 'gun', 'guns', 'weapon', 'weapons', 'bomb', 'bullet',
  'blood', 'bloody', 'war', 'fight', 'fighting', 'violence', 'violent', 'attack', 'die', 'died', 'dies', 'dying', 'dead', 'death',
  'suicide',
  // 범죄
  'steal', 'stole', 'stolen', 'rob', 'robbed', 'thief', 'crime', 'criminal',
  // 약물·술·담배·도박
  'drug', 'drugs', 'drunk', 'beer', 'wine', 'alcohol', 'cigarette', 'cigarettes', 'smoke', 'smoking', 'bet', 'betting',
  'gamble', 'gambling', 'casino',
  // 선정성
  'sex', 'sexy', 'sexual', 'naked', 'nude',
  // 비속어·모욕·비하
  'stupid', 'idiot', 'nitwit', 'nitwits', 'dumb', 'loser', 'ugly', 'fat', 'crazy', 'insane', 'damn', 'hell', 'crap', 'suck',
  'sucks',
  // 종교·국적 등을 끌어오는 관용 표현
  'devil', 'god', 'dutch',
];

/** 한국어 해설: 그대로 포함되면 걸린다. */
export const BANNED_KO = ['죽이', '죽는', '죽었', '죽음', '살인', '음주', '술을', '담배', '도박', '마약', '섹스', '바보', '멍청', '병신', '미친'];

const EN = new RegExp(`\\b(${BANNED_EN.join('|')})\\b`, 'i');

/** 걸린 표현 목록. 비어 있으면 통과다. */
export function contentViolations(question: { prompt: string; choices: string[]; explanation: string }): string[] {
  const text = [question.prompt, ...question.choices].join(' | ');
  const hits: string[] = [];
  const en = text.match(EN);
  if (en) hits.push(en[0]);
  for (const word of BANNED_KO) if (question.explanation.includes(word)) hits.push(word);
  return hits;
}
