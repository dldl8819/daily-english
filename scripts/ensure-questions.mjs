// 문제 은행(questions.json)은 저장소에 올리지 않는다. 없으면 샘플(75문제)을 복사해 바로 실행·빌드·테스트할 수 있게 한다.
import { copyFileSync, existsSync } from 'node:fs';

const target = new URL('../src/data/questions.json', import.meta.url);
const sample = new URL('../src/data/questions.sample.json', import.meta.url);

if (!existsSync(target)) {
  copyFileSync(sample, target);
  console.log('questions.json이 없어 questions.sample.json(샘플 75문제)을 복사했어요.');
}
