import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('시작 버튼은 WebGL Game scene과 단일 HUD overlay를 연다', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('후추덕배 디펜스');
  await expect(page.locator('#game-root')).toHaveAttribute('aria-label', '후추덕배 디펜스');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveJSProperty('width', 540);
  await expect(canvas).toHaveJSProperty('height', 960);
  await page.getByRole('button', { name: '함께 출발하기' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Game');
  await expect(page.locator('#game-root')).toHaveAttribute('data-renderer', 'webgl');
  await expect(page.locator('.hud-overlay')).toHaveCount(1);
});

test('첫 Game frame에 후추·덕배와 수동 기술 HUD가 함께 활성화된다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  const initial = await snapshot(page);
  expect(initial.player).toEqual({ x: 270, y: 650 });
  expect(initial.run.companion).toMatchObject({ companion: 'deokbae', active: true });
  expect(initial.hud.companion).toEqual({ label: '덕배 · 자동', ready: true });
  expect(initial.hud.actions.buttons.map(({ id }) => id)).toEqual([
    'bark', 'tailSwipe', 'aquaBeam', 'safetyReport',
  ]);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.hud-overlay')).toHaveCount(1);
  await expect(page.locator('.action-dock')).toHaveAttribute('aria-label', '후추 기술');
  await expect(page.locator('.action-button')).toHaveCount(4);
  await expect(page.getByText('덕배 · 자동', { exact: true })).toBeVisible();
  await expect(page.locator('.companion-status')).toHaveAttribute('aria-label', '덕배 · 자동');
});

test('일반 URL과 불완전한 query는 debug bridge를 노출하지 않는다', async ({ page }) => {
  for (const query of ['', '?clock=manual', '?e2e=1']) {
    await page.goto(`/${query}`);
    await page.getByRole('button', { name: '함께 출발하기' }).click();
    await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Game');
    expect(await page.evaluate(() => window.__HUCHU_TEST__)).toBeUndefined();
  }
});

test('manual clock과 visibility resume은 world 시간을 한 번만 진행한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  expect((await snapshot(page)).run.simulationMs).toBe(0);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 1000);
  expect((await snapshot(page)).run).toMatchObject({ mode: 'visibilityPause', simulationMs: 0 });
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.getByRole('button', { name: '계속하기' }).click();
  await advance(page, 1000);
  expect((await snapshot(page)).run).toMatchObject({ mode: 'playing', simulationMs: 1000 });
});

test('키보드는 후추를 150px/s 이동시킨다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  const before = (await snapshot(page)).player;
  await page.keyboard.down('ArrowRight');
  await advance(page, 1000);
  await page.keyboard.up('ArrowRight');
  const after = (await snapshot(page)).player;
  expect(after.x - before.x).toBeCloseTo(150, 0);
  expect(after.y).toBeCloseTo(before.y, 8);
});

test('390x844 DOM joystick 중심 drag와 Scene restart는 입력·overlay ownership을 보존한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'empty-run');
  const before = (await snapshot(page)).player;
  const joystick = page.locator('.virtual-joystick');
  const box = await joystick.boundingBox();
  if (box === null) throw new Error('Virtual joystick is not visible');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await joystick.dispatchEvent('pointerdown', {
    pointerId: 1, pointerType: 'touch', clientX: center.x, clientY: center.y, bubbles: true,
  });
  await joystick.dispatchEvent('pointermove', {
    pointerId: 1, pointerType: 'touch', clientX: center.x + 46, clientY: center.y, bubbles: true,
  });
  await advance(page, 1000);
  await joystick.dispatchEvent('pointerup', {
    pointerId: 1, pointerType: 'touch', clientX: center.x + 46, clientY: center.y, bubbles: true,
  });
  expect((await snapshot(page)).player.x - before.x).toBeCloseTo(150, 0);

  await page.evaluate(() => {
    (window as Window & { __OLD_BRIDGE__?: unknown }).__OLD_BRIDGE__ = window.__HUCHU_TEST__;
    window.__HUCHU_TEST__!.restartScene();
  });
  await page.waitForFunction(() => (
    window.__HUCHU_TEST__ !== undefined
    && window.__HUCHU_TEST__ !== (window as Window & { __OLD_BRIDGE__?: unknown }).__OLD_BRIDGE__
  ));
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  await expect(page.locator('.hud-overlay')).toHaveCount(1);
});
