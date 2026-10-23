import { describe, expect, it } from 'vitest';
import { THEME_BOOT_SCRIPT, initialTheme, parseTheme } from './theme';

describe('parseTheme', () => {
  it('알려진 값만 받는다', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('contrast')).toBe('contrast');
    expect(parseTheme('default')).toBe('default');
    expect(parseTheme('light')).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });
});

describe('initialTheme', () => {
  it('고른 적이 있으면 그 값을 쓴다', () => {
    expect(initialTheme('dark', true)).toBe('dark');
    expect(initialTheme('default', true)).toBe('default');
  });

  it('고른 적이 없으면 기기의 대비 높이기 설정만 따른다', () => {
    expect(initialTheme(null, true)).toBe('contrast');
    expect(initialTheme(null, false)).toBe('default');
  });
});

describe('THEME_BOOT_SCRIPT', () => {
  function run(saved: string | null, moreContrast: boolean): string | undefined {
    const root = { dataset: {} as Record<string, string> };
    const fn = new Function('localStorage', 'matchMedia', 'document', THEME_BOOT_SCRIPT);
    fn({ getItem: () => saved }, () => ({ matches: moreContrast }), { documentElement: root });
    return root.dataset.theme;
  }

  it('저장된 모드를 첫 화면 전에 적용한다', () => {
    expect(run('dark', false)).toBe('dark');
    expect(run('contrast', false)).toBe('contrast');
  });

  it('저장값이 없거나 이상하면 대비 설정에 따라 기본 또는 고대비', () => {
    expect(run(null, false)).toBe('default');
    expect(run('weird', true)).toBe('contrast');
  });
});
