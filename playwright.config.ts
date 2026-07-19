import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'performance/**/*.spec.ts', 'visual/**/*.spec.ts'],
  snapshotPathTemplate: '{testDir}/visual/__snapshots__/{projectName}/{testFilePath}/{arg}{ext}',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 } },
    { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
  ],
});
