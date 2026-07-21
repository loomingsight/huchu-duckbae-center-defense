import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viteConfigUrl = new URL('../../vite.config.ts', import.meta.url);
const assetManifestUrl = new URL('../../src/game/assets/assetManifest.ts', import.meta.url);
const indexUrl = new URL('../../index.html', import.meta.url);
const workflowUrl = new URL('../../.github/workflows/deploy-pages.yml', import.meta.url);

describe('GitHub Pages deployment', () => {
  it('저장소 하위 경로와 Vite BASE_URL로 모든 runtime asset을 해석한다', () => {
    const viteConfig = readFileSync(viteConfigUrl, 'utf8');
    const assetManifest = readFileSync(assetManifestUrl, 'utf8');

    expect(viteConfig).toContain("process.env.PAGES_BASE_PATH ?? '/'");
    expect(assetManifest).toContain('import.meta.env.BASE_URL');
    expect(assetManifest).not.toMatch(/url:\s*['"]\/assets\//);
  });

  it('main push와 수동 실행으로 dist를 Pages에 배포한다', () => {
    expect(existsSync(workflowUrl)).toBe(true);
    if (!existsSync(workflowUrl)) return;

    const workflow = readFileSync(workflowUrl, 'utf8');

    expect(workflow).toContain("branches: ['main']");
    expect(workflow).toContain('id: pages');
    expect(workflow).toContain('PAGES_BASE_PATH: ${{ steps.pages.outputs.base_path }}/');
    expect(workflow).not.toContain('/huchu-defense-v1/');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('actions/upload-pages-artifact');
    expect(workflow).toContain('actions/deploy-pages');
  });

  it('브라우저가 별도 favicon 경로를 요청하지 않도록 자체 제공한다', () => {
    const index = readFileSync(indexUrl, 'utf8');

    expect(index).toContain('rel="icon"');
    expect(index).toContain('href="data:image/svg+xml,');
  });
});
