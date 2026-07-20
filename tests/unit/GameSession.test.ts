import { FIXED_STEP_MS } from '../../src/game/constants';
import type { AttackOriginResolver } from '../../src/game/combat/EnemyAttackSystem';
import type { ProjectileSpawn } from '../../src/game/combat/ProjectileSystem';
import { BALANCE } from '../../src/game/data/balance';
import { WAVE_DEFINITIONS } from '../../src/game/data/waveDefinitions';
import { EnemySystem } from '../../src/game/enemies/EnemySystem';
import type { GameEvent } from '../../src/game/events/GameEvents';
import { ProgressionSystem } from '../../src/game/progression/ProgressionSystem';
import { ShelterSystem } from '../../src/game/shelter/ShelterSystem';
import {
  GameSession,
  type GameSessionDependencies,
} from '../../src/game/session/GameSession';
import type { EnemyKind, PathId, PurchasableSkillId } from '../../src/game/types/GameTypes';
import { WaveSystem } from '../../src/game/waves/WaveSystem';

const PLAYER = { x: 270, y: 600 } as const;

describe('GameSession V2 fixed-step integration', () => {
  it('purchase는 다음 playing step 첫 단계에서 확정되고 world가 계속 돈다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    const run = GameSession.create({ seed: 1 }, { progression });

    expect(run.queueSkillPurchase('tailSwipe')).toEqual({
      status: 'queued', skillId: 'tailSwipe', cost: 15, spent: 0, snacks: 40, nextCost: 15,
    });
    expect(run.queueSkillPurchase('aquaBeam').status).toBe('queueBusy');
    const before = run.snapshot();
    const events = run.step(FIXED_STEP_MS, PLAYER);

    expect(events).toContainEqual({
      type: 'skillPurchaseResolved',
      result: {
        status: 'learned', skillId: 'tailSwipe', cost: 15,
        spent: 15, snacks: 25, nextCost: 25,
      },
    });
    expect(events.findIndex((event) => event.type === 'skillPurchaseResolved'))
      .toBeLessThan(events.findIndex((event) => event.type === 'waveStarted'));
    expect(events.findIndex((event) => event.type === 'skillPurchaseResolved'))
      .toBeLessThan(events.findIndex((event) => event.type === 'enemySpawnRequested'));
    expect(run.snapshot()).toMatchObject({
      mode: 'playing', simulationMs: before.simulationMs + FIXED_STEP_MS,
      nextSkillCost: 25, pendingSpawns: 8, activeEnemyCount: 2,
    });
  });

  it('RunSnapshot은 V2 HUD와 projectile actor 계약을 제공한다', () => {
    const run = Harness.createHarness(2);
    run.suppressWave(1);
    run.spawnProjectile(projectile({ id: 9 }));

    expect(run.snapshot()).toMatchObject({
      mode: 'playing', simulationMs: 0, wave: 1,
      shelterHp: 1000, shelterMaxHp: 1000, snacks: 0, nextSkillCost: 15,
      learnedSkills: { tailSwipe: false, aquaBeam: false, safetyReport: false },
      skillStates: {
        tailSwipe: { learned: false, activeCastId: null },
        aquaBeam: { learned: false, activeCastId: null },
        safetyReport: { learned: false, activeCastId: null },
      },
      companion: { companion: 'deokbae', active: true, cooldownRemainingMs: 0 },
      enemies: [], pendingSpawns: 0, activeEnemyCount: 0,
      activeProjectileCount: 1,
      projectiles: [expect.objectContaining({ id: 9, x: 20, y: 20 })],
    });
    expect(run.snapshot().activeProjectileCount).toBe(run.snapshot().projectiles.length);
  });

  it('simulationMs는 오직 fixed tick 수에서 계산하고 invalid step/player는 상태 변경 전에 거부한다', () => {
    const run = GameSession.create({ seed: 1 });
    for (let tick = 0; tick < 3; tick += 1) run.step(FIXED_STEP_MS, PLAYER);
    expect(run.snapshot().simulationMs).toBe(3 * 1000 / 60);
    const before = run.snapshot();

    for (const stepMs of [
      0,
      -FIXED_STEP_MS,
      FIXED_STEP_MS + 1e-9,
      FIXED_STEP_MS * 2,
      Number.NaN,
      Infinity,
    ]) {
      expect(() => run.step(stepMs, PLAYER)).toThrow(RangeError);
    }
    expect(() => run.step(FIXED_STEP_MS, { x: Number.NaN, y: 0 })).toThrow(RangeError);
    expect(run.snapshot()).toEqual(before);
  });

  it('tail impact가 같은 step release를 취소하고 이미 release된 projectile은 유지한다', () => {
    const run = Harness.createHarness(3);
    run.suppressWave(1);
    const enemyId = run.spawnEnemy('poopGuardian', 'P6');
    run.place(enemyId, 335);
    run.learnAt('tailSwipe', 0);
    run.setSimulationTicks(479);
    run.spawnProjectile(projectile({ id: 77, speed: 1, lifeMs: 60_000 }));

    expect(run.step(FIXED_STEP_MS, PLAYER)).toContainEqual(
      expect.objectContaining({ type: 'skillCastStarted', skillId: 'tailSwipe' }),
    );
    run.place(enemyId, 1_000_000);
    const events = steps(run, 15);

    const impactIndex = events.findIndex((event) => event.type === 'skillImpact');
    const cancelIndex = events.findIndex((event) => event.type === 'attackCancelled');
    expect(impactIndex).toBeGreaterThanOrEqual(0);
    expect(cancelIndex).toBeGreaterThan(impactIndex);
    expect(events.some((event) => event.type === 'shelterDamageRequested')).toBe(false);
    expect(run.snapshot().projectiles).toEqual([
      expect.objectContaining({ id: 77 }),
    ]);
  });

  it('damageApplied를 lifecycle/reward보다 먼저 내고 reward snapshot을 갱신한다', () => {
    const run = Harness.createHarness(4);
    run.suppressWave(1);
    const enemyId = run.spawnEnemy('poopGuardian', 'P6');
    run.place(enemyId, 335);
    run.weaken(enemyId, 1);

    const events = stepsUntil(run, (event) => event.type === 'enemyDied', 30);
    const damageIndex = events.findIndex((event) => event.type === 'damageApplied');
    const deathIndex = events.findIndex((event) => event.type === 'enemyDied');
    const rewardIndex = events.findIndex((event) => event.type === 'snackEarned');

    expect(damageIndex).toBeGreaterThanOrEqual(0);
    expect(deathIndex).toBeGreaterThan(damageIndex);
    expect(rewardIndex).toBeGreaterThan(deathIndex);
    expect(events[deathIndex]).toMatchObject({ kind: 'poopGuardian', position: expect.any(Object) });
    expect(events[rewardIndex]).toMatchObject({ kind: 'poopGuardian', amount: 2, snacks: 2 });
    expect(run.snapshot().snacks).toBe(2);
  });

  it('structured shelter request를 상세 shelterDamaged로 손실 없이 바꾼다', () => {
    const run = Harness.createHarness(5);
    run.suppressWave(1);
    run.spawnProjectile(projectile({
      id: 41, castId: 'enemy:41:1', enemyId: 41, kind: 'dogTrader',
      projectileKind: 'net', from: { x: 270, y: 519 }, speed: 120, damage: 120,
    }));

    const events = run.step(FIXED_STEP_MS, PLAYER);
    expect(events.find((event) => event.type === 'shelterDamageRequested')).toMatchObject({
      castId: 'enemy:41:1', sourceEnemyId: 41, sourceEnemyKind: 'dogTrader',
      amount: 120, position: { x: 270, y: 480 }, strength: 'heavy',
    });
    expect(events.find((event) => event.type === 'shelterDamaged')).toMatchObject({
      castId: 'enemy:41:1', appliedAtStep: 1,
      sourceEnemyId: 41, sourceEnemyKind: 'dogTrader', amount: 120,
      effectiveAmount: 120, hp: 880, maxHp: 1000,
      position: { x: 270, y: 480 }, impactDirection: expect.any(Object),
      strength: 'heavy', visual: 'healthy',
    });
  });

  it.each(['dogTrader', 'illegalBreeder'] as const)(
    '%s lifecycle은 boss active count 0↔1 event를 정확히 한 번씩 낸다',
    (kind) => {
      const run = Harness.createHarness(6);
      run.suppressWave(1);
      const enemyId = run.spawnEnemy(kind, 'P6');
      run.place(enemyId, 335);
      run.weaken(enemyId, 1);

      const events = [
        ...run.step(FIXED_STEP_MS, PLAYER),
        ...stepsUntil(run, (event) => event.type === 'enemyDied', 30),
      ];

      expect(events.filter((event) => event.type === 'bossActiveChanged')).toEqual([
        { type: 'bossActiveChanged', active: true, activeBossCount: 1 },
        { type: 'bossActiveChanged', active: false, activeBossCount: 0 },
      ]);
    },
  );

  it('projectileOriginByKind pure dependency를 attack request와 reset 뒤에도 사용한다', () => {
    const origin: AttackOriginResolver = () => ({ x: 111, y: 222 });
    const run = Harness.createHarness(7, { projectileOriginByKind: { dogTrader: origin } });
    run.suppressWave(1);
    const id = run.spawnEnemy('dogTrader', 'P6');
    run.place(id, 1_000_000);

    expect(steps(run, 30).find((event) => event.type === 'projectileRequested'))
      .toMatchObject({ kind: 'dogTrader', from: { x: 111, y: 222 } });
    run.reset(8);
    run.suppressWave(1);
    const resetId = run.spawnEnemy('dogTrader', 'P6');
    run.place(resetId, 1_000_000);
    expect(steps(run, 30).find((event) => event.type === 'projectileRequested'))
      .toMatchObject({ from: { x: 111, y: 222 } });
  });

  it('주입 progression의 기존 learned state를 skill runtime과 일치시킨다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    progression.queuePurchase('tailSwipe');
    progression.consumeQueuedPurchase();

    const run = GameSession.create({ seed: 9 }, { progression });

    expect(run.snapshot()).toMatchObject({
      learnedSkills: { tailSwipe: true },
      skillStates: { tailSwipe: { learned: true } },
    });
  });
});

