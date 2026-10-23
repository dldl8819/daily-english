import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// globals.css의 화면 모드별 색 토큰을 읽어 WCAG 2.1 대비를 검사한다.
const css = readFileSync(path.resolve(__dirname, 'globals.css'), 'utf8');

function tokensOf(selector: RegExp): Record<string, string> {
  const result: Record<string, string> = {};
  for (const block of css.matchAll(selector)) {
    for (const m of block[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) result[m[1]] = m[2];
  }
  return result;
}

const base = tokensOf(/:root\s*\{([^}]*)\}/g);
const themes = {
  default: base,
  contrast: { ...base, ...tokensOf(/:root\[data-theme='contrast'\]\s*\{([^}]*)\}/g) },
  dark: { ...base, ...tokensOf(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/g) },
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [글자, 배경, 쓰이는 곳]
const textPairs: [string, string, string][] = [
  ['text', 'bg', '제목'],
  ['text', 'card', '문제, 선택지'],
  ['sub', 'bg', '부제, 화면 모드 제목'],
  ['sub', 'card', '진행 단계, XP'],
  ['text', 'primary-soft', '해설'],
  ['primary-strong', 'primary-soft', '태그'],
  ['primary-strong', 'card', '선택한 화면 모드'],
  ['sub', 'primary-soft', '선택한 학습 목적의 설명'],
  ['sub', 'card', '비활성 버튼'],
  ['on-primary', 'primary-strong', '주요 버튼'],
  ['ok', 'ok-soft', '정답 표시'],
  ['bad', 'bad-soft', '내 선택 표시'],
  ['text', 'ok-soft', '정답 선택지 글자'],
  ['text', 'bad-soft', '오답 선택지 글자'],
  ['ok', 'card', '복습 화면 맞힘'],
  ['bad', 'card', '복습 화면 틀림'],
];

// [요소, 배경, 쓰이는 곳] 그래픽·포커스는 3:1
const graphicPairs: [string, string, string][] = [
  ['primary-strong', 'track', '진행 바 채움 / 바탕'],
  ['focus', 'bg', '포커스 테두리'],
  ['focus', 'card', '포커스 테두리'],
];

// 고대비 모드는 AAA(7:1), 나머지는 AA(4.5:1)
const textMin = { default: 4.5, contrast: 7, dark: 4.5 };

describe.each(Object.entries(themes))('색 대비: %s', (name, tokens) => {
  const min = textMin[name as keyof typeof textMin];

  it.each(textPairs)(`글자 %s / %s ≥ ${min} (%s)`, (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each(graphicPairs)('그래픽 %s / %s ≥ 3 (%s)', (fg, bg) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
  });
});

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('브랜드 가드', () => {
  // 앱인토스 플러그인 기준: 토스 브랜드 컬러(토스 블루 계열)를 미니앱 대표 색으로 쓰지 않는다.
  it.each(Object.entries(themes))('%s 모드의 대표 색이 파란 계열(색상각 190~250도)이 아니다', (_, tokens) => {
    for (const name of ['primary', 'primary-strong']) {
      const h = hue(tokens[name]);
      expect(h < 190 || h > 250, `${name} ${tokens[name]} hue ${h.toFixed(0)}`).toBe(true);
    }
  });
});

describe('어둡게 모드', () => {
  it('순검정 배경과 순백 글자를 쓰지 않는다 (눈부심·번짐 완화)', () => {
    expect(themes.dark.bg.toLowerCase()).not.toBe('#000000');
    expect(themes.dark.text.toLowerCase()).not.toBe('#ffffff');
  });
});
