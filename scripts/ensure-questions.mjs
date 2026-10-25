// 문제 은행(questions.json)은 저장소에 올리지 않는다. 없으면 샘플(75문제)을 복사해 바로 실행·빌드·테스트할 수 있게 한다.
// 추가 문제 은행(questions.extra.json, 서버 모드 전용)도 저장소에 없다. 없으면 빈 목록으로 만든다.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';

const target = new URL('../src/data/questions.json', import.meta.url);
const sample = new URL('../src/data/questions.sample.json', import.meta.url);
const extra = new URL('../src/data/questions.extra.json', import.meta.url);

if (!existsSync(target)) {
  copyFileSync(sample, target);
  console.log('questions.json이 없어 questions.sample.json(샘플 75문제)을 복사했어요.');
}
if (!existsSync(extra)) {
  writeFileSync(extra, '[]\n');
  console.log('questions.extra.json이 없어 빈 목록으로 만들었어요.');
}
