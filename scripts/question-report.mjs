// 문제 은행 확장 진행 보고 (docs/20_문제_은행_확장.md).
// - 분류·난이도별 문항 수와 목표
// - 맞춤 설정마다 하루 20문제씩 새 문제로 버틸 수 있는 날수 (목표 365일)
// - 추가 문제 은행의 품질 신호: 해설에 정답이 나오는지, 같은 정답의 반복, 문장 길이, 정답 위치
// 사용: npm run questions:report
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => {
  const path = join(root, 'src/data', file);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
};
const main = read('questions.json');
const extra = read('questions.extra.json');
const all = [...main, ...extra];

const CATEGORIES = ['dev', 'office', 'daily', 'study', 'toeic'];
const LABEL = { dev: '개발', office: '직장', daily: '일상', study: '학교', toeic: '토익' };
/** 목표: 여행·취미 설정은 일상 영어만 쓰므로 일상 영어 7,300, 나머지는 두 분류를 반씩 쓰므로 3,650. 난이도는 15:30:55 */
const TARGET = {
  daily: { 1: 1100, 2: 2200, 3: 4000 },
  dev: { 1: 550, 2: 1100, 3: 2000 },
  office: { 1: 550, 2: 1100, 3: 2000 },
  study: { 1: 550, 2: 1100, 3: 2000 },
  toeic: { 1: 550, 2: 1100, 3: 2000 },
};
/** src/lib/study.ts profileCategories와 같은 조합 */
const PROFILES = [
  ['소통', ['daily', 'office']],
  ['경력: 개발', ['dev', 'office']],
  ['경력: 일반 업무', ['office', 'daily']],
  ['경력: 토익', ['toeic', 'office']],
  ['취미·여행', ['daily']],
  ['학업', ['study', 'toeic']],
  ['설정 전', ['dev', 'daily']],
];
const PER_DAY = 20;
const YEAR = 365;

const count = (list, c, d) => list.filter((q) => q.category === c && (d === undefined || q.difficulty === d)).length;
const pct = (n, total) => `${Math.round((n / total) * 100)}%`;

console.log(`문제 은행 ${main.length} + 추가 ${extra.length} = ${all.length}문항 (목표 ${Object.values(TARGET).reduce((n, t) => n + t[1] + t[2] + t[3], 0)})\n`);
console.log('분류   기초(현재/목표)  중급(현재/목표)  심화(현재/목표)  합계');
for (const c of CATEGORIES) {
  const cells = [1, 2, 3].map((d) => `${String(count(all, c, d)).padStart(5)}/${String(TARGET[c][d]).padEnd(5)}`);
  const total = count(all, c);
  const goal = TARGET[c][1] + TARGET[c][2] + TARGET[c][3];
  console.log(`${LABEL[c]}   ${cells.join('      ')}   ${total}/${goal} (${pct(total, goal)})`);
}

console.log(`\n맞춤 설정마다 하루 ${PER_DAY}문제씩 새 문제로 버티는 날수 (목표 ${YEAR}일, 보너스 제외)`);
for (const [name, categories] of PROFILES) {
  const pool = categories.reduce((n, c) => n + count(all, c), 0);
  const days = Math.floor(pool / PER_DAY);
  console.log(`  ${name.padEnd(10)} ${String(pool).padStart(6)}문항 → ${String(days).padStart(4)}일 ${days >= YEAR ? '✓' : ''}`);
}

if (extra.length > 0) {
  console.log('\n추가 문제 은행 품질 신호');
  const lower = (s) => s.toLowerCase();
  const noAnswer = extra.filter((q) => !lower(q.explanation).includes(lower(q.choices[q.answer]).split(' ')[0]));
  console.log(`  해설에 정답 표현이 안 나오는 문항: ${noAnswer.length} ${noAnswer.slice(0, 10).map((q) => `#${q.id}`).join(' ')}`);
  const positions = [0, 1, 2, 3].map((i) => extra.filter((q) => q.answer === i).length);
  console.log(`  정답 위치 분포(1~4번): ${positions.map((n) => pct(n, extra.length)).join(' / ')}`);
  for (const d of [1, 2, 3]) {
    const words = extra.filter((q) => q.difficulty === d).map((q) => q.prompt.split(/\s+/).length);
    if (words.length) console.log(`  난이도 ${d} 문장 길이(단어): 평균 ${(words.reduce((a, b) => a + b, 0) / words.length).toFixed(1)}, ${Math.min(...words)}~${Math.max(...words)}`);
  }
  for (const c of CATEGORIES) {
    const answers = new Map();
    for (const q of extra.filter((q) => q.category === c)) {
      const a = lower(q.choices[q.answer]);
      answers.set(a, (answers.get(a) ?? 0) + 1);
    }
    const repeated = [...answers].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (repeated.length) console.log(`  ${LABEL[c]}에서 4번 이상 나온 정답: ${repeated.map(([a, n]) => `${a}(${n})`).join(', ')}`);
  }
}
