import { expect, test } from '@playwright/test';
import {
  advance,
  events,
  loadScenario,
  openScenario,
  snapshot,
} from './helpers';

test('W3 개장수 보스 bar와 900ms notice를 fixed UI time으로 표시한다', async ({ page }) => {
  await openScenario(page, 'boss');

  expect((await snapshot(page)).hud.bossBar).toEqual({
    name: '개장수',
    width: 280,
    height: 12,
    noticeVisible: true,
  });
  await advance(page, 899);
  expect((await snapshot(page)).hud.bossBar?.noticeVisible).toBe(true);
  await advance(page, 1);
  expect((await snapshot(page)).hud.bossBar?.noticeVisible).toBe(false);
});

test('보호소 0은 failed frame을 1200ms 유지한 뒤 같은 runtime으로 재시작한다', async ({ page }) => {
  await openScenario(page, 'shelter-defeat');
  const beforeRestart = await snapshot(page);
  await page.evaluate(() => {
    (window as Window & { __TASK12_BRIDGE__?: unknown }).__TASK12_BRIDGE__ = window.__HUCHU_TEST__;
  });

  expect(beforeRestart).toMatchObject({ mode: 'lost', shelterHp: 0, shelterFrame: 3 });
  expect(beforeRestart.worldClocks).toMatchObject({
    worldPaused: true,
    shelterEffectAgeMs: 0,
  });
  await advance(page, 1199);
  const held = await snapshot(page);
  expect(held.worldClocks).toMatchObject({
    worldPaused: true,
    worldAnimationMs: beforeRestart.worldClocks.worldAnimationMs,
    barkAnimationElapsedMs: beforeRestart.worldClocks.barkAnimationElapsedMs,
    barkEffectAgesMs: beforeRestart.worldClocks.barkEffectAgesMs,
    projectileEffectAgesMs: beforeRestart.worldClocks.projectileEffectAgesMs,
    skillEffectAgesMs: beforeRestart.worldClocks.skillEffectAgesMs,
    offLeashEffectAgeMs: beforeRestart.worldClocks.offLeashEffectAgeMs,
  });
  expect(held.worldClocks.shelterEffectAgeMs).toBeCloseTo(71 * 1000 / 60, 6);
  await expect(page.getByText('다시 지켜볼까요?')).not.toBeVisible();
  await advance(page, 1);
  expect((await snapshot(page)).worldClocks.shelterEffectAgeMs).toBeNull();
  await expect(page.getByText('다시 지켜볼까요?')).toBeVisible();
  const lossEvents = await events(page);
  expect(lossEvents.filter((event) => event.type === 'modeChanged' && event.mode === 'lost'))
    .toHaveLength(1);
  expect(lossEvents.filter((event) => event.type === 'runEnded' && event.outcome === 'lost'))
    .toHaveLength(1);
  expect(lossEvents.filter((event) => event.type === 'resultReady' && event.outcome === 'lost'))
    .toHaveLength(1);

  await page.getByRole('button', { name: '다시 시작' }).click();
  await page.waitForFunction(() => {
    const state = window.__HUCHU_TEST__?.snapshot();
    return state?.mode === 'playing' && state.wave === 1 && state.shelterHp === 100;
  });
  let restarted = await snapshot(page);

  expect(restarted).toMatchObject({
    mode: 'playing',
    wave: 1,
    shelterHp: 100,
    snacks: 0,
    skills: { bark: 1, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0 },
    skillStates: {
      bark: { level: 1, cooldownRemainingMs: 0 },
      scold: { level: 0, cooldownRemainingMs: 0 },
      aquaBeam: { level: 0, cooldownRemainingMs: 0 },
      deokbaeHowl: { level: 0, cooldownRemainingMs: 0 },
      safetyReport: { level: 0, cooldownRemainingMs: 0 },
    },
    pools: {
      enemies: { active: 0 },
      projectiles: { active: 0 },
      effects: { active: 0 },
    },
  });
  expect(restarted.runtime.sessionInstanceId).toBe(beforeRestart.runtime.sessionInstanceId);
  expect({
    enemies: restarted.pools.enemies.instanceId,
    projectiles: restarted.pools.projectiles.instanceId,
    effects: restarted.pools.effects.instanceId,
  }).toEqual({
    enemies: beforeRestart.pools.enemies.instanceId,
    projectiles: beforeRestart.pools.projectiles.instanceId,
    effects: beforeRestart.pools.effects.instanceId,
  });
  expect(await page.evaluate(() => (
    (window as Window & { __TASK12_BRIDGE__?: unknown }).__TASK12_BRIDGE__
      === window.__HUCHU_TEST__
  ))).toBe(true);

  for (let restart = 1; restart < 3; restart += 1) {
    await loadScenario(page, 'shelter-defeat');
    await advance(page, 1200);
    await page.getByRole('button', { name: '다시 시작' }).click();
    await page.waitForFunction(() => {
      const state = window.__HUCHU_TEST__?.snapshot();
      return state?.mode === 'playing' && state.wave === 1 && state.shelterHp === 100;
    });
    restarted = await snapshot(page);
    expect(restarted.runtime.sessionInstanceId).toBe(beforeRestart.runtime.sessionInstanceId);
    expect({
      enemies: restarted.pools.enemies.instanceId,
      projectiles: restarted.pools.projectiles.instanceId,
      effects: restarted.pools.effects.instanceId,
    }).toEqual({
      enemies: beforeRestart.pools.enemies.instanceId,
      projectiles: beforeRestart.pools.projectiles.instanceId,
      effects: beforeRestart.pools.effects.instanceId,
    });
  }

  const lastSequence = (await events(page)).at(-1)?.sequence ?? 0;
  await advance(page, 1000 / 60);
  expect((await snapshot(page)).pools.enemies.active).toBe(1);
  expect((await events(page, lastSequence)).filter(({ type }) => type === 'enemySpawned'))
    .toHaveLength(1);
});

