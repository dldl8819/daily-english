// 배포 전 확인: 문제 은행이 서버 번들에 들어간다. 실제 문제 은행 없이(샘플로) 배포하지 않도록 막는다.
import { existsSync, readFileSync } from 'node:fs';

const bank = new URL('../../src/data/questions.json', import.meta.url);
const sample = new URL('../../src/data/questions.sample.json', import.meta.url);

if (!existsSync(bank)) {
  console.error('src/data/questions.json이 없어요. 실제 문제 은행을 두고 배포해 주세요.');
  process.exit(1);
}
if (readFileSync(bank, 'utf8') === readFileSync(sample, 'utf8')) {
  console.error('src/data/questions.json이 샘플과 같아요. 실제 문제 은행을 두고 배포해 주세요.');
  process.exit(1);
}
console.log(`문제 은행 ${JSON.parse(readFileSync(bank, 'utf8')).length}문제를 서버에 넣어 배포해요.`);
