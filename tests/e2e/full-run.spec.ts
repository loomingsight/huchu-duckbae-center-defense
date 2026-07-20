import { expect, test } from '@playwright/test';
import {
  advance,
  events,
  loadScenario,
  openScenario,
  snapshot,
} from './helpers';

const INTEGRATION_RUN_TIMEOUT_MS = 180_000;
const CANONICAL_CARD_PATH = [
  'safetyReport:1',
  'scold:1',
  'bark:2',
  'aquaBeam:1',
  'bark:3',
] as const;

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

test('완화된 integration schedule에서 canonical 전투·성장·보스·재시작을 연결한다', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', '완화된 integration schedule은 desktop에서 대표 검증한다');
  test.setTimeout(INTEGRATION_RUN_TIMEOUT_MS);

  await openScenario(page, 'canonical-combat-progression');

  const initial = await snapshot(page);
  const observedBosses = new Set<string>();
  const observedBossIds = new Map<string, number>();
  const observedBossWaves = new Map<string, number>();
  const selectedCardIds: string[] = [];
  let finalBossSpawn: { shelterHp: number; bossHp: number } | undefined;
  let finalBossFirstDamage: { shelterHp: number; bossHp: number } | undefined;
  let previousShelterHp = initial.shelterHp;
  let selections = 0;
  let selectionResumes = 0;

  for (let turn = 0; turn < 2_000; turn += 1) {
    const state = await snapshot(page);
    state.enemies.filter(({ isBoss }) => isBoss).forEach(({ id, kind }) => {
      observedBosses.add(kind);
      observedBossIds.set(kind, id);
      observedBossWaves.set(kind, state.wave);
    });
    const finalBoss = state.enemies.find(({ kind }) => kind === 'illegalBreeder');
    if (finalBoss !== undefined && finalBossSpawn === undefined) {
      finalBossSpawn = { shelterHp: state.shelterHp, bossHp: finalBoss.currentHp };
    }
    if (
      finalBoss !== undefined
      && finalBossFirstDamage === undefined
      && state.shelterHp < previousShelterHp
    ) {
      finalBossFirstDamage = { shelterHp: state.shelterHp, bossHp: finalBoss.currentHp };
    }
    previousShelterHp = state.shelterHp;
    if (state.mode === 'won') break;
    expect(
      state.mode,
      `canonical combat progression ended before victory at turn ${turn}: ${JSON.stringify({
        wave: state.wave,
        shelterHp: state.shelterHp,
        snacks: state.snacks,
        player: state.player,
        enemies: state.enemies.map(({ kind, currentHp, state: enemyState }) => ({
          kind,
          currentHp,
          state: enemyState,
        })),
        selectedCardIds,
        finalBossSpawn,
        finalBossFirstDamage,
      })}`,
    ).not.toBe('lost');

    if (state.mode === 'skillSelection') {
      expect(state.cards).toHaveLength(3);
      const expectedCardId = CANONICAL_CARD_PATH.at(selections);
      const preferred = state.cards.find(({ id }) => id === expectedCardId);
      expect(preferred, `expected canonical card ${String(expectedCardId)}`).toBeDefined();
      await page.getByRole('button', { name: preferred!.title }).click();
      selectedCardIds.push(preferred!.id);
      selections += 1;
      const selected = await snapshot(page);
      expect(selected).toMatchObject({
        mode: 'countdown',
        cards: [],
        skills: { [preferred!.skillId]: preferred!.nextLevel },
        countdown: { remainingMs: 3000 },
      });
      await advance(page, selected.countdown.remainingMs);
      expect(await snapshot(page)).toMatchObject({ mode: 'playing' });
      selectionResumes += 1;
      continue;
    }
    if (state.mode === 'countdown') {
      await advance(page, state.countdown.remainingMs);
      continue;
    }

    const bossIsNext = state.pendingSpawns === 1 && (
      (state.wave === 3 && state.snacks === 44)
      || (state.wave === 5 && state.snacks === 106)
    );
    if (state.enemies.length === 0 && bossIsNext) {
      await moveTowardEnemy(page, state.player, { x: 270, y: 0 }, 100);
      continue;
    }

    const target = [...state.enemies].sort((left, right) => left.etaMs - right.etaMs)[0];
    if (target === undefined) {
      await advance(page, 2000);
      continue;
    }
    await moveTowardEnemy(page, state.player, target.position);
  }

  const won = await snapshot(page);
  const runEvents = await events(page);
  const spawned = runEvents.filter((event) => event.type === 'enemySpawned');
  const requested = runEvents.filter((event) => event.type === 'enemySpawnRequested');
  const deaths = runEvents.filter((event) => event.type === 'enemyDied');
  const rewards = runEvents.filter((event) => event.type === 'snackEarned');
  expect(won.mode).toBe('won');
  expect(won.wave).toBe(5);
  expect(won.snacks).toBe(126);
  expect(won.activeEnemyCount).toBe(0);
  expect(won.shelterHp).toBeGreaterThan(0);
  expect(won.shelterHp).toBeLessThan(100);
  expect(observedBosses).toEqual(new Set(['dogTrader', 'illegalBreeder']));
  expect(Object.fromEntries(observedBossWaves)).toEqual({ dogTrader: 3, illegalBreeder: 5 });
  expect(selections).toBe(5);
  expect(selectionResumes).toBe(5);
  expect(selectedCardIds).toEqual(CANONICAL_CARD_PATH);
  expect(runEvents.flatMap((event) => (
    event.type === 'skillSelectionOpened'
      ? [event.request.threshold]
      : []
  ))).toEqual([8, 22, 40, 62, 88]);
  expect(runEvents.filter(({ type }) => type === 'playerMoved').length).toBeGreaterThan(0);
  expect(runEvents.filter(({ type }) => type === 'barkStarted').length).toBeGreaterThan(0);
  expect(runEvents.filter(({ type }) => type === 'barkReleased').length).toBeGreaterThan(0);
  const learnedAutoSkills = Object.entries(won.skills)
    .filter(([skillId, level]) => skillId !== 'bark' && level > 0)
    .map(([skillId]) => skillId);
  const castAutoSkills = new Set(runEvents.flatMap((event) => (
    event.type === 'skillCast' ? [event.skillId] : []
  )));
  expect(castAutoSkills).toEqual(new Set(learnedAutoSkills));
  expect(runEvents.filter(({ type }) => type === 'shelterDamaged').length).toBeGreaterThan(0);
  expect(spawned).toHaveLength(64);
  expect(deaths).toHaveLength(64);
  expect(rewards).toHaveLength(64);
  const spawnedIds = sortedUniqueIds(spawned.map(({ enemyId }) => enemyId));
  const diedIds = sortedUniqueIds(deaths.map(({ enemyId }) => enemyId));
  const rewardedIds = sortedUniqueIds(rewards.map(({ enemyId }) => enemyId));
  expect(spawnedIds).toHaveLength(64);
  expect(diedIds).toEqual(spawnedIds);
  expect(rewardedIds).toEqual(spawnedIds);
  const kindCounts = requested.reduce<Record<string, number>>((counts, { request }) => ({
    ...counts,
    [request.kind]: (counts[request.kind] ?? 0) + 1,
  }), {});
  expect(kindCounts).toEqual({
    poopGuardian: 30,
    offLeashGuardian: 32,
    dogTrader: 1,
    illegalBreeder: 1,
  });
  expect(deaths.at(-1)?.enemyId).toBe(observedBossIds.get('illegalBreeder'));
  expect(runEvents.filter((event) => event.type === 'modeChanged' && event.mode === 'won'))
    .toHaveLength(1);
  expect(runEvents.filter((event) => event.type === 'runEnded' && event.outcome === 'won'))
    .toHaveLength(1);
  expect(runEvents.filter((event) => event.type === 'resultReady' && event.outcome === 'won'))
    .toHaveLength(1);

  await expect(page.getByText('보호소를 지켰어요!')).toBeVisible();
  await page.getByRole('button', { name: '다시 시작' }).click();
  await page.waitForFunction(() => window.__HUCHU_TEST__?.snapshot().mode === 'playing');
  const restarted = await snapshot(page);
  expect(restarted).toMatchObject({
    mode: 'playing',
    wave: 1,
    shelterHp: 100,
    snacks: 0,
    skills: { bark: 1, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0 },
    activeEnemyCount: 0,
    activeProjectileCount: 0,
  });
  expect(restarted.runtime.sessionInstanceId).toBe(initial.runtime.sessionInstanceId);
  expect({
    enemies: restarted.pools.enemies.instanceId,
    projectiles: restarted.pools.projectiles.instanceId,
    effects: restarted.pools.effects.instanceId,
  }).toEqual({
    enemies: initial.pools.enemies.instanceId,
    projectiles: initial.pools.projectiles.instanceId,
    effects: initial.pools.effects.instanceId,
  });
  const restartSequence = runEvents.at(-1)?.sequence ?? 0;
  await advance(page, 1000 / 60);
  const firstProductionTick = await events(page, restartSequence);
  expect(firstProductionTick.filter(({ type }) => type === 'enemySpawned')).toHaveLength(1);
  expect((await snapshot(page)).pendingSpawns).toBe(9);
  await advance(page, 1000);
  const productionAfterOneSecond = await events(page, restartSequence);
  expect(productionAfterOneSecond.filter(({ type }) => type === 'enemySpawned')).toHaveLength(2);
  expect((await snapshot(page)).pendingSpawns).toBe(8);
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

async function moveTowardEnemy(
  page: import('@playwright/test').Page,
  player: { readonly x: number; readonly y: number },
  target: { readonly x: number; readonly y: number },
  stepMs?: number,
): Promise<void> {
  const horizontal = target.x - player.x;
  const vertical = target.y - player.y;
  const keys = [
    ...(horizontal < -24 ? ['ArrowLeft'] : horizontal > 24 ? ['ArrowRight'] : []),
    ...(vertical < -24 ? ['ArrowUp'] : vertical > 24 ? ['ArrowDown'] : []),
  ];
  for (const key of keys) await page.keyboard.down(key);
  await advance(page, stepMs ?? (keys.length === 0 ? 650 : 400));
  for (const key of keys) await page.keyboard.up(key);
}

function sortedUniqueIds(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}
