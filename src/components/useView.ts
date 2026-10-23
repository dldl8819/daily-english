'use client';

import { useCallback, useEffect, useState } from 'react';

const VIEWS = [
  'home',
  'saved',
  'settings',
  'settings_profile',
  'settings_study',
  'settings_display',
  'settings_reminder',
  'review',
  'wrong',
] as const;

/** 화면 이름. 분석 이벤트 이름(`{view}_screen`)에도 그대로 쓴다. */
export type View = (typeof VIEWS)[number];

function viewOf(state: unknown): View {
  const view = (state as { view?: unknown } | null)?.view;
  return VIEWS.includes(view as View) ? (view as View) : 'home';
}

/**
 * 한 페이지 안의 화면 전환. 브라우저 기록에 쌓아서 토스 내비게이션 바·안드로이드 뒤로가기가
 * 앞 화면으로 돌아가게 한다. 첫 화면(home)에서 뒤로가면 기록이 없으므로 미니앱이 닫힌다.
 * 화면 안에 따로 뒤로가기 버튼은 두지 않는다(토스 내비게이션 바의 뒤로가기와 함께 보이면 안 된다는 출시 가이드).
 */
export function useView(): { view: View; go: (next: View) => void } {
  const [view, setView] = useState<View>('home');

  useEffect(() => {
    if (!history.state?.view) history.replaceState({ ...history.state, view: 'home' }, '');
    setView(viewOf(history.state));
    const onPop = (e: PopStateEvent) => setView(viewOf(e.state));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: View) => {
    history.pushState({ view: next }, '');
    setView(next);
  }, []);

  return { view, go };
}
