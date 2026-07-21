import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('visibility pause는 world snapshot을 고정하고 명시적 확인 뒤 playing으로 돌아간다', async ({ page }) => {
  await openScenario(page, 'health-bar-colors');
  await advance(page, 1000);
  const before = await snapshot(page);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 10_000);
  const hidden = await snapshot(page);
  expect(hidden.run.simulationMs).toBe(before.run.simulationMs);
  expect(hidden.run.enemies).toEqual(before.run.enemies);
  expect(hidden.run.skillStates).toEqual(before.run.skillStates);
  expect(hidden.run.mode).toBe('visibilityPause');
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await expect(page.getByRole('button', { name: '계속하기' })).toHaveCount(1);
  await page.getByRole('button', { name: '계속하기' }).click();
  expect((await snapshot(page)).run.mode).toBe('playing');
});

test('countdown 숨김 시간은 3000ms transition clock에 포함되지 않는다', async ({ page }) => {
  await openScenario(page, 'wave-schedule');
  await advance(page, 20_000 + 1000 / 60);
  expect((await snapshot(page)).run.mode).toBe('countdown');
  await advance(page, 1000);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 10_000);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.getByRole('button', { name: '계속하기' }).click();
  expect((await snapshot(page)).run.mode).toBe('countdown');
  await advance(page, 1999);
  expect((await snapshot(page)).run.mode).toBe('countdown');
  await advance(page, 1);
  expect((await snapshot(page)).run).toMatchObject({ mode: 'playing', wave: 2 });
});

test('Scene restart 뒤 lifecycle/WebGL confirmation과 HUD overlay는 하나만 남는다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.evaluate(() => {
    (window as Window & { __LIFECYCLE_BRIDGE__?: unknown }).__LIFECYCLE_BRIDGE__ = window.__HUCHU_TEST__;
    window.__HUCHU_TEST__!.restartScene();
  });
  await page.waitForFunction(() => (
    window.__HUCHU_TEST__ !== undefined
    && window.__HUCHU_TEST__ !== (window as Window & { __LIFECYCLE_BRIDGE__?: unknown }).__LIFECYCLE_BRIDGE__
  ));
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  await expect(page.locator('.hud-overlay')).toHaveCount(1);

  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await expect(page.getByRole('button', { name: '계속하기' })).toHaveCount(1);
  await page.getByRole('button', { name: '계속하기' }).click();

  await loseContext(page);
  await restoreContext(page);
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(1);
  await page.getByRole('button', { name: '다시 그리기' }).click();
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(0);
});

async function loseContext(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl!.getExtension('WEBGL_lose_context')!;
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context }).__loseContextExtension = extension;
    extension.loseContext();
  });
}

async function restoreContext(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension!.restoreContext();
  });
}
