// 빌드한 out/에 문제 은행(정답·해설·해석)이 들어 있는지 검사한다.
// - 서버 모드(NEXT_PUBLIC_API_BASE_URL이 있는 빌드): 한 문제라도 들어 있으면 실패한다. 문제 은행은 서버에만 둔다.
// - 기기 모드: 문제 은행이 들어 있는 게 정상이라 개수만 알린다.
//   --self-test를 주면 전 문항을 찾아내는지 확인한다. 서버 모드의 "0문항"이 검사 실수가 아니라는 근거다(CI).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const selfTest = process.argv.includes('--self-test');

/** next build와 같은 우선순위로 서버 주소를 읽는다: 환경 변수 > .env.production.local > .env.production */
function apiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  for (const file of ['.env.production.local', '.env.production']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*NEXT_PUBLIC_API_BASE_URL\s*=\s*(.*?)\s*$/);
      if (match) return match[1].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return '';
}

function textFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return textFiles(path);
    return /\.(js|html|txt|json|css)$/.test(name) ? [path] : [];
  });
}

/** 번들러가 문자열을 이스케이프해 넣어도 찾을 수 있게 되돌린다(\uXXXX, \xXX, \', \"). */
function unescape(text) {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\(['"`\\/])/g, '$1');
}

const out = join(root, 'out');
if (!existsSync(out)) {
  console.error('out/이 없어요. 먼저 next build를 실행해 주세요.');
  process.exit(1);
}
const bank = JSON.parse(readFileSync(join(root, 'src/data/questions.json'), 'utf8'));
const bundle = unescape(textFiles(out).map((f) => readFileSync(f, 'utf8')).join('\n'));
// 해석은 판별에 쓰지 않는다. 짧은 한국어 문장은 화면 문구와 우연히 겹친다(예: '앱을 최신 버전으로 업데이트해 주세요.').
// 문제 은행은 문항 단위로 통째로 들어가므로 영어 문장·해설만으로 찾아낼 수 있다(--self-test가 확인).
const found = bank.filter((q) => bundle.includes(q.prompt) || bundle.includes(q.explanation));
const serverMode = apiBaseUrl() !== '';

// 추가 문제 은행(questions.extra.json)은 서버 전용이다. 어느 모드든 클라이언트 번들에 한 문항이라도 있으면 실패한다.
// 기기 모드 번들에는 기본 문제 은행이 들어 있으므로, 기본 문항에도 있는 해설(예: "'~할 때'는 when이에요.")은 근거로 쓰지 않는다.
// 문장은 문항마다 다르다(src/data/questions.test.ts의 중복 검사가 막는다).
const extraPath = join(root, 'src/data/questions.extra.json');
const extra = existsSync(extraPath) ? JSON.parse(readFileSync(extraPath, 'utf8')) : [];
const mainText = bank.map((q) => `${q.prompt}\n${q.explanation}`).join('\n');
const extraFound = extra.filter(
  (q) => bundle.includes(q.prompt) || (bundle.includes(q.explanation) && !mainText.includes(q.explanation)),
);
if (extraFound.length > 0) {
  console.error(`추가 문제 은행(서버 전용) ${extraFound.length}/${extra.length}문항이 번들에 있어요. 예: #${extraFound.slice(0, 5).map((q) => q.id).join(', #')}`);
  process.exit(1);
}

if (serverMode) {
  if (found.length > 0) {
    console.error(`서버 모드 빌드인데 문제 은행 ${found.length}/${bank.length}문항이 번들에 있어요. 예: #${found.slice(0, 5).map((q) => q.id).join(', #')}`);
    console.error('문제 은행을 import하는 곳이 src/lib/localBank.ts 말고 더 생겼는지 확인해 주세요.');
    process.exit(1);
  }
  console.log(`서버 모드: 번들에 문제 은행이 없어요 (0/${bank.length}문항).`);
} else if (selfTest && found.length < bank.length) {
  console.error(`검사가 기기 모드 번들에서 ${found.length}/${bank.length}문항만 찾았어요. 번들 형식이 바뀌었으면 scripts/check-bundle.mjs를 고쳐 주세요.`);
  process.exit(1);
} else {
  console.log(`기기 모드: 문제 은행 ${found.length}/${bank.length}문항이 번들에 들어 있어요 (서버 주소 없이 빌드한 정상 상태).`);
}
