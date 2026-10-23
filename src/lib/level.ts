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

export function xpForResult(correct: number): number {
  return correct * XP_PER_CORRECT + XP_DAILY_BONUS;
}
