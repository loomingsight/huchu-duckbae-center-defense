import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import {
  advance,
  events,
  loadScenario,
  openScenario,
  snapshot,
} from './helpers';

const WORLD = { width: 540, height: 960 } as const;

test('기본 짖기가 가장 위협적인 적을 250ms에 공격하고 HP bar와 fixed wave pool을 유지한다', async ({ page }) => {
  await openScenario(page, 'bark-targeting');
  const before = await snapshot(page);
  const [target, other] = before.enemies;

  await advance(page, 250);

  const after = await snapshot(page);
  expect(after.enemies.find(({ id }) => id === target!.id)?.currentHp).toBe(target!.currentHp - 10);
  expect(after.enemies.find(({ id }) => id === other!.id)?.currentHp).toBe(other!.currentHp);
  expect(after.enemies.find(({ id }) => id === target!.id)?.hpBar).toMatchObject({
    visible: true,
    width: 30,
    height: 4,
  });
  const canvas = await page.locator('canvas').screenshot();
  expect(await logicalPixel(canvas, 257, 537)).toEqual(expectColor(0xf2ca45));
  expect(after.barkWavePool).toMatchObject({ created: 8, active: 1, available: 7 });
  const eventLog = await events(page);
  expect(eventLog.slice(0, 3).map(({ sequence, type }) => ({ sequence, type }))).toEqual([
    { sequence: 1, type: 'enemySpawnRequested' },
    { sequence: 2, type: 'barkStarted' },
    { sequence: 3, type: 'barkReleased' },
  ]);
  expect(eventLog.filter(({ type }) => type.startsWith('bark'))).toEqual([
    expect.objectContaining({ sequence: 2, atMs: 1000 / 60, type: 'barkStarted', attackId: 'bark:1', targetId: target!.id }),
    expect.objectContaining({ sequence: 3, atMs: 250, type: 'barkReleased', attackId: 'bark:1', targetId: target!.id }),
  ]);
});

test('lethal bark 보상과 death event는 한 번뿐이고 cast id는 deterministic unique다', async ({ page }) => {
  await openScenario(page, 'bark-targeting');
  const targetId = (await snapshot(page)).enemies.at(0)!.id;

  await advance(page, 900);

  const killed = await snapshot(page);
  const eventLog = await events(page);
  expect(killed.enemies.some(({ id }) => id === targetId)).toBe(false);
  expect(killed.snacks).toBe(1);
  expect(eventLog.filter((event) => event.type === 'enemyDied' && event.enemyId === targetId))
    .toHaveLength(1);
  expect(eventLog.filter((event) => event.type === 'snackEarned' && event.enemyId === targetId))
    .toHaveLength(1);
  expect(eventLog.filter((event) => event.type === 'barkStarted').map(({ attackId }) => attackId))
    .toEqual(['bark:1', 'bark:2']);

  await advance(page, 1000);
  expect((await snapshot(page)).snacks).toBe(1);
  expect((await events(page)).filter((event) => event.type === 'enemyDied' && event.enemyId === targetId))
    .toHaveLength(1);
});

test('windup 중 이동은 계속되고 visibility pause wall time은 release를 앞당기지 않는다', async ({ page }) => {
  await openScenario(page, 'bark-targeting');
  const before = await snapshot(page);
  const targetId = before.enemies.at(0)!.id;
  await page.keyboard.down('ArrowRight');
  await advance(page, 125);
  await page.keyboard.up('ArrowRight');
  const inWindup = await snapshot(page);
  expect(inWindup.player.x).toBeGreaterThan(before.player.x);
  expect(inWindup.enemies.find(({ id }) => id === targetId)?.currentHp).toBe(20);

  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 1000);
  expect(await snapshot(page)).toMatchObject({
    mode: 'visibilityPause',
    simulationMs: 7 * 1000 / 60,
    snacks: 0,
  });
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await advance(page, 125);

  const released = await snapshot(page);
  expect(released.simulationMs).toBe(250);
  expect(released.enemies.find(({ id }) => id === targetId)?.currentHp).toBe(10);
  expect((await events(page)).filter(({ type }) => type === 'barkReleased')).toHaveLength(1);
});

test('scenario reset은 wave pool을 재사용하고 Scene restart는 새 lifecycle pool을 만든다', async ({ page }) => {
  await openScenario(page, 'bark-targeting');
  const initial = (await snapshot(page)).barkWavePool;
  await advance(page, 250);
  expect((await snapshot(page)).barkWavePool).toEqual({ ...initial, active: 1, available: 7 });

  await loadScenario(page, 'empty-run');
  expect((await snapshot(page)).barkWavePool).toEqual({ ...initial, active: 0, available: 8 });
  await loadScenario(page, 'bark-targeting');
  await advance(page, 250);
  expect((await snapshot(page)).barkWavePool).toEqual({ ...initial, active: 1, available: 7 });

  await page.evaluate(() => window.__HUCHU_TEST__!.restartScene());
  await page.waitForFunction((instanceId) => (
    window.__HUCHU_TEST__ !== undefined
    && window.__HUCHU_TEST__.snapshot().barkWavePool.instanceId !== instanceId
  ), initial.instanceId);
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  await loadScenario(page, 'bark-targeting');

  expect((await snapshot(page)).barkWavePool).toMatchObject({
    created: 8,
    active: 0,
    available: 8,
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
