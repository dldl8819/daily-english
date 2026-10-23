'use client';

import { useEffect } from 'react';

/** 개발 서버에서만 AIT DevTools 플로팅 패널을 띄운다. 프로덕션 빌드에서는 import가 제거된다. */
export function DevtoolsPanel() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      void import('@apps-in-toss/devtools/panel');
    }
  }, []);
  return null;
}