describe('GameSession terminal and transition priority', () => {
  it('wave 사이는 정확히 3000ms이고 countdown에서는 simulation tick이 멈춘다', () => {
    const run = Harness.createHarness(10);
    run.suppressWave(1);

    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual(expect.arrayContaining([
      { type: 'modeChanged', mode: 'countdown' },
      { type: 'waveTransition', fromWave: 1, toWave: 2, countdownMs: 3000 },
      { type: 'waveCountdownChanged', remainingMs: 3000 },
    ]));
    expect(run.countdownState()).toEqual({ kind: 'nextWave', remainingMs: 3000 });
    const simulationMs = run.snapshot().simulationMs;
    steps(run, 179);
    expect(run.snapshot()).toMatchObject({ mode: 'countdown', simulationMs });
    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual([
      { type: 'waveStarted', wave: 2 },
      { type: 'modeChanged', mode: 'playing' },
    ]);
  });

  it('lost result는 1200ms 뒤 한 번만 준비되고 terminal은 purchase/world를 무시한다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    const run = GameSession.create(
      { seed: 11 },
      { progression, shelter: new ShelterSystem(1, 0) },
    );

    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual(expect.arrayContaining([
      { type: 'modeChanged', mode: 'lost' },
      { type: 'runEnded', outcome: 'lost' },
    ]));
    const terminal = run.snapshot();
    expect(run.queueSkillPurchase('tailSwipe')).toMatchObject({
      status: 'queueBusy', spent: 0, snacks: 40,
    });
    const early = steps(run, 71);
    expect(early.some((event) => event.type === 'resultReady')).toBe(false);
    expect(run.snapshot().simulationMs).toBe(terminal.simulationMs);
    expect(run.step(FIXED_STEP_MS, PLAYER).filter((event) => event.type === 'resultReady'))
      .toEqual([{ type: 'resultReady', outcome: 'lost' }]);
    expect(steps(run, 10).some((event) => event.type === 'resultReady')).toBe(false);
  });

  it('final clear와 loss가 같은 step이면 lost만 한 번 확정한다', () => {
    const run = Harness.createHarness(12, { shelter: new ShelterSystem(1, 0) });
    run.suppressWave(5);

    const events = run.step(FIXED_STEP_MS, PLAYER);
    expect(events.filter((event) => event.type === 'runEnded')).toEqual([
      { type: 'runEnded', outcome: 'lost' },
    ]);
    expect(events).not.toContainEqual({ type: 'runEnded', outcome: 'won' });
  });

  it('final clear 승리는 run/result event를 같은 step 한 번만 낸다', () => {
    const run = Harness.createHarness(13);
    run.suppressWave(5);

    expect(run.step(FIXED_STEP_MS, PLAYER)).toEqual(expect.arrayContaining([
      { type: 'modeChanged', mode: 'won' },
      { type: 'runEnded', outcome: 'won' },
      { type: 'resultReady', outcome: 'won' },
    ]));
    expect(steps(run, 10)).toEqual([]);
  });

  it('dependency reset은 주입 instance를 초기화하고 default session끼리 상태를 공유하지 않는다', () => {
    const progression = new ProgressionSystem();
    progression.addSnacks(40);
    const shelter = new ShelterSystem(1000, 900);
    const first = GameSession.create({ seed: 14 }, { progression, shelter });
    const second = GameSession.create({ seed: 15 });
    first.queueSkillPurchase('tailSwipe');
    first.step(FIXED_STEP_MS, PLAYER);

    first.reset(16);

    expect(progression.snapshot()).toMatchObject({ snacks: 0, queuedSkillId: null });
    expect(shelter.currentHp).toBe(1000);
    expect(first.snapshot()).toMatchObject({ snacks: 0, shelterHp: 1000, simulationMs: 0 });
    expect(second.snapshot()).toMatchObject({ snacks: 0, shelterHp: 1000, simulationMs: 0 });
  });
});

