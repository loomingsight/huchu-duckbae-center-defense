import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { loadScenario, openScenario, snapshot } from './helpers';

const WORLD = { width: 540, height: 960 } as const;

test('health-bar-colors는 full HP를 포함한 초록·노랑·빨강 HP bar 3개를 고정 pool로 그린다', async ({ page }) => {
  await openScenario(page, 'health-bar-colors');

  const loaded = await snapshot(page);
  expect(loaded.enemies.map(({ currentHp, maxHp, state }) => ({ currentHp, maxHp, state }))).toEqual([
    { currentHp: 35, maxHp: 35, state: 'stunned' },
    { currentHp: 17, maxHp: 35, state: 'stunned' },
    { currentHp: 6, maxHp: 35, state: 'stunned' },
  ]);
  expect(loaded.enemies.map(({ position }) => position)).toEqual([
    { x: 170, y: 445 },
    { x: 370, y: 445 },
    { x: 270, y: 625 },
  ]);
  expect(loaded.enemyPool).toMatchObject({ created: 60, active: 3, available: 57 });

  const canvas = await page.locator('canvas').screenshot();
  expect(await logicalPixel(canvas, 157, 357)).toEqual(expectColor(0x39a852));
  expect(await logicalPixel(canvas, 357, 357)).toEqual(expectColor(0xf2ca45));
  expect(await logicalPixel(canvas, 257, 537)).toEqual(expectColor(0xd94b43));
});

test('scenario reset은 같은 60 actor pool을 releaseAll 후 재사용한다', async ({ page }) => {
  await openScenario(page, 'health-bar-colors');
  const initial = (await snapshot(page)).enemyPool;

  await loadScenario(page, 'empty-run');
  const cleared = (await snapshot(page)).enemyPool;
  await loadScenario(page, 'health-bar-colors');
  const reloaded = (await snapshot(page)).enemyPool;

  expect(cleared).toEqual({ ...initial, active: 0, available: 60 });
  expect(reloaded).toEqual(initial);
});

test('Scene restart는 destroyed actor를 재사용하지 않고 새 60 actor pool로 복구한다', async ({ page }) => {
  await openScenario(page, 'health-bar-colors');
  const previousPoolId = (await snapshot(page)).enemyPool.instanceId;

  await page.evaluate(() => window.__HUCHU_TEST__!.restartScene());
  await page.waitForFunction((instanceId) => (
    window.__HUCHU_TEST__ !== undefined
    && window.__HUCHU_TEST__.snapshot().enemyPool.instanceId !== instanceId
  ), previousPoolId);
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  await loadScenario(page, 'health-bar-colors');

  expect((await snapshot(page)).enemyPool).toMatchObject({
    created: 60,
    active: 3,
    available: 57,
  });
});

async function logicalPixel(
  image: Buffer,
  logicalX: number,
  logicalY: number,
): Promise<{ readonly red: number; readonly green: number; readonly blue: number }> {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const x = Math.min(info.width - 1, Math.floor(logicalX * info.width / WORLD.width));
  const y = Math.min(info.height - 1, Math.floor(logicalY * info.height / WORLD.height));
  const offset = (y * info.width + x) * info.channels;
  return { red: data[offset]!, green: data[offset + 1]!, blue: data[offset + 2]! };
}

function expectColor(color: number): {
  readonly red: ReturnType<typeof expect.closeTo>;
  readonly green: ReturnType<typeof expect.closeTo>;
  readonly blue: ReturnType<typeof expect.closeTo>;
} {
  return {
    red: expect.closeTo(color >> 16 & 0xff, 0),
    green: expect.closeTo(color >> 8 & 0xff, 0),
    blue: expect.closeTo(color & 0xff, 0),
  };
}
