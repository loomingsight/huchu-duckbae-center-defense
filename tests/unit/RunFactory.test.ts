import { FIXED_STEP_MS } from '../../src/game/constants';
import type { GameEvent } from '../../src/game/events/GameEvents';
import { GameSession } from '../../src/game/session/GameSession';

const PLAYER = { x: 270, y: 650 } as const;

it('reset은 모든 run state를 초기화하고 같은 projectile pool capacity를 세 번 재사용한다', () => {
  const run = GameSession.create({ seed: 7 });
  const initialPool = run.scenarioPortForE2e().projectilePoolTelemetry();
  for (let step = 0; step < 180; step += 1) run.step(FIXED_STEP_MS, PLAYER);
  expect(run.snapshot().activeEnemyCount).toBeGreaterThan(0);

  for (const seed of [424242, 2, 3]) run.reset(seed);

  expect(run.snapshot()).toMatchObject({
    mode: 'playing',
    simulationMs: 0,
    wave: 1,
    shelterHp: 100,
    snacks: 0,
    skills: { bark: 1, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0 },
    activeEnemyCount: 0,
    activeProjectileCount: 0,
  });
  expect(run.scenarioPortForE2e().projectilePoolTelemetry()).toEqual(initialPool);

  const firstTick = run.step(FIXED_STEP_MS, PLAYER);
  expect(firstTick.filter(({ type }) => type === 'waveStarted')).toEqual([
    { type: 'waveStarted', wave: 1 },
  ]);
  expect(firstTick.filter(({ type }) => type === 'enemySpawned')).toHaveLength(1);
  expect(run.snapshot().activeEnemyCount).toBe(1);
});

it('clear와 skill due가 겹치면 selection 뒤 transition 하나와 정확히 180 UI tick을 사용한다', () => {
  const run = GameSession.create({ seed: 1 });
  run.scenarioPortForE2e().suppressWaveSpawns();
  for (let index = 0; index < 4; index += 1) {
    const enemyId = run.scenarioPortForE2e().spawnEnemy({
      kind: 'offLeashGuardian',
      variant: index % 2 === 0 ? 'male' : 'female',
      pathId: 'P6',
      placement: { kind: 'worldPoint', x: 270 + index, y: 725 },
      currentHp: 1,
      maxHp: 65,
    });
    run.scenarioPortForE2e().damageEnemy(enemyId, 1);
  }

  const clearEvents = run.step(FIXED_STEP_MS, PLAYER);
  expect(run.snapshot()).toMatchObject({ mode: 'skillSelection', wave: 1, snacks: 8 });
  expect(clearEvents.filter(({ type }) => type === 'waveTransition')).toEqual([]);
  expect(clearEvents.filter(({ type }) => type === 'skillSelectionOpened')).toHaveLength(1);

  const card = run.currentCards().at(0)!;
  const selectEvents = run.selectCard(card.id);
  expect(selectEvents.filter(({ type }) => type === 'waveTransition')).toEqual([
    { type: 'waveTransition', fromWave: 1, toWave: 2, countdownMs: 3000 },
  ]);
  expect(run.countdownState()).toEqual({ kind: 'nextWave', remainingMs: 3000 });

  const beforeBoundary: GameEvent[] = [];
  for (let tick = 0; tick < 179; tick += 1) {
    beforeBoundary.push(...run.step(FIXED_STEP_MS, PLAYER));
  }
  expect(run.snapshot()).toMatchObject({ mode: 'countdown', wave: 1 });
  expect(beforeBoundary.filter(({ type }) => type === 'waveStarted')).toEqual([]);

  const completionEvents = run.step(FIXED_STEP_MS, PLAYER);
  expect(completionEvents.filter(({ type }) => type === 'waveStarted')).toEqual([
    { type: 'waveStarted', wave: 2 },
  ]);
  expect(completionEvents.filter(({ type }) => type === 'enemySpawned')).toEqual([]);
  expect(run.snapshot()).toMatchObject({ mode: 'playing', wave: 2, activeEnemyCount: 0 });
});

it('패배 tick은 1200ms hold를 차감하지 않고 world freeze 뒤 resultReady를 한 번만 낸다', () => {
  const run = GameSession.create({ seed: 1 });
  run.scenarioPortForE2e().suppressWaveSpawns();
  for (let index = 0; index < 17; index += 1) {
    run.scenarioPortForE2e().spawnEnemy({
      kind: 'offLeashGuardian',
      variant: index % 2 === 0 ? 'male' : 'female',
      pathId: 'P6',
      placement: { kind: 'attackBoundary' },
    });
  }

  const lossEvents: GameEvent[] = [];
  for (let tick = 0; tick < 15; tick += 1) {
    lossEvents.push(...run.step(FIXED_STEP_MS, { x: 0, y: 0 }));
  }
  const frozen = run.snapshot();

  expect(frozen).toMatchObject({ mode: 'lost', shelterHp: 0 });
  expect(run.countdownState()).toEqual({ kind: 'lostResult', remainingMs: 1200 });
  expect(lossEvents.filter((event) => event.type === 'modeChanged' && event.mode === 'lost'))
    .toHaveLength(1);
  expect(lossEvents.filter(({ type }) => type === 'runEnded')).toEqual([
    { type: 'runEnded', outcome: 'lost' },
  ]);

  const holdEvents: GameEvent[] = [];
  for (let tick = 0; tick < 71; tick += 1) {
    holdEvents.push(...run.step(FIXED_STEP_MS, PLAYER));
  }
  expect(run.snapshot()).toEqual(frozen);
  expect(holdEvents.filter(({ type }) => type === 'resultReady')).toEqual([]);

  const readyEvents = run.step(FIXED_STEP_MS, PLAYER);
  expect(readyEvents.filter(({ type }) => type === 'resultReady')).toEqual([
    { type: 'resultReady', outcome: 'lost' },
  ]);
  expect(run.step(FIXED_STEP_MS, PLAYER).filter(({ type }) => type === 'resultReady'))
    .toEqual([]);
  expect(run.snapshot()).toEqual(frozen);
});
