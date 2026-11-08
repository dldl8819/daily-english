// 보기 설명(choiceNotes)을 문제 은행에 합친다 (docs/20_문제_은행_확장.md "보기 설명").
// 설명 파일은 { "문항 id": ["1번 보기 설명", "2번", "3번", "4번"] } 형식의 JSON이다. 문제 은행처럼 공개하지 않으므로 저장소 밖에 둔다.
// - 오류: 없는 id, 규칙 위반(src/data/choiceNotes.ts), 부적절한 표현(src/data/contentPolicy.ts, 테스트와 같은 함수)
// - --merge: 오류가 없을 때 기본 문제 은행(questions.json)과 추가 문제 은행(questions.extra.json)의 해당 문항에 넣는다.
//   한 줄에 한 문항 형식을 그대로 둔다. 이미 설명이 있는 문항은 새 설명으로 바꾼다.
// 사용: npm run questions:notes -- <설명.json> [--merge]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { choiceNoteProblems } from '../src/data/choiceNotes.ts';
import { contentViolations } from '../src/data/contentPolicy.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
const merge = args.includes('--merge');
if (!file) {
  console.error('사용: npm run questions:notes -- <설명.json> [--merge]');
  process.exit(1);
}

// 문제 은행 파일 형식(questions-batch.mjs의 --merge와 같다). 읽은 파일이 이 형식이 아니면 덮어쓰지 않는다.
const format = (list) => '[\n' + list.map((q) => '  ' + JSON.stringify(q)).join(',\n') + '\n]\n';
const banks = ['src/data/questions.json', 'src/data/questions.extra.json']
  .map((rel) => join(root, rel))
  .filter((path) => existsSync(path))
  .map((path) => {
    const raw = readFileSync(path, 'utf8');
    return { path, raw, list: JSON.parse(raw) };
  });
const byId = new Map(banks.flatMap((bank) => bank.list.map((q) => [q.id, { bank, q }])));

// npm run은 저장소 루트에서 실행되므로, 상대 경로는 명령을 친 위치(INIT_CWD) 기준으로 푼다.
const notes = JSON.parse(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8'));
const errors = [];
let replaced = 0;
for (const [key, value] of Object.entries(notes)) {
  const found = byId.get(Number(key));
  if (!found || !/^\d+$/.test(key)) {
    errors.push(`#${key} 문제 은행에 없는 문항`);
    continue;
  }
  const next = { ...found.q, choiceNotes: value };
  for (const problem of choiceNoteProblems(next)) errors.push(`#${key} ${problem}`);
  const banned = contentViolations(next);
  if (banned.length > 0) errors.push(`#${key} 부적절한 표현 ${banned.join(', ')}`);
  if (found.q.choiceNotes) replaced += 1;
}

const count = Object.keys(notes).length;
console.log(`${basename(file)}: ${count}문항의 보기 설명${replaced ? ` (이미 있던 ${replaced}문항은 바꿈)` : ''}`);
if (errors.length > 0) {
  console.error(`  오류 ${errors.length}건\n    ${errors.join('\n    ')}`);
  process.exit(1);
}
console.log('  오류 없음');

if (merge) {
  for (const bank of banks) {
    if (format(bank.list) !== bank.raw) {
      console.error(`${basename(bank.path)}가 한 줄에 한 문항 형식이 아니라 덮어쓰지 않았어요.`);
      process.exit(1);
    }
  }
  for (const bank of banks) {
    let changed = 0;
    const list = bank.list.map((q) => {
      if (!(String(q.id) in notes)) return q;
      changed += 1;
      return { ...q, choiceNotes: notes[String(q.id)] };
    });
    if (changed > 0) {
      writeFileSync(bank.path, format(list));
      console.log(`  ${basename(bank.path)}에 넣었어요: ${changed}문항 (설명 있는 문항 ${list.filter((q) => q.choiceNotes).length}/${list.length})`);
    }
  }
}
