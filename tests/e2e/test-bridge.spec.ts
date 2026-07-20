import { expect, test } from '@playwright/test';
import { events, loadScenario, openScenario, snapshot } from './helpers';

const scenarios = [
  'empty-run',
  'wave-schedule',
  'bark-targeting',
  'poop-attack',
  'health-bar-colors',
  'skill-selection',
  'all-skills',
  'boss',
  'final-enemy',
  'shelter-defeat',
  'stress',
] as const;

for (const scenario of scenarios) {
  test(`${scenario}를 독립적으로 load한다`, async ({ page }) => {
    await openScenario(page, scenario);
    const loaded = await snapshot(page);
    expect(loaded.simulationMs).toBe(0);
    expect(loaded.pools.enemies.active).toBeLessThanOrEqual(60);
    const loadedEvents = await events(page);
    expect(loadedEvents.map(({ sequence }) => sequence)).toEqual(
      Array.from({ length: loadedEvents.length }, (_, index) => index + 1),
    );
    expect(loadedEvents.every(({ atMs }) => atMs === 0)).toBe(true);

    await loadScenario(page, 'empty-run');
    expect((await snapshot(page)).pools).toMatchObject({
      enemies: { active: 0 },
      projectiles: { active: 0 },
      effects: { active: 0 },
    });
  });
}

test('같은 page에서 stress를 세 번 다시 로드해도 pool instance와 created count가 유지된다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  const identity = (pools: Awaited<ReturnType<typeof snapshot>>['pools']) => ({
    enemies: { instanceId: pools.enemies.instanceId, created: pools.enemies.created },
    projectiles: { instanceId: pools.projectiles.instanceId, created: pools.projectiles.created },
    effects: { instanceId: pools.effects.instanceId, created: pools.effects.created },
  });
  const initialIdentity = identity((await snapshot(page)).pools);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await loadScenario(page, 'stress');
    const stressed = await snapshot(page);
    expect(identity(stressed.pools)).toEqual(initialIdentity);
    expect(stressed.pools).toMatchObject({
      enemies: { created: 60, active: 60 },
      projectiles: { created: 80, active: 80 },
      effects: { created: 120, active: 120 },
    });
    expect(stressed.projectilePool).toMatchObject({ created: 80, active: 80 });

    await loadScenario(page, 'empty-run');
    const cleared = await snapshot(page);
    expect(identity(cleared.pools)).toEqual(initialIdentity);
    expect(cleared.pools).toMatchObject({
      enemies: { active: 0 },
      projectiles: { active: 0 },
      effects: { active: 0 },
    });
    expect(cleared.projectilePool).toMatchObject({ created: 80, active: 0 });
  }
});

test('scenario load는 fractional scheduler와 event sequence를 원자적으로 reset한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.evaluate(() => window.__HUCHU_TEST__!.advance(10));
  await loadScenario(page, 'stress');

  const initialEvents = await page.evaluate(() => window.__HUCHU_TEST__!.eventsSince(0));
  expect(initialEvents.map(({ sequence }) => sequence)).toEqual(
    Array.from({ length: initialEvents.length }, (_, index) => index + 1),
  );
  expect(initialEvents.at(0)).toMatchObject({ sequence: 1, atMs: 0 });
  expect(initialEvents.every(({ atMs }) => atMs === 0)).toBe(true);

  await page.evaluate(() => window.__HUCHU_TEST__!.advance(7));
  expect((await snapshot(page)).simulationMs).toBe(0);
  await page.evaluate(() => window.__HUCHU_TEST__!.advance(10));
  expect((await snapshot(page)).simulationMs).toBeCloseTo(1000 / 60, 6);

  await loadScenario(page, 'skill-selection');
  expect((await snapshot(page)).simulationMs).toBe(0);
  await expect(page.getByRole('button')).toHaveCount(3);
  await loadScenario(page, 'shelter-defeat');
  expect(await snapshot(page)).toMatchObject({ simulationMs: 0, mode: 'lost', shelterFrame: 3 });
  await loadScenario(page, 'empty-run');
  expect((await snapshot(page)).pools).toMatchObject({
    enemies: { active: 0 },
    projectiles: { active: 0 },
    effects: { active: 0 },
  });
  await expect(page.getByRole('button')).toHaveCount(0);
});
