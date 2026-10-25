// 추가 문제 묶음 검사 (docs/20_문제_은행_확장.md "묶음 작업 순서").
// 묶음은 문제 은행과 같은 형식의 JSON 배열이다. 문제 은행처럼 공개하지 않으므로 저장소 밖에 둔다.
// - 오류: id 중복, 형식, 부적절한 표현(contentPolicy.ts, 테스트와 같은 함수), 기존 문항·묶음 안에서 같은 문장
// - 경고: 기존 문항과 같은 해설, 난이도에 비해 길거나 짧은 문장, 해석 어미, 사람 지칭(당신·그 사람)
// --merge를 주면 오류가 없을 때 추가 문제 은행(src/data/questions.extra.json)에 id 순으로 합친다. 경고는 막지 않는다.
// 사용: npm run questions:batch -- <묶음.json> [--merge]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentViolations } from '../src/data/contentPolicy.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
const merge = args.includes('--merge');
if (!file) {
  console.error('사용: npm run questions:batch -- <묶음.json> [--merge]');
  process.exit(1);
}

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []);
const main = read(join(root, 'src/data/questions.json'));
const extraPath = join(root, 'src/data/questions.extra.json');
const extra = read(extraPath);
// npm run은 저장소 루트에서 실행되므로, 상대 경로는 명령을 친 위치(INIT_CWD) 기준으로 푼다.
const batch = JSON.parse(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8'));

const CATEGORIES = ['dev', 'office', 'study', 'toeic', 'daily'];
// 경고 기준. docs/20의 난이도별 문장 길이보다 넉넉하게 잡았다.
const WORDS = { 1: [4, 11], 2: [6, 16], 3: [7, 20] };
// 같은 문장 판정은 questions.test.ts와 같다(대소문자·문장부호 무시).
const normalize = (s) => s.toLowerCase().replace(/[^a-z_ ]/g, ' ').replace(/\s+/g, ' ').trim();

const existing = [...main, ...extra];
const ids = new Set(existing.map((q) => q.id));
const prompts = new Map(existing.map((q) => [normalize(q.prompt), q.id]));
// 같은 해설은 기기 모드 번들 검사에서 추가 문항을 가려내기 어렵게 하고, 문항별 설명도 흐려진다.
const explanations = new Map(existing.map((q) => [q.explanation, q.id]));
const errors = [];
const warnings = [];

for (const q of batch) {
  const error = (message) => errors.push(`#${q.id} ${message}`);
  const warn = (message) => warnings.push(`#${q.id} ${message}`);

  if (!Number.isInteger(q.id) || ids.has(q.id)) error('id 중복 또는 정수가 아님');
  ids.add(q.id);
  if (!CATEGORIES.includes(q.category)) error(`분류 ${q.category}`);
  if (![1, 2, 3].includes(q.difficulty)) error(`난이도 ${q.difficulty}`);
  if (typeof q.prompt !== 'string' || q.prompt.split('___').length - 1 !== 1) error('빈칸(___)은 한 개');
  if (!Array.isArray(q.choices) || q.choices.length !== 4 || new Set(q.choices.map((c) => c.toLowerCase())).size !== 4) {
    error('보기는 서로 다른 4개');
  }
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) error('정답 번호');
  if (!q.explanation?.trim()) error('해설 없음');
  if (!q.translation?.trim() || q.translation.includes('___') || !/[가-힣]/.test(q.translation)) error('해석 형식');
  if (typeof q.prompt !== 'string' || !Array.isArray(q.choices)) continue;

  const banned = contentViolations(q);
  if (banned.length > 0) error(`부적절한 표현 ${banned.join(', ')}`);
  const key = normalize(q.prompt);
  if (prompts.has(key)) error(`같은 문장 (#${prompts.get(key)})`);
  prompts.set(key, q.id);

  if (explanations.has(q.explanation)) warn(`해설이 #${explanations.get(q.explanation)}와 같아요: ${q.explanation}`);
  explanations.set(q.explanation, q.id);
  const words = q.prompt.split(/\s+/).length;
  const [min, max] = WORDS[q.difficulty] ?? [0, Infinity];
  if (words < min || words > max) warn(`난이도 ${q.difficulty}인데 ${words}단어: ${q.prompt}`);
  if (!/(요|죠|세요|까요)[.?!]?$/.test(q.translation?.trim() ?? '')) warn(`해석 어미: ${q.translation}`);
  if (/당신|그 사람/.test(q.translation ?? '')) warn(`사람 지칭(그/그녀로): ${q.translation}`);
}

const cells = {};
for (const q of batch) cells[`${q.category}/${q.difficulty}`] = (cells[`${q.category}/${q.difficulty}`] ?? 0) + 1;
const positions = [0, 1, 2, 3].map((i) => batch.filter((q) => q.answer === i).length);
console.log(`${basename(file)}: ${batch.length}문항 ${JSON.stringify(cells)} 정답 위치 ${positions.join('/')}`);
if (warnings.length > 0) console.log(`  확인 필요 ${warnings.length}건\n    ${warnings.join('\n    ')}`);
if (errors.length > 0) {
  console.error(`  오류 ${errors.length}건\n    ${errors.join('\n    ')}`);
  process.exit(1);
}
console.log('  오류 없음');

if (merge) {
  const merged = [...extra, ...batch].sort((a, b) => a.id - b.id);
  // 한 줄에 한 문항: 변경 내역(diff)을 문항 단위로 볼 수 있다.
  writeFileSync(extraPath, '[\n' + merged.map((q) => '  ' + JSON.stringify(q)).join(',\n') + '\n]\n');
  console.log(`  추가 문제 은행에 합쳤어요: ${merged.length}문항`);
}
