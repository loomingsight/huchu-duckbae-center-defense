import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('시작 버튼으로 GameScene에 진입한다', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveJSProperty('width', 540);
  await expect(canvas).toHaveJSProperty('height', 960);
  await page.getByRole('button', { name: '보호소 지키기' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Game');
  await expect(page.locator('#game-root')).toHaveAttribute('data-renderer', 'webgl');
});

test('일반 빌드 URL에서는 E2E 브릿지를 노출하지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '보호소 지키기' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Game');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__HUCHU_TEST__)).toBeUndefined();
});

test('E2E 브릿지는 URL 수동 시계 조건도 모두 필요하다', async ({ page }) => {
  for (const query of ['?clock=manual', '?e2e=1']) {
    await page.goto(`/${query}`);
    await page.getByRole('button', { name: '보호소 지키기' }).click();
    await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Game');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__HUCHU_TEST__)).toBeUndefined();
  }
});

test('수동 시계는 wall time으로 이중 진행하지 않는다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  expect((await snapshot(page)).simulationMs).toBe(0);
  await page.waitForTimeout(100);
  expect((await snapshot(page)).simulationMs).toBe(0);
  await advance(page, 1000);
  expect((await snapshot(page)).simulationMs).toBe(1000);
});

test('가시성 일시정지 중에는 수동 tick과 애니메이션 시간을 진행하지 않는다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 1000);
  expect(await snapshot(page)).toMatchObject({ mode: 'visibilityPause', simulationMs: 0 });
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.getByRole('button', { name: '계속하기' }).click();
  await advance(page, 1000);
  expect(await snapshot(page)).toMatchObject({ mode: 'playing', simulationMs: 1000 });
});

test('가시성 일시정지의 부분 ms도 resume 후 tick에 합치지 않는다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 8);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.getByRole('button', { name: '계속하기' }).click();
  await advance(page, 9);
  expect((await snapshot(page)).simulationMs).toBe(0);
  await advance(page, 8);
  expect((await snapshot(page)).simulationMs).toBeCloseTo(1000 / 60, 12);
});

test('stress가 아닌 시나리오에서 flush 없는 진행을 거부한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  const message = await page.evaluate(() => {
    try {
      window.__HUCHU_TEST__!.advanceWithoutFlush(1000);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(message).toBe('advanceWithoutFlush is only available for the stress scenario');
  expect((await snapshot(page)).simulationMs).toBe(0);
});

test('키보드로 후추가 150px/s 이동한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  const before = (await snapshot(page)).player;
  await page.keyboard.down('ArrowRight');
  await advance(page, 1000);
  await page.keyboard.up('ArrowRight');
  const after = (await snapshot(page)).player;
  expect(after.x - before.x).toBeCloseTo(150, 0);
});

test('mobile touch pointer drag가 조이스틱 최대 속도로 이동한다', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'empty-run');
  const before = await snapshot(page);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const scale = box.width / 540;
  const base = { x: box.x + 78 * scale, y: box.y + 862 * scale };
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: base.x,
    clientY: base.y,
    bubbles: true,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: base.x + 48 * scale,
    clientY: base.y,
    bubbles: true,
  });
  await advance(page, 1000);
  await canvas.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'touch',
    clientX: base.x + 48 * scale,
    clientY: base.y,
    bubbles: true,
  });
  const distance = (await snapshot(page)).player.x - before.player.x;
  expect(distance).toBeGreaterThanOrEqual(145);
  expect(distance).toBeLessThanOrEqual(151);
});

test('mobile 조이스틱은 pointer 소유·release·키보드 우선을 유지한다', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'empty-run');
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const scale = box.width / 540;
  const base = { x: box.x + 78 * scale, y: box.y + 862 * scale };

  await canvas.dispatchEvent('pointerdown', {
    pointerId: 1, pointerType: 'touch', clientX: base.x, clientY: base.y, bubbles: true,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId: 1, pointerType: 'touch', clientX: base.x + 48 * scale, clientY: base.y, bubbles: true,
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 2, pointerType: 'touch', clientX: base.x, clientY: base.y, bubbles: true,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId: 2, pointerType: 'touch', clientX: base.x - 48 * scale, clientY: base.y, bubbles: true,
  });
  await advance(page, 500);
  expect((await snapshot(page)).player.x).toBeCloseTo(345, 0);

  await canvas.dispatchEvent('pointerup', {
    pointerId: 1, pointerType: 'touch', clientX: base.x + 48 * scale, clientY: base.y, bubbles: true,
  });
  const released = (await snapshot(page)).player.x;
  await advance(page, 250);
  expect((await snapshot(page)).player.x).toBe(released);

  await canvas.dispatchEvent('pointerdown', {
    pointerId: 3, pointerType: 'touch', clientX: base.x, clientY: base.y, bubbles: true,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId: 3, pointerType: 'touch', clientX: base.x - 48 * scale, clientY: base.y, bubbles: true,
  });
  await page.keyboard.down('ArrowRight');
  await advance(page, 500);
  await page.keyboard.up('ArrowRight');
  await canvas.dispatchEvent('pointercancel', {
    pointerId: 3, pointerType: 'touch', clientX: base.x - 48 * scale, clientY: base.y, bubbles: true,
  });
  const canceled = (await snapshot(page)).player.x;
  expect(canceled).toBeCloseTo(released + 75, 0);
  await advance(page, 250);
  expect((await snapshot(page)).player.x).toBe(canceled);
});

test('native pointer와 Phaser touch의 같은 숫자 ID를 서로 다른 소유자로 처리한다', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'empty-run');
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const scale = box.width / 540;
  const base = { x: box.x + 78 * scale, y: box.y + 862 * scale };
  const touchAt = (clientX: number) => ({
    identifier: 99,
    clientX,
    clientY: base.y,
    pageX: clientX,
    pageY: base.y,
    screenX: clientX,
    screenY: base.y,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
  });

  await canvas.dispatchEvent('pointerdown', {
    pointerId: 1, pointerType: 'touch', clientX: base.x, clientY: base.y, bubbles: true,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId: 1, pointerType: 'touch', clientX: base.x + 48 * scale, clientY: base.y, bubbles: true,
  });
  const touchStart = touchAt(base.x);
  await canvas.dispatchEvent('touchstart', {
    touches: [touchStart], targetTouches: [touchStart], changedTouches: [touchStart], bubbles: true,
  });
  const touchMove = touchAt(base.x - 48 * scale);
  await canvas.dispatchEvent('touchmove', {
    touches: [touchMove], targetTouches: [touchMove], changedTouches: [touchMove], bubbles: true,
  });

  await advance(page, 500);
  expect((await snapshot(page)).player.x).toBeCloseTo(345, 0);
});
