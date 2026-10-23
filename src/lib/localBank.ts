import type { Question } from './types';

/**
 * 서버 없이 동작하는 빌드(NEXT_PUBLIC_API_BASE_URL이 비어 있을 때)의 문제 은행.
 * 서버 모드 빌드에서는 아래 조건이 빌드 때 참으로 정해져 import가 빠지고, 문제 은행(정답·해설)이 번들에 들어가지 않는다.
 * 조건을 SERVER_MODE 같은 변수로 바꾸면 번들러가 미리 알 수 없어 다시 들어간다.
 */
export async function loadLocalBank(): Promise<Question[]> {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return [];
  return (await import('@/data/questions.json')).default as Question[];
}
