import type { Progress } from './types';

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 10;

export type NicknameCheck = { ok: true; value: string } | { ok: false; error: string };

/** 한글·영문·숫자·공백·밑줄만, 앞뒤 공백 제거 후 2~10자 */
export function checkNickname(raw: string): NicknameCheck {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < NICKNAME_MIN || value.length > NICKNAME_MAX) {
    return { ok: false, error: `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해 주세요.` };
  }
  if (!/^[가-힣a-zA-Z0-9_ ]+$/.test(value)) {
    return { ok: false, error: '한글, 영문, 숫자, 밑줄(_)만 쓸 수 있어요.' };
  }
  return { ok: true, value };
}

export function setNickname(progress: Progress, nickname: string): Progress {
  return progress.nickname === nickname ? progress : { ...progress, nickname };
}
