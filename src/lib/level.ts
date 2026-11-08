export const XP_PER_CORRECT = 10;
export const XP_DAILY_BONUS = 5;

/** 해당 레벨에 도달하는 데 필요한 누적 XP. 레벨 1은 0, 이후 60, 180, 360 ... */
export function xpToReach(level: number): number {
  return (60 * level * (level - 1)) / 2;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xp >= xpToReach(level + 1)) {
    level += 1;
  }
  return level;
}

export function levelProgress(xp: number): { level: number; current: number; needed: number } {
  const level = levelFromXp(xp);
  const base = xpToReach(level);
  return { level, current: xp - base, needed: xpToReach(level + 1) - base };
}

/** 오늘의 문제 세트 하나로 얻는 XP 합계: 맞힌 문제마다 10, 마치면 완료 보너스 5 */
export function xpForResult(correct: number): number {
  return correct * XP_PER_CORRECT + XP_DAILY_BONUS;
}

/**
 * 한 문제에 답할 때 바로 주는 XP(2026-11-08부터). 맞히면 10, 틀리면 0.
 * 세트를 마칠 때는 합계(xpForResult)에서 이미 준 만큼을 뺀 나머지(완료 보너스)만 더하므로 하루 합계는 그대로다.
 */
export function xpForPick(correct: boolean): number {
  return correct ? XP_PER_CORRECT : 0;
}
