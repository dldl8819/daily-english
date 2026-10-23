'use client';

import { useCallback, useEffect, useState } from 'react';
import { type Theme, applyTheme, loadTheme, saveTheme } from '@/lib/theme';

/** 저장된 화면 모드를 읽어 적용하고, 바꾸면 바로 적용·저장한다. 읽기 전에는 null */
export function useTheme(): [Theme | null, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTheme().then((loaded) => {
      if (cancelled) return;
      setTheme(loaded);
      applyTheme(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = useCallback((next: Theme) => {
    setTheme(next);
    applyTheme(next);
    void saveTheme(next);
  }, []);

  return [theme, choose];
}
