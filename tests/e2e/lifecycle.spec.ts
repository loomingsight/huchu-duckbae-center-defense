import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('탭 숨김 시간에는 적 cooldown과 visual clock이 진행되지 않는다', async ({ page }) => {
  await openScenario(page, 'health-bar-colors');
  await advance(page, 1000);
  const before = await snapshot(page);

  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 10_000);
  const hidden = await snapshot(page);

  expect(hidden.enemies).toEqual(before.enemies);
  expect(hidden.skillStates).toEqual(before.skillStates);
  expect(hidden.worldClocks).toEqual({ ...before.worldClocks, worldPaused: true });
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  expect((await snapshot(page)).mode).toBe('visibilityPause');
  await page.getByText('게임이 잠시 멈췄어요').click();
  expect((await snapshot(page)).mode).toBe('visibilityPause');
  await page.getByRole('button', { name: '계속하기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
});

test('390x844 resize 뒤 logical 좌표와 joystick 변환이 한 번만 적용된다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  const before = (await snapshot(page)).player;
  await page.setViewportSize({ width: 390, height: 844 });

  expect((await snapshot(page)).player).toEqual(before);
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('Canvas is not visible');
  const start = {
    x: box.x + box.width * 78 / 540,
    y: box.y + box.height * 862 / 960,
  };
  const end = { x: start.x + box.width * 50 / 540, y: start.y };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await advance(page, 1000);
  await page.mouse.up();

  const after = (await snapshot(page)).player;
  expect(after.x).toBeGreaterThan(before.x + 40);
  expect(after.x).toBeLessThanOrEqual(before.x + 160);
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.01);
});

test('countdown 중 숨김 시간은 3초 transition clock에 포함되지 않는다', async ({ page }) => {
  await openScenario(page, 'skill-selection');
  const cardTitle = (await snapshot(page)).cards.at(0)!.title;
  await page.getByRole('button', { name: cardTitle }).click();
  await advance(page, 1000);

  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 10_000);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.getByRole('button', { name: '계속하기' }).click();
  await advance(page, 1999);
  expect((await snapshot(page)).mode).toBe('countdown');
  await advance(page, 1);
  expect((await snapshot(page)).mode).toBe('playing');
});

test('skill selection은 visible 즉시 기존 modal로 돌아간다', async ({ page }) => {
  await openScenario(page, 'skill-selection');
  const cardTitle = (await snapshot(page)).cards.at(0)!.title;

  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));

  await expect(page.getByRole('button', { name: '계속하기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: cardTitle })).toBeVisible();
  expect((await snapshot(page)).mode).toBe('skillSelection');
});

test('scene restart 뒤에도 lifecycle button과 listener를 하나만 유지한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.evaluate(() => {
    (window as Window & { __TASK13_OLD_BRIDGE__?: unknown }).__TASK13_OLD_BRIDGE__
      = window.__HUCHU_TEST__;
    window.__HUCHU_TEST__!.restartScene();
  });
  await page.waitForFunction(() => (
    window.__HUCHU_TEST__ !== undefined
    && window.__HUCHU_TEST__ !== (window as Window & { __TASK13_OLD_BRIDGE__?: unknown })
      .__TASK13_OLD_BRIDGE__
  ));
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);

  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await expect(page.getByRole('button', { name: '계속하기' })).toHaveCount(1);
  await page.getByRole('button', { name: '계속하기' }).click();
  await expect(page.getByRole('button', { name: '계속하기' })).toHaveCount(0);

  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl!.getExtension('WEBGL_lose_context')!;
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension = extension;
    extension.loseContext();
  });
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension!.restoreContext();
  });
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(1);
  await page.getByRole('button', { name: '다시 그리기' }).click();
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(0);
});
