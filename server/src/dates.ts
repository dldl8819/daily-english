const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

/** 한국 시간 기준 오늘 (yyyy-mm-dd) */
export function kstToday(nowMs: number): string {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

function dayNumber(key: string): number {
  return Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY_MS);
}

/**
 * 클라이언트가 보낸 날짜가 오늘(한국 시간) 앞뒤 하루 안인지.
 * 클라이언트는 기기 시간대의 날짜를 쓰므로 하루 차이는 허용한다. 날짜마다 세트는 하나라 아무 날짜나 받으면 문제를 더 받아 갈 수 있다.
 */
export function withinWindow(date: string, today: string): boolean {
  return Math.abs(dayNumber(date) - dayNumber(today)) <= 1;
}
