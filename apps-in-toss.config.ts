import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 앱인토스 콘솔에 등록한 appName(miniAppId 89606). 변경 불가. 다르면 컴파일이 BUILD_FAILED로 끝난다.
  appName: 'english-bite',
  brand: {
    primaryColor: '#EA580C',
  },
  navigationBar: {
    withBackButton: true,
    withTitle: true,
    theme: 'light',
  },
  permissions: [],
  // next build(output: 'export')의 결과 폴더
  webBundleDir: 'out',
});
