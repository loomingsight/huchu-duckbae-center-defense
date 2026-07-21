import { expect, test } from '@playwright/test';
import type { GameDebugEvent } from '../../src/game/debug/TestContract';
import { advance, events, openScenario, runFullGame, snapshot } from './helpers';

test('2배 출현 빈도는 exact 3 seed에서 승리와 패배가 모두 재현된다', async ({ page }) => {
  test.setTimeout(120_000);
  const durations: number[] = [];
  const outcomes = new Set<'won' | 'lost'>();
  const expectedWaveRanges = [
    [20_000, 35_000],
    [25_000, 45_000],
    [30_000, 50_000],
    [40_000, 70_000],
    [55_000, 90_000],
  ] as const;
  for (const seed of [104729, 130363, 155921]) {
    const result = await runFullGame(page, { seed, policy: 'threat-orbit-v2' });
    const runLog = await events(page);
    expect(result).toMatchObject({
      seed,
      shelterMaxHp: 1000,
      spawnCount: 68,
      purchaseCount: 3,
      countdowns: [3000, 3000, 3000, 3000],
    });
    expect(result.waveDurationsMs).toHaveLength(result.outcome === 'won' ? 5 : 4);
    result.waveDurationsMs.forEach((durationMs, index) => {
      const [minimumMs, maximumMs] = expectedWaveRanges[index]!;
      expect(durationMs, `seed ${seed} W${index + 1} lower bound`).toBeGreaterThanOrEqual(minimumMs);
      expect(durationMs, `seed ${seed} W${index + 1} upper bound`).toBeLessThanOrEqual(maximumMs);
    });
    if (result.outcome === 'won') expect(result.finalShelterHp).toBeGreaterThan(0);
    else expect(result.finalShelterHp).toBe(0);
    expect(result.durationMs - result.simulationMs).toBeGreaterThanOrEqual(12_000);
    expect(result.durationMs - result.simulationMs).toBeLessThan(12_500);
    expect([...result.bossKinds].sort()).toEqual(['dogTrader', 'illegalBreeder']);
    expect(bossSpawnWaves(runLog)).toEqual([
      { wave: 4, kind: 'dogTrader' },
      { wave: 5, kind: 'illegalBreeder' },
    ]);
    expectIllegalBreederElectricAttack(runLog);
    outcomes.add(result.outcome);
    durations.push(result.durationMs);
  }
  expect(outcomes).toEqual(new Set(['won', 'lost']));
  const median = [...durations].sort((left, right) => left - right)[1];
  expect(median).toBeGreaterThanOrEqual(180_000);
  expect(median).toBeLessThanOrEqual(300_000);
});

test('W5 final clear와 shelter HP 0이 같은 fixed step이면 lost가 우선한다', async ({ page }) => {
  await openScenario(page, 'full-run', 104729);
  await page.evaluate(() => window.__HUCHU_TEST__!.prepareTerminalTieForTest());
  await advance(page, 250);
  expect((await snapshot(page)).run.mode).toBe('lost');
  const lostLog = await events(page);
  const ended = lostLog.filter((event) => event.type === 'runEnded' && event.outcome === 'lost');
  expect(ended).toHaveLength(1);
  expect(lostLog.filter((event) => event.type === 'runEnded' && event.outcome === 'won')).toHaveLength(0);
  const lethal = lostLog.find((event) => event.type === 'damageApplied' && event.lethal);
  const shelterFailed = lostLog.find((event) => event.type === 'shelterDamaged' && event.hp === 0);
  expect(lethal).toBeDefined();
  expect(shelterFailed).toBeDefined();
  if (lethal?.type !== 'damageApplied' || shelterFailed?.type !== 'shelterDamaged') {
    throw new Error('Terminal tie did not expose canonical damage events');
  }
  expect(lethal.appliedAtStep).toBe(shelterFailed.appliedAtStep);
  expect(lostLog.filter(({ type }) => type === 'resultReady')).toHaveLength(0);
  await advance(page, 1199);
  expect((await events(page)).filter(({ type }) => type === 'resultReady')).toHaveLength(0);
  await advance(page, 1);
  const ready = (await events(page)).filter((event) => event.type === 'resultReady' && event.outcome === 'lost');
  expect(ready).toHaveLength(1);
  expect(ready[0]!.sequence).toBeGreaterThan(ended[0]!.sequence);
  await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Result');
  await expect(page).toHaveTitle('후추덕배 디펜스');
  await expect(page.locator('#game-root')).toHaveAttribute('aria-label', '후추덕배 디펜스');
  await expect(page.getByRole('heading', { name: '다시 지켜볼까요?' })).toBeVisible();
  await expect(page.getByRole('button', { name: '보호소 지키기' })).toBeVisible();
});

function bossSpawnWaves(log: readonly GameDebugEvent[]): readonly Readonly<{
  wave: number;
  kind: 'dogTrader' | 'illegalBreeder';
}>[] {
  let activeWave: number | null = null;
  const bosses: Array<Readonly<{
    wave: number;
    kind: 'dogTrader' | 'illegalBreeder';
  }>> = [];
  for (const event of log) {
    if (event.type === 'waveStarted') activeWave = event.wave;
    if (
      event.type !== 'enemySpawned'
      || (event.request.kind !== 'dogTrader' && event.request.kind !== 'illegalBreeder')
    ) continue;
    if (activeWave === null) throw new Error(`Boss ${event.request.kind} spawned before waveStarted`);
    bosses.push({ wave: activeWave, kind: event.request.kind });
  }
  return bosses;
}

function expectIllegalBreederElectricAttack(log: readonly GameDebugEvent[]): void {
  const spawn = log.find((event) => (
    event.type === 'enemySpawned' && event.request.kind === 'illegalBreeder'
  ));
  expect(spawn).toBeDefined();
  if (spawn?.type !== 'enemySpawned') throw new Error('W5 illegal breeder spawn is missing');

  const started = log.find((event) => (
    event.type === 'attackStarted'
    && event.kind === 'illegalBreeder'
    && event.enemyId === spawn.enemyId
  ));
  expect(started).toBeDefined();
  if (started?.type !== 'attackStarted') throw new Error('Illegal breeder attack start is missing');

  const requested = log.find((event) => (
    event.type === 'projectileRequested'
    && event.kind === 'illegalBreeder'
    && event.enemyId === spawn.enemyId
    && event.castId === started.castId
    && event.projectileKind === 'electric'
  ));
  expect(requested).toBeDefined();
  if (requested?.type !== 'projectileRequested') {
    throw new Error('Illegal breeder electric projectile request is missing');
  }
  expect(requested).toMatchObject({ speed: 260, damage: 160, lifeMs: 1200 });

  expect(log.some((event) => (
    event.type === 'projectileHit'
    && event.castId === requested.castId
    && event.sourceEnemyId === spawn.enemyId
    && event.sourceEnemyKind === 'illegalBreeder'
    && event.projectileKind === 'electric'
  ))).toBe(true);
}
