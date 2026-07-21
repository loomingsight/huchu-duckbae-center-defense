import { expect, test } from '@playwright/test';
import { TEST_SCENARIO_IDS } from '../../src/game/debug/ScenarioFactory';
import type { GameDebugSnapshot } from '../../src/game/debug/TestContract';
import { advance, events, loadScenario, openScenario, snapshot } from './helpers';

test('exact 18 scenario를 독립 load하고 event sequence를 매번 1부터 시작한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  for (const scenario of TEST_SCENARIO_IDS) {
    await loadScenario(page, scenario);
    const loaded = await snapshot(page);
    expect(loaded.run.simulationMs).toBe(0);
    expect(loaded.pools.enemies.active).toBeLessThanOrEqual(60);
    const loadedEvents = await events(page);
    expect(loadedEvents.map(({ sequence }) => sequence)).toEqual(
      Array.from({ length: loadedEvents.length }, (_, index) => index + 1),
    );
    expect(loadedEvents.every(({ atSimulationMs }) => atSimulationMs === 0)).toBe(true);
  }
});

test('scenario reset은 pool identity를 유지하고 Scene restart는 pool과 workload identity를 교체한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  const initial = poolIdentity(await snapshot(page));
  for (let iteration = 0; iteration < 3; iteration += 1) {
    await loadScenario(page, 'stress');
    const stressed = await snapshot(page);
    expect(poolIdentity(stressed)).toEqual(initial);
    expect(stressed.pools).toMatchObject({
      enemies: { created: 60, active: 60 },
      labels: { created: 60, active: 60 },
      projectiles: { created: 80, active: 80 },
      effects: { created: 120, active: 120 },
      damageNumbers: { created: 64, active: 64 },
    });
    expect(stressed.renderedVisibleEnemyLabels).toBe(60);
    await loadScenario(page, 'empty-run');
    const cleared = await snapshot(page);
    expect(poolIdentity(cleared)).toEqual(initial);
    expect(Object.values(cleared.pools).every(({ active }) => active === 0)).toBe(true);
  }

  await loadScenario(page, 'stress');
  const workloadBeforeRestart = presentationPoolIdentity(await snapshot(page));
  await page.evaluate(() => {
    (window as Window & { __PREVIOUS_BRIDGE__?: unknown }).__PREVIOUS_BRIDGE__ = window.__HUCHU_TEST__;
    window.__HUCHU_TEST__!.restartScene();
  });
  await page.waitForFunction(() => (
    window.__HUCHU_TEST__ !== undefined
    && window.__HUCHU_TEST__ !== (window as Window & { __PREVIOUS_BRIDGE__?: unknown }).__PREVIOUS_BRIDGE__
  ));
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  const restarted = poolIdentity(await snapshot(page));
  for (const name of Object.keys(initial) as (keyof typeof initial)[]) {
    expect(restarted[name].instanceId).not.toBe(initial[name].instanceId);
    expect(restarted[name].created).toBe(initial[name].created);
  }

  await loadScenario(page, 'stress');
  const workloadAfterRestart = presentationPoolIdentity(await snapshot(page));
  for (const name of Object.keys(workloadBeforeRestart) as (keyof typeof workloadBeforeRestart)[]) {
    expect(workloadAfterRestart[name]).not.toBe(workloadBeforeRestart[name]);
  }
});

test('fractional scheduler와 exclusive event cursor는 scenario load에서 원자 reset된다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await advance(page, 10);
  await loadScenario(page, 'bark-cone');
  await advance(page, 1000);
  const first = await events(page, 0);
  expect(first[0]?.sequence).toBe(1);
  const cursor = first.at(-1)?.sequence ?? 0;
  expect((await events(page, cursor)).every(({ sequence }) => sequence > cursor)).toBe(true);
  await loadScenario(page, 'empty-run');
  await advance(page, 7);
  expect((await snapshot(page)).run.simulationMs).toBe(0);
  await advance(page, 10);
  expect((await snapshot(page)).run.simulationMs).toBeCloseTo(1000 / 60, 6);
});

function poolIdentity(state: GameDebugSnapshot) {
  return {
    enemies: pick(state.pools.enemies),
    labels: pick(state.pools.labels),
    projectiles: pick(state.pools.projectiles),
    effects: pick(state.pools.effects),
    damageNumbers: pick(state.pools.damageNumbers),
  };
}

function presentationPoolIdentity(state: GameDebugSnapshot) {
  const stress = state.presentationStress;
  if (stress === null) throw new Error('Missing presentation stress telemetry');
  return {
    effects: stress.effects.poolInstanceId,
    projectileLogic: stress.projectiles.logicalPoolInstanceId,
    projectileView: stress.projectiles.viewPoolInstanceId,
    damageNumbers: stress.damageNumbers.poolInstanceId,
  };
}

function pick(pool: GameDebugSnapshot['pools']['enemies']): { readonly instanceId: number; readonly created: number } {
  return { instanceId: pool.instanceId, created: pool.created };
}