test('W5 불법번식업자 마지막 적의 정상 Bark death 뒤 승리를 한 번만 확정한다', async ({ page }) => {
  await openScenario(page, 'final-enemy');
  expect((await snapshot(page)).hud.bossBar?.name).toBe('불법번식업자');

  await advance(page, 300);
  await expect(page.getByText('보호소를 지켰어요!')).toBeVisible();
  await advance(page, 5000);

  const runEvents = await events(page);
  expect(runEvents.filter(({ type }) => type === 'runEnded')).toHaveLength(1);
  expect(runEvents.filter(({ type }) => type === 'resultReady')).toHaveLength(1);
  expect(runEvents.filter((event) => event.type === 'modeChanged' && event.mode === 'won'))
    .toHaveLength(1);
});

test('actual WaveSystem이 W1부터 W5까지 64 spawn과 네 3초 전환으로 완주한다', async ({ page }) => {
  await openScenario(page, 'wave-schedule');
  await advance(page, 120_000);

  const runEvents = await events(page);
  expect(runEvents.flatMap((event) => event.type === 'waveStarted' ? [event.wave] : []))
    .toEqual([1, 2, 3, 4, 5]);
  expect(runEvents.filter(({ type }) => type === 'enemySpawned')).toHaveLength(64);
  const transitions = runEvents.flatMap((event) => (
    event.type === 'waveTransition' ? [event] : []
  ));
  expect(transitions).toHaveLength(4);
  expect(transitions.every(({ countdownMs }) => countdownMs === 3000)).toBe(true);
  expect(runEvents.filter(({ type }) => type === 'skillSelectionOpened')).toHaveLength(0);
  expect(await snapshot(page)).toMatchObject({
    mode: 'won',
    shelterHp: 100,
    snacks: 0,
    activeEnemyCount: 0,
  });
});

test('wave-schedule 승리 재시작은 auto-clear maintainer를 제거하고 첫 적을 유지한다', async ({ page }) => {
  await openScenario(page, 'wave-schedule');
  await advance(page, 120_000);
  await expect(page.getByText('보호소를 지켰어요!')).toBeVisible();

  await page.getByRole('button', { name: '다시 시작' }).click();
  await page.waitForFunction(() => window.__HUCHU_TEST__?.snapshot().mode === 'playing');
  const lastSequence = (await events(page)).at(-1)?.sequence ?? 0;

  await advance(page, 1000 / 60);

  expect(await snapshot(page)).toMatchObject({
    mode: 'playing',
    wave: 1,
    activeEnemyCount: 1,
    pools: { enemies: { active: 1 } },
  });
  expect((await events(page, lastSequence)).filter(({ type }) => type === 'enemySpawned'))
    .toHaveLength(1);
});

test('clear tick은 countdown을 차감하지 않고 완료 tick에도 다음 wave spawn을 실행하지 않는다', async ({ page }) => {
  await openScenario(page, 'wave-schedule');
  await advance(page, 9000);
  await advance(page, 1000 / 60);
  const transitionSequence = (await events(page)).find(({ type }) => type === 'waveTransition')
    ?.sequence ?? 0;

  expect(transitionSequence).toBeGreaterThan(0);
  expect((await snapshot(page)).wave).toBe(1);
  await advance(page, 2999);
  expect((await snapshot(page)).wave).toBe(1);
  await advance(page, 1);
  expect(await snapshot(page)).toMatchObject({ wave: 2, activeEnemyCount: 0 });
  const completionEvents = await events(page, transitionSequence);
  expect(completionEvents.filter((event) => event.type === 'waveStarted' && event.wave === 2))
    .toHaveLength(1);
  expect(completionEvents.filter(({ type }) => type === 'enemySpawned')).toHaveLength(0);

  const lastSequence = completionEvents.at(-1)?.sequence ?? transitionSequence;
  await advance(page, 1000 / 60);
  expect((await events(page, lastSequence)).filter(({ type }) => type === 'enemySpawned'))
    .toHaveLength(1);
});
