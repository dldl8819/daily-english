import { canUseSdk, loadValue, saveValue } from './storage';

/**
 * 화면 모드.
 * - default: 기본 라이트 화면
 * - contrast: 밝은 배경 고대비 (난시·저시력)
 * - dark: 어두운 화면 (눈부심·광과민). 앱인토스 출시 가이드가 라이트 모드를 요구해서
 *   기기 다크 모드를 따라가지 않고, 사용자가 앱 안에서 고를 때만 켠다.
 */
export type Theme = 'default' | 'contrast' | 'dark';

export const THEME_KEY = 'daily-english:theme:v1';

export const THEMES: { value: Theme; label: string; description: string }[] = [
  { value: 'default', label: '기본', description: '밝은 화면' },
  { value: 'contrast', label: '고대비', description: '흰 배경에 진한 글자와 굵은 테두리' },
  { value: 'dark', label: '어둡게', description: '눈부심을 줄인 어두운 화면' },
];

/** 내비게이션 바를 화면 모드에 맞춘다. 배경색은 globals.css의 --bg와 같다. */
const NAV_BAR: Record<Theme, { theme: 'light' | 'dark'; backgroundColor: string }> = {
  default: { theme: 'light', backgroundColor: '#f4f5f7' },
  contrast: { theme: 'light', backgroundColor: '#ffffff' },
  dark: { theme: 'dark', backgroundColor: '#1a1c20' },
};

export function parseTheme(raw: string | null): Theme | null {
  return raw === 'default' || raw === 'contrast' || raw === 'dark' ? raw : null;
}

/** 고른 적이 없으면 기기의 "대비 높이기" 설정만 따른다. 다크 모드 설정은 따르지 않는다. */
export function initialTheme(saved: Theme | null, prefersMoreContrast: boolean): Theme {
  return saved ?? (prefersMoreContrast ? 'contrast' : 'default');
}

function prefersMoreContrast(): boolean {
  try {
    return window.matchMedia('(prefers-contrast: more)').matches;
  } catch {
    return false;
  }
}

export async function loadTheme(): Promise<Theme> {
  return initialTheme(parseTheme(await loadValue(THEME_KEY)), prefersMoreContrast());
}

export async function saveTheme(theme: Theme): Promise<void> {
  await saveValue(THEME_KEY, theme);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  if (canUseSdk()) {
    void import('@apps-in-toss/web-framework')
      .then(({ NavigationBar }) => NavigationBar.setOptions(NAV_BAR[theme]))
      .catch(() => {
        // 내비게이션 바를 못 바꿔도 본문 화면은 바뀐다.
      });
  }
}

/**
 * 첫 화면이 밝게 번쩍이지 않도록 React보다 먼저 실행하는 스크립트.
 * localStorage 사본만 동기로 읽을 수 있어서 그것만 본다.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='default'&&t!=='contrast'&&t!=='dark'){t=matchMedia('(prefers-contrast: more)').matches?'contrast':'default'}document.documentElement.dataset.theme=t}catch(e){}`;