class Harness extends GameSession {
  private constructor(seed: number, dependencies: GameSessionDependencies) {
    super(seed, EnemySystem.createDefault(), dependencies);
  }

  static createHarness(seed: number, dependencies: GameSessionDependencies = {}): Harness {
    return new Harness(seed, dependencies);
  }

  suppressWave(wave: 1 | 2 | 3 | 4 | 5): void {
    const definitions = WAVE_DEFINITIONS.map((definition) => ({
      wave: definition.wave,
      pathIds: definition.pathIds,
      groups: [],
    }));
    this.waves = new WaveSystem(definitions, this.rng, BALANCE.caps.enemies);
    this.waves.start(wave);
    this.waveStartEventPending = true;
  }

  spawnEnemy(kind: EnemyKind, pathId: PathId): number {
    return this.enemies.spawn({
      atMs: 0, kind, pathId, variant: 'male', spawnSequence: this.enemies.activeCount,
    });
  }

  place(enemyId: number, progress: number): void {
    this.enemies.applyPathProgress(enemyId, progress);
  }

  weaken(enemyId: number, hp: number): void {
    const snapshot = this.enemies.snapshots().find(({ id }) => id === enemyId)!;
    this.enemies.damage(enemyId, snapshot.currentHp - hp);
  }

  learnAt(skillId: PurchasableSkillId, nowMs: number): void {
    this.skills.learn(skillId, nowMs);
  }

  setSimulationTicks(ticks: number): void {
    this.simulationTicks = ticks;
  }

  spawnProjectile(input: ProjectileSpawn): void {
    this.projectiles.spawn(input);
  }
}

function steps(run: GameSession, count: number): GameEvent[] {
  return Array.from({ length: count }, () => run.step(FIXED_STEP_MS, PLAYER)).flat();
}

function stepsUntil(
  run: GameSession,
  predicate: (event: GameEvent) => boolean,
  maxSteps: number,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let tick = 0; tick < maxSteps; tick += 1) {
    const next = run.step(FIXED_STEP_MS, PLAYER);
    events.push(...next);
    if (next.some(predicate)) break;
  }
  return events;
}

function projectile(overrides: Partial<ProjectileSpawn> = {}): ProjectileSpawn {
  return {
    id: 1,
    castId: 'enemy:1:1',
    enemyId: 1,
    kind: 'poopGuardian',
    projectileKind: 'poop',
    from: { x: 20, y: 20 },
    to: { x: 270, y: 480 },
    speed: 1,
    damage: 25,
    lifeMs: 1200,
    ...overrides,
  };
}
